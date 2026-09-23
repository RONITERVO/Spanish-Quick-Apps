import { createServer } from "node:http";
import { createReadStream, watch } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { build, root, output } from "./build.mjs";

const development = process.argv.includes("--watch");
if (development) await build();
const directory = output;
const port = Number(process.env.PORT || 4183);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
};

export function resolvePath(directory, url) {
  const pathname = decodeURIComponent(
    new URL(url, "http://localhost").pathname,
  );
  const file = path.resolve(
    directory,
    "." + pathname,
    pathname.endsWith("/") ? "index.html" : "",
  );
  if (file !== directory && !file.startsWith(directory + path.sep))
    throw new Error("Path outside served directory");
  return file;
}

createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    const file = resolvePath(directory, request.url);
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const headers = {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Accept-Ranges": "bytes",
    };
    const range = request.headers.range;
    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      const start = Number(match?.[1]);
      const end = match?.[2] ? Number(match[2]) : info.size - 1;
      if (!match || start > end || end >= info.size) {
        response
          .writeHead(416, { "Content-Range": `bytes */${info.size}` })
          .end();
        return;
      }
      response.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Content-Length": end - start + 1,
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(file, { start, end }).pipe(response);
    } else {
      response.writeHead(200, { ...headers, "Content-Length": info.size });
      if (request.method === "HEAD") response.end();
      else createReadStream(file).pipe(response);
    }
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Serving ${directory} at http://127.0.0.1:${port}`),
);

if (development) {
  let timer;
  let rebuilding = false;
  let dirty = false;
  async function rebuild() {
    if (rebuilding) {
      dirty = true;
      return;
    }
    rebuilding = true;
    try {
      await build({ clean: false });
    } catch (error) {
      console.error(error);
    }
    rebuilding = false;
    if (dirty) {
      dirty = false;
      await rebuild();
    }
  }
  for (const folder of ["src", "learning-translations"])
    watch(path.join(root, folder), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 150);
    });
}
