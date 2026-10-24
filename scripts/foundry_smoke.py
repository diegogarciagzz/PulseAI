"""Live smoke test against the running backend (default http://127.0.0.1:8000).

Checks that real Microsoft Foundry calls happen (not the demo fallback):
capabilities, one insight explanation, and a full pundit debate.

    python scripts/foundry_smoke.py [base_url]
"""
import json
import sys
import time
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/") + "/api"


def call(method, path, timeout=180):
    req = urllib.request.Request(BASE + path, method=method, data=b"" if method == "POST" else None)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


ok = True
cap = call("GET", "/system/capabilities")
print(f"1. Capabilities: {cap['ai_mode_label']} | model={cap.get('foundry_model')} | credential={cap.get('credential_source')}")
if cap["ai_mode"] != "foundry":
    print("   -> Not in Foundry mode. Check .env and az login, then restart the backend.")
    sys.exit(1)

match = call("GET", "/matches")[0]
print(f"2. Match: {match['title']} ({match['id']})")

insights = call("GET", f"/matches/{match['id']}/insights")
if insights:
    t0 = time.time()
    ex = call("POST", f"/matches/{match['id']}/insights/{insights[0]['id']}/explain")
    src = ex["source"]
    print(f"3. Insight explanation: source={src} | VAR={ex['verification']['status']} | {time.time() - t0:.1f}s")
    print(f"   \"{ex['explanation'] if src == 'demo' else ex['explanation'][:220]}\"")
    ok &= src != "demo"

print("4. Pundit debate (can take up to a minute)...")
t0 = time.time()
d = call("POST", f"/matches/{match['id']}/debate?refresh=true", timeout=300)
print(f"   ai_mode={d['ai_mode']} | rounds={d['rounds']} | {time.time() - t0:.1f}s")
for a in d["arguments"]:
    v = (a.get("verification") or {}).get("status")
    print(f"   - {a['pundit_name']:<12} {a['round']:<9} source={a['source']:<16} VAR={v} pick={a['pick_name']}")
    ok &= a["source"] != "demo"
print(f"   Verdict: {d['verdict_name']} ({d['verdict_rating']})")
print(f"   Moderator: {d['moderator_summary'][:260]}")

print("\nRESULT:", "LIVE FOUNDRY OK" if ok else "SOME CALLS FELL BACK TO DEMO (see backend terminal for the error)")
