import os
import sys
import shutil
import tempfile

# Ensure backend directory is in the python path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BACKEND_DIR)

# Create a temporary directory for Qdrant storage to isolate test data
temp_qdrant_dir = tempfile.mkdtemp()
os.environ["QDRANT_DIR"] = temp_qdrant_dir

# Now import the modules so they read the environment variable
from app.rag.vector_store import (
    embed_segments,
    query_segments,
    delete_collection,
    get_qdrant_client,
    get_collection
)

def test_qdrant_db_update():
    meeting_id = "test-meeting-999-update"
    collection_name = f"meeting_{meeting_id.replace('-', '_')}"
    client = get_qdrant_client()

    print(f"Temporary Qdrant directory: {temp_qdrant_dir}")
    print("Step 1: Embedding initial segments...")
    initial_segments = [
        {
            "speaker": "Alice",
            "text": "Let's review the marketing plan for Q3.",
            "start": 1.5,
            "end": 5.0,
            "emotion": "neutral"
        },
        {
            "speaker": "Bob",
            "text": "I will prepare the slides by Wednesday.",
            "start": 5.2,
            "end": 9.8,
            "emotion": "confident"
        }
    ]

    embed_segments(meeting_id, initial_segments)
    
    # Verify collection exists
    assert client.collection_exists(collection_name), "Collection should be created."
    
    # Retrieve all points via scroll
    points, _ = client.scroll(collection_name=collection_name, limit=10)
    assert len(points) == 2, f"Expected 2 points in collection, found {len(points)}"
    
    print("Initial points successfully verified in Qdrant:")
    for pt in points:
        print(f"  - ID: {pt.id} | Speaker: {pt.payload['speaker']} | Text: {pt.payload['text']} | Emotion: {pt.payload['emotion']}")

    print("\nStep 2: Updating segments (re-embedding with modified text and emotion for Alice)...")
    updated_segments = [
        {
            "speaker": "Alice",
            "text": "Let's review the updated marketing plan for Q3, it looks fantastic!",
            "start": 1.5,
            "end": 5.0,
            "emotion": "excited"  # Changed emotion from neutral to excited, and text changed
        },
        {
            "speaker": "Bob",
            "text": "I will prepare the slides by Wednesday.",
            "start": 5.2,
            "end": 9.8,
            "emotion": "confident"
        }
    ]

    embed_segments(meeting_id, updated_segments)

    # Retrieve all points again
    points, _ = client.scroll(collection_name=collection_name, limit=10)
    
    # Assert total count is still 2 (upsert should override, not duplicate)
    assert len(points) == 2, f"Expected exactly 2 points after update, found {len(points)}. Duplication occurred!"

    # Verify that the changes were successfully updated
    alice_points = [pt for pt in points if pt.payload["speaker"] == "Alice"]
    assert len(alice_points) == 1, "Expected exactly one point for Alice"
    alice_pt = alice_points[0]
    
    # Payload format inserts: f"[{seg.get('speaker', 'Unknown')} @ {seg.get('start', 0):.1f}s]: {text}"
    expected_text = "[Alice @ 1.5s]: Let's review the updated marketing plan for Q3, it looks fantastic!"
    assert alice_pt.payload["text"] == expected_text, f"Expected updated text: '{expected_text}', got: '{alice_pt.payload['text']}'"
    assert alice_pt.payload["emotion"] == "excited", f"Expected updated emotion 'excited', got: '{alice_pt.payload['emotion']}'"

    print("Updated points successfully verified (in-place modification verified, no duplicates created):")
    for pt in points:
        print(f"  - ID: {pt.id} | Speaker: {pt.payload['speaker']} | Text: {pt.payload['text']} | Emotion: {pt.payload['emotion']}")

    print("\nStep 3: Querying the database to check search relevance...")
    query_results = query_segments(meeting_id, "marketing plan", top_k=2)
    assert len(query_results) > 0, "Query should return results."
    # The first result should be Alice's segment
    assert "marketing" in query_results[0]["text"].lower(), "Query result should refer to marketing."
    print("Query results verified:")
    for res in query_results:
        print(f"  - Score: {res['relevance_score']} | Speaker: {res['speaker']} | Text: {res['text']}")

    print("\nStep 4: Cleaning up (deleting collection)...")
    delete_collection(meeting_id)
    assert not client.collection_exists(collection_name), "Collection should be deleted."
    print("Collection successfully deleted.")

if __name__ == "__main__":
    try:
        test_qdrant_db_update()
        print("\nAll Qdrant update tests passed successfully!")
    except AssertionError as e:
        print(f"\nAssertion Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected Error: {e}")
        sys.exit(1)
    finally:
        # Close the singleton QdrantClient to release file locks on Windows
        import app.rag.vector_store
        if app.rag.vector_store._client is not None:
            app.rag.vector_store._client.close()
            app.rag.vector_store._client = None
            print("Closed Qdrant client connection.")

        # Clean up the temporary directory
        if os.path.exists(temp_qdrant_dir):
            try:
                shutil.rmtree(temp_qdrant_dir)
                print(f"Cleaned up temporary directory: {temp_qdrant_dir}")
            except PermissionError:
                print(f"Warning: Could not remove temporary directory {temp_qdrant_dir} due to Windows file locks. It will be cleaned up by the OS.")
