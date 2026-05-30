/* ============================================================
   server.js — Curse Him Out API + static frontend
   Run:  npm run dev   (local)   |   npm start   (production)
   ============================================================ */
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { pool, initDb } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
// Vanity head-start for the public counter, so it doesn't start at 0.
const COUNT_BASE = parseInt(process.env.COUNT_BASE || "12000", 10);
const MAX_LEN = 1000;

app.set("trust proxy", 1);   // we sit behind Render's proxy in production
app.use(cors());             // harmless same-origin; lets you split the frontend off later
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public"))); // serve index.html, styles.css, script.js

// Allow at most 10 new curses per minute per IP (basic spam guard).
const postLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

function safeParse(s) { try { return JSON.parse(s) || []; } catch (_) { return []; } }

// --- GET the most recent curses (the Wall of Shame) ---
app.get("/api/curses", async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 40;
    limit = Math.min(limit, 100);
    const [rows] = await pool.query(
      "SELECT id, body AS text, level, crimes, created_at FROM curses ORDER BY id DESC LIMIT ?",
      [limit]
    );
    res.json(rows.map((r) => ({ ...r, crimes: safeParse(r.crimes) })));
  } catch (e) {
    console.error("GET /api/curses", e);
    res.status(500).json({ error: "server_error" });
  }
});

// --- POST a new curse (one burn) ---
app.post("/api/curses", postLimiter, async (req, res) => {
  try {
    let { text, level, crimes } = req.body || {};
    text = (typeof text === "string" ? text : "").trim();
    if (!text) return res.status(400).json({ error: "empty" });
    if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);

    level = parseInt(level, 10);
    if (!Number.isFinite(level) || level < 1 || level > 5) level = 3;

    const crimesJson = JSON.stringify(Array.isArray(crimes) ? crimes.slice(0, 20).map(String) : []);

    const [result] = await pool.query(
      "INSERT INTO curses (body, level, crimes) VALUES (?, ?, ?)",
      [text, level, crimesJson]
    );
    res.status(201).json({
      id: result.insertId,
      text,
      level,
      crimes: safeParse(crimesJson),
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("POST /api/curses", e);
    res.status(500).json({ error: "server_error" });
  }
});

// --- GET counter total (base + real submissions) ---
app.get("/api/stats", async (req, res) => {
  try {
    const [[row]] = await pool.query("SELECT COUNT(*) AS n FROM curses");
    res.json({ count: COUNT_BASE + row.n });
  } catch (e) {
    console.error("GET /api/stats", e);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Start only after the database is reachable and set up.
initDb()
  .then(() => app.listen(PORT, () => console.log(`🔥 Curse Him Out running on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error("❌ Could not connect to the database. Check your .env values.\n", err.message);
    process.exit(1);
  });
