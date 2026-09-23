import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const apps = JSON.parse(
  await readFile(new URL("../../src/registry.json", import.meta.url)),
);
const readouts = JSON.parse(
  await readFile(new URL("../fixtures/readouts.json", import.meta.url)),
);

for (const app of apps) {
  test(`${app.id} ${app.label}: original URL, canvas and interactions`, async ({
    page,
  }) => {
    const errors = [];
    const failures = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().endsWith("favicon.ico"))
        failures.push(response.url());
    });
    const response = await page.goto(app.file);
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(app.title);
    await expect(page.locator("html")).toHaveAttribute(
      "data-learning-app",
      app.id,
    );
    await expect
      .poll(() =>
        page.locator("html").getAttribute("data-learning-translations"),
      )
      .toMatch(/^[1-9]\d*$/);
    await expect
      .poll(() => page.locator("html").getAttribute("data-syncvoice-entries"))
      .toMatch(/^[1-9]\d*$/);
    await expect(page.locator("canvas").first()).toBeVisible();
    const viewport = page.viewportSize();
    let sample = 0;
    for (const ratio of [0.23, 0.53, 0.83]) {
      await page.mouse.move(
        Math.round(viewport.width * ratio),
        Math.round(viewport.height * ratio),
      );
      await page.mouse.down();
      if (Number(app.id) >= 3) {
        for (const id of ["zone-name", "feature-name", "metric", "fact"]) {
          await expect(page.locator(`#${id}`)).toHaveText(
            readouts[viewport.width][app.id][sample][id],
          );
        }
      } else if (app.id === "01")
        await expect(page.locator("#color-announcer")).not.toBeEmpty();
      else await expect(page.locator(".touch-ring.visible")).toHaveCount(1);
      await page.mouse.up();
      sample++;
    }
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
  });
}

