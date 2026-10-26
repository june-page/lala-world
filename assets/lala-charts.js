/* LaLa-World project page — the results, as charts (from the LaLa 3D film, claude-3d-model_v14/assets/lala-charts.js).
   One chart drawn on a 2D canvas over the 3D stage, after Apple's keynote charts: thin grey axes without ticks or numbers,
   grey axis titles, LaLa in the film's violet → orange gradient and the others in grey, names without scores, one smooth
   curve per model (a saturating curve fitted through the paper's points, held to their first and last point; no markers),
   and one dotted callout per chart. The chapter's title is the chart's title. Over the night sky (P4) the same in night
   colours: light text and axes, the lighter gradient of the night captions (mixed by the stage's night value).
     p1  planning performance: LaLa-World and six other world models, points on one vertical line          (Table 1, top)
     p2  the x-axis becomes planning time: LaLa-World and RAEv2, a video generation model                  (Fig. 5b)
     p3  the x-axis becomes training time                                                                   (Fig. 5a)
     p4  LaLa-Policy and four other policies: success rate against inference time                         (Tables 3, 4)
   In p1 the points come in one after another from the lowest, LaLa-World last, their names to the right of the line;
   in p4 the other policies come in one by one from the slowest, then LaLa-Policy.
   charts.go(name, { at }) builds a section `at` seconds from now; a section that follows its predecessor turns out of
   it (the points slide, the curves reshape), any other one builds from its axes. charts.go(null) fades the chart.
   Everything runs on the stage's clock. The film's shorter chart shots run p2–p4 faster (TEMPO), and so does the page.

   What changed from the film: the chart stands in its chapter's pin and goes with it, like the model in the other
   chapters. Every frame the page says where the pin is and how much of the chapter's picture shows (charts.place), then
   the chart is drawn (charts.draw). On a wide screen it is laid out as in the film; on a narrow one it fills the band
   under the chapter's title, the y-axis title above the axis. */
