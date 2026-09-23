import { test } from "node:test";
import assert from "node:assert/strict";
import { createSharedNarrationMemory } from "../../src/shared/shared-narration-memory.js";

const heading = {
  id: "heading",
  role: "region-heading",
  display: "Átomos",
  narration: "átomos",
  translation: "atoms",
};
const context = {
  id: "context",
  role: "shared-context",
  display: "10 km",
  narration: "diez kilómetros",
  translation: "ten kilometres",
};
const item = { ...heading, id: "item", role: "item" };
const explanation = { ...heading, id: "fact", role: "explanation" };

test("only completed shared bilingual pairs skip, while identical item/fact text repeats", () => {
  const memory = createSharedNarrationMemory();
  const first = memory.begin(
    "atoms",
    [heading, context, item, explanation],
    "en",
  );
  assert.deepEqual(first.skipped, [false, false, false, false]);
  first.completePair(0);
  first.completePair(2);
  first.completePair(3);
  assert.deepEqual(
    memory.begin("atoms", [heading, context, item, explanation], "en").skipped,
    [true, false, false, false],
  );
});

test("changed display, narration, translation, role and language are read again", () => {
  for (const field of [
    "display",
    "narration",
    "translation",
    "role",
    "locale",
  ]) {
    const memory = createSharedNarrationMemory();
    memory.begin("atoms", [heading], "en").completePair(0);
    const changed =
      field === "locale" ? heading : { ...heading, [field]: "changed" };
    assert.deepEqual(
      memory.begin("atoms", [changed], field === "locale" ? "fi" : "en")
        .skipped,
      [false],
      field,
    );
    // Returning to an old value after an unfinished changed one also reads it.
    assert.deepEqual(
      memory.begin("atoms", [heading], "en").skipped,
      [false],
      field,
    );
  }
});

test("region changes and reset forget context and reject late completions", () => {
  const memory = createSharedNarrationMemory();
  const old = memory.begin("atoms", [heading], "en");
  old.completePair(0);
  memory.setRegion("molecules");
  memory.setRegion("atoms");
  old.completePair(0);
  assert.deepEqual(memory.begin("atoms", [heading], "en").skipped, [false]);
  const current = memory.begin("atoms", [heading], "en");
  current.completePair(0);
  memory.reset();
  current.completePair(0);
  assert.deepEqual(memory.begin("atoms", [heading], "en").skipped, [false]);
});

test("superseded narration and missing or ambiguous metadata cannot suppress content", () => {
  const memory = createSharedNarrationMemory();
  const old = memory.begin("atoms", [heading], "en");
  memory.begin("atoms", [heading], "en");
  old.completePair(0);
  assert.deepEqual(memory.begin("atoms", [heading], "en").skipped, [false]);
  for (const segments of [
    [{ ...heading, role: undefined }],
    [{ ...heading, id: undefined }],
    [{ ...heading, role: "future-role" }],
    [heading, heading],
  ]) {
    const turn = memory.begin("atoms", segments, "en");
    segments.forEach((_, index) => turn.completePair(index));
    assert.ok(
      memory.begin("atoms", segments, "en").skipped.every((value) => !value),
    );
  }
  memory.begin(null, [heading], "en").completePair(0);
  assert.deepEqual(memory.begin(null, [heading], "en").skipped, [false]);
});

test("only shared fields still present in the current target remain remembered", () => {
  const memory = createSharedNarrationMemory();
  const first = memory.begin("atoms", [heading, context], "en");
  first.completePair(0);
  first.completePair(1);
  assert.deepEqual(memory.begin("atoms", [heading], "en").skipped, [true]);
  assert.deepEqual(memory.begin("atoms", [heading, context], "en").skipped, [
    true,
    false,
  ]);
});
