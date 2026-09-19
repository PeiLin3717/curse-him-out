/* ============================================================
   CURSE HIM OUT — scroll motion
   Reveal-on-scroll with staggered pop-ins, a gentle parallax on the
   hero and the background blobs, and the progress bar along the top.
   Elements opt in with data-reveal="..." (see styles.css → MOTION).
   Nothing here is needed for the page to work: if it can't run, it
   removes html.js so every element is simply shown.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  var sweep = null; // set up by setupReveals, run from the scroll handler

  function showEverything() { root.classList.remove("js"); }

  try {
    setupReveals();
    setupScrollEffects();
  } catch (err) {
    showEverything();
    if (window.console) console.warn("motion.js switched off:", err);
  }

  /* ---------- reveal on scroll ---------- */
  function setupReveals() {
    if (!("IntersectionObserver" in window)) { showEverything(); return; }

    var STEP_MAX = 70;   // ms between two neighbours in the same wave
    var WAVE_MAX = 700;  // ms from the first to the last item of a wave
    var LONGEST = 1500;  // ms: longer than any reveal animation in styles.css
    var pending = new Set();

    // Fires when an element's top crosses a line 10% up from the bottom edge.
    var io = new IntersectionObserver(onChange, { rootMargin: "0px 0px -10% 0px", threshold: 0 });

    function onChange(entries) {
      var wave = [];
      entries.forEach(function (e) {
        if (e.isIntersecting) wave.push(e.target);
        // Already scrolled past (page restored mid-way): no ceremony, just show it.
        else if (e.boundingClientRect.bottom < 0) revealNow(e.target);
      });
      revealWave(wave);
    }

    // Stagger top-to-bottom, left-to-right, and squeeze big batches
    // (25 bingo cells) into the same total wave length as small ones.
    function revealWave(els) {
      els = els.filter(function (el) { return !el.classList.contains("in"); });
      if (!els.length) return;
      var rect = new Map();
      els.forEach(function (el) { rect.set(el, el.getBoundingClientRect()); });
      els.sort(function (a, b) {
        return (rect.get(a).top - rect.get(b).top) || (rect.get(a).left - rect.get(b).left);
      });
      var step = Math.min(STEP_MAX, WAVE_MAX / Math.max(1, els.length - 1));
      els.forEach(function (el, i) { reveal(el, Math.round(i * step)); });
    }

    function forget(el) {
      io.unobserve(el);
      pending.delete(el);
    }

    function reveal(el, delay) {
      forget(el);
      if (el.classList.contains("in")) return;
      el.style.setProperty("--d", delay + "ms");
      el.classList.add("in");
      // Once the reveal has played, mark it done so a later animation on the
      // same element (rage-shake, win-pulse) can come and go without the
      // reveal replaying. animationend is the normal path; the timer covers
      // a reveal that gets interrupted (Chromium never fires animationcancel).
      // Tiles inside a "letters" group bubble their events up, so only count
      // the element's own animation.
      var timer = setTimeout(done, delay + LONGEST);
      function done(ev) {
        if (ev && ev.target !== el) return;
        clearTimeout(timer);
        el.removeEventListener("animationend", done);
        el.classList.add("done");
      }
      el.addEventListener("animationend", done);
    }

    function revealNow(el) {
      forget(el);
      if (el.classList.contains("in")) return;
      el.classList.add("in");
      el.classList.add("done"); // .done = no animation: it is simply there
    }

    function prime(el) {
      if (el.classList.contains("in")) return;
      pending.add(el);
      io.observe(el);
    }

    // Runs once per scroll frame while anything is still waiting. Catches what
    // the observer can't: an element flicked past so fast it never showed up
    // in a frame (shown without animation, as if already seen), and the last
    // screen of the page, where the 10% dead zone would otherwise keep the
    // final lines hidden for good.
    sweep = function (y, max) {
      if (!pending.size) return;
      var vh = window.innerHeight;
      var atEnd = max - y < vh * 0.1 + 1;
      var wave = [];
      pending.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < 0) revealNow(el);
        else if (atEnd && r.top < vh) wave.push(el);
      });
      revealWave(wave);
    };

    // Ransom-note tiles get their index for the letter-by-letter stagger.
    document.querySelectorAll('[data-reveal="letters"] .word > span').forEach(function (tile, i) {
      tile.style.setProperty("--i", i);
    });
    document.querySelectorAll("[data-reveal]").forEach(prime);

    // Chips, bingo cells and wall notes are created by script.js (the wall
    // even arrives later, from the API): pick them up as they are added.
    if ("MutationObserver" in window) {
      var mo = new MutationObserver(function (records) {
        records.forEach(function (r) {
          r.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.hasAttribute("data-reveal")) prime(n);
            n.querySelectorAll("[data-reveal]").forEach(prime);
          });
        });
      });
      mo.observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
    }
  }

  /* ---------- progress bar + parallax ---------- */
  function setupScrollEffects() {
    var bar  = document.getElementById("progress");
    var bg   = document.querySelector(".bg");
    var hero = document.querySelector(".hero");
    var HERO_LAG = 0.2; // hero moves at 80% of scroll speed, so it trails behind
    var heroLimit = 0;  // scrollY past which the hero is off-screen anyway
    var queued = false;

    function measure() {
      heroLimit = hero ? hero.offsetHeight / (1 - HERO_LAG) : 0;
    }

    function update() {
      queued = false;
      var y = window.pageYOffset || root.scrollTop || 0;
      var max = Math.max(0, root.scrollHeight - window.innerHeight);
      var p = max ? Math.min(1, Math.max(0, y / max)) : 1;

      if (sweep) sweep(y, max);
      if (bar) bar.style.clipPath = "inset(0 " + ((1 - p) * 100).toFixed(2) + "% 0 0 round 3px)";

      if (reduce.matches) return; // the bar tracks position; everything else is motion
      if (bg) bg.style.setProperty("--p", p.toFixed(4));
      if (hero) hero.style.translate = "0 " + (Math.min(y, heroLimit) * HERO_LAG).toFixed(1) + "px";
    }

    function queue() {
      if (!queued) { queued = true; window.requestAnimationFrame(update); }
    }

    function resetMotion() {
      if (hero) hero.style.translate = "";
      if (bg) bg.style.removeProperty("--p");
      queue();
    }

    measure();
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", function () { measure(); queue(); });
    // The wall loads later and makes the page taller: keep the bar honest.
    if ("ResizeObserver" in window) new ResizeObserver(queue).observe(document.body);
    if (reduce.addEventListener) reduce.addEventListener("change", resetMotion);
  }
})();