(function () {
  'use strict';

  /* the colours by day and at night, [r, g, b, a]; the drawing uses the mix for the stage's night value (setColours) */
  var DAY = { INK: [29, 29, 31, 1], INK2: [110, 110, 115, 1], MUTE: [134, 134, 139, 1], MUTE2: [174, 174, 178, 1], AXIS: [60, 60, 67, 0.26],
    BASE: [180, 180, 186, 1], GUIDE: [60, 60, 67, 0.12], LEAD: [60, 60, 67, 0.3],
    G0: [110, 86, 207, 1], G1: [194, 75, 214, 1], G2: [240, 162, 59, 1] };   // G: the captions' <em>
  var NIGHT = { INK: [245, 245, 247, 1], INK2: [212, 208, 230, 1], MUTE: [169, 164, 196, 1], MUTE2: [128, 122, 160, 1], AXIS: [232, 228, 255, 0.3],
    BASE: [142, 137, 174, 1], GUIDE: [232, 228, 255, 0.14], LEAD: [232, 228, 255, 0.34],
    G0: [167, 155, 255, 1], G1: [242, 139, 230, 1], G2: [255, 210, 125, 1] };   // the night captions' <em>
  var INK, INK2, MUTE, MUTE2, AXIS, BASE, GUIDE, LEAD, GRAD, colourAt = -1;
  function setColours(n) {
    if (n === colourAt) return;
    colourAt = n;
    var c = {};
    Object.keys(DAY).forEach(function (key) {
      var a = DAY[key], b = NIGHT[key];
      c[key] = 'rgba(' + Math.round(lerp(a[0], b[0], n)) + ',' + Math.round(lerp(a[1], b[1], n)) + ',' + Math.round(lerp(a[2], b[2], n)) + ',' + lerp(a[3], b[3], n).toFixed(3) + ')';
    });
    INK = c.INK; INK2 = c.INK2; MUTE = c.MUTE; MUTE2 = c.MUTE2; AXIS = c.AXIS; BASE = c.BASE; GUIDE = c.GUIDE; LEAD = c.LEAD; GRAD = [c.G0, c.G1, c.G2];
  }
  setColours(0);
  var FONT = '"Inter V", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

  /* the paper's numbers */
  var DATA = {
    // Table 1 (top): average MPC planning success (%) over Wall, PointMaze, Push-T, MetaWorld-R and MetaWorld-RW
    // (V-JEPA 2-AC's average as given by the authors)
    lwm: [{ name: 'LaLa-World', v: 72.1, us: true }, { name: 'JEPA-WMs', v: 64.6 }, { name: 'DINO-WM', v: 62.3 },
      { name: 'V-JEPA 2-AC', v: 61.6 }, { name: 'DreamerV3', v: 30.2 }, { name: 'LeWorldModel', v: 28.1 }, { name: 'IRIS', v: 26.0 }],
    // Fig. 5, the points as plotted: planning performance against (b) average planning time per trajectory (min) and
    // (a) training time (min, 8 H100), full-depth predictors in (a), the four depths in (b); RAEv2 with five denoising steps
    time: { lala: [[1.56, 46.7], [3.95, 54.3], [5.73, 57.5], [7.52, 59.4]], rae: [[34.23, 43.6], [56.45, 46.8], [78.65, 47.5], [100.86, 48.0]] },
    train: { lala: [[144.6, 47.8], [289.9, 56.7], [434.7, 58.9], [579.3, 59.4]], rae: [[180, 33.6], [360, 45.2], [540, 47.4], [720, 48.0]] },
    // RoboCasa, 50 demonstrations per task: success rate (%) (Table 3) and average inference time per trajectory (s):
    // LaLa-Policy's and Cosmos Policy's from Table 4, the others from the authors, against LaLa-Policy's: UVA 1.4× faster,
    // π0.5 3.2× and MolmoAct2 4.6× slower
    policy: [{ name: 'LaLa-Policy', v: 57.3, s: 2.12, us: true }, { name: 'UVA', v: 50.0, s: 2.12 / 1.4 },
      { name: 'π0.5', v: 54.5, s: 2.12 * 3.2 }, { name: 'MolmoAct2', v: 54.3, s: 2.12 * 4.6 }, { name: 'Cosmos Policy', v: 56.0, s: 11.71 }]
  };
  var Y_P1 = [20, 76], Y_PERF = [30, 30 + 29.4 * 56 / 52.1];   // p2 / p3: LaLa-World's last point (59.4) sits where its p1 point (72.1) stood
  var SEC = {
    p1: { y: Y_P1, yl: ['Planning performance', 'Higher is better'], xl: null },
    p2: { x: [-4, 108], y: Y_PERF, yl: ['Planning performance', 'Higher is better'], xl: ['Planning time', 'Lower is better'], ratio: '13.9×' },
    p3: { x: [0, 760], y: Y_PERF, yl: ['Planning performance', 'Higher is better'], xl: ['Training time', 'Lower is better'], ratio: '6×' },
    // the success rates (50.0 … 57.3) take the height of the chart, not its top fifth
    p4: { x: [0, 15.5], y: [47.5, 58.5], yl: ['Success rate', 'Higher is better'], xl: ['Inference time', 'Lower is better'], ratio: '5.5×' }
  };
  var CHAIN = { p2: 'p1', p3: 'p2', p4: 'p3' };   // a section that follows its predecessor turns out of it
  var P4_T0 = 0.65, P4_T0_MORPH = 0.95;   // p4's points begin this long into the section (built fresh / out of p3)
  var PACE = { p1: 1.5, p4: 2 };          // how many times faster than the base timings below the points come in
  var TEMPO = { p2: 1.4, p3: 1.25, p4: 1.15 };   // a whole section this many times faster (the film's v14: 3.8 s for p2 / p3, 4.5 s for p4)

  /* a smooth curve for a short run of points: y = A − B·e^(−(x − x0)/τ) through the first and the last point,
     τ chosen to pass closest to the ones between */
  function fit(pts) {
    var x0 = pts[0][0], y0 = pts[0][1], n = pts.length, x1 = pts[n - 1][0], y1 = pts[n - 1][1], span = x1 - x0, best = null;
    for (var i = 0; i <= 240; i++) {
      var tau = span * Math.pow(10, -1.6 + 2.4 * i / 240), e1 = Math.exp(-span / tau), B = (y1 - y0) / (1 - e1), A = y0 + B, err = 0;
      for (var j = 1; j < n - 1; j++) { var d = A - B * Math.exp(-(pts[j][0] - x0) / tau) - pts[j][1]; err += d * d; }
      if (!best || err < best.err) best = { err: err, A: A, B: B, tau: tau };
    }
    return function (s) { var x = x0 + s * span; return [x, best.A - best.B * Math.exp(-(x - x0) / best.tau)]; };   // s ∈ [0, 1]
  }
  var CURVE = { p2: { lala: fit(DATA.time.lala), rae: fit(DATA.time.rae) }, p3: { lala: fit(DATA.train.lala), rae: fit(DATA.train.rae) } };
  var NS = 72;   // samples per curve

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function byValue(p, q) { return p.d.v - q.d.v; }

  function create(stage, opts) {
    opts = opts || {};
    var ease = stage.ease;
    var cv = document.createElement('canvas');
    cv.className = 'charts'; cv.setAttribute('aria-hidden', 'true');
    (opts.host || document.body).appendChild(cv);
    var g = cv.getContext('2d');
    var cur = null, old = null, axesFrom = 0, hideAt = -1, F = null, drawn = false;
    function E(u, a, b, f) { return (f || ease.inOutCubic)(clamp01((u - a) / (b - a))); }
    function now() { return stage.clock.t; }

    /* ------------------------------------------------------------ layout (CSS px, from the top of the pin; W: the screen's width) */
    function layout(W) {
      var H = F.h, L = { W: W, H: H, narrow: W < 760 || W < H * 0.85, right: W };
      if (!L.narrow) {   // the film's: the plot from 0.3 to 0.8 of the height, a little right of the middle, the y-axis title left of it
        var k = Math.min(H / 900, W / 1600 * 1.15), ph = H * 0.5;
        L.k = k; L.yb = H * 0.8; L.yt = Math.max(L.yb - ph, F.capBottom + 48 * k);   // never under the title
        ph = L.yb - L.yt;
        var pw = Math.min(W * 0.56, ph * 1.95);
        L.xl = (W - pw) / 2 + W * 0.055; L.xr = L.xl + pw; L.pw = pw; L.ph = ph;
        return L;
      }
      /* the band under the title: the y-axis title above the axis, the x-axis title under it */
      var kn = Math.max(0.58, Math.min(0.85, W / 650)), m = Math.max(16, W * 0.05);
      L.k = kn;
      L.yt = F.capBottom + (26 + 50 + 32) * kn;   // a gap, the y-axis title's two lines, the axis running on above the plot
      L.yb = F.bottom - 92 * kn;
      L.xl = m + 6 * kn; L.xr = W - m - 24 * kn; L.right = W - m;
      L.pw = L.xr - L.xl; L.ph = Math.max(60, L.yb - L.yt);
      L.yt = L.yb - L.ph;
      return L;
    }
    function sx(L, name, x) { var d = SEC[name].x; return L.xl + (x - d[0]) / (d[1] - d[0]) * L.pw; }
    function sy(L, name, y) { var d = SEC[name].y; return L.yb - (y - d[0]) / (d[1] - d[0]) * L.ph; }
    function curvePts(L, name, which) {   // the fitted curve in screen space
      var f = CURVE[name][which], out = [];
      for (var i = 0; i < NS; i++) { var p = f(i / (NS - 1)); out.push([sx(L, name, p[0]), sy(L, name, p[1])]); }
      return out;
    }

    /* ------------------------------------------------------------ drawing helpers */
    function font(w, px) { return w + ' ' + px + 'px ' + FONT; }
    function grad(x0, y0, x1, y1) { var gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, GRAD[0]); gr.addColorStop(0.45, GRAD[1]); gr.addColorStop(1, GRAD[2]); return gr; }
    function text(s, x, y, o) {
      g.save(); g.globalAlpha *= o.a == null ? 1 : o.a; g.font = font(o.w || 600, o.px); g.fillStyle = o.c || INK;
      g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic'; g.fillText(s, x, y); g.restore();
    }
    function measure(s, w, px) { g.save(); g.font = font(w, px); var m = g.measureText(s).width; g.restore(); return m; }
    /* "LaLa-" + the word in the gradient, like the film's wordmark */
    function brand(word, x, y, o) {
      g.save(); g.globalAlpha *= o.a == null ? 1 : o.a; g.font = font(o.w || 650, o.px); g.textBaseline = o.base || 'alphabetic';
      var w1 = g.measureText('LaLa-').width, w2 = g.measureText(word).width, x0 = o.align === 'right' ? x - w1 - w2 : o.align === 'center' ? x - (w1 + w2) / 2 : x;
      g.fillStyle = INK; g.fillText('LaLa-', x0, y);
      g.fillStyle = grad(x0 + w1, 0, x0 + w1 + w2, 0); g.fillText(word, x0 + w1, y);
      g.restore(); return w1 + w2;
    }
    /* a model's name, from its left end on a baseline: LaLa's as the wordmark, π0.5 with its subscript */
    function subName(name) { var m = /^π(.+)$/.exec(name); return m ? ['π', m[1]] : null; }
    function nameWidth(d, px) {
      if (d.us) return measure(d.name, 650, px);
      var s = subName(d.name);
      return s ? measure(s[0], 600, px) + px * 0.05 + measure(s[1], 600, Math.round(px * 0.7)) : measure(d.name, 600, px);
    }
    function nameAt(d, left, base, px, a) {
      if (a <= 0.003) return;
      if (d.us) { brand(d.name.slice(5), left, base, { px: px, a: a }); return; }
      var s = subName(d.name);
      if (!s) { text(d.name, left, base, { px: px, w: 600, c: INK2, a: a }); return; }
      text(s[0], left, base, { px: px, w: 600, c: INK2, a: a });
      text(s[1], left + measure(s[0], 600, px) + px * 0.05, base + px * 0.2, { px: Math.round(px * 0.7), w: 600, c: INK2, a: a });
    }
    /* a point. cut: a thin ring around it is cleared first, so points that nearly coincide still read as two */
    function dot(x, y, r, us, a, cut) {
      if (r <= 0.05 || a <= 0.003) return;
      g.save(); g.globalAlpha *= a;
      if (cut) {
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        g.beginPath(); g.arc(x, y, r * 1.4, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      if (us) {
        var halo = g.createRadialGradient(x, y, 0, x, y, r * 3);
        halo.addColorStop(0, 'rgba(194,75,214,0.26)'); halo.addColorStop(1, 'rgba(194,75,214,0)');
        g.fillStyle = halo; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = grad(x - r, y + r, x + r, y - r);
      } else g.fillStyle = BASE;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
    function guide(L, x, grow, a) {   // the faint vertical line points stand on
      if (grow <= 0.003 || a <= 0.003) return;
      g.save(); g.strokeStyle = GUIDE; g.lineWidth = 1.5 * L.k; g.globalAlpha *= a;
      g.beginPath(); g.moveTo(x, L.yb); g.lineTo(x, lerp(L.yb, L.yt, grow)); g.stroke(); g.restore();
    }
    function polyline(pts, draw) {   // the first `draw` (0..1) of a sampled curve
      var n = pts.length, end = draw * (n - 1), last = Math.floor(end);
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i <= last; i++) g.lineTo(pts[i][0], pts[i][1]);
      if (last < n - 1 && end > last) { var f = end - last; g.lineTo(lerp(pts[last][0], pts[last + 1][0], f), lerp(pts[last][1], pts[last + 1][1], f)); }
    }
    function curve(pts, draw, us, a, L) {
      if (draw <= 0.002 || a <= 0.003) return;
      var p0 = pts[0], p1 = pts[pts.length - 1];
      g.save(); g.globalAlpha *= a; g.lineCap = g.lineJoin = 'round';
      if (us) {
        g.lineWidth = 7.5 * L.k; g.strokeStyle = grad(p0[0], p0[1], p1[0], p1[1]);
        g.shadowColor = 'rgba(194,75,214,0.32)'; g.shadowBlur = 16 * L.k;
      } else { g.lineWidth = 6 * L.k; g.strokeStyle = BASE; }
      polyline(pts, draw); g.stroke(); g.restore();
    }
    /* a dotted callout along a polyline, drawn from its first point; an arrowhead at the last one */
    function callout(path, draw, label, lx, ly, la, L) {
      if (draw > 0.002) {
        var segs = [], total = 0, i;
        for (i = 1; i < path.length; i++) { var l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); segs.push(l); total += l; }
        var left = total * draw;
        g.save(); g.strokeStyle = MUTE; g.lineCap = 'round'; g.lineWidth = 3.2 * L.k; g.setLineDash([0.01, 10 * L.k]);
        g.beginPath(); g.moveTo(path[0][0], path[0][1]);
        var tip = path[0], dir = [1, 0];
        for (i = 1; i < path.length && left > 0; i++) {
          var f = Math.min(1, left / segs[i - 1]);
          tip = [lerp(path[i - 1][0], path[i][0], f), lerp(path[i - 1][1], path[i][1], f)];
          dir = [(path[i][0] - path[i - 1][0]) / segs[i - 1], (path[i][1] - path[i - 1][1]) / segs[i - 1]];
          g.lineTo(tip[0], tip[1]); left -= segs[i - 1];
        }
        g.stroke();
        var ha = clamp01((draw - 0.9) / 0.1);
        if (ha > 0) {   // the arrowhead
          var s = 11 * L.k, nx = -dir[1], ny = dir[0];
          g.setLineDash([]); g.lineWidth = 3 * L.k; g.globalAlpha *= ha; g.beginPath();
          g.moveTo(tip[0] - dir[0] * s + nx * s * 0.62, tip[1] - dir[1] * s + ny * s * 0.62); g.lineTo(tip[0], tip[1]);
          g.lineTo(tip[0] - dir[0] * s - nx * s * 0.62, tip[1] - dir[1] * s - ny * s * 0.62); g.stroke();
        }
        g.restore();
      }
      if (la > 0.003) {
        g.save(); g.globalAlpha *= la; g.font = font(700, Math.round(40 * L.k)); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        var w = g.measureText(label).width; g.fillStyle = grad(lx - w / 2, 0, lx + w / 2, 0);
        g.fillText(label, lx, ly + (1 - la) * 8 * L.k); g.restore();
      }
    }
    function axes(L, ya, xa, a) {
      if (a <= 0.003) return;
      g.save(); g.globalAlpha *= a; g.strokeStyle = AXIS; g.lineWidth = 1.7 * L.k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(L.xl, L.yb); g.lineTo(L.xl, lerp(L.yb, L.yt - 18 * L.k, ya));
      g.moveTo(L.xl, L.yb); g.lineTo(lerp(L.xl, L.xr + 24 * L.k, xa), L.yb); g.stroke(); g.restore();
    }
    function yLabel(L, lab, a) {
      if (!lab || a <= 0.003) return;
      var px = Math.round(28 * L.k), d = (1 - a) * 8 * L.k;
      if (L.narrow) {   // above the axis, from its foot
        var base = L.yt - 18 * L.k - 14 * L.k;
        text(lab[0], L.xl - 6 * L.k, base - Math.round(19 * L.k) * 1.15 + d, { px: px, w: 650, c: MUTE, a: a });
        text(lab[1], L.xl - 6 * L.k, base + d, { px: Math.round(19 * L.k), w: 500, c: MUTE2, a: a });
        return;
      }
      var y = (L.yt + L.yb) / 2;
      text(lab[0], L.xl - 34 * L.k, y + d, { px: px, w: 650, c: MUTE, a: a, align: 'right' });
      text(lab[1], L.xl - 34 * L.k, y + px * 1.05 + d, { px: Math.round(19 * L.k), w: 500, c: MUTE2, a: a, align: 'right' });
    }
    function xLabel(L, lab, a) {
      if (!lab || a <= 0.003) return;
      var px = Math.round(28 * L.k), x = (L.xl + L.xr) / 2, y = L.yb + 56 * L.k + (1 - a) * 8 * L.k;
      text(lab[0], x, y, { px: px, w: 650, c: MUTE, a: a, align: 'center' });
      text(lab[1], x, y + px * 1.05, { px: Math.round(19 * L.k), w: 500, c: MUTE2, a: a, align: 'center' });
    }
    function same(a, b) { return a && b && a[0] === b[0]; }

    /* ------------------------------------------------------------ names beside points on one vertical line */
    var LX = 32;   // a name starts this far (× k) from its point
    function relax(list) {   // names closer than a line apart part evenly (ly: the height a name goes to)
      var o = list.slice().sort(function (p, q) { return p.y - q.y; });
      o.forEach(function (p) { p.ly = p.y; });
      for (var it = 0; it < 40; it++) for (var i = 1; i < o.length; i++) {
        var short = (o[i - 1].px + o[i].px) * 0.6 - (o[i].ly - o[i - 1].ly);
        if (short > 0) { o[i - 1].ly -= short / 2; o[i].ly += short / 2; }
      }
    }
    /* two points closer than their size stand side by side instead, the line between them (ox: the sideways offset).
       lean(a, b): 1 when a goes to the right of b */
    function twins(list, L, lean) {
      var o = list.slice().sort(function (p, q) { return p.y - q.y; });
      o.forEach(function (p) { p.ox = 0; });
      for (var i = 1; i < o.length; i++) {
        var a = o[i - 1], b = o[i], need = a.r + b.r + 3 * L.k, dy = b.y - a.y;
        if (dy >= need || a.ox || b.ox) continue;
        var dx = Math.sqrt(need * need - dy * dy) / 2, side = lean(a, b);
        a.ox = side * dx; b.ox = -side * dx;
      }
    }
    function leader(L, p, x, y, a) {   // from a point (at x + p.ox, y) toward its name, where the name sits away from it
      var ox = p.ox || 0, off = p.ly - p.y;
      if (a <= 0.003 || (Math.abs(off) <= 5 * L.k && ox * p.side >= 0)) return;
      var ax = x + p.side * (LX - 7) * L.k, ay = y + off, vx = ax - x - ox, vy = off, len = Math.hypot(vx, vy), r0 = p.r + 5 * L.k;
      if (len <= r0 + 4 * L.k) return;
      g.save(); g.globalAlpha *= a; g.strokeStyle = LEAD; g.lineWidth = 1.3 * L.k; g.lineCap = 'round'; g.beginPath();
      g.moveTo(x + ox + vx / len * r0, y + vy / len * r0); g.lineTo(ax, ay); g.stroke(); g.restore();
    }
    function sideName(L, p, a, dy) {   // p.side: 1 right of the line, −1 left of it
      if (a <= 0.003) return;
      var w = nameWidth(p.d, p.px), slide = (1 - a) * 10 * L.k;
      leader(L, p, p.x, p.y + dy, a);
      nameAt(p.d, p.side > 0 ? p.x + LX * L.k + slide : p.x - LX * L.k - w - slide, p.ly + dy + p.px * 0.36, p.px, a);
    }

    /* ------------------------------------------------------------ the sections. u: seconds since the section began;
       m: true when it turns out of its predecessor */
    function p1Layout(L) {   // the points on the line and where their names go (ly); a narrow screen keeps the names room
      var xc = L.narrow ? lerp(L.xl, L.xr, 0.38) : (L.xl + L.xr) / 2, k = L.k;
      var pts = DATA.lwm.map(function (d) { return { d: d, x: xc, y: sy(L, 'p1', d.v), px: Math.round((d.us ? 30 : 25) * k), r: (d.us ? 11 : 6.5) * k, side: 1 }; });
      relax(pts);
      twins(pts, L, function (a, b) {   // the one whose name moved further leans away from the names
        return Math.abs(a.ly - a.y) > Math.abs(b.ly - b.y) ? -1 : 1;
      });
      return pts;
    }
    function drawP1(L, u, a) {
      var pts = p1Layout(L), n = pts.length, q = PACE.p1;
      g.save(); g.globalAlpha *= a;
      guide(L, pts[0].x, E(u, 0.6, 1.1), E(u, 0.6, 1.1));
      pts.slice().sort(byValue).forEach(function (p, i) {   // one after another from the lowest (drawn over the lower ones); LaLa-World last
        var t = 0.8 + (p.d.us ? (n - 1) * 0.13 + 0.25 : i * 0.13) / q;
        var ap = E(u, t, t + 0.5 / q, ease.outCubic), al = E(u, t + 0.15 / q, t + 0.65 / q, ease.outCubic);
        dot(p.x + p.ox, p.y, p.r * ap, p.d.us, ap, true);
        sideName(L, p, al, 0);
      });
      g.restore();
    }
    function drawCurves(L, name, lalaPts, raePts, dl, dr, a, la, lr) {
      curve(raePts, dr, false, a, L); curve(lalaPts, dl, true, a, L);
      var e = lalaPts[lalaPts.length - 1], r = raePts[raePts.length - 1], px = Math.round(28 * L.k);
      if (la > 0.003) {   // the name beside the end of the LaLa-World curve
        if (name === 'p2') brand('World', e[0] + 24 * L.k, e[1] + 10 * L.k, { px: px, a: a * la });
        else brand('World', e[0], e[1] - 26 * L.k, { px: px, a: a * la, align: 'center' });
      }
      if (lr > 0.003) raeName(L, r, a * lr);
    }
    function raeName(L, r, a) {   // under the end of its curve, right-aligned: the callouts run above it
      var px = Math.round(28 * L.k);
      text('RAEv2', r[0], r[1] + 50 * L.k, { px: px, w: 650, c: INK2, a: a, align: 'right' });
      text('Video generation model', r[0], r[1] + 50 * L.k + px * 0.95, { px: Math.round(20 * L.k), w: 500, c: MUTE, a: a, align: 'right' });
    }
    function calloutP2(L, draw, la, a) {
      var e = sx(L, 'p2', DATA.time.lala[3][0]), ey = sy(L, 'p2', DATA.time.lala[3][1]);
      var rx = sx(L, 'p2', DATA.time.rae[3][0]), ry = sy(L, 'p2', DATA.time.rae[3][1]);
      var lift = ey + 46 * L.k;   // just under the LaLa-World end: up from RAEv2's end, then across
      // the ratio halfway along; on a narrow chart halfway between the LaLa-World name (beside the curve's end) and RAEv2's end
      var name = e + 24 * L.k + measure('LaLa-World', 650, Math.round(28 * L.k)), half = measure(SEC.p2.ratio, 700, Math.round(40 * L.k)) / 2;
      var lx = L.narrow ? Math.min(Math.max((name + rx) / 2, name + 14 * L.k + half), rx - half) : (rx + e) / 2;
      g.save(); g.globalAlpha *= a;
      callout([[rx, ry - 16 * L.k], [rx, lift], [e + 26 * L.k, lift]], draw, SEC.p2.ratio, lx, lift - 18 * L.k, la, L);
      g.restore();
    }
    function calloutP3(L, draw, la, a) {
      var lx = sx(L, 'p3', DATA.train.lala[0][0]), rx = sx(L, 'p3', DATA.train.rae[3][0]), y = sy(L, 'p3', 47.9);
      g.save(); g.globalAlpha *= a;
      callout([[rx - 22 * L.k, y], [lx + 22 * L.k, y]], draw, SEC.p3.ratio, (lx + rx) / 2, y - 22 * L.k, la, L);
      g.restore();
    }
    function drawP2(L, u, m, a) {
      var lala = curvePts(L, 'p2', 'lala'), rae = curvePts(L, 'p2', 'rae'), end = lala[NS - 1], k = L.k;
      g.save(); g.globalAlpha *= a;
      if (m) {   // out of p1: the other points leave, LaLa-World's point slides to the end of its curve, the curve grows into it
        var p1 = p1Layout(L), out = E(u, 0, 0.55), mv = E(u, 0.15, 1.3), me = p1[0];
        guide(L, me.x, 1, 1 - E(u, 0, 0.4));
        p1.slice().sort(byValue).forEach(function (p) {
          if (p.d.us) return;
          dot(p.x + p.ox, p.y + out * 14 * k, p.r, false, 1 - out, true);
          sideName(L, p, 1 - out, out * 14 * k);
        });
        var x = lerp(me.x, end[0], mv), y = lerp(me.y, end[1], mv), dl = E(u, 1.1, 2.1), dr = E(u, 1.15, 2.45);
        sideName(L, me, 1 - E(u, 0, 0.35), 0);   // its p1 name leaves; the curve's own name comes with the curve
        drawCurves(L, 'p2', lala, rae, dl, dr, 1, E(u, 1.6, 2.2), E(u, 2.2, 2.7));
        dot(x, y, lerp(11 * k, 3.75 * k, E(u, 1.75, 2.15)), true, 1 - E(u, 2.05, 2.2));
        calloutP2(L, E(u, 2.6, 3.3, ease.inOutSine), E(u, 3.0, 3.5), 1);
      } else {
        drawCurves(L, 'p2', lala, rae, E(u, 0.55, 1.55), E(u, 0.6, 1.9), 1, E(u, 1.2, 1.7), E(u, 1.6, 2.1));
        calloutP2(L, E(u, 2.0, 2.7, ease.inOutSine), E(u, 2.4, 2.9), 1);
      }
      g.restore();
    }
    function drawP3(L, u, m, a) {
      var lala3 = curvePts(L, 'p3', 'lala'), rae3 = curvePts(L, 'p3', 'rae');
      g.save(); g.globalAlpha *= a;
      if (m) {   // out of p2: the curves reshape from planning time to training time
        var lala2 = curvePts(L, 'p2', 'lala'), rae2 = curvePts(L, 'p2', 'rae'), t = E(u, 0.25, 1.75);
        var mix = function (A, B) { return A.map(function (p, i) { return [lerp(p[0], B[i][0], t), lerp(p[1], B[i][1], t)]; }); };
        calloutP2(L, 1, 1, 1 - E(u, 0, 0.4));
        curve(mix(rae2, rae3), 1, false, 1, L); curve(mix(lala2, lala3), 1, true, 1, L);
        // the LaLa-World name: from beside the p2 end to above the p3 end
        var e2 = lala2[NS - 1], e3 = lala3[NS - 1], px = Math.round(28 * L.k), nt = E(u, 0.25, 1.75);
        var nw = measure('LaLa-World', 650, px);
        var nx = lerp(e2[0] + 24 * L.k + nw / 2, e3[0], nt), ny = lerp(e2[1] + 10 * L.k, e3[1] - 26 * L.k, nt);
        brand('World', nx, ny, { px: px, align: 'center' });
        raeName(L, mix(rae2, rae3)[NS - 1], 1);
        calloutP3(L, E(u, 1.95, 2.65, ease.inOutSine), E(u, 2.3, 2.8), 1);
      } else {
        drawCurves(L, 'p3', lala3, rae3, E(u, 0.55, 1.6), E(u, 0.6, 1.9), 1, E(u, 1.2, 1.7), E(u, 1.6, 2.1));
        calloutP3(L, E(u, 2.0, 2.7, ease.inOutSine), E(u, 2.4, 2.9), 1);
      }
      g.restore();
    }

    function p4Pts(L) {
      return DATA.policy.map(function (d) {
        return { d: d, x: sx(L, 'p4', d.s), y: sy(L, 'p4', d.v), px: Math.round((d.us ? 30 : 25) * L.k), r: (d.us ? 11 : 8) * L.k };
      });
    }
    /* [left end, baseline] of a name by its point: LaLa-Policy's above it, the others' to its right (to its left where a
       narrow screen would cut it) */
    function p4Name(L, p, x, y) {
      if (p.d.us) return [x - nameWidth(p.d, p.px) / 2, y - 30 * L.k];
      var w = nameWidth(p.d, p.px), left = x + p.r + 12 * L.k;
      return [left + w > L.right ? x - p.r - 12 * L.k - w : left, y + p.px * 0.36];
    }
    function calloutP4(L, pts, draw, la) {   // up from Cosmos Policy, then across to LaLa-Policy
      var c = pts[4], l = pts[0], k = L.k;
      callout([[c.x, c.y - c.r - 9 * k], [c.x, l.y], [l.x + l.r + 13 * k, l.y]], draw, SEC.p4.ratio, (c.x + l.x) / 2, l.y - 18 * k, la, L);
    }
    function drawP4(L, u, m, a) {
      var t0 = m ? P4_T0_MORPH : P4_T0, q = PACE.p4, t;
      g.save(); g.globalAlpha *= a;
      if (m) {   // out of p3: the curves and their callout leave
        var f = 1 - E(u, 0, 0.6);
        if (f > 0) { drawCurves(L, 'p3', curvePts(L, 'p3', 'lala'), curvePts(L, 'p3', 'rae'), 1, 1, f, 1, 1); calloutP3(L, 1, f, f); }
      }
      var pts = p4Pts(L);   // the others one by one, the slowest first; LaLa-Policy last
      pts.slice().sort(function (p, r) { return (p.d.us ? 1 : 0) - (r.d.us ? 1 : 0) || r.d.s - p.d.s; }).forEach(function (p, i) {
        t = t0 + (i * 0.32 + (p.d.us ? 0.2 : 0)) / q;
        var ap = E(u, t, t + 0.5 / q, ease.outCubic), al = E(u, t + 0.15 / q, t + 0.65 / q, ease.outCubic), n = p4Name(L, p, p.x, p.y);
        dot(p.x, p.y, p.r * ap, p.d.us, ap, true);
        nameAt(p.d, n[0], n[1] + (1 - al) * 8 * L.k, p.px, al);
      });
      var tc = t + 0.8 / q;
      calloutP4(L, pts, E(u, tc, tc + 0.7, ease.inOutSine), E(u, tc + 0.4, tc + 0.9));
      g.restore();
    }
    var DRAW = { p1: function (L, u, m, a) { drawP1(L, u, a); }, p2: drawP2, p3: drawP3, p4: drawP4 };
    var END = 9;   // a section's local time when frozen at its end (fading out under the next one)
    /* ------------------------------------------------------------ per frame (after the page has placed the pin) */
    function draw() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), CW = cv.clientWidth, CH = cv.clientHeight;
      if (cv.width !== Math.round(CW * dpr) || cv.height !== Math.round(CH * dpr)) { cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr); drawn = true; }
      var t = now();
      var vis = hideAt >= 0 ? 1 - E(t - hideAt, 0, 0.5) : 1;
      if (hideAt >= 0 && vis <= 0.001) { cur = old = null; hideAt = -1; }
      var alpha = F ? vis * clamp01(F.alpha) : 0;
      if (!(cur || old) || alpha <= 0.002) {   // nothing to show: clear once
        if (drawn) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); drawn = false; }
        return;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, CW, CH);
      g.translate(0, F.top); drawn = true;   // the pin's top on the screen
      setColours(stage.night);
      var L = layout(CW);
      g.globalAlpha = alpha;
      // axes and their titles
      var ua = t - axesFrom, ya = E(ua, 0, 0.75), xa = E(ua, 0.12, 0.9);
      axes(L, ya, xa, 1);
      var sec = cur ? SEC[cur.name] : null, u = cur ? (t - cur.t0) * (TEMPO[cur.name] || 1) : 0;
      var lab = E(ua, 0.3, 0.9);
      if (cur && cur.m) {   // titles that change cross over
        var pre = SEC[cur.from], xo = 1 - E(u, 0.15, 0.6), xi = E(u, 0.55, 1.05);
        if (same(pre.yl, sec.yl)) yLabel(L, sec.yl, lab); else { yLabel(L, pre.yl, lab * xo); yLabel(L, sec.yl, lab * xi); }
        if (same(pre.xl, sec.xl)) xLabel(L, sec.xl, lab); else { xLabel(L, pre.xl, lab * xo); xLabel(L, sec.xl, lab * xi); }
      } else if (sec) { var fi = E(u, 0.25, 0.85); yLabel(L, sec.yl, lab * fi); xLabel(L, sec.xl, lab * fi); }
      if (old) {   // the section being replaced, at its end, fading
        var oa = 1 - E(t - old.out, 0, 0.35);
        if (oa > 0) { if (!(cur && same(SEC[old.name].yl, sec.yl))) yLabel(L, SEC[old.name].yl, oa); if (!(cur && same(SEC[old.name].xl, sec.xl))) xLabel(L, SEC[old.name].xl, oa); DRAW[old.name](L, END, false, oa); }
        else old = null;
      }
      if (cur && u > -0.001) DRAW[cur.name](L, Math.max(0, u), cur.m, 1);
    }

    return {
      canvas: cv,
      get shown() { return cur && hideAt < 0 ? cur.name : null; },
      /* where the chapter's pin is: { top (on the screen), h (its height), capBottom (its title's foot, from its top),
         bottom (the foot of its free band, from its top), alpha (how much of its picture shows) }; null: no chart chapter */
      place: function (f) { F = f; },
      draw: draw,
      /* build section `name` (`at` s from now), or fade the chart out (null) */
      go: function (name, o) {
        o = o || {};
        var t = now(), at = o.at || 0;
        if (!name) { if (cur && hideAt < 0) hideAt = t; return; }
        var showing = cur && hideAt < 0 && t - cur.t0 > 0.2 ? cur.name : null;
        if (showing === name) return;
        if (o.instant) { cur = { name: name, t0: t - END, m: false }; old = null; hideAt = -1; axesFrom = t - END; return; }
        var m = !!showing && CHAIN[name] === showing;
        if (!showing || hideAt >= 0) { axesFrom = t + at; old = null; }
        else if (!m) old = { name: showing, out: t };
        hideAt = -1;
        cur = { name: name, t0: t + (m ? 0 : at), m: m, from: m ? showing : null };
      }
    };
  }

  window.LalaCharts = { create: create, DATA: DATA };
})();
