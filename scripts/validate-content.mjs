import { readFile } from "node:fs/promises";
import path from "node:path";

export async function validateRegistry(registry, root) {
  if (!Array.isArray(registry) || !registry.length)
    throw new Error("Registry must contain experiences");
  const ids = new Set();
  const files = new Set();
  for (const app of registry) {
    if (!/^\d{2}$/.test(app.id) || ids.has(app.id))
      throw new Error(`Invalid/duplicate app ID: ${app.id}`);
    if (
      !/^[\w-]+\.html$/.test(app.file) ||
      files.has(app.file) ||
      !app.file.startsWith(app.id + "_")
    )
      throw new Error(`Invalid/duplicate route: ${app.file}`);
    if (!app.label || !app.title || !Array.isArray(app.metadata))
      throw new Error(`Missing metadata: ${app.id}`);
    ids.add(app.id);
    files.add(app.file);
    const folder = path.join(root, "src/experiences", app.id);
    const [content] = await Promise.all([
      readFile(path.join(folder, "content.json"), "utf8").then(JSON.parse),
      ...["scene.js", "style.css", "view.html"].map((file) =>
        readFile(path.join(folder, file)),
      ),
      ...["en", "fi"].map((locale) =>
        readFile(
          path.join(root, "learning-translations", locale, app.id + ".js"),
        ),
      ),
      readFile(path.join(root, "assets/syncvoice/catalogs", app.id + ".js")),
    ]);
    if (content.ZONES) {
      const zoneIds = new Set();
      for (const zone of content.ZONES) {
        if (
          !zone.id ||
          zoneIds.has(zone.id) ||
          !zone.name ||
          !zone.features?.length
        )
          throw new Error(`Invalid zone in ${app.id}: ${zone.id}`);
        zoneIds.add(zone.id);
        if (
          !Array.isArray(zone.color) ||
          zone.color.length !== 3 ||
          zone.color.some((n) => !Number.isFinite(n) || n < 0 || n > 255)
        )
          throw new Error(`Invalid color: ${app.id}/${zone.id}`);
        if (
          zone.features.some(
            (feature) =>
              !Array.isArray(feature) ||
              feature.length !== 2 ||
              feature.some(
                (value) => typeof value !== "string" || !value.trim(),
              ),
          )
        )
          throw new Error(`Invalid features: ${app.id}/${zone.id}`);
      }
    }
  }
}
