import { build as bundle } from "esbuild";
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRegistry } from "./validate-content.mjs";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const output = path.join(root, "dist");
const read = (file) => readFile(path.join(root, file), "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export async function build({ clean = true, copyAssets = true } = {}) {
  const registry = JSON.parse(await read("src/registry.json"));
  await validateRegistry(registry, root);
  if (clean) {
    if (output !== path.join(root, "dist"))
      throw new Error("Unexpected output directory");
    await rm(output, { recursive: true, force: true });
  }
  await mkdir(output, { recursive: true });
  const result = await bundle({
    absWorkingDir: root,
    entryPoints: {
      feed: "src/feed/index.js",
      ...Object.fromEntries(
        registry.map((app) => [`app-${app.id}`, `experience:${app.id}`]),
      ),
    },
    outdir: "dist",
    entryNames: "static/[name]-[hash]",
    chunkNames: "static/shared-[hash]",
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    metafile: true,
    plugins: [
      {
        name: "experience-entry",
        setup(builder) {
          builder.onResolve({ filter: /^experience:/ }, (args) => ({
            path: args.path.slice(11),
            namespace: "experience",
          }));
          builder.onLoad({ filter: /.*/, namespace: "experience" }, (args) => {
            const app = registry.find((item) => item.id === args.path);
            return {
              resolveDir: path.join(root, "src/experiences", app.id),
              contents: `import './style.css';
              import { mountScene } from './scene.js';
              ${app.feedback ? "import { mountFeedback } from '../../shared/floating-feedback.js';" : ""}
              import { mountNarration } from '../../shared/learning-narration.js';
              import { mountNavigation } from '../../shared/app-navigation.js';
              ${app.feedback ? "mountFeedback();" : ""}
              mountScene();
              mountNarration();
              mountNavigation();`,
            };
          });
        },
      },
    ],
  });
  const outputs = Object.entries(result.metafile.outputs);
  function entry(name) {
    const pair = outputs.find(
      ([file, info]) => file.endsWith(".js") && info.entryPoint === name,
    );
    if (!pair) throw new Error(`Missing bundle ${name}`);
    return {
      script: pair[0].replace(/^dist\//, ""),
      css: pair[1].cssBundle?.replace(/^dist\//, ""),
    };
  }
  function document(title, metadata, body, assets) {
    return `<!doctype html>\n<html lang="es">\n<head>\n${metadata
      .map(
        (meta) =>
          "<meta " +
          Object.entries(meta)
            .map(([key, value]) => `${key}="${escape(value)}"`)
            .join(" ") +
          ">",
      )
      .join(
        "\n",
      )}\n<title>${escape(title)}</title>\n<link rel="stylesheet" href="${assets.css}">\n<script type="module" src="${assets.script}"></script>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  }
  for (const app of registry) {
    await writeFile(
      path.join(output, app.file),
      document(
        app.title,
        app.metadata,
        await read(`src/experiences/${app.id}/view.html`),
        entry(`experience:${app.id}`),
      ),
    );
  }
  await writeFile(
    path.join(output, "index.html"),
    document(
      "Espectros en Español",
      [
        { charset: "utf-8" },
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no",
        },
        { name: "theme-color", content: "#050505" },
        {
          name: "description",
          content: `${registry.length} experiencias táctiles para explorar conceptos en español.`,
        },
      ],
      await read("src/feed/view.html"),
      entry("src/feed/index.js"),
    ),
  );
  if (copyAssets) {
    await cp(path.join(root, "assets"), path.join(output, "assets"), {
      recursive: true,
    });
    await cp(
      path.join(root, "learning-translations"),
      path.join(output, "learning-translations"),
      { recursive: true },
    );
  }
  await writeFile(path.join(output, ".nojekyll"), "");
  let revision = process.env.GITHUB_SHA || "local";
  if (revision === "local") {
    try {
      revision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
    } catch {}
  }
  await writeFile(
    path.join(output, "release.json"),
    JSON.stringify({ revision, experiences: registry.length }) + "\n",
  );
  console.log(`Built ${registry.length} experiences and feed → dist/`);
  return result.metafile;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await build();
