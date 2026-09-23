import { test, expect } from "@playwright/test";
import {
  prepare,
  start,
  sourceKeys,
  displayParts,
  catalog,
  translations,
} from "./helpers/narration.mjs";

for (const locale of ["en-US", "fi-FI"]) {
  test.describe(locale, () => {
    test.use({ locale });
    for (const mode of ["recorded", "browser"]) {
      test(`${mode} narration alternates each pair and writes translation over Spanish`, async ({
        page,
      }) => {
        await prepare(page, mode);
        await start(page);
        const translated = sourceKeys.map(
          (key) => translations[locale.slice(0, 2)][key],
        );
        const rows = page.locator(".learning-narration__line");
        const overlay = page.locator("#learning-narration");
        for (let step = 0; step < 6; step++) {
          const index = Math.floor(step / 2);
          const translating = step % 2 === 1;
          const language = translating ? locale : "es-ES";
          const spoken = translating ? translated[index] : sourceKeys[index];
          await expect
            .poll(() => page.evaluate(() => window.narrationTest.played.length))
            .toBe(step + 1);
          const played = await page.evaluate(() =>
            window.narrationTest.played.at(-1),
          );
          expect(played).toEqual(
            mode === "recorded"
              ? { id: catalog[language][sourceKeys[index]], rate: 3 }
              : { text: `${spoken}.`, language, rate: 0.84 * 3 },
          );
          await expect(overlay).not.toHaveClass(/learning-narration--complete/);
          await expect(rows.nth(index)).toHaveClass(
            /learning-narration__line--speaking/,
          );
          await expect(
            rows.nth(index).locator(".learning-narration__source"),
          ).toHaveText(displayParts[index]);
          for (let previous = 0; previous < index; previous++) {
            await expect(
              rows.nth(previous).locator(".learning-narration__ink"),
            ).toHaveText(translated[previous]);
          }
          for (let next = index + 1; next < 3; next++) {
            await expect(
              rows.nth(next).locator(".learning-narration__ink"),
            ).toBeEmpty();
          }
          if (translating) {
            await expect(rows.nth(index)).toHaveClass(
              /learning-narration__line--translating/,
            );
            await expect(
              rows.nth(index).locator(".learning-narration__source"),
            ).toHaveCSS("color", "rgba(255, 255, 255, 0.2)");
            const overlap = await rows.nth(index).evaluate((row) => {
              const source = row
                .querySelector(".learning-narration__source")
                .getBoundingClientRect();
              const ink = row
                .querySelector(".learning-narration__ink")
                .getBoundingClientRect();
              return Math.abs(source.x - ink.x) + Math.abs(source.y - ink.y);
            });
            expect(overlap).toBeLessThan(1);
          }
          await page.evaluate(() => window.narrationTest.advance());
          await expect(
            rows.nth(index).locator(".learning-narration__ink"),
          ).not.toBeEmpty();
          await page.evaluate(() => window.narrationTest.finish());
        }
        await expect(overlay).toHaveClass(/learning-narration--complete/);
        await expect(
          page.locator(".learning-narration__line--translated"),
        ).toHaveCount(3);
        await expect(page.locator(".learning-narration__ink")).toHaveText(
          translated,
        );
      });
    }
  });
}

for (const mode of ["recorded", "browser"]) {
  test(`${mode} cancellation during translation prevents later lines and allows restart`, async ({
    page,
  }) => {
    await prepare(page, mode);
    await start(page);
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(1);
    await page.evaluate(() => window.narrationTest.finish());
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(2);
    await page.evaluate(async () => {
      const lateFinish = window.narrationTest.finish;
      window.dispatchEvent(new Event("spectrum:cancel-tts"));
      lateFinish();
      await new Promise(requestAnimationFrame);
    });
    await expect(page.locator("#learning-narration")).not.toHaveClass(
      /learning-narration--active/,
    );
    expect(await page.evaluate(() => window.narrationTest.played.length)).toBe(
      2,
    );
    await start(page);
    await expect
      .poll(() => page.evaluate(() => window.narrationTest.played.length))
      .toBe(3);
    const restarted = await page.evaluate(() =>
      window.narrationTest.played.at(-1),
    );
    expect(mode === "recorded" ? restarted.id : restarted.language).toBe(
      mode === "recorded" ? catalog["es-ES"].rojo : "es-ES",
    );
    await expect(
      page.locator(".learning-narration__line--translating"),
    ).toHaveCount(0);
    await expect(
      page.locator(".learning-narration__line--translated"),
    ).toHaveCount(0);
  });
}
