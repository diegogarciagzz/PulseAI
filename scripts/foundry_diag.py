"""Direct Foundry diagnostics (no backend needed). Run from pulse-ai/ with the venv active:

    python scripts/foundry_diag.py

Prints the deployments in the project and the FULL error of a minimal Responses API call.
"""
import os
import pathlib
import traceback

env = {}
for line in (pathlib.Path(__file__).resolve().parents[1] / ".env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
endpoint, model = env.get("FOUNDRY_PROJECT_ENDPOINT", ""), env.get("FOUNDRY_MODEL", "")
print(f"endpoint = {endpoint!r}")
print(f"model    = {model!r}")

from azure.identity import AzureCliCredential
from azure.ai.projects import AIProjectClient

project = AIProjectClient(endpoint=endpoint, credential=AzureCliCredential())

print("\n-- Deployments in this project --")
try:
    names = []
    for d in project.deployments.list():
        info = {k: getattr(d, k, None) for k in ("name", "model_name", "model_version", "model_publisher")}
        names.append(info["name"])
        print("  ", info)
    if model not in names:
        print(f"   !! FOUNDRY_MODEL={model!r} is not one of the deployment names above")
except Exception as e:  # noqa: BLE001
    print("   could not list deployments:", type(e).__name__, e)

client = project.get_openai_client()
print("\nOpenAI base_url =", client.base_url)

print("\n-- Test 1: Responses API, system + user --")
try:
    r = client.responses.create(model=model, input=[{"role": "system", "content": "Reply with JSON only."},
                                                    {"role": "user", "content": 'Return {"ok": true} as JSON.'}])
    print("   OK:", r.output_text)
except Exception as e:  # noqa: BLE001
    print("   FAILED:", type(e).__name__)
    print("   ", getattr(e, "status_code", ""), getattr(e, "body", None) or e)

print("\n-- Test 2: Responses API, plain string input --")
try:
    r = client.responses.create(model=model, input='Return {"ok": true} as JSON.')
    print("   OK:", r.output_text)
except Exception as e:  # noqa: BLE001
    print("   FAILED:", type(e).__name__)
    print("   ", getattr(e, "status_code", ""), getattr(e, "body", None) or e)

print("\n-- Test 3: Chat Completions --")
try:
    r = client.chat.completions.create(model=model, messages=[{"role": "user", "content": 'Return {"ok": true} as JSON.'}])
    print("   OK:", r.choices[0].message.content)
except Exception as e:  # noqa: BLE001
    print("   FAILED:", type(e).__name__)
    print("   ", getattr(e, "status_code", ""), getattr(e, "body", None) or e)
