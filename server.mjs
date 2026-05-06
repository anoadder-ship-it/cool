/**
 * server.mjs — esbuild production build + optional dev server
 * Completely bypasses Vite/Rolldown.
 *
 * Production build (Vercel):  node server.mjs --build
 * Local dev server:           node server.mjs
 */

import * as esbuild from "esbuild";
import http from "http";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.argv.includes("--build");
const PORT = process.env.PORT || 5173;

// ── Polyfill banner — injected at the top of every JS bundle ─────────────────
const banner = `(function(){
  if(typeof globalThis.process==="undefined"){
    globalThis.process={env:{},browser:true,version:"",platform:"browser"};
  }
  if(typeof globalThis.global==="undefined"){
    globalThis.global=globalThis;
  }
})();`;

// ── Shared esbuild options ────────────────────────────────────────────────────
const buildOptions = {
  entryPoints: ["src/main.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  jsx: "automatic",
  loader: {
    ".tsx": "tsx",
    ".ts":  "ts",
    ".jsx": "jsx",
    ".js":  "js",
    ".css": "css",
    ".svg": "dataurl",
    ".png": "file",
    ".jpg": "file",
    ".jpeg":"file",
    ".gif": "file",
    ".webp":"file",
    ".woff":"file",
    ".woff2":"file",
    ".ttf": "file",
    ".eot": "file",
    ".json":"json",
  },
  define: {
    global:                   "globalThis",
    "process.env.NODE_ENV":   isProd ? '"production"' : '"development"',
    "process.env":            "{}",
    "process.browser":        "true",
    "process.version":        '""',
    "process.platform":       '"browser"',
  },
  banner: { js: banner },
  inject: ["./esbuild-inject.js"],
  alias: {
    "@": path.resolve(__dirname, "src"),
  },
};

// ── Build Tailwind CSS ────────────────────────────────────────────────────────
function buildCSS(outPath) {
  console.log("Building Tailwind CSS...");
  try {
    execSync(
      `npx tailwindcss -i ./src/index.css -o ${outPath} --minify`,
      { stdio: "inherit" }
    );
  } catch (e) {
    console.warn("Tailwind CLI failed, copying raw index.css:", e.message);
    fs.copyFileSync("src/index.css", outPath);
  }
}

// ── Copy public/ → dest/ ─────────────────────────────────────────────────────
function copyPublic(dest) {
  if (!fs.existsSync("public")) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync("public")) {
    fs.copyFileSync(path.join("public", f), path.join(dest, f));
  }
}

// ── Write index.html with bundled assets injected ────────────────────────────
function buildHtml(jsName, cssName, outDir) {
  let html = fs.readFileSync("index.html", "utf-8");
  // Remove the dev <script type="module"> tag
  html = html.replace(/<script type="module" src="\/src\/main\.tsx"><\/script>/, "");
  // Inject CSS + JS before </body>
  html = html.replace(
    "</body>",
    `  <link rel="stylesheet" href="/${cssName}">\n  <script src="/${jsName}"></script>\n</body>`
  );
  fs.writeFileSync(path.join(outDir, "index.html"), html);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION BUILD
// ─────────────────────────────────────────────────────────────────────────────
if (isProd) {
  const outDir = "dist";
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });

  copyPublic(outDir);
  buildCSS(path.join(outDir, "assets", "index.css"));

  await esbuild.build({
    ...buildOptions,
    outfile: path.join(outDir, "assets", "main.js"),
    minify: true,
  });

  buildHtml("assets/main.js", "assets/index.css", outDir);
  console.log("\n✅ Production build complete → /dist");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEV SERVER
// ─────────────────────────────────────────────────────────────────────────────
const devOut = "dist-dev";
fs.mkdirSync(devOut, { recursive: true });

const ctx = await esbuild.context({
  ...buildOptions,
  outfile: `${devOut}/main.js`,
  sourcemap: true,
  minify: false,
});

await ctx.watch();
buildCSS(`${devOut}/index.css`);
copyPublic(devOut);

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".webp": "image/webp",
};

http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  let filePath = path.join(__dirname, devOut, url === "/" ? "index.html" : url);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback — serve index.html with injected assets
    let html = fs.readFileSync("index.html", "utf-8");
    html = html.replace(
      '<script type="module" src="/src/main.tsx"></script>',
      '<link rel="stylesheet" href="/index.css">\n  <script src="/main.js"></script>'
    );
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(fs.readFileSync(filePath));
}).listen(PORT, "0.0.0.0", () => {
  console.log(`\nBurnBox dev server → http://localhost:${PORT}`);
});
