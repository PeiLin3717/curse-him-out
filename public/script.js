/* ============================================================
   CURSE HIM OUT — interactions
   Works on its own (localStorage), and automatically uses the
   backend API (/api/*) for a shared Wall when the server is up.
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /* ---------- API helpers (graceful fallback to offline/local) ---------- */
  const API_BASE = ""; // same origin when served by the backend
  let ONLINE = false;
  async function apiGet(p) {
    const r = await fetch(API_BASE + p);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function apiPost(p, body) {
    const r = await fetch(API_BASE + p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  /* ---------- live counter ---------- */
  const COUNT_KEY = "cho_count";
  const SEED_COUNT = 12453;
  const countEl = $("#count");
  let count = parseInt(localStorage.getItem(COUNT_KEY), 10);
  if (!Number.isFinite(count)) count = SEED_COUNT;

  function renderCount(to) {
    const from = parseInt(countEl.textContent.replace(/,/g, ""), 10) || 0;
    const steps = 24;
    let i = 0;
    const tick = () => {
      i++;
      const val = Math.round(from + (to - from) * (i / steps));
      countEl.textContent = val.toLocaleString();
      if (i < steps) requestAnimationFrame(tick);
      else countEl.textContent = to.toLocaleString();
    };
    tick();
  }
  function bumpCount() {
    count += 1;
    localStorage.setItem(COUNT_KEY, String(count));
    renderCount(count);
  }

  /* ---------- toast ---------- */
  const toast = $("#toast");
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  /* ---------- rage slider ---------- */
  const RAGE = {
    1: "Mildly annoyed",
    2: "Irritated",
    3: "Heated",
    4: "Furious 😤",
    5: "☢ NUCLEAR",
  };
  const intensity = $("#intensity");
  const intensityLabel = $("#intensityLabel");
  const ventBox = $("#ventBox");
  function syncRage() {
    const lvl = intensity.value;
    intensityLabel.textContent = RAGE[lvl];
    ventBox.dataset.level = lvl;
  }
  intensity.addEventListener("input", syncRage);
  syncRage();

  /* ---------- censor-o-matic ---------- */
  const censorToggle = $("#censor");
  const ventText = $("#ventText");
  const SWEARS = [
    "ass", "asshole", "bastard", "bitch", "crap", "damn", "dick",
    "douche", "douchebag", "hell", "jerk", "loser", "prick",
    "scumbag", "shit", "trash", "idiot", "moron", "creep",
  ];
  const SWEAR_RE = new RegExp("\\b(" + SWEARS.join("|") + ")\\b", "gi");
  // Live-typing pass: only mask a swear once the character AFTER it has been
  // typed, so "hell" in "hello" or "ass" in "assume" is never clobbered mid-word.
  // SWEAR_RE (no lookahead) still runs at toggle-on and burn time.
  const SWEAR_LIVE_RE = new RegExp("\\b(" + SWEARS.join("|") + ")\\b(?=\\W)", "gi");
  const SYMS = "#@$%&!*";
  function mask(word) {
    const n = Math.max(3, word.length);
    let out = "";
    for (let i = 0; i < n; i++) out += SYMS[Math.floor(Math.random() * SYMS.length)];
    return out;
  }
  function censor(str) {
    return str.replace(SWEAR_RE, (m) => mask(m));
  }
  function maybeCensorLive() {
    if (!censorToggle.checked) return;
    const before = ventText.value;
    const after = before.replace(SWEAR_LIVE_RE, (m) => mask(m));
    if (after === before) return; // nothing to mask: leave value and caret alone
    const pos = ventText.selectionStart;
    ventText.value = after;
    // Keep the caret where it was, shifted by any length change and clamped.
    const newPos = Math.max(0, Math.min(after.length, pos + (after.length - before.length)));
    try { ventText.setSelectionRange(newPos, newPos); } catch (e) {}
  }
  censorToggle.addEventListener("change", () => {
    if (censorToggle.checked) {
      ventText.value = censor(ventText.value);
      showToast("Censor-o-matic: ON #@$%!");
    }
  });
  ventText.addEventListener("input", maybeCensorLive);

  /* ---------- crime cards ---------- */
  const CRIMES = [
    { label: "Ghosted me",        phrase: "Then he ghosted me like a coward." },
    { label: "Cheated",           phrase: "He cheated and STILL acted surprised I was mad." },
    { label: "Showed up late",    phrase: "Showed up 40 minutes late with zero apology." },
    { label: "Talked about his ex", phrase: "Spent the whole date talking about his ex." },
    { label: "Made me pay",       phrase: "Made me pay for everything, including his." },
    { label: "Bad texter",        phrase: "Texts back once every business week." },
    { label: "Lied about height", phrase: "Lied about his height by a full 5 inches." },
    { label: "Still on the apps",  phrase: "Was still swiping while sitting across from me." },
    { label: "Mama's boy",        phrase: "Called his mom mid-date. Twice." },
    { label: "Boring",            phrase: "Had the personality of unseasoned chicken." },
    { label: "Cheap",             phrase: "Tipped 4% and bragged about it." },
    { label: "Love-bombed",       phrase: "Love-bombed me for a week, then vanished." },
  ];
  const crimeGrid = $("#crimeGrid");
  CRIMES.forEach((c) => {
    const b = document.createElement("button");
    b.className = "crime";
    b.type = "button";
    b.textContent = c.label;
    b.addEventListener("click", () => toggleCrime(b, c.phrase));
    crimeGrid.appendChild(b);
  });
  function toggleCrime(btn, phrase) {
    const on = btn.classList.toggle("selected");
    let v = ventText.value;
    if (on) {
      ventText.value = (v ? v.replace(/\s*$/, "") + " " : "") + phrase + " ";
    } else {
      ventText.value = v.replace(phrase + " ", "").replace(phrase, "");
    }
    ventText.value = ventText.value.replace(/\s{2,}/g, " ");
  }

  /* ---------- the BURN ritual ---------- */
  const burnBtn = $("#burnBtn");
  const ash = $("#ash");
  const BURN_LINES = [
    "💨 Poof. One less man on your mind.",
    "🔥 Reduced to ash. As he should be.",
    "✨ Released into the void. Bye!",
    "💅 Burned. You're already glowing.",
    "🪦 RIP to that situationship.",
  ];

  function spawnEmbers() {
    for (let i = 0; i < 16; i++) {
      const e = document.createElement("span");
      e.className = "ember";
      e.style.left = 10 + Math.random() * 80 + "%";
      e.style.setProperty("--x", (Math.random() * 60 - 30) + "px");
      e.style.animationDelay = Math.random() * 0.3 + "s";
      ventBox.appendChild(e);
      setTimeout(() => e.remove(), 1700);
    }
  }

  burnBtn.addEventListener("click", () => {
    let text = ventText.value.trim();
    if (!text) {
      ventBox.dataset.level = "5";
      setTimeout(syncRage, 500);
      showToast("Type something first, bestie. 💅");
      return;
    }
    if (censorToggle.checked) text = censor(text);

    const lvl = parseInt(intensity.value, 10);
    const crimes = [...document.querySelectorAll(".crime.selected")].map((c) => c.textContent);
    ash.textContent = text;
    ventBox.classList.add("burning");
    spawnEmbers();

    setTimeout(() => {
      ventBox.classList.remove("burning");
      ash.textContent = "";
      ventText.value = "";
      document.querySelectorAll(".crime.selected").forEach((c) => c.classList.remove("selected"));
      publishCurse({ text, lvl, crimes });
      showToast(BURN_LINES[Math.floor(Math.random() * BURN_LINES.length)]);
    }, 1500);
  });

  /* ---------- wall of shame ---------- */
  const WALL_KEY = "cho_wall";
  const wallGrid = $("#wallGrid");
  const SEED_WALL = [
    { text: "Took me to a gas station for our first date and made me pay for my own taquito. 🌮", lvl: 4 },
    { text: "Said he 'doesn't believe in labels' then posted his other situationship the next day.", lvl: 5 },
    { text: "Brought his MOM to our second date. She ordered for him.", lvl: 3 },
    { text: "Ghosted me for 3 weeks then texted 'wyd' at 2am. Sir.", lvl: 4 },
    { text: "Told me I 'remind him of his ex' on the FIRST date. Read the room.", lvl: 4 },
    { text: "Split the bill to the cent. Including my water. Tap water.", lvl: 3 },
    { text: "Spent the whole dinner explaining crypto. I lost more than money.", lvl: 5 },
    { text: "Said he'd call. It's been 8 months. Still 'typing…'", lvl: 5 },
  ];

  function noteNode(entry, fresh) {
    const div = document.createElement("div");
    div.className = "note glass-inner" + (fresh ? " fresh" : "");
    const p = document.createElement("p");
    p.textContent = "“" + entry.text + "”";
    p.style.margin = "0";
    const meta = document.createElement("span");
    meta.className = "note__meta";
    meta.textContent = "rage: " + "🔥".repeat(Math.max(1, entry.lvl || 1)) + " · anon";
    div.appendChild(p);
    div.appendChild(meta);
    return div;
  }

  function loadUserWall() {
    try { return JSON.parse(localStorage.getItem(WALL_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveUserWall(arr) {
    localStorage.setItem(WALL_KEY, JSON.stringify(arr.slice(0, 40)));
  }
  function renderWall() {
    wallGrid.innerHTML = "";
    const user = loadUserWall();
    user.concat(SEED_WALL).forEach((e) => wallGrid.appendChild(noteNode(e, false)));
  }
  function addWallEntry(entry, fresh) {
    const user = loadUserWall();
    user.unshift(entry);
    saveUserWall(user);
    wallGrid.insertBefore(noteNode(entry, fresh), wallGrid.firstChild);
  }

  // Load the wall from the API; fall back to local seed if the backend is down.
  async function initWall() {
    try {
      const rows = await apiGet("/api/curses?limit=40");
      ONLINE = true;
      wallGrid.innerHTML = "";
      if (rows.length === 0) {
        SEED_WALL.forEach((e) => wallGrid.appendChild(noteNode(e, false)));
      } else {
        rows.forEach((r) => wallGrid.appendChild(noteNode({ text: r.text, lvl: r.level }, false)));
      }
    } catch (e) {
      renderWall(); // offline: your localStorage entries + the seed
    }
  }

  async function initCounter() {
    try { const s = await apiGet("/api/stats"); ONLINE = true; renderCount(s.count); }
    catch (e) { renderCount(count); }
  }

  // Publish one burned curse: POST to the API, else fall back to local-only.
  async function publishCurse(entry) {
    try {
      const saved = await apiPost("/api/curses", {
        text: entry.text, level: entry.lvl, crimes: entry.crimes || [],
      });
      ONLINE = true;
      wallGrid.insertBefore(noteNode({ text: saved.text, lvl: saved.level }, true), wallGrid.firstChild);
      try { const s = await apiGet("/api/stats"); renderCount(s.count); } catch (_) {}
    } catch (e) {
      bumpCount();
      addWallEntry(entry, true);
    }
  }

  initCounter();
  initWall();

  /* ---------- curse generator ---------- */
  const SUBJECTS = [
    "He", "That man", "Mr. 'I'm not like other guys'",
    "Your situationship", "The clown", "This whole man",
  ];
  const BURNS = [
    "ghosted like he was training for the Olympics.",
    "has commitment issues with his own calendar.",
    "called gas-station sushi 'fancy' and meant it.",
    "texts back slower than my grandma on dial-up.",
    "peaked emotionally in the seventh grade.",
    "thinks the bare minimum is a love language.",
    "has the emotional depth of a parking-lot puddle.",
    "treated 'good morning' like a finite resource.",
    "is the human version of a 'we need to talk' text.",
    "would lose an argument with a Magic 8-Ball.",
    "brought zero flowers and a whole personality disorder.",
    "ranks his exes like a fantasy football league.",
  ];
  const genOut = $("#genOut");
  const genBtn = $("#genBtn");
  const copyBtn = $("#copyBtn");
  function generate() {
    const s = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
    const b = BURNS[Math.floor(Math.random() * BURNS.length)];
    genOut.textContent = s + " " + b;
  }
  genBtn.addEventListener("click", generate);
  copyBtn.addEventListener("click", () => {
    const txt = genOut.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(
        () => showToast("Copied. Go forth. 💅"),
        () => showToast("Couldn't copy — select it manually.")
      );
    } else {
      showToast("Copy not supported here.");
    }
  });

  /* ---------- red-flag bingo ---------- */
  const FLAGS = [
    "'I'm not like other guys'", "Still texts his ex", "Lives with 'a roommate'",
    "No bookshelf, no soul", "Calls all exes crazy", "'I don't do labels'",
    "Mom does his laundry", "Hates his job, won't leave", "Splits the bill to the cent",
    "Only texts after 11pm", "Has a podcast", "Talks over you",
    "FREE", // center
    "'I'm just brutally honest'", "Owns one (1) fork", "Never asks a question",
    "Crypto bro", "Sunglasses indoors", "Ranks his exes",
    "'Mature for your age'", "Ghosts then un-ghosts", "Brags about body count",
    "Phone always face-down", "Cardio is replying 'k'", "Therapy is for the weak",
  ];
  const bingoGrid = $("#bingoGrid");
  const bingoMsg = $("#bingoMsg");
  const marked = new Array(25).fill(false);
  marked[12] = true; // free space

  FLAGS.forEach((f, idx) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "bingo-cell" + (idx === 12 ? " free marked" : "");
    cell.textContent = f;
    cell.addEventListener("click", () => {
      if (idx === 12) return;
      marked[idx] = cell.classList.toggle("marked");
      checkBingo();
    });
    bingoGrid.appendChild(cell);
  });

  const LINES = [];
  for (let r = 0; r < 5; r++) LINES.push([0,1,2,3,4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) LINES.push([0,1,2,3,4].map((r) => r * 5 + c));
  LINES.push([0, 6, 12, 18, 24]);
  LINES.push([4, 8, 12, 16, 20]);

  function checkBingo() {
    const win = LINES.some((line) => line.every((i) => marked[i]));
    if (win) {
      bingoGrid.classList.add("win");
      bingoMsg.textContent = "BINGO. Block him. 🚩";
    } else {
      bingoGrid.classList.remove("win");
      bingoMsg.textContent = "";
    }
  }

  /* ---------- floating nav: light up the section in view ---------- */
  const navLinks = [...document.querySelectorAll(".nav a[href^='#']")].filter((a) => a.hash !== "#top");
  if ("IntersectionObserver" in window && navLinks.length) {
    const byId = new Map(navLinks.map((a) => [a.hash.slice(1), a]));
    const visible = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => visible.set(en.target.id, en.intersectionRatio));
      let bestId = null, best = 0;
      visible.forEach((ratio, id) => { if (ratio > best) { best = ratio; bestId = id; } });
      navLinks.forEach((a) => a.classList.toggle("active", a.hash.slice(1) === bestId));
    }, { rootMargin: "-40% 0px -45% 0px", threshold: [0, .1, .25, .5, .75, 1] });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }
})();
