"""Model prose is normalised before it reaches the screen or Narrative VAR."""
from app.ai.provider import _parse_json, clean_text


def test_unicode_spaces_become_plain_spaces():
    assert clean_text("North City pressed the​NCF line hard") == "North City pressed the NCF line hard"
    assert clean_text("a b c") == "a b c"


def test_dashes_and_spacing_are_house_style():
    assert clean_text("high‑intensity press — and it worked") == "high-intensity press, and it worked"
    assert clean_text("3–1 win , then  more .") == "3-1 win, then more."
    assert "—" not in clean_text("one—two")


def test_parse_json_cleans_nested_strings():
    raw = '```json\n{"explanation": "the\\u202fNCF surge", "items": ["x\\u00a0y"], "n": 3}\n```'
    assert _parse_json(raw) == {"explanation": "the NCF surge", "items": ["x y"], "n": 3}
    assert _parse_json("Sure! {\"argument\": \"ok\\u2014fine\"}") == {"argument": "ok, fine"}
    assert _parse_json("not json") is None
