import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateRegistry } from "../../scripts/validate-content.mjs";
import { root, output } from "../../scripts/build.mjs";
import path from "node:path";

const json = async (file) =>
  JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
const registry = await json("../../src/registry.json");
const baseline = await json("../fixtures/preservation.json");

test("all original routes and educational data survive migration", async () => {
  assert.equal(registry.length, 25);
  await validateRegistry(registry, root);
  for (const app of registry) {
    const content = await json(`../../src/experiences/${app.id}/content.json`);
    assert.equal(
      createHash("sha256").update(JSON.stringify(content)).digest("hex"),
      baseline[app.id].content,
      app.id,
    );
    const html = await readFile(path.join(output, app.file), "utf8");
    assert.ok(html.includes(`id="${baseline[app.id].canvas}"`), app.file);
    assert.match(
      html,
      /<script type="module" src="static\/app-\d{2}-[A-Z0-9]+\.js"><\/script>/,
    );
  }
});

test("invalid registry entries fail before publishing", async () => {
  await assert.rejects(
    validateRegistry([...registry, registry[0]], root),
    /duplicate app ID/,
  );
  await assert.rejects(
    validateRegistry([{ ...registry[0], file: "../escape.html" }], root),
    /Invalid.*route/,
  );
  await assert.rejects(validateRegistry([], root), /must contain/);
});

test("published output contains only public files and all local entry assets resolve", async () => {
  const files = await readdir(output);
  assert.deepEqual(
    files.filter(
      (file) =>
        !file.endsWith(".html") &&
        ![
          "static",
          "assets",
          "learning-translations",
          ".nojekyll",
          "release.json",
        ].includes(file),
    ),
    [],
  );
  for (const file of files.filter((file) => file.endsWith(".html"))) {
    const html = await readFile(path.join(output, file), "utf8");
    for (const match of html.matchAll(/(?:src|href)="(static\/[^"]+)"/g))
      assert.ok((await stat(path.join(output, match[1]))).isFile());
    assert.doesNotMatch(html, /<style>|<script>(?!<\/script>)/);
  }
  const release = JSON.parse(await readFile(path.join(output, "release.json")));
  assert.equal(release.experiences, registry.length);
});
