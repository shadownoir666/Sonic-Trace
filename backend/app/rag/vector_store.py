"""
Qdrant-backed vector store for RAG over meeting transcripts.
Uses sentence-transformers for embedding (local, no API key needed).
Each meeting gets its own collection: meeting_{meeting_id}
"""
import os
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, HnswConfigDiff, PointStruct
from sentence_transformers import SentenceTransformer

QDRANT_DIR = os.environ.get("QDRANT_DIR", "data/qdrant_db")

# Singleton clients for performance
_client: QdrantClient | None = None
_encoder: SentenceTransformer | None = None


def get_qdrant_client() -> QdrantClient:
    global _client
    if _client is None:
        os.makedirs(QDRANT_DIR, exist_ok=True)
        _client = QdrantClient(path=QDRANT_DIR)
    return _client


def get_encoder() -> SentenceTransformer:
    global _encoder
    if _encoder is None:
        from app.config import settings
        _encoder = SentenceTransformer("all-MiniLM-L6-v2", device=settings.device)
    return _encoder


def get_collection(meeting_id: str) -> str:
    client = get_qdrant_client()
    collection_name = f"meeting_{meeting_id.replace('-', '_')}"
    
    # Create collection with explicit HNSW configuration if it does not exist
    if not client.collection_exists(collection_name):
        hnsw_config = HnswConfigDiff(
            m=16,
            ef_construct=100,
        )
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=384,  # all-MiniLM-L6-v2 dimension is 384
                distance=Distance.COSINE
            ),
            hnsw_config=hnsw_config
        )
    return collection_name


def embed_segments(meeting_id: str, segments: list, chunk_index: int = 0):
    """
    Embed transcript segments into Qdrant.
    segments: list of dicts with keys: speaker, text, start, end, emotion
    """
    if not segments:
        return

    collection_name = get_collection(meeting_id)
    client = get_qdrant_client()
    encoder = get_encoder()

    points = []
    for i, seg in enumerate(segments):
        text = seg.get("text", "").strip()
        if not text:
            continue
        
        # Deterministic point ID using uuid5 to prevent duplicate issues on updates
        doc_id_str = f"{meeting_id}_chunk{chunk_index}_seg{i}"
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, doc_id_str))
        
        # Format with speaker for richer context
        doc_text = f"[{seg.get('speaker', 'Unknown')} @ {seg.get('start', 0):.1f}s]: {text}"
        
        # Generate embedding
        vector = encoder.encode(doc_text).tolist()
        
        payload = {
            "meeting_id": meeting_id,
            "text": doc_text,
            "speaker": seg.get("speaker", "Unknown"),
            "start": float(seg.get("start", 0)),
            "end": float(seg.get("end", 0)),
            "emotion": seg.get("emotion", "unknown"),
            "chunk_index": chunk_index,
        }
        
        points.append(
            PointStruct(
                id=point_id,
                vector=vector,
                payload=payload
            )
        )

    if points:
        client.upsert(
            collection_name=collection_name,
            points=points
        )


def query_segments(meeting_id: str, question: str, top_k: int = 6) -> list:
    """
    Query Qdrant for the most relevant transcript segments for a given question.
    Returns list of dicts with: text, speaker, start, end, emotion, relevance_score
    """
    client = get_qdrant_client()
    collection_name = f"meeting_{meeting_id.replace('-', '_')}"

    if not client.collection_exists(collection_name):
        return []

    # Check if collection has any docs
    stat = client.get_collection(collection_name)
    if stat.points_count == 0:
        return []

    encoder = get_encoder()
    query_vector = encoder.encode(question).tolist()

    actual_k = min(top_k, stat.points_count)
    results = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=actual_k
    ).points

    hits = []
    for hit in results:
        meta = hit.payload or {}
        hits.append({
            "text": meta.get("text", ""),
            "speaker": meta.get("speaker", "Unknown"),
            "start": meta.get("start", 0.0),
            "end": meta.get("end", 0.0),
            "emotion": meta.get("emotion", "unknown"),
            "relevance_score": round(hit.score, 3),  # cosine similarity directly
        })

    # Sort by relevance descending
    hits.sort(key=lambda x: x["relevance_score"], reverse=True)
    return hits


def delete_collection(meeting_id: str):
    """Clean up collection after meeting ends."""
    client = get_qdrant_client()
    collection_name = f"meeting_{meeting_id.replace('-', '_')}"
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
