# Evaluation

## What is evaluated

Narrative VAR: given commentary text and the authoritative event log, does the verifier return the right status and the right evidence?

## Dataset (`backend/app/evaluation/dataset.py`)

Cases are generated from each of the three synthetic matches so labels are grounded in real computed numbers. 23 cases per match, 69 in total, across six categories:

| Category | Examples | Expected |
| --- | --- | --- |
| supported | true shot counts, a real scorer and minute, real progressive passes, first-half possession, corners, recoveries plus interceptions, a real assist, a real substitution | VERIFIED |
| false-numeric | "dominated the last ten minutes with 85% possession" at 67', shots +7, progressive passes +12, a hat-trick that was a single goal, shots on target +3 | CORRECTED |
| fabricated-contribution | a non-scorer "scored twice", an unused substitute "assisted the winner", a player not in either squad, 6 tackles by a player with 0 minutes | UNSUPPORTED (or CORRECTED to 0 when the player exists) |
| missing-evidence | "look nervous at the back", referee opinion, distance covered (not tracked) | UNVERIFIED |
| contradictory | the team with fewer shots "had more shots"; a scorer "scored" checked 60 s *before* the goal | UNSUPPORTED |
| grounded | goals in a named window | VERIFIED |

## Method

`python -m app.evaluation.run_eval` runs every case through `verify_text` in demo mode (no model calls; numeric checks are deterministic in both modes), compares the overall status to the label, and writes `backend/app/evaluation/results/latest-demo.json` with per-case claims, actual values, evidence ids and a confusion matrix.

`python -m app.evaluation.run_eval --foundry` additionally runs the Microsoft Foundry **GroundednessEvaluator** from `azure-ai-evaluation` on the first eight cases of the comeback match, using the Narrative VAR evidence as `context`. It requires `ENABLE_GROUNDEDNESS_EVALUATOR=true`, `AZURE_OPENAI_ENDPOINT` and a deployment name, and records the raw evaluator output. If the evaluator cannot run, the report says `ran: false` with the reason; no score is invented.

## Results (October 24, 2026, demo mode)

```
Narrative VAR evaluation: 69/69 cases (100.0%)  evaluators: deterministic-labelled-fixtures
  contradictory              6/6   100%
  fabricated-contribution   12/12  100%
  false-numeric             15/15  100%
  grounded                   3/3   100%
  missing-evidence           9/9   100%
  supported                 24/24  100%
Groundedness: False (not requested (pass --foundry))
```

Additional deterministic checks of the system's own generated text (in `tests/test_agents.py`):

- all 6 pundit arguments per match verify as VERIFIED or UNVERIFIED (never corrected or unsupported) in all three scenarios;
- the recap summary in fan and analyst mode verifies;
- every recap insight section re-verifies.

## What did not run

- The Foundry `GroundednessEvaluator` was **not** executed: no Azure credentials or Azure OpenAI endpoint were available in the development environment. The integration code exists (`backend/app/evaluation/groundedness.py`) and is wired into `POST /verify` when enabled.
- No live Foundry inference was run for insight explanations, the debate or recaps for the same reason. The provider, fallback and JSON parsing are covered by unit tests; the Agent Framework path is exercised only to the point of being importable.

## Limitations

- The claim extractor is pattern-based. It covers the metrics the system itself talks about and common commentary phrasings; unusual phrasings fall to UNVERIFIED rather than to a wrong VERIFIED, by design.
- Tolerances (±4 percentage points, ±0.25 xG, exact counts) are a product decision, documented in `verifier.py`.
- The labelled dataset is generated, not human-annotated; its strength is that labels are provably consistent with the data, its weakness is phrasing diversity.
