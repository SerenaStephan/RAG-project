from langchain_ollama import ChatOllama


def build_prompt(query, reranked_chunks):
    """Build the prompt string from query + reranked chunks."""
    context_parts = []

    for i, item in enumerate(reranked_chunks, start=1):
        context_parts.append(
            f"[{i}] Source: {item['source']} | Page: {item['page']} | "
            f"Element: {item['element']} | Type: {item['type']}\n"
            f"{item['text']}"
        )

    context = "\n\n---\n\n".join(context_parts)

    return f"""You must answer using ONLY the provided context.
You MUST format your answer using markdown.
Use **bold** for important terms, use ONLY bullet points (- ) for lists, NEVER numbered lists.
CITATION RULES — this is mandatory:
- Each context chunk is labeled [1], [2], [3].
- Every sentence or claim MUST end with the citation number in square brackets, like [1] or [2].
- Example: "The CIS Controls started as a grassroots activity [1]. They reflect expert knowledge [2]."
- Do NOT expand the acronym CIS.
- Do NOT add facts not in the context.
- If context is insufficient, say so briefly.

Context:
{context}

Question:
{query}

Answer in markdown with inline citations:
"""


def generate_answer_with_ollama(query, reranked_chunks):
    """Non-streaming generation — kept for testing.py compatibility."""
    llm = ChatOllama(model="llama3.2:3b", temperature=0)
    prompt = build_prompt(query, reranked_chunks)
    response = llm.invoke(prompt)
    answer = response.content.strip()
    answer = answer.replace("Computer Incident Society (CIS)", "CIS")
    answer = answer.replace("Computer Incident Society", "CIS")
    return answer
