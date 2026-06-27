"""
SileroDiarizer — Upgraded with:
  1. Parallel embedding extraction (ThreadPoolExecutor)
  2. Speaker profile persistence (saved centroid embeddings per meeting)
  3. Cross-chunk speaker identity resolution (match new speakers to known profiles)
  4. Dendrogram generation is now optional (skip for live chunks = faster)
"""
from typing import List, Dict, Tuple, Optional
import os
import asyncio
import numpy as np
from concurrent.futures import ThreadPoolExecutor

import torch
import torchaudio
from sklearn.metrics.pairwise import cosine_distances, cosine_similarity

from app.diarization.base import Diarizer
from app.config import settings

# Thread pool for CPU-bound embedding work
_THREAD_POOL = ThreadPoolExecutor(max_workers=4)


class SileroDiarizer(Diarizer):
    """
    Adaptive speaker diarization using Silero VAD + Resemblyzer embeddings.
    Enhanced with persistent speaker profiles for cross-session identity mapping.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        win_size_s: float = 1.5,      # reduced from 2.0 for speed
        hop_s: float = 0.75,           # reduced from 1.0 for speed
        min_segment_duration: float = 0.3,
        min_speakers: int = 1,
        max_speakers: int = 10,
        identity_threshold: float = 0.82,  # cosine similarity threshold for speaker match
    ):
        self.sample_rate = sample_rate
        self.device = settings.device # cpu or gpu
        self.win_size_s = win_size_s
        self.hop_s = hop_s #move the window by hop_s time, hop_s <win_size_s because we want overlap for smoother transition
        self.min_segment_duration = min_segment_duration
        self.min_speakers = min_speakers
        self.max_speakers = max_speakers#clusering me isse jyada speakers na ho
        self.identity_threshold = identity_threshold

        # Load Resemblyzer
        try:
            from resemblyzer import VoiceEncoder
            self.encoder = VoiceEncoder(device=str(self.device))
        except ImportError:
            raise ImportError("resemblyzer required: pip install resemblyzer")

        # Load Silero VAD
        self.model, self.utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            trust_repo=True,
        ) #only detect speach is there or not in that time
        self.model.to(self.device)
        (
            self.get_speech_timestamps,
            self.save_audio,
            self.read_audio,
            self.VADIterator,
            self.collect_chunks,
        ) = self.utils

    # ── Audio Loading ──────────────────────────────────────────────────────────

    def _load_audio(self, audio_path: str) -> Tuple[torch.Tensor, np.ndarray]:
        import soundfile
        wav_np, sr = soundfile.read(audio_path) #sr-sampling rate,wav_np-.wav format numpyarray
        if wav_np.ndim == 1:
            wav = torch.from_numpy(wav_np).unsqueeze(0).float() # now (chanels,samples) -> (1,samples) for mono that's what model expect
        else:
            wav = torch.from_numpy(wav_np).t().float() #transpoing as its (sample,channel)->(channel,samples)
        if wav.shape[0] > 1:
            wav = torch.mean(wav, dim=0, keepdim=True) #if stereo then make it mono by taking mean  
        if sr != self.sample_rate:
            wav = torchaudio.functional.resample(wav, orig_freq=sr, new_freq=self.sample_rate)
        wav = wav.to(self.device)
        wav_np = wav.squeeze(0).cpu().numpy() #removing extra dimension as silero vad requires only samples no extra dimension
        return wav, wav_np

    # ── VAD ───────────────────────────────────────────────────────────────────

    def _get_speech_segments(self, wav: torch.Tensor) -> List[Dict]:
        speech_ts = self.get_speech_timestamps(
            wav.squeeze(0),
            self.model,
            sampling_rate=self.sample_rate,
            threshold=0.5,
            min_speech_duration_ms=300,
            min_silence_duration_ms=100,
        )
        return [{"start": int(ts["start"]), "end": int(ts["end"])} for ts in speech_ts]

    # ── Embedding Extraction (parallelized) ───────────────────────────────────

    def _embed_window(self, window_audio: np.ndarray) -> Optional[np.ndarray]:
        """Embed a single audio window — runs in thread pool."""
        try:
            if window_audio.dtype != np.float32:
                window_audio = window_audio.astype(np.float32)
            max_amp = np.abs(window_audio).max()
            if max_amp > 0:
                window_audio = window_audio / max_amp
            embedding = self.encoder.embed_utterance(window_audio)
            if np.isfinite(embedding).all():
                return embedding
        except Exception:
            pass
        return None

    def _create_embedding_windows(
        self,
        speech_segments: List[Dict],
        wav_np: np.ndarray,
    ) -> Tuple[np.ndarray, List[Dict]]:
        win_samples = int(self.win_size_s * self.sample_rate)
        hop_samples = int(self.hop_s * self.sample_rate)

        # Build list of (window_audio, metadata) first
        window_jobs: List[Tuple[np.ndarray, Dict]] = []

        for seg_idx, seg in enumerate(speech_segments):
            start_sample = seg["start"]
            end_sample = seg["end"]
            seg_duration = (end_sample - start_sample) / self.sample_rate
            if seg_duration < 0.5:
                continue

            pos = start_sample
            while pos + win_samples <= end_sample:
                window_jobs.append((
                    wav_np[pos: pos + win_samples].copy(),
                    {"start": pos, "end": pos + win_samples, "segment_idx": seg_idx}
                ))
                pos += hop_samples

            # Tail window
            remaining = end_sample - pos
            if remaining > win_samples * 0.6:
                window_jobs.append((
                    wav_np[max(start_sample, end_sample - win_samples): end_sample].copy(),
                    {
                        "start": max(start_sample, end_sample - win_samples),
                        "end": end_sample,
                        "segment_idx": seg_idx,
                    }
                ))

        if not window_jobs:
            return np.array([]), []

        # Run embedding in parallel via thread pool
        audios = [j[0] for j in window_jobs]
        metas = [j[1] for j in window_jobs]
        embeddings_raw = list(_THREAD_POOL.map(self._embed_window, audios))

        embeddings = []
        windows = []
        for emb, meta in zip(embeddings_raw, metas):
            if emb is not None:
                embeddings.append(emb)
                windows.append(meta)

        if not embeddings:
            return np.array([]), []

        return np.stack(embeddings, axis=0), windows

    # ── Clustering ────────────────────────────────────────────────────────────

    def _adaptive_clustering(
        self,
        embeddings: np.ndarray,
        generate_dendrograms: bool = False,
    ) -> Tuple[np.ndarray, Dict, List[Dict]]:
        from scipy.cluster.hierarchy import linkage, fcluster

        if len(embeddings) <= 1:
            return np.array([0] * len(embeddings)), {"method": "single"}, []

        norms = np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8 
        embeddings_normalized = embeddings / norms

        Z = linkage(embeddings_normalized, method="average", metric="cosine")

        # Distance stats
        dists_condensed = Z[:, 2]  # merge distances from linkage
        q25 = float(np.percentile(dists_condensed, 25))
        median = float(np.median(dists_condensed))
        q75 = float(np.percentile(dists_condensed, 75))

        candidates = [
            ("high", q75),
            ("med-high", (median + q75) / 2),
            ("median", median),
            ("med-low", (q25 + median) / 2),
            ("low", q25),
        ]

        best_result = None
        best_score = -float("inf")
        dendrograms_data = []

        for name, threshold in candidates:
            labels = fcluster(Z, t=threshold, criterion="distance") - 1
            n_clusters = len(np.unique(labels))

            score = 0.0
            if n_clusters > 1 and len(embeddings) > n_clusters:
                try:
                    from sklearn.metrics import silhouette_score
                    sil = silhouette_score(embeddings_normalized, labels, metric="cosine")
                    score += sil * 0.6
                except Exception:
                    pass

            if n_clusters > 0:
                sizes = [(labels == l).sum() for l in np.unique(labels)]
                balance = min(sizes) / max(sizes) if max(sizes) > 0 else 0
                score += balance * 0.2

            # Optionally generate dendrogram image
            if generate_dendrograms:
                try:
                    import matplotlib.pyplot as plt
                    import io, base64
                    from scipy.cluster.hierarchy import dendrogram as scipy_dend
                    plt.figure(figsize=(10, 5))
                    scipy_dend(Z, color_threshold=threshold, above_threshold_color="gray", no_labels=True)
                    plt.axhline(y=threshold, c="r", lw=2, linestyle="--")
                    plt.title(f"{name.title()} (Thresh={threshold:.3f}, K={n_clusters}, Score={score:.3f})")
                    plt.xlabel("Segments")
                    plt.ylabel("Cosine Distance")
                    buf = io.BytesIO()
                    plt.savefig(buf, format="png", bbox_inches="tight")
                    plt.close()
                    buf.seek(0)
                    img_str = base64.b64encode(buf.read()).decode("utf-8")
                    dendrograms_data.append({"name": name, "threshold": threshold, "score": score, "image": img_str})
                except Exception as e:
                    print(f"Dendrogram error: {e}")

            if n_clusters < self.min_speakers or n_clusters > self.max_speakers:
                continue
            if score > best_score:
                best_score = score
                best_result = {"name": name, "threshold": threshold, "n_clusters": n_clusters, "labels": labels.copy()}

        if best_result is None:
            labels = fcluster(Z, t=median, criterion="distance") - 1
            best_result = {"name": "fallback", "threshold": median, "n_clusters": len(np.unique(labels)), "labels": labels}

        return (
            best_result["labels"],
            {"threshold": best_result["threshold"], "n_clusters": best_result["n_clusters"], "method": best_result["name"]},
            dendrograms_data,
        )

    def _merge_similar_speakers(self, embeddings: np.ndarray, labels: np.ndarray, similarity_threshold: float = 0.85) -> np.ndarray:
        unique_labels = np.unique(labels)
        if len(unique_labels) <= 1:
            return labels

        norms = np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8
        embeddings_normalized = embeddings / norms

        centroids = {int(l): embeddings_normalized[labels == l].mean(axis=0) for l in unique_labels}
        speaker_ids = sorted(centroids.keys())

        merged = False
        for i, sp1 in enumerate(speaker_ids):
            for j, sp2 in enumerate(speaker_ids):
                if i < j:
                    sim = cosine_similarity(centroids[sp1].reshape(1, -1), centroids[sp2].reshape(1, -1))[0, 0]
                    if sim >= similarity_threshold:
                        labels[labels == sp2] = sp1
                        merged = True

        if merged:
            _, labels = np.unique(labels, return_inverse=True)
        return labels

    def _assign_segments_to_speakers(self, speech_segments, windows, labels, sample_rate) -> List[Dict]:
        segment_window_labels = {}
        for win_idx, window in enumerate(windows):
            seg_idx = window["segment_idx"]
            segment_window_labels.setdefault(seg_idx, []).append(int(labels[win_idx]))

        results = []
        for seg_idx, seg in enumerate(speech_segments):
            if seg_idx not in segment_window_labels:
                continue
            window_labels = segment_window_labels[seg_idx]
            vals, counts = np.unique(window_labels, return_counts=True)
            speaker_id = int(vals[np.argmax(counts)]) + 1
            results.append({
                "start": seg["start"] / sample_rate,
                "end": seg["end"] / sample_rate,
                "speaker": f"Speaker {speaker_id}",
            })
        return results

    def _postprocess_segments(self, segments: List[Dict]) -> List[Dict]:
        if not segments:
            return []
        segments = sorted(segments, key=lambda x: x["start"])
        merged = []
        for seg in segments:
            duration = seg["end"] - seg["start"]
            if duration < self.min_segment_duration:
                if merged:
                    merged[-1]["end"] = seg["end"]
                continue
            if merged and merged[-1]["speaker"] == seg["speaker"]:
                gap = seg["start"] - merged[-1]["end"]
                if gap < 0.5:
                    merged[-1]["end"] = seg["end"]
                    continue
            merged.append(seg)
        for seg in merged:
            seg["start"] = round(float(seg["start"]), 3)
            seg["end"] = round(float(seg["end"]), 3)
        return merged

    # ── Speaker Centroids ──────────────────────────────────────────────────────

    def compute_speaker_centroids(
        self, embeddings: np.ndarray, labels: np.ndarray
    ) -> Dict[str, np.ndarray]:
        """Compute normalized centroid for each speaker label."""
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8
        embeddings_normalized = embeddings / norms
        centroids = {}
        for label in np.unique(labels):
            mask = labels == label
            centroid = embeddings_normalized[mask].mean(axis=0)
            centroids[f"Speaker {int(label) + 1}"] = centroid
        return centroids

    def resolve_speakers_against_profiles(
        self,
        new_centroids: Dict[str, np.ndarray],
        known_profiles: List[Dict],
    ) -> Dict[str, str]:
        """
        Given new speaker centroids and known speaker profiles,
        return a mapping from new speaker labels → resolved speaker labels.
        If a new speaker matches a known profile above threshold, map to known label.
        Otherwise retain the new label.
        """
        if not known_profiles:
            return {k: k for k in new_centroids}

        mapping = {}
        used_known = set()

        for new_label, new_centroid in new_centroids.items():
            best_sim = -1.0
            best_known = None
            for profile in known_profiles:
                known_emb = np.array(profile["embedding"], dtype=np.float32)
                known_norm = known_emb / (np.linalg.norm(known_emb) + 1e-8)
                new_norm = new_centroid / (np.linalg.norm(new_centroid) + 1e-8)
                sim = float(cosine_similarity(known_norm.reshape(1, -1), new_norm.reshape(1, -1))[0, 0])
                if sim > best_sim and profile["speaker_label"] not in used_known:
                    best_sim = sim
                    best_known = profile

            if best_known and best_sim >= self.identity_threshold:
                resolved = best_known.get("display_name") or best_known["speaker_label"]
                mapping[new_label] = resolved
                used_known.add(best_known["speaker_label"])
            else:
                mapping[new_label] = new_label

        return mapping

    # ── Main Entry Point ───────────────────────────────────────────────────────

    def diarize(
        self,
        audio_path: str,
        generate_dendrograms: bool = True,
        known_profiles: Optional[List[Dict]] = None,
    ) -> Tuple[List[Dict], List[Dict], Dict[str, np.ndarray]]:
        """
        Returns:
            (segments, dendrograms, speaker_centroids)

        speaker_centroids: dict mapping "Speaker N" -> 256-dim numpy array
                           caller should persist these via upsert_speaker_profile
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio not found: {audio_path}")

        wav, wav_np = self._load_audio(audio_path)
        speech_segments = self._get_speech_segments(wav)
        if not speech_segments:
            return [], [], {}

        embeddings, windows = self._create_embedding_windows(speech_segments, wav_np)
        if len(embeddings) == 0:
            return [], [], {}

        labels, cluster_info, dendrograms = self._adaptive_clustering(
            embeddings, generate_dendrograms=generate_dendrograms
        )
        labels = self._merge_similar_speakers(embeddings, labels)

        # Compute centroids for persistence
        centroids = self.compute_speaker_centroids(embeddings, labels)

        # Resolve against known profiles if provided
        if known_profiles:
            mapping = self.resolve_speakers_against_profiles(centroids, known_profiles)
            # Re-label segments according to resolved names
            segments_raw = self._assign_segments_to_speakers(speech_segments, windows, labels, self.sample_rate)
            for seg in segments_raw:
                seg["speaker"] = mapping.get(seg["speaker"], seg["speaker"])
            # Update centroids keys too
            centroids = {mapping.get(k, k): v for k, v in centroids.items()}
        else:
            segments_raw = self._assign_segments_to_speakers(speech_segments, windows, labels, self.sample_rate)

        final_segments = self._postprocess_segments(segments_raw)
        return final_segments, dendrograms, centroids
