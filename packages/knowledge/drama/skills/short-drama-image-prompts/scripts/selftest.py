#!/usr/bin/env python3
"""Offline self-test for the standalone image-prompt checker."""

from __future__ import annotations

import copy
import sys
from typing import Any

from image_prompt_check import SKILL_ROOT, ValidationError, load_jsonl, validate_records

MINIMUM_PYTHON = (3, 9)
if sys.version_info < MINIMUM_PYTHON:
    raise SystemExit("selftest.py requires Python 3.9 or newer")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def fail(records: list[dict[str, Any]], sources: dict[str, dict[str, Any]], marker: str) -> None:
    try:
        validate_records(records, sources)
    except ValidationError as exc:
        require(marker in str(exc), f"expected {marker!r}, got {exc!s}")
    else:
        raise AssertionError(f"expected failure containing {marker!r}")


def expanded(ref: dict[str, Any], sources: dict[str, dict[str, Any]]) -> dict[str, Any]:
    entry = sources[ref["src"]]
    inline = {key: entry[key] for key in ("owner", "artifact")}
    inline.update({key: value for key, value in ref.items() if key != "src"})
    return inline


def main() -> int:
    sources, records = load_jsonl(SKILL_ROOT / "examples/minimal-image-prompt-specs.jsonl")
    require(validate_records(records, sources)["specs"] == 1, "valid fixture count")
    require(len(sources) == 3, "fixture declares its upstream snapshots once")

    duplicate = [records[0], copy.deepcopy(records[0])]
    fail(duplicate, sources, "duplicate spec_id")

    bad_order = copy.deepcopy(records)
    bad_order[0]["reference_bindings"].append(copy.deepcopy(bad_order[0]["reference_bindings"][0]))
    fail(bad_order, sources, "duplicate slot_id")

    leaked = copy.deepcopy(records)
    leaked[0]["provider"] = "example"
    fail(leaked, sources, "provider execution fields")

    # A/B Round 2: the suite forbids provider control syntax in a generic prompt,
    # but nothing enforced it — the only prompt check was for leaked hashes.
    # Generic quality language is `IMG-02`, a `craft_default`; it is not checked
    # here, because a validator cannot block delivery on a fixed word list.
    for syntax in ("--ar 9:16", "(red coat:1.2)", "cat::2"):
        engine_syntax = copy.deepcopy(records)
        engine_syntax[0]["generic_prompt"] += f" {syntax}"
        fail(engine_syntax, sources, "engine-specific syntax")

    nested_provider = copy.deepcopy(records)
    nested_provider[0]["reference_bindings"][0]["provider"] = "example"
    fail(nested_provider, sources, "reference_bindings[0].provider")

    nested_secret = copy.deepcopy(records)
    nested_secret[0]["asset_binding"]["credentials"] = {"token": "not-safe"}
    fail(nested_secret, sources, "asset_binding.credentials")

    undeclared = copy.deepcopy(records)
    undeclared[0]["asset_binding"]["identity_ref"]["src"] = "no-such-source"
    fail(undeclared, sources, "REF_SRC_IS_NOT_DECLARED")

    unbound = copy.deepcopy(records)
    del unbound[0]["source_refs"][0]["src"]
    fail(unbound, sources, "REF_HAS_NO_UPSTREAM_BINDING")

    # Projects released before the sources declaration write the snapshot inline on
    # every reference; both forms resolve to the same upstream binding.
    inline = copy.deepcopy(records)
    binding = inline[0]["asset_binding"]
    binding["identity_ref"] = expanded(binding["identity_ref"], sources)
    binding["variant_ref"] = expanded(binding["variant_ref"], sources)
    inline[0]["source_refs"] = [expanded(ref, sources) for ref in inline[0]["source_refs"]]
    for slot in inline[0]["reference_bindings"]:
        slot["artifact_ref"] = expanded(slot["artifact_ref"], sources)
    require(validate_records(inline, {})["specs"] == 1, "inline snapshots resolve without sources")

    print("10 self-tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
