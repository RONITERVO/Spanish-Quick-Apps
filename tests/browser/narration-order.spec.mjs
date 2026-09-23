import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const sourceKeys = ["rojo", "verde", "azul"];
const displayParts = ["Rojo", "Verde", "Azul"];
const context = { window: {} };
for (const path of [
  "assets/syncvoice/catalogs/01.js",
  "learning-translations/en/01.js",
  "learning-translations/fi/01.js",
]) {
  vm.runInNewContext(
    await readFile(new URL(`../../${path}`, import.meta.url), "utf8"),
    context,
  );
}
const catalog = context.window.SpectrumSyncVoiceCatalogs["01"];
const translations = context.window.SpectrumLearningTranslations["01"];

async function prepare(page, mode) {
  // Control segment completion without relying on recording duration or a
  // browser's installed speech voices. The actual player and caption DOM run.
  await page.addInitScript(() => {
    const state = (window.narrationTest = {
      played: [],
      finish: null,
      advance: null,
    });
    window.Audio = function () {
      const audio = document.createElement("audio");
      let src = "";
      let time = 0;
      let paused = true;
      Object.defineProperties(audio, {
        src: {
          get: () => src,
          set: (value) => {
            src = value;
          },
        },
        currentTime: {
          get: () => time,
          set: (value) => {
            time = value;
          },
        },
        paused: { get: () => paused },
      });
      audio.pause = () => {
        paused = true;
      };
      audio.load = () => {
        src = "";
        time = 0;
      };
      audio.play = () => {
        paused = false;
        if (src.includes(".mp3")) {
          state.played.push({
            id: new URL(src).pathname.split("/").pop().replace(".mp3", ""),
            rate: audio.playbackRate,
          });
          state.finish = audio.onended;
          state.advance = () => {
            time = 0.5;
          };
          queueMicrotask(() => audio.onplaying?.());
        }
        return Promise.resolve();
      };
      return audio;
    };
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(text) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        cancel() {},
        resume() {},
        speak(utterance) {
          state.played.push({
            text: utterance.text,
            language: utterance.lang,
            rate: utterance.rate,
          });
          state.finish = utterance.onend;
          state.advance = () =>
            utterance.onboundary?.({ charIndex: 2, elapsedTime: 0.5 });
          queueMicrotask(() => utterance.onstart?.());
        },
      },
    });
  });
  if (mode === "browser") {
    await page.route("**/assets/syncvoice/catalogs/01.js?*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "/* Exercise speech fallback. */",
      }),
    );
  } else {
    const transcripts = {};
    for (const language of ["es-ES", "en-US", "fi-FI"]) {
      for (const key of sourceKeys) {
        const id = catalog[language][key];
        const text =
          language === "es-ES" ? key : translations[language.slice(0, 2)][key];
        transcripts[id] = {
          version: 1,
          externalId: id,
          text,
          durationMs: 1000,
          cues: [
            { startMs: 0, endMs: 1000, startChar: 0, endChar: text.length },
          ],
        };
      }
    }
    await page.route("**/assets/syncvoice/transcripts/*.json?*", (route) => {
      const id = new URL(route.request().url()).pathname
        .split("/")
        .pop()
        .replace(".json", "");
      return route.fulfill({ json: transcripts[id] });
    });
  }
  await page.goto("01_espectro_colores_espanol.html");
  await expect(page.locator("html")).toHaveAttribute(
    "data-learning-translations",
    /^[1-9]\d*$/,
  );
  await page.locator("#playback-speed").selectOption("3");
}

async function start(page) {
  await page.evaluate(
    ({ displayParts, sourceKeys }) => {
      window.dispatchEvent(
        new CustomEvent("spectrum:learning-target", {
          detail: {
            parts: displayParts,
            narrationParts: sourceKeys,
            x: 195,
            y: 300,
          },
        }),
      );
      window.SpectrumLearningNarration.speakCurrent();
    },
    { displayParts, sourceKeys },
  );
}

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
