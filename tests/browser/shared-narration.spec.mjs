import { test, expect } from "@playwright/test";
import { prepare, start, catalog, translations } from "./helpers/narration.mjs";

const heading = {
  id: "heading",
  role: "region-heading",
  display: "Rojo",
  narration: "rojo",
};
const context = {
  id: "context",
  role: "shared-context",
  display: "Contexto",
  narration: "azul",
};
const item = { id: "item", role: "item", display: "Verde", narration: "verde" };
const fact = {
  id: "fact",
  role: "explanation",
  display: "Explicación",
  narration: "verde",
};

async function finishPairs(page, count, offset = 0) {
  for (let step = 0; step < count * 2; step++) {
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(offset + step + 1);
    await page.evaluate(() => window.narrationTest.finish());
  }
  await expect(page.locator("#learning-narration")).toHaveClass(
    /learning-narration--complete/,
  );
}

for (const locale of ["en-US", "fi-FI"]) {
  test.describe(locale, () => {
    test.use({ locale });
    for (const mode of ["recorded", "browser"]) {
      test(`${mode}: completed shared pairs skip while items, facts and changed context still play`, async ({
        page,
      }) => {
        await prepare(page, mode);
        await start(page, {
          regionId: "region-a",
          segments: [heading, item, context, fact],
        });
        await finishPairs(page, 4);
        const nextItem = { ...item, display: "Azul", narration: "azul" };
        await start(page, {
          regionId: "region-a",
          segments: [heading, nextItem, context, fact],
        });
        await expect
          .poll(() => page.evaluate(() => window.narrationTest.played.length))
          .toBe(9);
        const rows = page.locator(".learning-narration__line");
        for (const index of [0, 2]) {
          await expect(rows.nth(index)).toHaveClass(
            /learning-narration__line--remembered/,
          );
          await expect(
            rows.nth(index).locator(".learning-narration__source"),
          ).toHaveCSS("color", "rgba(255, 255, 255, 0.12)");
        }
        await expect(
          rows.nth(0).locator(".learning-narration__source"),
        ).toHaveText("Rojo");
        await expect(
          rows.nth(0).locator(".learning-narration__ink"),
        ).toHaveText(translations[locale.slice(0, 2)].rojo);
        await finishPairs(page, 2, 8);
        const played = await page.evaluate(() =>
          window.narrationTest.played.slice(8),
        );
        expect(played).toEqual(
          ["azul", "verde"].flatMap((key) =>
            ["es-ES", locale].map((language) =>
              mode === "recorded"
                ? { id: catalog[language][key], rate: 3 }
                : {
                    text: `${language === "es-ES" ? key : translations[locale.slice(0, 2)][key]}.`,
                    language,
                    rate: 0.84 * 3,
                  },
            ),
          ),
        );
        // Even when its spoken wording is unchanged, a changed displayed
        // measurement must be read again instead of silently disappearing.
        await start(page, {
          regionId: "region-a",
          segments: [
            heading,
            nextItem,
            { ...context, display: "Nuevo contexto" },
            fact,
          ],
        });
        await expect(
          page.locator(".learning-narration__line--remembered"),
        ).toHaveCount(1);
        await finishPairs(page, 3, 12);
      });
    }
  });
}

for (const mode of ["recorded", "browser"]) {
  test(`${mode}: interrupted translation is replayed, and completed headings survive an interrupted item`, async ({
    page,
  }) => {
    await prepare(page, mode);
    const target = { regionId: "region-a", segments: [heading, item] };
    await start(page, target);
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(1);
    await page.evaluate(() => window.narrationTest.finish());
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(2);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("spectrum:cancel-tts")),
    );
    await start(page, target);
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(3);
    await expect(
      page.locator(".learning-narration__line--remembered"),
    ).toHaveCount(0);
    await page.evaluate(() => window.narrationTest.finish());
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(4);
    await page.evaluate(() => window.narrationTest.finish());
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(5);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("spectrum:cancel-tts")),
    );
    await start(page, target);
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(6);
    await expect(
      page.locator(".learning-narration__line--remembered"),
    ).toHaveCount(1);
    const last = await page.evaluate(() => window.narrationTest.played.at(-1));
    expect(mode === "recorded" ? last.id : last.text).toBe(
      mode === "recorded" ? catalog["es-ES"].verde : "verde.",
    );
  });
}

test("region changes, leaving an experience and reload clear shared memory", async ({
  page,
}) => {
  await prepare(page, "recorded");
  const target = { regionId: "region-a", segments: [heading] };
  await start(page, target);
  await finishPairs(page, 1);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("spectrum:narration-region", {
        detail: { regionId: "region-b" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("spectrum:narration-region", {
        detail: { regionId: "region-a" },
      }),
    );
  });
  await start(page, target);
  await finishPairs(page, 1, 2);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("spectrum:scene-inactive")),
  );
  await start(page, target);
  await finishPairs(page, 1, 4);
  await page.reload();
  await start(page, target);
  await finishPairs(page, 1);
});

test("legacy targets, unknown roles and headings that also name an item always repeat", async ({
  page,
}) => {
  await prepare(page, "recorded");
  let offset = 0;
  for (const detail of [
    {
      regionId: "region-a",
      segments: [heading, { ...heading, id: "item", role: "item" }],
    },
    { regionId: "region-a", segments: [{ ...heading, role: "future-role" }] },
    { regionId: "region-a", parts: ["Rojo"], narrationParts: ["rojo"] },
  ]) {
    for (let repeat = 0; repeat < 2; repeat++) {
      await start(page, detail);
      await expect(
        page.locator(".learning-narration__line--remembered"),
      ).toHaveCount(0);
      await finishPairs(page, 1, offset);
      offset += 2;
    }
  }
});

test("nearby real items share context while retaining their own names and explanations", async ({
  page,
}) => {
  await prepare(page, "browser", {
    appId: "13",
    appFile: "13_espectro_materia_energia_es_global.html",
  });
  // The same proportions land in the quarks region at both viewport sizes.
  const size = page.viewportSize();
  await page.mouse.move(size.width * 0.53, size.height * 0.474);
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => window.narrationTest.played.length))
    .toBe(1);
  await page.mouse.up();
  await finishPairs(page, 4);
  await page.mouse.move(size.width * 0.22, size.height * 0.474);
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => window.narrationTest.played.length))
    .toBe(9);
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.narrationTest.played.at(-1).text),
  ).toBe("quark down.");
  await expect(page.locator("#readout")).toHaveAttribute(
    "data-narration-region",
    "quarks",
  );
  await expect(
    page.locator(".learning-narration__line--remembered"),
  ).toHaveCount(2);
  await finishPairs(page, 2, 8);
});
