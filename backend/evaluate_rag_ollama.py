from deepeval.metrics import (
    FaithfulnessMetric,
    AnswerRelevancyMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
    ContextualRelevancyMetric,
    HallucinationMetric,
)
from deepeval.test_case import LLMTestCase
from deepeval.models import OllamaModel

from retrieval import retrieve_chunks
from reranking import rerank_chunks
from generation import generate_answer_with_ollama


# Local Ollama judge model for DeepEval.
judge = OllamaModel(model="llama3.2:3b")


goldens = [
    {
        "input": "What are CIS Controls?",
        "expected_output": (
            "The CIS Controls are critical security controls that help enterprises focus on "
            "important steps to defend themselves from common real-world cyberattacks. "
            "They reflect the combined knowledge and experience of experts across different "
            "sectors, roles, and industries."
        ),
    },
    {
        "input": "Why were the CIS Controls created?",
        "expected_output": (
            "They were created to help people and enterprises focus on the most important "
            "steps needed to defend themselves from real-world cyberattacks."
        ),
    },
    {
        "input": "Who contributes to the CIS Controls?",
        "expected_output": (
            "The CIS Controls are supported by experts from many parts of the cybersecurity "
            "ecosystem, including governments, companies, threat responders, IT defenders, "
            "auditors, policy-makers, and solution providers."
        ),
    },
    {
        "input": "What is the purpose of CIS Controls v8?",
        "expected_output": (
            "The purpose of CIS Controls v8 is to guide organizations in implementing, "
            "measuring, reporting, and managing enterprise security through clear and "
            "practical safeguards."
        ),
    },
    {
        "input": "Why does CIS Controls v8 use revised terminology and grouping of safeguards?",
        "expected_output": (
            "CIS Controls v8 uses revised terminology and grouping of safeguards to reflect "
            "changes in technology and cybersecurity, including cloud computing, virtualization, "
            "mobility, outsourcing, work-from-home, and changing attacker tactics."
        ),
    },
]


def build_metrics():
    # Fresh metric objects for every test case.
    return [
        FaithfulnessMetric(
            threshold=0.5,
            model=judge,
            include_reason=False,
            async_mode=False,
        ),
        AnswerRelevancyMetric(
            threshold=0.5,
            model=judge,
            include_reason=False,
            async_mode=False,
        ),
        ContextualPrecisionMetric(
            threshold=0.5,
            model=judge,
            include_reason=False,
            async_mode=False,
        ),
        ContextualRecallMetric(
            threshold=0.5,
            model=judge,
            include_reason=False,
            async_mode=False,
        ),
        ContextualRelevancyMetric(
            threshold=0.5,
            model=judge,
            include_reason=False,
            async_mode=False,
        ),
        HallucinationMetric(
            threshold=0.5,
            model=judge,
            include_reason=False,
            async_mode=False,
        ),
    ]


total_test_cases = 0
passed_test_cases = 0
failed_test_cases = 0

all_results = []


for index, golden in enumerate(goldens):
    total_test_cases += 1
    query = golden["input"]

    print("\n================================================")
    print(f"TEST CASE {index}")
    print(f"Question: {query}")
    print("================================================")

    # Retrieve candidate chunks from Weaviate.
    retrieved_chunks = retrieve_chunks(query, top_k=10)

    # Rerank the retrieved chunks.
    best_chunks = rerank_chunks(query, retrieved_chunks, top_n=3)

    # Generate final answer using local Ollama.
    actual_output = generate_answer_with_ollama(query, best_chunks)

    # DeepEval expects retrieval_context as a list of strings.
    retrieval_context = [chunk["text"] for chunk in best_chunks]

    test_case = LLMTestCase(
        input=query,
        actual_output=actual_output,
        expected_output=golden["expected_output"],
        retrieval_context=retrieval_context,
        context=retrieval_context,  # used by HallucinationMetric
    )

    print("\nActual output:")
    print(actual_output)

    print("\nExpected output:")
    print(golden["expected_output"])

    print("\nRetrieved context:")
    for i, chunk in enumerate(best_chunks, start=1):
        print(f"\n--- Context chunk {i} ---")
        print(
            f"Page: {chunk['page']} | Type: {chunk['type']} | "
            f"Rerank score: {chunk['rerank_score']}"
        )
        print(chunk["text"][:500])

    metrics = build_metrics()
    metric_results = []
    test_case_passed = True

    for metric in metrics:
        metric_name = metric.__class__.__name__

        print("\n--------------------------------")
        print(f"Running metric: {metric_name}")
        print("--------------------------------")

        try:
            metric.measure(test_case)

            score = metric.score
            success = metric.success

            print(f"{metric_name} score: {score}")
            print(f"{metric_name} passed: {success}")

            metric_results.append({
                "metric": metric_name,
                "score": score,
                "passed": success,
            })

            if not success:
                test_case_passed = False

        except Exception as e:
            print(f"{metric_name} failed with error:")
            print(e)

            metric_results.append({
                "metric": metric_name,
                "score": None,
                "passed": False,
            })

            test_case_passed = False

    if test_case_passed:
        passed_test_cases += 1
    else:
        failed_test_cases += 1

    all_results.append({
        "test_case_index": index,
        "question": query,
        "actual_output": actual_output,
        "passed": test_case_passed,
        "metrics": metric_results,
    })


print("\n\n================ FINAL SUMMARY ================")
print(f"Total test cases: {total_test_cases}")
print(f"Passed test cases: {passed_test_cases}")
print(f"Failed test cases: {failed_test_cases}")
print(f"Pass rate: {(passed_test_cases / total_test_cases) * 100:.2f}%")

for result in all_results:
    print("\n--------------------------------")
    print(f"Test case {result['test_case_index']}: {result['question']}")
    print(f"Passed: {result['passed']}")

    for metric_result in result["metrics"]:
        print(
            f"{metric_result['metric']}: "
            f"score={metric_result['score']}, "
            f"passed={metric_result['passed']}"
        )