from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, timezone


MONGO_URL = "mongodb://localhost:27017"
client = AsyncIOMotorClient(MONGO_URL)
db = client["rag_db"]
conversations_col = db["conversations"]
feedback_col = db["feedback"]


def utcnow():
    return datetime.now(timezone.utc)


def serialize(doc):
    doc["id"] = str(doc.pop("_id"))
    return doc


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
        {}, {"messages": 0}
    ).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    return [serialize(d) for d in docs]


async def get_conversation(conversation_id: str) -> dict | None:
    doc = await conversations_col.find_one({"_id": ObjectId(conversation_id)})
    if doc:
        return serialize(doc)
    return None


async def delete_conversation(conversation_id: str) -> None:
    await conversations_col.delete_one({"_id": ObjectId(conversation_id)})


async def append_message(conversation_id: str, role: str, content: str, sources: list) -> None:
    if role == "assistant":
        message = {
            "role": role,
            "versions": [{"content": content, "sources": sources}],
            "current_version": 0,
            "timestamp": utcnow(),
        }
    else:
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


async def add_message_version(conversation_id: str, message_index: int, content: str, sources: list) -> dict:
    convo = await conversations_col.find_one({"_id": ObjectId(conversation_id)})
    if not convo:
        return {}
    messages = convo.get("messages", [])
    if message_index >= len(messages):
        return {}
    msg = messages[message_index]
    versions = msg.get("versions", [])
    versions.append({"content": content, "sources": sources})
    new_version_index = len(versions) - 1
    await conversations_col.update_one(
        {"_id": ObjectId(conversation_id)},
        {
            "$set": {
                f"messages.{message_index}.versions": versions,
                f"messages.{message_index}.current_version": new_version_index,
                "updated_at": utcnow(),
            }
        }
    )
    return {"version_index": new_version_index}


async def set_current_version(conversation_id: str, message_index: int, version_index: int) -> None:
    await conversations_col.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {f"messages.{message_index}.current_version": version_index}}
    )


async def update_conversation_title(conversation_id: str, title: str) -> None:
    await conversations_col.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"title": title, "updated_at": utcnow()}}
    )


async def save_feedback(
    conversation_id: str,
    message_index: int,
    version_index: int,
    rating: str,
    reason: str | None,
) -> dict:
    doc = {
        "conversation_id": conversation_id,
        "message_index": message_index,
        "version_index": version_index,
        "rating": rating,
        "reason": reason,
        "created_at": utcnow(),
    }
    result = await feedback_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize(doc)
