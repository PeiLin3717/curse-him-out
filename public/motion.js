/* ============================================================
   CURSE HIM OUT — scroll motion
   Reveal-on-scroll with staggered pop-ins, a gentle parallax on the
   hero and the background blobs, and the progress bar along the top.
   Elements opt in with data-reveal="..." (see styles.css → MOTION).
   Nothing here is needed for the page to work: if it can't run, it
   removes html.js so every element is simply shown (and the <head>
   does the same if this file never arrives).
   ============================================================ */
(function () {
  "use strict";

  window.CHO_MOTION = true; // tells the <head> safety timer we made it

  var root = document.documentElement;
  var reduce = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  var sweep = null;  // set up by setupReveals, run from the scroll handler
  var settle = null; // set up by setupReveals, run when reduced-motion flips

  function showEverything() { root.classList.remove("js"); }

  function cssNumber(name, fallback) {
    var v = parseFloat(getComputedStyle(root).getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }

  function now() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

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
    // We arrived so late that the <head> safety timer already showed the page:
    // adding reveal animations now would only make visible things blink.
    if (!root.classList.contains("js")) return;

    var STEP_MAX  = 70;   // ms between two neighbours in the same wave
    var WAVE_MAX  = 700;  // ms from the first to the last item of a wave
    var QUEUE_MAX = 400;  // ms a new wave will wait for the previous one
    var LONGEST   = 1500; // ms: longer than any reveal animation in styles.css
    var RISE      = cssNumber("--rise", 32);      // px a glass panel floats up
    var TILE_STEP = cssNumber("--tile-step", 35); // ms between title tiles
    var pending = new Set();
    var waveEnd = 0; // clock time at which the latest wave's last item starts

    // Fires when an element's top crosses a line 10% up from the bottom edge.
    var io = new IntersectionObserver(onChange, { rootMargin: "0px 0px -10% 0px", threshold: 0 });

    function onChange(entries) {
      var wave = [], rects = new Map();
      entries.forEach(function (e) {
        if (e.isIntersecting) { wave.push(e.target); rects.set(e.target, e.boundingClientRect); }
        // Already scrolled past (page restored mid-way): no ceremony, just show it.
        else if (e.boundingClientRect.bottom < 0) revealNow(e.target);
      });
      revealWave(wave, rects);
    }

    // Reveal a batch top-to-bottom, left-to-right with a short stagger.
    // Reads (rects) all happen before writes (classes), so layout runs once.
    function revealWave(els, rects) {
      els = els.filter(function (el) { return pending.has(el); });
      if (!els.length) return;
      rects = rects || new Map();
      var inWave = new Set(els);
      var line = window.innerHeight * 0.9; // the observer's reveal line

      // A floating panel is measured while still sitting --rise lower, so a
      // child just under the line would cross it by itself as the panel rises
      // and pop late, alone. Bring those children along now.
      els.slice().forEach(function (panel) {
        if (panel.getAttribute("data-reveal") !== "float") return;
        panel.querySelectorAll("[data-reveal]").forEach(function (child) {
          if (!pending.has(child) || inWave.has(child)) return;
          var r = child.getBoundingClientRect();
          // (children already scrolled past are the sweep's job: shown, not animated)
          if (r.bottom >= 0 && r.top - RISE < line) { els.push(child); inWave.add(child); rects.set(child, r); }
        });
      });

      els.forEach(function (el) { if (!rects.has(el)) rects.set(el, el.getBoundingClientRect()); });
      els.sort(function (a, b) {
        return (rects.get(a).top - rects.get(b).top) || (rects.get(a).left - rects.get(b).left);
      });

      // Big batches (25 bingo cells) are squeezed into the same wave length as
      // small ones. A batch that arrives while the previous one is still popping
      // queues behind it instead of restarting at 0, so rows keep their order;
      // the deeper the queue already is, the tighter the new batch packs, and
      // at QUEUE_MAX it simply joins the end so reveals never lag far behind.
      var clock = now();
      var t = Math.max(0, waveEnd - clock);
      var gaps = Math.max(1, els.length - 1);
      var step = Math.min(STEP_MAX, WAVE_MAX / gaps, Math.max(0, QUEUE_MAX - t) / gaps);
      var last = t;
      els.forEach(function (el) {
        reveal(el, Math.round(t));
        last = t;
        t += step;
        // The title's tiles carry their own stagger: give the headline time to lead.
        if (el.getAttribute("data-reveal") === "letters") {
          t += 0.7 * TILE_STEP * el.querySelectorAll(".word > span").length;
        }
      });
      waveEnd = clock + last;
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
      if (reduce.matches) { el.classList.add("done"); return; } // nothing will animate
      // Once the reveal has had its turn, mark it done so a later animation on
      // the same element (rage-shake, win-pulse) can come and go without the
      // reveal replaying. Its turn is over when it ends, when it is cancelled,
      // or the moment another animation takes over; the timer is the backstop.
      // Tiles inside a "letters" group bubble their events up, so only the
      // element's own animations count.
      var timer = setTimeout(done, delay + LONGEST);
      function done(ev) {
        if (ev && ev.target !== el) return;
        if (ev && ev.type === "animationstart" && /^reveal-/.test(ev.animationName)) return;
        clearTimeout(timer);
        el.removeEventListener("animationend", done);
        el.removeEventListener("animationcancel", done);
        el.removeEventListener("animationstart", done);
        el.classList.add("done");
      }
      el.addEventListener("animationend", done);
      el.addEventListener("animationcancel", done);
      el.addEventListener("animationstart", done);
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
      var past = [], wave = [], rects = new Map();
      pending.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < 0) past.push(el);
        else if (atEnd && r.top < vh) { wave.push(el); rects.set(el, r); }
      });
      revealWave(wave, rects);
      past.forEach(revealNow);
    };

    // If reduced motion is switched on mid-visit, whatever is showing is final.
    settle = function () {
      document.querySelectorAll("[data-reveal].in").forEach(function (el) { el.classList.add("done"); });
    };

    // Keyboard users can Tab to a control that is still hidden (sitting in the
    // dead zone at the bottom of the screen): show it, and whatever holds it.
    document.addEventListener("focusin", function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest("[data-reveal]") : null;
      while (el) {
        revealNow(el);
        el = el.parentElement ? el.parentElement.closest("[data-reveal]") : null;
      }
    });

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
    var HERO_LAG = 0.1; // hero moves at 90% of scroll speed: a trailing hint of depth
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
      if (settle) settle();
      queue();
    }

    // First pass on the first frame, not right now: measuring during script
    // evaluation would force the document's first layout before script.js has
    // even built the grids. The CSS start states cover the gap.
    window.requestAnimationFrame(function () { measure(); update(); });
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", function () { measure(); queue(); });
    // The wall loads later and makes the page taller: keep the bar honest.
    if ("ResizeObserver" in window) new ResizeObserver(queue).observe(document.body);
    if (reduce.addEventListener) reduce.addEventListener("change", resetMotion);
  }
})();
