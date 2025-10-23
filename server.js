import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// serve your app
app.use(express.static(path.join(__dirname, "public")));

// ⬇️ serve the three package at a stable URL your browser can import
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules/three")));

app.listen(PORT, () => {
  console.log(`➡  Three.js viewer running at http://localhost:${PORT}`);
});
