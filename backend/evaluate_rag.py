from deepeval import evaluate
from deepeval.metrics import FaithfulnessMetric, AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase
from deepeval.models import OllamaModel


# Local Ollama model used as the evaluation judge
judge = OllamaModel(model="llama3.2:1b")   

test_case = LLMTestCase(
    input="What are CIS Controls?",
    actual_output=(
    "The CIS Critical Security Controls are a set of cybersecurity best practices "
    "that began as a grassroots effort to identify the most common and important "
    "real-world cyberattacks affecting enterprises. They translate expert knowledge "
    "into practical defensive actions and reflect input from security experts across "
    "government, industry, IT, auditing, threat response, and other sectors."
),
    retrieval_context=[
        "The CIS Critical Security Controls® (CIS Controls®) started as a simple grassroots activity "
        "to identify the most common and important real-world cyber-attacks that affect enterprises every day, "
        "translate that knowledge and experience into positive, constructive action for defenders, and then share "
        "that information with a wider audience.",
        "The CIS Controls reflect the combined knowledge of experts from every part of the ecosystem, "
        "including companies, governments, individuals, threat responders, analysts, technologists, "
        "IT operators, defenders, and auditors."
    ]
)

faithfulness = FaithfulnessMetric(
    threshold=0.7,
    model=judge
)

relevancy = AnswerRelevancyMetric(
    threshold=0.7,
    model=judge
)

evaluate(
    test_cases=[test_case],
    metrics=[faithfulness, relevancy]
)