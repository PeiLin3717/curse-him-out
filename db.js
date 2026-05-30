/* ============================================================
   db.js — MySQL connection pool + first-run setup
   Reads credentials from environment variables (see .env.example).
   Works with any MySQL 8 host: Aiven, TiDB Cloud, Railway, local, etc.
   ============================================================ */
const mysql = require("mysql2/promise");

// Most cloud MySQL hosts (Aiven, TiDB) REQUIRE SSL. Set DB_SSL=false only
// for a plain local MySQL with no SSL. rejectUnauthorized:false keeps setup
// simple for now; you can harden it later with the host's CA certificate.
const sslEnabled = (process.env.DB_SSL || "true").toLowerCase() !== "false";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 5, // free DB tiers allow only a few connections
  enableKeepAlive: true,
});

// A few curses so the wall is never empty on day one.
const SEED = [
  ["Took me to a gas station for our first date and made me pay for my own taquito. 🌮", 4],
  ["Said he 'doesn't believe in labels' then posted his other situationship the next day.", 5],
  ["Brought his MOM to our second date. She ordered for him.", 3],
  ["Ghosted me for 3 weeks then texted 'wyd' at 2am. Sir.", 4],
  ["Told me I 'remind him of his ex' on the FIRST date. Read the room.", 4],
  ["Split the bill to the cent. Including my water. Tap water.", 3],
  ["Spent the whole dinner explaining crypto. I lost more than money.", 5],
  ["Said he'd call. It's been 8 months. Still 'typing…'", 5],
];

// Create the table if it doesn't exist, and seed it once.
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS curses (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      body       VARCHAR(1000) NOT NULL,
      level      TINYINT NOT NULL DEFAULT 3,
      crimes     TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM curses");
  if (n === 0) {
    for (const [body, level] of SEED) {
      await pool.query("INSERT INTO curses (body, level, crimes) VALUES (?, ?, ?)", [body, level, "[]"]);
    }
    console.log(`🌱 Seeded ${SEED.length} starter curses.`);
  }
}

module.exports = { pool, initDb };
