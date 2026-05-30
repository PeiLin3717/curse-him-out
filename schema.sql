-- ============================================================
-- schema.sql — reference only.
-- The server creates and seeds this table automatically on first
-- run (see db.js initDb), so you normally DON'T need to run this.
-- It's here in case you want to inspect or set up the DB by hand.
-- ============================================================

CREATE TABLE IF NOT EXISTS curses (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  body       VARCHAR(1000) NOT NULL,   -- the curse / rant text
  level      TINYINT NOT NULL DEFAULT 3, -- rage level 1..5
  crimes     TEXT,                      -- JSON array of selected "crimes"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A few starter rows:
INSERT INTO curses (body, level, crimes) VALUES
  ('Took me to a gas station for our first date and made me pay for my own taquito. 🌮', 4, '[]'),
  ('Said he ''doesn''t believe in labels'' then posted his other situationship the next day.', 5, '[]'),
  ('Brought his MOM to our second date. She ordered for him.', 3, '[]'),
  ('Ghosted me for 3 weeks then texted ''wyd'' at 2am. Sir.', 4, '[]');
