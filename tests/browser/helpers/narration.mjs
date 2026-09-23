import { expect } from "@playwright/test";
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
    await readFile(new URL(`../../../${path}`, import.meta.url), "utf8"),
    context,
  );
}
const catalog = context.window.SpectrumSyncVoiceCatalogs["01"];
const translations = context.window.SpectrumLearningTranslations["01"];

async function prepare(
  page,
  mode,
  { appId = "01", appFile = "01_espectro_colores_espanol.html" } = {},
) {
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
    await page.route(`**/assets/syncvoice/catalogs/${appId}.js?*`, (route) =>
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
  await page.goto(appFile);
  await expect(page.locator("html")).toHaveAttribute(
    "data-learning-translations",
    /^[1-9]\d*$/,
  );
  await page.locator("#playback-speed").selectOption("3");
}

async function start(
  page,
  detail = { parts: displayParts, narrationParts: sourceKeys },
) {
  await page.evaluate((detail) => {
    window.dispatchEvent(
      new CustomEvent("spectrum:learning-target", {
        detail: { x: 195, y: 300, ...detail },
      }),
    );
    window.SpectrumLearningNarration.speakCurrent();
  }, detail);
}

export { prepare, start, sourceKeys, displayParts, catalog, translations };
