/* LaLa-World project page — a page you scroll, with the film's 3D model in it.
   The 3D stage (lala-stage.js + lala-world.js) sits behind the page. Each chapter in the markup names its shot
   (data-shot) and is a section whose .pin holds the screen while the section scrolls past (data-pin, in vh): the
   chapter's title rises from below with the page, holds while its shot plays, then scrolls away. The model goes with
   its chapter: the stage's lens moves the picture with the pin, the picture fades out as the chapter leaves and in as
   the next one arrives, and the shot changes in between, while no model is on the screen. Each chapter's background
   (b · a · c) comes up the screen with its section, as a page's would. Without WebGL 2 the chapters are plain sections. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (window.matchMedia('(pointer: coarse)').matches) root.classList.add('touch');

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------------------------------------------------------------- chapters */
  var NAMES = { start: 'LaLa-World & LaLa-Policy', world: 'LaLa-World', latent: 'Latent future', words: 'Actions in words', legacy: 'One model',
    data1: 'Every domain', data2: 'Video, too', evolve: 'Evolve', policy: 'LaLa-Policy', end: 'TL;DR & BibTeX' };
  var chapters = $$('[data-shot]').map(function (el, i) {
    return { i: i, el: el, key: el.getAttribute('data-shot'), pinEl: $('.pin', el), pin: parseFloat(el.getAttribute('data-pin') || '0'),
      cap: $('.cap', el), ctl: $('.ctl', el), top: 0, h: 0, a: -Infinity, lens: null };
  });
  var byKey = {}; chapters.forEach(function (c) { byKey[c.key] = c; });
  var LAST = chapters.length - 1;

  // the browser's toolbar follows the night chapters
  var tint = $('meta[name="theme-color"]');
  if (tint && window.MutationObserver) new MutationObserver(function () {
    var night = root.classList.contains('night');
    if (tint.content !== (night ? '#0b0925' : '#e6e6ea')) tint.content = night ? '#0b0925' : '#e6e6ea';
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  // the credits repeat the hero's links
  var heroLinks = $('.hero .links');
  $$('[data-clone="links"]').forEach(function (slot) { slot.innerHTML = heroLinks.innerHTML; });

  // BibTeX → clipboard
  $$('.copy-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = $('pre', b.closest('.bibtex')).textContent, done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
      var legacy = function () {
        var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(t); t.select();
        try { if (document.execCommand('copy')) done(); } catch (e) {}
        t.remove();
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, legacy); else legacy();
    });
  });

  function webgl2() {
    try { var c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch (e) { return false; }
  }
  var filmMode = webgl2() && !/[?&]film=0\b/.test(location.search);
  root.classList.add(filmMode ? 'film' : 'nofilm');
  if (!filmMode) return;

  chapters.forEach(function (c) { if (c.pinEl) c.el.style.setProperty('--pin', c.pin + 'vh'); });

  /* ---------------------------------------------------------------- layout (px, in page coordinates) */
  var vh = window.innerHeight, H = vh, paperBottom = 0, heroBottom = 0, heroFit = null;
  var X = 0, OUT = 0;   // a chapter's shot starts when its pin is X below its place; its model leaves OUT before the next one's
  var hero = $('.hero'), paper = $('.hero .paper'), heroStage = $('.hero-stage');
  function measure() {
    vh = window.innerHeight;
    var y = window.scrollY, first = chapters[1] && chapters[1].pinEl;
    H = first ? first.offsetHeight : vh;   // a pin is one screen tall (the small viewport on phones)
    X = 0.4 * H; OUT = 0.12 * H;
    chapters.forEach(function (c, i) {
      var r = c.el.getBoundingClientRect(); c.top = r.top + y; c.h = r.height; c.lens = null;
      c.a = i ? c.top - X : -Infinity;
    });
    var pr = paper.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    paperBottom = (pr.height ? pr.bottom : hr.bottom) + y; heroBottom = hr.bottom + y;
    heroFit = null;
    if (film) film.setCompact(window.innerWidth < 760 || window.innerWidth < window.innerHeight * 0.85);   // a narrow opening frame: the pair stands closer
  }
  /* how far chapter c's frame is from its place on the screen at scroll y (px; > 0: still below, < 0: gone up) */
  function off(c, y) {
    if (!c.i) return -y;
    if (!c.pinEl) return c.top - y;
    var end = c.top + c.h - H;
    return y < c.top ? c.top - y : y > end ? end - y : 0;
  }
  function activeAt(y) {
    var a = 0;
    for (var i = 1; i < chapters.length; i++) if (y >= chapters[i].a) a = i;
    return a;
  }
  function endOf(i) { return i < LAST ? chapters[i + 1].a : Infinity; }
  function shows(i, y) {   // the scroll asks for chapter i's model: from its shot's start until a little before the next one's
    if (chapters[i].key === 'end') return false;
    return (!i || y >= chapters[i].a) && y < endOf(i) - OUT;
  }
  function progress(i, y) {   // 0 → 1 while chapter i's model is on the screen
    var a = i ? chapters[i].a : 0, b = endOf(i);
    return clamp01((y - a) / Math.max(1, b - a));
  }
  function startOf(i) {   // where a jump to chapter i lands: its pin in place
    var c = chapters[i];
    if (i === 0) return 0;
    if (c.key === 'end') return $('.credits-in').getBoundingClientRect().top + window.scrollY - vh * 0.16;
    return Math.ceil(c.top + 2);
  }
  /* the backgrounds: chapter i's look is whole from the top of its section down and comes up the screen with it, mixed
     into the last one's over a soft band above that edge. LaLa-World's starts where the opening screen ends: the poster
     has a moment to itself before the title arrives */
  var SOFT = 0.3;   // the soft band, in screens
  function edgeOf(i) { return i === 1 ? heroBottom + SOFT * H : chapters[i].top; }
  function lookAt(y) {   // { a: look above, b: look below the edge, at: the edge (screens from the top) }
    for (var i = LAST; i >= 1; i--) {
      var at = (edgeOf(i) - y) / H;
      if (at < 1 + SOFT) return at > 0 && chapters[i].look !== chapters[i - 1].look ? { a: chapters[i - 1].look, b: chapters[i].look, at: at } : { a: chapters[i].look };
    }
    return { a: chapters[0].look };
  }
  function showLook(y) {
    var lk = lookAt(y);
    if (lk.b) film.split(lk.a, lk.b, lk.at, SOFT); else film.look(lk.a);
    film.setNight(film.isNight(lk.b && lk.at < 50 / H ? lk.b : lk.a));   // the page's colours: those of the look under the nav
  }

  /* ---------------------------------------------------------------- chrome: local nav, chapter dots, drag hint */
  var nav = $('.localnav'), dotsNav = $('.chapters'), hint = $('.drag-hint');
  dotsNav.innerHTML = chapters.map(function (c, i) {
    return '<a href="#' + (c.el.id || '') + '" data-i="' + i + '" aria-label="' + NAMES[c.key] + '"><span>' + NAMES[c.key] + '</span></a>';
  }).join('');
  var dots = $$('a', dotsNav);
  dotsNav.addEventListener('click', function (e) {
    var a = e.target.closest('a'); if (!a) return;
    e.preventDefault(); jump(+a.getAttribute('data-i'));
  });
  $$('a[href="#top"]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); jump(0); }); });
  var jumping = -1, jumpTimer = 0;
  function jump(i) {
    jumping = i;
    window.scrollTo({ top: startOf(i), behavior: reduce.matches ? 'auto' : 'smooth' });
    if (history.replaceState && chapters[i].el.id) history.replaceState(null, '', i ? '#' + chapters[i].el.id : location.pathname + location.search);
  }

  /* ---------------------------------------------------------------- the film */
  var film = null, current = -1, pending = -1, pendingTimer = 0, queued = -1, interacted = false, endTimer = 0;
  var vis = 0;   // how much of the current chapter's model shows
  var stageEl = $('#stage');

  function viewFor(v) { return v; }   // a shot's framing for this screen (shots are composed for 16:9; the lens does the adapting)
  function narrow() { var S = film.stage.size; return S.w / S.h < 1 || S.h < 560; }
  function toNDC(r) {   // a screen rectangle (px) → NDC, y up
    var S = film.stage.size;
    return { x0: 2 * r.left / S.w - 1, x1: 2 * r.right / S.w - 1, y0: 1 - 2 * r.bottom / S.h, y1: 1 - 2 * r.top / S.h };
  }
  /* the lens: in the opening frame the picture fits the band between the title and the paper and scrolls with the page */
  function fitHero() {
    var r = heroStage.getBoundingClientRect(), y = window.scrollY;
    var top = r.top + y, bottom = r.bottom + y, pad = Math.min(26, (bottom - top) * 0.05);
    return film.fitShot(0, toNDC({ left: r.left + 8, right: r.right - 8, top: top + pad, bottom: bottom - pad }), 2.2);
  }
  /* the chapters keep the film's framing on wide screens (a little smaller and higher over a row of controls); on narrow
     ones each shot's box is fitted between its title and the bottom of its pin */
  var LENS = { world: { s: 1, x: 0, y: 0 }, latent: { s: 0.93, x: 0, y: 0.07 }, words: { s: 1, x: 0, y: 0 }, legacy: { s: 1, x: 0, y: 0 },
    data1: { s: 0.94, x: 0, y: 0.05 }, data2: { s: 0.8, x: 0, y: 0.13 }, evolve: { s: 0.94, x: 0, y: 0.05 }, policy: { s: 0.95, x: 0, y: 0.06 },
    end: { s: 1, x: 0, y: 0 } };
  function bandOf(c) {   // the free band of a pinned chapter: under its title, over its controls
    var p = c.pinEl.getBoundingClientRect(), t = c.cap.getBoundingClientRect(), k = c.ctl && c.ctl.getBoundingClientRect();
    return { top: t.bottom - p.top, bottom: k && k.height ? k.top - p.top : p.height - Math.max(0.044 * vh, 22) };
  }
  function lensOf(c) {
    if (!narrow() || !c.pinEl) return LENS[c.key] || LENS.world;
    if (!c.lens) {
      var b = bandOf(c), S = film.stage.size;
      c.lens = film.fitShot(film.byShot[c.key], toNDC({ left: 12, right: S.w - 12, top: b.top + 12, bottom: b.bottom - 10 }), 3);
    }
    return c.lens;
  }
  function onFrame(dt) {
    var y = window.scrollY, L = film.stage.lens, c = chapters[current], S = film.stage.size;
    if (current === 0) {
      var f = heroFit || (heroFit = fitHero());
      L.s = f.s; L.x = f.x; L.y = f.y + 2 * y / S.h;
    } else {
      var g = lensOf(c);
      L.s = g.s; L.x = g.x; L.y = g.y - 2 * off(c, y) / S.h;   // the picture goes with its pin
    }
    L.snap = true;
    /* the model comes and goes in its own time once the scroll asks (never left half-faded where the scroll stops); a
       queued shot waits until the last model has gone */
    var aim = queued < 0 && shows(current, y) ? 1 : 0;
    vis = aim > vis ? Math.min(1, vis + dt / 0.5) : Math.max(0, vis - dt / (queued < 0 ? 0.3 : 0.12));
    film.setFade(vis * vis * (3 - 2 * vis));
    if (queued >= 0 && vis === 0) { var q = queued; queued = -1; start(q); }
    var shot = film.shots[film.byShot[c.key]];
    film.setYaw(reduce.matches ? 0 : (shot.yaw || 0) * progress(current, y));
    showLook(y);
  }

  function play(i, instant) {
    clearTimeout(pendingTimer); pending = -1;
    if (i === current) { queued = -1; return; }
    if (vis > 0.01 && !instant) { queued = i; film.setPaused(false); return; }   // the last model leaves first
    start(i, instant);
  }
  function start(i, instant) {
    current = i;
    var c = chapters[i], s = film.byShot[c.key];
    film.setLight(film.isNight(c.look));   // the model is lit for its own chapter's background
    film.goShot(s, { instant: !!instant || reduce.matches, cut: true });
    film.setYaw(reduce.matches ? 0 : (film.shots[s].yaw || 0) * progress(i, window.scrollY), true);
    clearTimeout(endTimer);
    film.setPaused(false);
    if (c.key === 'end') endTimer = setTimeout(function () { if (chapters[current].key === 'end') film.setPaused(true); }, 1600);   // a still sky: stop drawing
    if (i >= byKey.data1.i - 1) loadVideo();
    if (c.key === 'policy') syncPolicy();
    syncChrome();
  }
  function want(i) {   // the shot changes a moment after the scroll crosses into a chapter: a fling through five plays only the last
    if (i === current) { clearTimeout(pendingTimer); pending = -1; queued = -1; return; }
    if (i === pending) return;
    if (jumping >= 0 && i !== jumping) return;   // a dot was clicked: only the destination plays
    pending = i; clearTimeout(pendingTimer);
    pendingTimer = setTimeout(function () { play(i); }, 120);
  }

  function syncChrome() {
    var y = window.scrollY, a = activeAt(y), past = y > paperBottom - 40;
    nav.classList.toggle('on', past);
    dotsNav.classList.toggle('on', past);
    dots.forEach(function (d, j) { d.classList.toggle('on', j === a); if (j === a) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
    hint.classList.toggle('on', !!film && !interacted && current >= 0 && current < byKey.data1.i && vis > 0.6);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (jumping >= 0) {   // a dot jump ends when the scroll comes to rest
        clearTimeout(jumpTimer);
        jumpTimer = setTimeout(function () { jumping = -1; if (film) want(activeAt(window.scrollY)); }, 160);
      }
      if (film) want(activeAt(window.scrollY));
      syncChrome();
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); onScroll(); });
  window.addEventListener('load', function () { measure(); onScroll(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); onScroll(); });
  measure();
  syncChrome();

  /* the controls of two chapters: the domain the world model plays; LaLa-World or LaLa-Policy */
  var domainRow = $('.ctl[data-for="latent"]'), policyRow = $('.ctl[data-for="policy"]');
  function buildDomains() {
    domainRow.innerHTML = film.domains.map(function (d, i) {
      return '<button type="button" data-domain="' + i + '" aria-pressed="false">' + d.name + '</button>';
    }).join('');
    domainRow.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b && chapters[current].key === 'latent') film.playDomain(+b.getAttribute('data-domain'));
    });
  }
  function onDomain(i) {
    $$('button', domainRow).forEach(function (b, j) { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
  }
  function syncPolicy() {
    if (!film) return;
    $$('button', policyRow).forEach(function (b) {
      var on = (b.getAttribute('data-model') === 'policy') === film.policy;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  policyRow.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !film || chapters[current].key !== 'policy') return;
    film.setPolicy(b.getAttribute('data-model') === 'policy'); syncPolicy();
  });

  var videoLoad = null;
  function loadVideo() {
    if (videoLoad || !film) return;
    videoLoad = loadScript('assets/media-video.js').then(function () { return film.addVideo(); })
      .catch(function (e) { console.warn('LaLa-World: video cards unavailable', e); });
  }

  function fallback(err) {
    console.error('LaLa-World: the 3D film could not start', err);
    root.classList.remove('film', 'night'); root.classList.add('nofilm');
    nav.classList.remove('on'); dotsNav.classList.remove('on');
  }

  Promise.all([loadScript('assets/media.js'), loadScript('assets/lala-stage.js'), loadScript('assets/lala-world.js')]).then(function () {
    return window.LalaFilm.boot({
      host: stageEl, labelHost: document.body, view: viewFor, onFrame: function (dt) { if (film && current >= 0) onFrame(dt); },
      onDomain: function (i) { onDomain(i); },
      onInteract: function () { interacted = true; syncChrome(); },
      onFirstFrames: function () { stageEl.classList.add('on'); root.classList.add('ready'); }
    });
  }).then(function (api) {
    film = api;
    window.__film = api;
    chapters.forEach(function (c) { c.look = film.lookName(film.byShot[c.key]); });
    buildDomains();
    measure();
    var y = window.scrollY, a = activeAt(y);
    showLook(y);   // the first frame already wears its background
    if (a === 0) play(0); else play(a, true);   // the opening builds up layer by layer; deeper in, the shot is just there
    if ('requestIdleCallback' in window) requestIdleCallback(loadVideo, { timeout: 6000 }); else setTimeout(loadVideo, 4000);
    if (location.hash && a === 0) {   // a link to a chapter
      var target = document.getElementById(location.hash.slice(1)), c = target && chapters.filter(function (ch) { return ch.el === target; })[0];
      if (c) { window.scrollTo(0, startOf(c.i)); onScroll(); }
    }
  }).catch(fallback);
})();
