// server.js
const path = require("path");
const fs = require("fs");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// --- Where things live
const ROOT = __dirname;
const PUB  = path.join(ROOT, "public");
const THREE_ROOT = path.join(ROOT, "node_modules", "three");

// --- Helpful logger
const log = (...args) => console.log("[srv]", ...args);

// --- Basic hardening & correct MIME for ESM
app.use((req, res, next) => {
  // Some hosts misreport .js as text/plain; force a good MIME for modules.
  if (req.path.endsWith(".js")) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  }
  next();
});

// --- Static & vendor mounting
app.use(express.static(PUB));
app.use("/vendor/three", express.static(THREE_ROOT));

// Your patched OrbitControls.js should be at: public/vendor/OrbitControls.js
//   and its first import must be:
//   import { ... } from "/vendor/three/build/three.module.js";

// --- Health & diagnostics
app.get("/healthz", (req, res) => res.type("text").send("ok"));

app.get("/diag", (req, res) => {
  const checks = [
    ["public/index.html", path.join(PUB, "index.html")],
    ["public/main.js", path.join(PUB, "main.js")],
    ["public/style.css", path.join(PUB, "style.css")],
    ["public/vendor/OrbitControls.js", path.join(PUB, "vendor", "OrbitControls.js")],
    ["node_modules/three/build/three.module.js", path.join(THREE_ROOT, "build", "three.module.js")],
  ];
  const rows = checks.map(([name, p]) => {
    const ok = fs.existsSync(p);
    return `<tr><td>${name}</td><td>${ok ? "✅" : "❌"}</td><td><code>${p}</code></td></tr>`;
  }).join("");

  res.send(`<!doctype html>
  <meta charset="utf-8"/>
  <title>diag</title>
  <style>body{font:14px ui-sans-serif,system-ui;margin:20px}td{padding:4px 8px;border-bottom:1px solid #ddd}</style>
  <h1>Diagnostics</h1>
  <p>PORT=${PORT} | ROOT=${ROOT}</p>
  <table><thead><tr><th>File</th><th>Exists</th><th>Path</th></tr></thead><tbody>${rows}</tbody></table>
  <p>Fetch tests:</p>
  <ul>
    <li><a href="/">/</a></li>
    <li><a href="/vendor/three/build/three.module.js">/vendor/three/build/three.module.js</a></li>
    <li><a href="/vendor/OrbitControls.js">/vendor/OrbitControls.js</a></li>
    <li><a href="/main.js">/main.js</a></li>
  </ul>`);
});

// Default index.html if someone hits /
app.get("/", (req, res) => res.sendFile(path.join(PUB, "index.html")));

app.listen(PORT, HOST, () => {
  log(`listening on http://${HOST}:${PORT}`);
  log(`public → ${PUB}`);
  log(`three  → ${THREE_ROOT}`);
});
