"""Narrative VAR evaluation runner.

    python -m app.evaluation.run_eval                 # deterministic labelled fixtures, all scenarios
    python -m app.evaluation.run_eval --foundry        # also run the Foundry groundedness evaluator when configured

Writes a JSON report to app/evaluation/results/ and prints a summary table. The report
records exactly which evaluators ran. Scores are never fabricated: if the Foundry
evaluator is not configured, the report says so.
"""
from __future__ import annotations

import argparse
import json
import platform
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.evaluation.dataset import build_dataset
from app.services.match_store import MatchStore
from app.verification.verifier import verify_text

RESULTS = Path(__file__).resolve().parent / "results"


def run(use_foundry: bool = False) -> dict:
    store = MatchStore()
    rows = []
    for key in ("comeback", "momentum-paradox", "hidden-hero"):
        m = store.generate(key)
        for case in build_dataset(m):
            r = verify_text(m.events, case.text, m.home, m.away, at_t=case.at_t, match_id=m.meta.id)
            rows.append({"id": case.id, "scenario": key, "category": case.category, "text": case.text, "expected": case.expected, "got": r.status,
                         "pass": r.status == case.expected, "at_t": case.at_t, "notes": case.notes,
                         "claims": [{"metric": c.claim.metric, "subject": c.claim.player_name or c.claim.team, "claimed": c.claim.value, "actual": c.actual_value, "status": c.status,
                                     "evidence_ids": [e.event_id for e in c.evidence][:6]} for c in r.claims],
                         "corrected_text": r.corrected_text})
    by_cat: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        by_cat[row["category"]]["total"] += 1
        by_cat[row["category"]]["pass"] += int(row["pass"])
    confusion: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        confusion[row["expected"]][row["got"]] += 1
    total = len(rows)
    passed = sum(1 for r in rows if r["pass"])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "python": platform.python_version(),
        "evaluators_ran": ["deterministic-labelled-fixtures"],
        "ai_mode": "demo",
        "summary": {"total": total, "passed": passed, "accuracy": round(passed / total, 4) if total else None,
                    "by_category": {k: {"total": v["total"], "passed": v["pass"], "accuracy": round(v["pass"] / v["total"], 3)} for k, v in sorted(by_cat.items())},
                    "confusion": {k: dict(v) for k, v in confusion.items()}},
        "cases": rows,
        "foundry_groundedness": {"ran": False, "reason": "not requested (pass --foundry)"},
    }
    if use_foundry:
        from app.ai.provider import resolve_provider
        from app.evaluation.groundedness import run_groundedness_sync, context_from_result
        st = resolve_provider()
        report["ai_mode"] = st.provider.mode
        if st.provider.mode != "foundry":
            report["foundry_groundedness"] = {"ran": False, "reason": "Foundry mode not active: " + "; ".join(st.notes)}
        elif not settings.enable_groundedness_evaluator:
            report["foundry_groundedness"] = {"ran": False, "reason": "ENABLE_GROUNDEDNESS_EVALUATOR is false"}
        else:
            scored = []
            for key in ("comeback",):
                m = store.generate(key)
                for case in build_dataset(m)[:8]:
                    r = verify_text(m.events, case.text, m.home, m.away, at_t=case.at_t, match_id=m.meta.id)
                    out = run_groundedness_sync(case.text, context_from_result(r))
                    scored.append({"id": case.id, "expected": case.expected, "var_status": r.status, "groundedness": out})
            ran = any(s["groundedness"].get("ran") for s in scored)
            report["foundry_groundedness"] = {"ran": ran, "evaluator": "azure.ai.evaluation.GroundednessEvaluator", "cases": scored}
            if ran:
                report["evaluators_ran"].append("azure-ai-evaluation GroundednessEvaluator")
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--foundry", action="store_true", help="also run the Foundry groundedness evaluator when configured")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    report = run(use_foundry=args.foundry)
    RESULTS.mkdir(parents=True, exist_ok=True)
    out = Path(args.out) if args.out else RESULTS / ("latest-foundry.json" if args.foundry else "latest-demo.json")
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    s = report["summary"]
    print(f"Narrative VAR evaluation: {s['passed']}/{s['total']} cases ({s['accuracy']:.1%})  evaluators: {', '.join(report['evaluators_ran'])}")
    for cat, v in s["by_category"].items():
        print(f"  {cat:<24} {v['passed']:>3}/{v['total']:<3} {v['accuracy']:.0%}")
    fails = [c for c in report["cases"] if not c["pass"]]
    for c in fails:
        print(f"  FAIL {c['id']}: expected {c['expected']} got {c['got']} :: {c['text']}")
    print(f"Groundedness: {report['foundry_groundedness'].get('ran')} ({report['foundry_groundedness'].get('reason', 'see report')})")
    print(f"Report: {out}")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
