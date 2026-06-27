"""
ChromaDB-backed vector store for RAG over meeting transcripts.
Uses sentence-transformers for embedding (local, no API key needed).
Each meeting gets its own collection: meeting_{meeting_id}
"""
import os
import chromadb
from chromadb.config import Settings as ChromaSettings

CHROMA_DIR = os.environ.get("CHROMA_DIR", "data/chroma_db")

# Singleton client for fast things
_client: chromadb.ClientAPI | None = None


def get_chroma_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        os.makedirs(CHROMA_DIR, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=CHROMA_DIR,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def get_collection(meeting_id: str):
    client = get_chroma_client()
    collection_name = f"meeting_{meeting_id.replace('-', '_')}"
    # get_or_create
    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )
    return collection


def embed_segments(meeting_id: str, segments: list, chunk_index: int = 0):
    """
    Embed transcript segments into ChromaDB.
    segments: list of dicts with keys: speaker, text, start, end
    """
    if not segments:
        return

    collection = get_collection(meeting_id)

    documents = []
    metadatas = []
    ids = []

    for i, seg in enumerate(segments):
        text = seg.get("text", "").strip()
        if not text:
            continue
        doc_id = f"{meeting_id}_chunk{chunk_index}_seg{i}"
        # Format with speaker for richer context
        doc_text = f"[{seg.get('speaker', 'Unknown')} @ {seg.get('start', 0):.1f}s]: {text}"
        documents.append(doc_text)
        metadatas.append({
            "meeting_id": meeting_id,
            "speaker": seg.get("speaker", "Unknown"),
            "start": float(seg.get("start", 0)),
            "end": float(seg.get("end", 0)),
            "emotion": seg.get("emotion", "unknown"),
            "chunk_index": chunk_index,
        })
        ids.append(doc_id)

    if documents:
        # ChromaDB uses its own built-in embedding function by default
        # We use the default (all-MiniLM-L6-v2 via sentence-transformers)
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids,
        )


def query_segments(meeting_id: str, question: str, top_k: int = 6) -> list:
    """
    Query ChromaDB for the most relevant transcript segments for a given question.
    Returns list of dicts with: text, speaker, start, end, distance
    """
    collection = get_collection(meeting_id)

    # Check if collection has any docs
    count = collection.count()
    if count == 0:
        return []

    actual_k = min(top_k, count)
    results = collection.query(
        query_texts=[question],
        n_results=actual_k,
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        hits.append({
            "text": doc,
            "speaker": meta.get("speaker", "Unknown"),
            "start": meta.get("start", 0),
            "end": meta.get("end", 0),
            "emotion": meta.get("emotion", "unknown"),
            "relevance_score": round(1 - dist, 3),  # cosine similarity
        })

    # Sort by relevance descending
    hits.sort(key=lambda x: x["relevance_score"], reverse=True)
    return hits


def delete_collection(meeting_id: str):
    """Clean up collection after meeting ends (optional)."""
    client = get_chroma_client()
    collection_name = f"meeting_{meeting_id.replace('-', '_')}"
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
