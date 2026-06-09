from pathlib import Path
import inspect

from deepeval.synthesizer import Synthesizer
from deepeval.dataset import EvaluationDataset
from deepeval.models import OllamaModel


judge = OllamaModel(model="llama3.2:1b")

synthesizer = Synthesizer(model=judge)


def load_contexts_from_txt(file_path, max_contexts=5):
    text = Path(file_path).read_text(encoding="utf-8", errors="ignore")

    sections = text.split("PAGE ")

    contexts = []

    for section in sections:
        section = section.strip()

        if len(section) < 500:
            continue

        # Try to read the page number from the beginning of the section
        first_line = section.split("\n")[0].strip()

        try:
            page_number = int(first_line.split()[0])
        except ValueError:
            continue

        # Skip front matter / table of contents pages
        if page_number < 10:
            continue

        # Skip table of contents-like text
        lower_section = section.lower()
        if "contents" in lower_section and "control 09" in lower_section:
            continue

        # Skip index / appendix-like pages
        if "controls and safeguards index" in lower_section:
            continue

        contexts.append([section[:2500]])

        if len(contexts) >= max_contexts:
            break

    return contexts


contexts = load_contexts_from_txt(
    "docs/cis_controls_clean.txt",
    max_contexts=5
)

print(f"Loaded contexts: {len(contexts)}")

if len(contexts) == 0:
    raise ValueError("No contexts loaded. Check docs/cis_controls_clean.txt.")


method = synthesizer.generate_goldens_from_contexts
signature = inspect.signature(method)
params = signature.parameters

kwargs = {}

if "contexts" in params:
    kwargs["contexts"] = contexts

if "include_expected_output" in params:
    kwargs["include_expected_output"] = True

if "max_goldens_per_context" in params:
    kwargs["max_goldens_per_context"] = 1

if "num_goldens_per_context" in params:
    kwargs["num_goldens_per_context"] = 1

if "num_evolutions" in params:
    kwargs["num_evolutions"] = 1


try:
    synthesizer.generate_goldens_from_contexts(**kwargs)
except TypeError:
    synthesizer.generate_goldens_from_contexts(contexts)


dataset = EvaluationDataset(goldens=synthesizer.synthetic_goldens)

print(f"Generated goldens: {len(dataset.goldens)}")

if len(dataset.goldens) == 0:
    print("No goldens were generated.")
else:
    dataset.save_as(
        file_type="json",
        directory="./eval_data"
    )

    g = dataset.goldens[0]

    print("\nGenerated question:")
    print(g.input)

    print("\nExpected answer:")
    print(g.expected_output)

    print("\nContext:")
    print(g.context)