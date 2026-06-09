from deepeval.dataset import EvaluationDataset
from deepeval.test_case import LLMTestCase


goldens = [
    LLMTestCase(
        input="What are CIS Controls?",
        expected_output=(
            "The CIS Critical Security Controls are cybersecurity best practices "
            "that help organizations focus on the most important defensive actions "
            "against common real-world cyberattacks."
        ),
        retrieval_context=[
            "The CIS Critical Security Controls started as a grassroots activity to identify "
            "the most common and important real-world cyber-attacks that affect enterprises every day.",
            "The CIS Controls reflect the combined knowledge of experts from companies, governments, "
            "threat responders, IT operators, defenders, auditors, and other sectors."
        ],
        actual_output=""
    ),
    LLMTestCase(
        input="Why were the CIS Controls created?",
        expected_output=(
            "They were created to help people and enterprises focus on the most important "
            "steps needed to defend themselves from real-world cyberattacks."
        ),
        retrieval_context=[
            "The original goals were modest—to help people and enterprises focus their attention "
            "and get started on the most important steps to defend themselves from the attacks that really mattered."
        ],
        actual_output=""
    ),
    LLMTestCase(
        input="Who contributes to the CIS Controls?",
        expected_output=(
            "The CIS Controls are supported by experts from many parts of the cybersecurity ecosystem, "
            "including governments, companies, threat responders, IT defenders, auditors, policy-makers, "
            "and solution providers."
        ),
        retrieval_context=[
            "The CIS Controls reflect the combined knowledge of experts from every part of the ecosystem "
            "(companies, governments, individuals), with every role including threat responders, analysts, "
            "IT operators, defenders, auditors, policy-makers, and solution providers."
        ],
        actual_output=""
    ),
]

dataset = EvaluationDataset(test_cases=goldens)

dataset.save_as(
    file_type="json",
    directory="./eval_data"
)

print(f"Saved {len(goldens)} manual goldens.")