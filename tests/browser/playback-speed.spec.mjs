import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const apps = JSON.parse(
  await readFile(new URL("../../src/registry.json", import.meta.url)),
);
const storageKey = "spectrum.narrationSpeed";

test("speed is saved across loaded neighbours, new experiences and reloads", async ({
  page,
}) => {
  await page.goto("#app-01");
  const first = page.locator("iframe").nth(0).contentFrame();
  const next = page.locator("iframe").nth(1).contentFrame();
  await expect(
    first.getByRole("combobox", { name: "Narration speed" }),
  ).toHaveValue("1");
  await expect(next.locator("#playback-speed")).toHaveValue("1");
  await first.locator("#playback-speed").selectOption("2.75");
  await expect(first.locator("audio")).toHaveJSProperty("playbackRate", 2.75);
  await expect(next.locator("#playback-speed")).toHaveValue("2.75");
  await expect(next.locator("audio")).toHaveJSProperty("playbackRate", 2.75);
  await page.evaluate(() => {
    location.hash = "#app-25";
  });
  const last = page.locator("iframe").nth(24).contentFrame();
  await expect(last.locator("#playback-speed")).toHaveValue("2.75");
  await page.reload();
  await expect(last.locator("#playback-speed")).toHaveValue("2.75");
  await page.goto(apps[3].file);
  await expect(page.locator("#playback-speed")).toHaveValue("2.75");
});

// Exercise a real, twenty-second Spanish recording so native media loaders are
// tested too (WebKit can bypass Playwright's media request interception).
const longRecording = JSON.parse(
  await readFile(
    new URL(
      "../../assets/syncvoice/transcripts/sq-es-b159ef526b607824f745b024.json",
      import.meta.url,
    ),
  ),
);

test("changing to 3x keeps audio playing, pitch preserved and captions on media time", async ({
  page,
}) => {
  await page.goto(apps[23].file);
  await page.mouse.click(195, 422);
  await page.evaluate(async (text) => {
    await new Promise(requestAnimationFrame);
    window.dispatchEvent(new Event("spectrum:cancel-tts"));
    window.dispatchEvent(
      new CustomEvent("spectrum:learning-target", {
        detail: { parts: [text] },
      }),
    );
    window.SpectrumLearningNarration.speakCurrent();
  }, longRecording.text);
  await expect(page.locator("html")).toHaveAttribute(
    "data-syncvoice-asset-starts",
    "1",
  );
  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute(
    "src",
    new RegExp(longRecording.externalId),
  );
  const select = page.getByRole("combobox", { name: "Narration speed" });
  const cancellations = await page
    .locator("html")
    .getAttribute("data-syncvoice-cancellations");
  const source = await audio.getAttribute("src");
  await select.dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true });
  await select.dispatchEvent("pointerup", { pointerId: 1, isPrimary: true });
  await select.selectOption("3");
  await expect(audio).toHaveJSProperty("playbackRate", 3);
  await expect(audio).toHaveJSProperty("defaultPlaybackRate", 3);
  await expect(audio).toHaveJSProperty("preservesPitch", true);
  await expect(audio).toHaveJSProperty("paused", false);
  const measuredRate = await audio.evaluate(async (media) => {
    const start = media.currentTime;
    const now = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 650));
    return (media.currentTime - start) / ((performance.now() - now) / 1000);
  });
  expect(measuredRate).toBeGreaterThan(2.4);
  expect(measuredRate).toBeLessThan(3.6);
  await expect(audio).toHaveAttribute("src", source);
  await expect(page.locator("html")).toHaveAttribute(
    "data-syncvoice-cancellations",
    cancellations,
  );
  await expect
    .poll(() =>
      page.evaluate((cues) => {
        const time = document.querySelector("audio").currentTime * 1000;
        let expected = 0;
        for (const cue of cues) {
          if (time < cue.startMs) break;
          if (time >= cue.endMs) expected = cue.endChar;
          else {
            expected =
              cue.startChar +
              ((cue.endChar - cue.startChar) * (time - cue.startMs)) /
                (cue.endMs - cue.startMs);
            break;
          }
        }
        const revealed = document.querySelector(".learning-narration__ink")
          .textContent.length;
        return Math.abs(revealed - Math.round(expected));
      }, longRecording.cues),
    )
    .toBeLessThanOrEqual(2);
  await select.selectOption("1");
  await expect(audio).toHaveJSProperty("playbackRate", 1);
  await expect(audio).toHaveJSProperty("paused", false);
});

test("control gestures and keyboard do not explore or navigate a scene", async ({
  page,
}) => {
  await page.goto(apps[3].file);
  const select = page.locator("#playback-speed");
  const before = await page.locator("#readout").textContent();
  await select.focus();
  await select.press("ArrowDown");
  await select.press("PageDown");
  await select.dispatchEvent("wheel", { deltaY: 150 });
  await select.dispatchEvent("pointerdown", {
    pointerId: 1,
    isPrimary: true,
    clientX: 50,
    clientY: 600,
  });
  await select.dispatchEvent("pointerup", {
    pointerId: 1,
    isPrimary: true,
    clientX: 50,
    clientY: 40,
  });
  await expect(page).toHaveURL(new RegExp(apps[3].file));
  await expect(page.locator("#readout")).toHaveText(before);
  await expect(page.locator("html")).toHaveAttribute(
    "data-syncvoice-asset-starts",
    "0",
  );
  await expect(page.locator("#playback-speed option")).toHaveText([
    "1×",
    "1.25×",
    "1.5×",
    "1.75×",
    "2×",
    "2.25×",
    "2.5×",
    "2.75×",
    "3×",
  ]);
});

test("invalid saved rates fall back to normal and blocked storage does not break controls", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "999"),
    storageKey,
  );
  await page.goto(apps[0].file);
  await expect(page.locator("#playback-speed")).toHaveValue("1");
  await expect(page.locator("audio")).toHaveJSProperty("playbackRate", 1);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.reload();
  await page.locator("#playback-speed").selectOption("3");
  await expect(page.locator("audio")).toHaveJSProperty("playbackRate", 3);
});

test("browser speech fallback uses the selected multiplier", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.spokenRates = [];
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
          window.spokenRates.push(utterance.rate);
          utterance.onstart?.();
        },
      },
    });
  });
  await page.route("**/assets/syncvoice/catalogs/01.js?*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "/* No recordings: exercise browser fallback. */",
    }),
  );
  await page.goto(apps[0].file);
  await page.locator("#playback-speed").selectOption("3");
  await page.mouse.move(195, 422);
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => window.spokenRates))
    .toEqual([0.84 * 3]);
  await page.mouse.up();
});