test("feed deep links, keyboard navigation, bounded frames, and resize", async ({
  page,
}) => {
  await page.goto("#app-12");
  await expect(page.locator("#feed-position")).toHaveText("12 / 25");
  const active = page.locator("iframe").nth(11);
  await expect(active).toHaveAttribute("data-loaded", "true");
  await expect(active.contentFrame().locator("html")).toHaveAttribute(
    "data-scene-active",
    "true",
  );
  await expect(
    page.locator("iframe").nth(10).contentFrame().locator("html"),
  ).toHaveAttribute("data-scene-active", "false");
  await page.locator("#feed-position").evaluate((el) => {
    el.tabIndex = -1;
    el.focus();
  });
  await page.keyboard.press("End");
  await expect(page).toHaveURL(/#app-25$/);
  await expect(page.locator("iframe").nth(24)).toHaveAttribute(
    "data-loaded",
    "true",
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(() =>
      page
        .locator("#app-feed")
        .evaluate((el) => Math.round(el.scrollTop / el.clientHeight)),
    )
    .toBe(24);
  await page.evaluate(() => {
    location.hash = "#app-04";
  });
  await expect(page.locator("#feed-position")).toHaveText("04 / 25");
  await expect(page.locator("iframe").nth(3)).toHaveAttribute(
    "data-loaded",
    "true",
  );
  expect(await page.locator("iframe[src]").count()).toBeLessThanOrEqual(5);
});

test("wheel from embedded scene navigates and cancels narration", async ({
  page,
}) => {
  await page.goto("#app-01");
  const frame = page.locator("iframe").nth(0);
  await expect(frame).toHaveAttribute("data-loaded", "true");
  await page.mouse.move(195, 300);
  await page.mouse.down();
  await expect
    .poll(() =>
      frame
        .contentFrame()
        .locator("html")
        .getAttribute("data-syncvoice-asset-starts"),
    )
    .toMatch(/^[1-9]\d*$/);
  const before = await frame
    .contentFrame()
    .locator("html")
    .getAttribute("data-syncvoice-cancellations");
  await page.mouse.wheel(0, 150);
  await page.mouse.up();
  await expect(page).toHaveURL(/#app-02$/);
  await expect
    .poll(() =>
      frame
        .contentFrame()
        .locator("html")
        .getAttribute("data-syncvoice-cancellations"),
    )
    .not.toBe(before);
  await expect(frame.contentFrame().locator("audio")).toHaveJSProperty(
    "paused",
    true,
  );
});

for (const locale of ["en-US", "fi-FI"])
  test(`hold plays Spanish production audio with ${locale} translation catalog`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      locale,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(new URL(apps[0].file, baseURL).href);
    await expect(page.locator("html")).toHaveAttribute(
      "data-learning-locale",
      locale.slice(0, 2),
    );
    await expect
      .poll(() => page.locator("html").getAttribute("data-syncvoice-entries"))
      .toMatch(/^[1-9]\d*$/);
    await page.locator("#playback-speed").selectOption("3");
    await page.mouse.move(195, 422);
    await page.mouse.down();
    await expect
      .poll(
        () => page.locator("html").getAttribute("data-syncvoice-asset-starts"),
        { timeout: 10000 },
      )
      .toMatch(/^[1-9]\d*$/);
    await expect(page.locator("html")).toHaveAttribute(
      "data-syncvoice-spanish-fallbacks",
      "0",
    );
    await page.mouse.up();
    await expect(page.locator("audio")).toHaveCount(1);
    await expect(page.locator("audio")).toHaveJSProperty("playbackRate", 3);
    await page.keyboard.press("PageDown");
    await expect(page).toHaveURL(new RegExp(apps[1].file));
    await context.close();
  });

test("deliberate swipe changes experiences and keyboard works in direct pages", async ({
  page,
}) => {
  await page.goto("#app-01");
  await expect(page.locator("iframe").nth(0)).toHaveAttribute(
    "data-loaded",
    "true",
  );
  const { height } = page.viewportSize();
  await page.mouse.move(160, height * 0.8);
  await page.mouse.down();
  await page.mouse.move(160, height * 0.2, { steps: 12 });
  await page.mouse.up();
  await expect(page).toHaveURL(/#app-02$/);
  await page.goto(apps[3].file);
  const canvas = page.locator("canvas").first();
  await canvas.focus();
  await page.keyboard.press("PageUp");
  await expect(page).toHaveURL(new RegExp(apps[2].file));
});

test("failed scene load offers retry and recovers without reloading the feed", async ({
  page,
}) => {
  await page.clock.install();
  await page.route(`**/${apps[0].file}`, (route) => route.abort());
  await page.goto("#app-01");
  await page.clock.fastForward(15100);
  const retry = page
    .locator(".app-slide")
    .first()
    .getByRole("button", { name: "Volver a intentar" });
  await expect(retry).toBeVisible();
  await page.unroute(`**/${apps[0].file}`);
  await retry.click();
  await expect(page.locator("iframe").first()).toHaveAttribute(
    "data-loaded",
    "true",
  );
  await expect(retry).not.toBeVisible();
});

test("rapid repeated music touches release every voice", async ({ page }) => {
  await page.goto(apps[1].file);
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(100 + i * 20, 200);
    await page.mouse.down();
    await expect(page.locator(".touch-ring.visible")).toHaveCount(1);
    await page.mouse.up();
  }
  await expect(page.locator(".touch-ring")).toHaveCount(0);
});

test("visual exploration works without Web Audio", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", { value: undefined });
    Object.defineProperty(window, "webkitAudioContext", { value: undefined });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const index of [1, 2, 3]) {
    await page.goto(apps[index].file);
    await page.mouse.move(150, 200);
    await page.mouse.down();
    if (index === 1)
      await expect(page.locator(".touch-ring.visible")).toHaveCount(1);
    else await expect(page.locator("#feature-name")).not.toBeEmpty();
    await page.mouse.up();
  }
  expect(errors).toEqual([]);
});
