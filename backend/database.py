from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, timezone


MONGO_URL = "mongodb://localhost:27017"
client = AsyncIOMotorClient(MONGO_URL)
db = client["rag_db"]
conversations_col = db["conversations"]


def utcnow():
    return datetime.now(timezone.utc)


def serialize(doc):
    """Convert MongoDB document to JSON-serializable dict."""
    doc["id"] = str(doc.pop("_id"))
    return doc


# ── Conversations ─────────────────────────────────────────────────────────────

async def create_conversation(title: str) -> dict:
    doc = {
        "title": title,
        "created_at": utcnow(),
        "updated_at": utcnow(),
        "messages": [],
    }
    result = await conversations_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize(doc)


async def list_conversations() -> list:
    cursor = conversations_col.find(
        {}, {"messages": 0}  # exclude messages for performance
    ).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    return [serialize(d) for d in docs]


async def get_conversation(conversation_id: str) -> dict | None:
    doc = await conversations_col.find_one({"_id": ObjectId(conversation_id)})
    if doc:
        return serialize(doc)
    return None


async def append_message(conversation_id: str, role: str, content: str, sources: list) -> None:
    message = {
        "role": role,
        "content": content,
        "sources": sources,
        "timestamp": utcnow(),
    }
    await conversations_col.update_one(
        {"_id": ObjectId(conversation_id)},
        {
            "$push": {"messages": message},
            "$set": {"updated_at": utcnow()},
        }
    )


async def update_conversation_title(conversation_id: str, title: str) -> None:
    await conversations_col.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"title": title, "updated_at": utcnow()}}
    )
