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
// (A typo in COUNT_BASE must not turn the counter into NaN — fall back to 12000.)
const parsedCountBase = parseInt(process.env.COUNT_BASE || "12000", 10);
const COUNT_BASE = Number.isFinite(parsedCountBase) ? parsedCountBase : 12000;
const MAX_LEN = 1000;

app.set("trust proxy", 1);   // we sit behind Render's proxy in production
app.use(cors());             // harmless same-origin; lets you split the frontend off later
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public"))); // serve index.html, styles.css, script.js

// Allow at most 10 new curses per minute per IP (basic spam guard).
const postLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

function safeParse(s) { try { return JSON.parse(s) || []; } catch (_) { return []; } }

// --- Database availability ---
// Aiven's free MySQL powers itself off after a quiet spell. That must never take
// the whole site down: the static frontend works fine offline, so we listen right
// away and keep retrying the DB in the background (5 s, 10 s, 20 s … capped at 60 s).
const DB_RETRY_MIN = 5 * 1000;
const DB_RETRY_MAX = 60 * 1000;
let dbReady = false;
let lastDbError = null;
let dbRetryTimer = null;      // pending retry (non-null while a retry is scheduled)
let dbConnecting = false;     // an initDb() attempt is in flight right now
let dbRetryDelay = DB_RETRY_MIN;

// Try to reach + set up the DB. Only one attempt/retry loop runs at a time, so
// calling this from many places (startup, failed queries) never stacks timers.
function connectDb() {
  if (dbConnecting || dbRetryTimer) return;
  dbConnecting = true;
  initDb()
    .then(() => {
      dbReady = true;
      lastDbError = null;
      dbRetryDelay = DB_RETRY_MIN;
      console.log("✅ Database connected");
    })
    .catch((err) => {
      dbReady = false;
      lastDbError = (err && err.message) || String(err);
      console.warn(`⚠️  Database unavailable (${lastDbError}) — retrying in ${dbRetryDelay / 1000}s`);
      dbRetryTimer = setTimeout(() => { dbRetryTimer = null; connectDb(); }, dbRetryDelay);
      dbRetryDelay = Math.min(dbRetryDelay * 2, DB_RETRY_MAX);
    })
    .finally(() => { dbConnecting = false; });
}

// Errors that mean "the DB itself is unreachable" (as opposed to a bad query).
const DB_CONN_ERROR_CODES = new Set([
  "ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST", "ER_ACCESS_DENIED_ERROR",
]);
function isDbConnError(err) {
  return Boolean(err) && (err.fatal === true || DB_CONN_ERROR_CODES.has(err.code));
}

function sendDbUnavailable(res) {
  res.set("Retry-After", "30");
  res.status(503).json({ error: "db_unavailable" });
}

// Gate for the data routes: while the DB is down, answer 503 immediately. The
// frontend treats any non-OK response as "offline" and falls back to localStorage.
function requireDb(req, res, next) {
  if (dbReady) return next();
  sendDbUnavailable(res);
}

// Shared tail for the routes' catch blocks: a lost connection flips us back to
// "DB down" and kicks off the reconnect loop; anything else stays a plain 500.
function sendRouteError(res, e) {
  if (isDbConnError(e)) {
    dbReady = false;
    lastDbError = e.message;
    connectDb();
    return sendDbUnavailable(res);
  }
  res.status(500).json({ error: "server_error" });
}

// --- GET the most recent curses (the Wall of Shame) ---
app.get("/api/curses", requireDb, async (req, res) => {
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
    sendRouteError(res, e);
  }
});

// --- POST a new curse (one burn) ---
app.post("/api/curses", postLimiter, requireDb, async (req, res) => {
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
    sendRouteError(res, e);
  }
});

// --- GET counter total (base + real submissions) ---
app.get("/api/stats", requireDb, async (req, res) => {
  try {
    const [[row]] = await pool.query("SELECT COUNT(*) AS n FROM curses");
    res.json({ count: COUNT_BASE + row.n });
  } catch (e) {
    console.error("GET /api/stats", e);
    sendRouteError(res, e);
  }
});

// Always 200, even with the DB down — Render's health check must keep the
// instance (and the static frontend) alive. `db` tells you the real story.
app.get("/api/health", (req, res) =>
  res.json({ ok: true, db: dbReady, lastDbError, uptime: Math.round(process.uptime()) })
);

// Listen right away; the frontend must not wait on (or die with) the database.
app.listen(PORT, () => console.log(`🔥 Curse Him Out running on http://localhost:${PORT}`));
connectDb();
