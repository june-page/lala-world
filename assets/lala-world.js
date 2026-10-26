/* LaLa-World project page — the glass stack (from the LaLa 3D film, claude-3d-model_v14/assets/lala-world.js).
   Classic script (dynamic import of three.js) so the page also works from file://. Nothing runs until the page calls
   LalaFilm.boot(options); it resolves to the API page.js drives while the visitor scrolls (see the end of main()).

   The model, bottom → top:
     observations         up to three context frames on frosted plates straight under the stack, the oldest on top. Each
                          step the window moves up: the oldest frame rises into the encoder and fades, the others move up
                          a slot, the new frame arrives at the bottom
     vision encoder       glass plates with warm edges, red / orange tokens rise inside
     predictor            the pretrained language model: plates with cool edges, blue / violet tokens rise inside
     future observation   a dark plate above the stack: the predicted latent as a 32×32 patch mosaic
   The language condition sits beside the stack: one card per transition, stacked like the observations, and a cable
   into the predictor. A new domain dissolves in place: the three observations, their cards and the future observation
   change without moving, then the window moves on as before. LaLa-Policy keeps one current observation and adds a small
   action generator (green / teal) next to the future observation, fed by the predictor; its actions drive a simulator
   screen while the future plate shows the decoded imagination.

   Backgrounds: a = the LaLa-World poster, b = white with the faintest violet (the poster as a blurred veil),
   c = the night of the talk's section slides.

   The opening, under the title "LaLa-World & LaLa-Policy" while the camera closes in slowly: LaLa-World builds up in
   the middle and the data of "Learns from video, too." comes in around it, its traces orange / violet into the model;
   then LaLa-Policy's action generator buds off beside the future observation (no simulator yet) and the robot
   demonstrations it learns from (LIBERO, RoboCasa: assets/robot.js) come in to the right of the two rows of video, their
   traces green / teal into the generator. As the visitor scrolls on toward LaLa-World, the poster comes out of b behind
   the page and goes back into it (passLook: the film's move from 0 to 1).

   The results (assets/lala-charts.js) are four chart chapters, P1–P3 after "Video, too" and P4 after LaLa-Policy: the
   camera looks up past the stage (an empty studio) and the chart stands in the chapter. LaLa-Policy keeps the night sky,
   c: Evolve, LaLa-Policy and P4 (its chart in night colours).

   Shots = the page's chapters: Start · LaLa-World · Latent future · Actions in words · No domain-specific models ·
   Every domain · Video, too · P1 · P2 · P3 · Evolve · LaLa-Policy · P4, and End (LaLa-Policy bows out under the closing
   credits; the film's own end is not on the page). The motions keep the film's v14 pace: the opening (the model builds
   1.8× faster than in v13), the merge, Evolve (the ring, then LaLa-Policy) and the charts (TEMPO in lala-charts.js). */
(function () {
  'use strict';
  var booted = null;
  window.LalaFilm = {
    /* opts: { host, labelHost, view(shot, i), onInteract(), onFirstFrames(), onFrame(dt), fitCap } */
    boot: function (opts) {
      if (!booted) booted = Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'), import('three/addons/postprocessing/ShaderPass.js')]).then(function (m) {
        return main(m[0], { OrbitControls: m[1].OrbitControls, EffectComposer: m[2].EffectComposer, RenderPass: m[3].RenderPass,
          UnrealBloomPass: m[4].UnrealBloomPass, OutputPass: m[5].OutputPass, ShaderPass: m[6].ShaderPass }, opts || {});
      });
      return booted;
    }
  };

  async function main(THREE, L, opts) {
    var MEDIA = window.LALA_MEDIA;

    /* the backgrounds (stage.bg). a is framed as on a 16:9 screen at 1/1.3 of a cover fit (the people about a fifth of the
       screen height), running on past its sides, and lighter toward the top so the caption stays on a light ground. It comes
       out of b and goes back into it by its lift and blur (a dark picture faded against white would turn grey on the way) */
    var POSTER = { zoom: 1 / 1.3, panU: 0.5, panV: 0.04, cropL: 0.1, sides: 1, bandLo: 0.5, bandHi: 0.95 };
    var LOOK = {
      paper: { night: 0, glow: 0, veil: 1, amt: 0, lift: 0.84, bright: 0, blur: 1, sat: 1.3, cool: 0, band: 0, top: 0 },   // b (and a, after its pass, back into b)
      sky: { night: 1, glow: 1, veil: 0, amt: 0, top: 0 },                                                                  // c
      inVeil: Object.assign({ amt: 1, lift: 0.84, bright: 0, blur: 1, sat: 1.3, cool: 0, band: 0 }, POSTER),                 // a as faint and soft as b: where it starts and ends
      pass: { lift: 0.06, bright: 0.5, blur: 0.06, sat: 1.05, cool: 0, band: 1 },                                           // at its clearest (halfway through its pass)
      chart: { night: 0, glow: 0, veil: 0.45, amt: 0, top: 0 }                                                              // b, fainter: nothing of the poster behind a chart
    };
    /* a's pass (the film's move from 0 to 1): it comes out of b, clearest halfway, drifting across, and goes back into b.
       The page runs it with the scroll, between the opening and LaLa-World: passLook(u), u from 0 to 1 */
    var PASS = Object.assign({}, LOOK.paper, LOOK.inVeil);
    function passLook(u) {
      var c = smooth(0.08, 0.46, u) * (1 - smooth(0.6, 0.97, u));   // how clear it is
      PASS.amt = smooth(0, 0.1, u) * (1 - smooth(0.95, 1, u));   // a and b look alike at both ends
      ['lift', 'bright', 'blur', 'sat', 'band'].forEach(function (key) { PASS[key] = lerp(LOOK.inVeil[key], LOOK.pass[key], c); });
      var mid = Math.sin(Math.PI * c); PASS.bright += 1.1 * mid; PASS.sat += 0.35 * mid; PASS.cool = mid;   // half-clear: lighter shadows, more colour, no grey
      PASS.panU = lerp(0.42, 0.58, ease.inOutSine(u));
      return PASS;
    }

    /* ---------------------------------------------------------------- shots (the captions live in the page's markup)
       yaw: degrees the camera turns about the model while the visitor scrolls through the chapter (the film's drift)
       box: what a narrow screen must show of the shot (world space, [x0, y0, z0, x1, y1, z1]); the page fits it with the lens
       limit: [azimuth, polar] radians either side of the shot's view a drag may turn it ([0, 0]: not at all) */
    /* the opening (see the top). The camera closes in from `from` to the shot's view while the model builds up.
       rot: the arc of the data turned about the model (degrees, counted like the cards' angles: < 0 to the left);
       build: the model's build-up (1.8× v13's 1.4 s); wait: when the model's screens start;
       at / run: when the data, the action generator and the robot demonstrations begin to come in, and for how long (s).
       cards: the robot demonstrations (assets/robot.js, by key) where each stands on the arc (angle from straight behind
       the model, clockwise seen from above; radius; the height of its foot; width), facing the model like the others:
       to the right of the two rows of video, LIBERO with the upper row, RoboCasa with the lower.
       box: the whole arc, for the opening screen's band; compact: a narrow screen's (the model and the cards nearest it) */
    var OPEN = {
      view: { pos: [-1.25, 6.46, 8.93], target: [0.58, 2.2, -4.16], fov: 38 }, from: { pos: [-0.6, 7.2, 11.6], target: [0.3, 2.3, -4.2], fov: 38 },
      rot: -10, build: 0.78, wait: 0.75, at: { data: 0.9, gen: 2.0, robot: 2.3 }, run: { data: 1.6, gen: 0.9, robot: 1.1 }, dur: 4.2,
      cards: [{ ep: 'libero-moka', angle: 50, radius: 7.55, y: 2.55, width: 1.95 }, { ep: 'libero-soup', angle: 68, radius: 7.55, y: 2.55, width: 1.95 },
        { ep: 'robocasa-mug', angle: 54, radius: 6.25, y: 0.95, width: 1.9 }, { ep: 'robocasa-door', angle: 74, radius: 6.25, y: 0.95, width: 1.9 }],
      box: [-6.9, 0, -7.6, 8.0, 4.1, 0.95], compact: [-3.3, 0, -4.8, 4.4, 3.4, 0.95] };
    var OPEN_AT = OPEN.at;
    var SKY = { pos: [0, 6.6, 8.6], target: [0, 12.8, -6], fov: 34 };   // the charts: looking up past the stage, an empty studio
    function chartDef(name, label, first) {   // the first chart of a run builds `chartAt` s in; the next ones turn out of it
      var night = name === 'p4';   // LaLa-Policy's chart stays on the night sky
      return { key: name, label: label, bg: night ? 'night' : 'studio', look: night ? LOOK.sky : LOOK.chart, pos: SKY.pos, target: SKY.target, fov: SKY.fov,
        chartAt: first ? 0.6 : 0, yaw: 0, limit: [0, 0], apply: function (ctx) { return chartShot(name, ctx); } };
    }
    var SHOTS = [
      { key: 'start', box: OPEN.box, label: 'Start', bg: 'studio', look: LOOK.paper, pos: OPEN.view.pos, target: OPEN.view.target, fov: OPEN.view.fov, yaw: 0, limit: [0.55, 0.28],
        apply: function (c) { return openWall(c); } },
      { key: 'world', box: [-3.55, 0, -0.9, 0.95, 2.9, 0.9], label: 'LaLa-World', bg: 'studio', look: LOOK.paper, pos: [-0.7, 5.0, 10.6], target: [-0.6, 1.55, 0], fov: 26, yaw: 12,
        apply: function (c) { return heroShot(c); } },
      { key: 'latent', box: [-3.6, -0.05, -0.9, 3.4, 3.5, 0.9], label: 'Latent future', bg: 'studio', look: LOOK.paper, bgDur: 1.5, pos: [5.4, 7.3, 9.6], target: [-0.55, 2.15, 0], fov: 31, yaw: -12,
        apply: function (c) { return setScene('latent', c); } },
      { key: 'words', box: [-5.9, -0.05, -0.6, 0.95, 2.95, 0.9], label: 'Actions in words', bg: 'studio', look: LOOK.paper, pos: [-1.75, 3.1, 8.9], target: [-1.95, 1.3, 0], fov: 33, yaw: 5,
        apply: function (c) { return wordsShot(c); } },
      { key: 'legacy', box: [-3.1, 0, -1.9, 3.1, 2.1, 1.6], label: 'Domain-specific', bg: 'studio', look: LOOK.paper, pos: [0, 5.6, 9.6], target: [0, 0.62, 0], fov: 34, yaw: 0,
        apply: function (c) { return mergeLegacy(c); } },
      { key: 'data1', box: [-3.0, 0, -4.8, 3.0, 3.0, 1.0], label: 'Every domain', bg: 'studio', look: LOOK.paper, pos: [0, 6.3, 7.7], target: [0, 0.95, -2.0], fov: 38, yaw: 8,
        apply: function (c) { return setScene('data1', c); } },
      { key: 'data2', box: [-3.6, 0, -7.6, 3.6, 4.5, 1.0], label: 'Video, too', bg: 'studio', look: LOOK.paper, pos: [0, 6.2, 7.0], target: [0, 2.5, -4.6], fov: 38, yaw: -8,
        apply: function (c) { return setScene('data2', c); } },
      chartDef('p1', 'vs. world models', true), chartDef('p2', 'Planning time'), chartDef('p3', 'Training cost'),
      { key: 'evolve', box: [-3.6, 0, -1.7, 3.9, 3.1, 1.7], label: 'Evolve', bg: 'night', look: LOOK.sky, pos: [0, 6.9, 9.4], target: [0, 1.9, -3.2], fov: 40, yaw: 0,
        apply: function (c) { return evolve(c); } },
      { key: 'policy', box: [-3.5, 0, -0.9, 3.9, 3.05, 0.9], label: 'LaLa-Policy', bg: 'night', look: LOOK.sky, pos: [0.45, 5.3, 10.8], target: [0.42, 1.5, 0], fov: 31, yaw: -8,
        apply: function (c) { return setScene('policy', c); } },
      chartDef('p4', 'vs. other policies', true),
      { key: 'end', box: [-3.5, 0, -0.9, 3.9, 3.05, 0.9], label: 'End', bg: 'night', look: LOOK.sky, pos: [0.45, 5.8, 12.2], target: [0.42, 1.5, 0], fov: 31, yaw: 0,
        apply: function (c) { return endShot(c); } }
    ];

    var stage = LalaStage.create({ THREE: THREE, OrbitControls: L.OrbitControls, EffectComposer: L.EffectComposer, RenderPass: L.RenderPass,
      UnrealBloomPass: L.UnrealBloomPass, OutputPass: L.OutputPass, ShaderPass: L.ShaderPass }, {
      host: opts.host, labelHost: opts.labelHost, shots: SHOTS, bg: 'studio', fitCap: opts.fitCap, pageBg: true,
      camera: { pos: OPEN.from.pos, target: OPEN.from.target, fov: OPEN.from.fov },
      view: opts.view, onInteract: opts.onInteract, onFirstFrames: opts.onFirstFrames,
      onFrame: function (dt) { if (opts.onFrame) opts.onFrame(dt); if (charts) charts.draw(); }   // a chart goes with its pin in the same frame
    });
    var scene = stage.scene, anim = stage.anim, ease = stage.ease, COL = stage.colors, tex = stage.tex;
    var smooth = stage.smooth, clamp01 = stage.clamp01, lerp = stage.lerp, hash = stage.hash;
    await stage.fontsReady;   // canvas textures below need the fonts
    var charts = LalaCharts.create(stage, { host: opts.labelHost });

    /* ---------------------------------------------------------------- images */
    var img = {};
    function load(key, src) { return stage.loadImage(src).then(function (im) { img[key] = im; }); }
    var DOMAINS = MEDIA.domains, WVID = MEDIA.worldVideo;
    var jobs = [load('poster', MEDIA.poster.src), load('posterBlur', MEDIA.poster.blur), load('nightSky', MEDIA.nightSky)];
    DOMAINS.concat([WVID]).forEach(function (d) { d.frames.forEach(function (f, i) { jobs.push(load(d.key + ':' + i, f)); }); });
    MEDIA.omniedit.forEach(function (s) { jobs.push(load('oe:' + s.key + ':cur', s.cur), load('oe:' + s.key + ':fut', s.fut)); });
    MEDIA.policy.forEach(function (p) { jobs.push(load('sim:' + p.key, p.sim.src), load('imag:' + p.key, p.imag.src)); });   // OpenVid, robots: addVideo(), addRobots()
    MEDIA.rows.forEach(function (r) { jobs.push(load('row:' + r.key, r.thumb)); });
    await Promise.all(jobs);
    stage.bg.setPoster(img.poster, img.posterBlur);
    stage.bg.setNightSky(img.nightSky);

    /* ---------------------------------------------------------------- scene state (the models keep their own) */
    var T = { data: 0, rows: 0, robot: 0 };                                              // targets
    var V = { data: 0, rows: 0, robot: 0, morph: 0, wires: 0, legacy: 0, legacyIn: 1, merge: 1, train: 0, ringO: 1 };     // animated (train: the ring's progress)
    var labelGroup = '', labelTok = 0;

    /* ---------------------------------------------------------------- materials */
    function glassMat(color, opacity, fres, o) {
      var m = new THREE.MeshPhysicalMaterial(Object.assign({ color: color, transparent: true, opacity: opacity, roughness: 0.05, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.3, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 420],
        depthWrite: false, envMapIntensity: 1.3 }, o || {}));
      m.userData.fres = { value: fres };
      m.onBeforeCompile = function (sh) {   // Fresnel: glass reads at grazing angles, every layer stays visible
        sh.uniforms.uFres = m.userData.fres;
        sh.fragmentShader = 'uniform float uFres;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
          '#include <opaque_fragment>\n float lalaFres = pow(1.0 - saturate(abs(dot(normalize(vViewPosition), normal))), 2.2);\n' +
          ' gl_FragColor.a = saturate(gl_FragColor.a + lalaFres * uFres);');
      };
      return m;
    }
    var MAT = {
      frost: new THREE.MeshPhysicalMaterial({ color: '#f3f5fb', metalness: 0, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.2,
        sheen: 0.5, sheenColor: '#e6ebff', sheenRoughness: 0.5, emissive: '#d9e2ff', emissiveIntensity: 0.18 }),
      plateVE: glassMat('#fff3ee', 0.06, 0.5),
      plateLM: glassMat('#f1f2ff', 0.06, 0.5),
      plateAct: glassMat('#e6fff8', 0.11, 0.8, { iridescence: 0.25 }),
      cap: new THREE.MeshPhysicalMaterial({ color: '#16141f', metalness: 0.25, roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.04 }),
      legacyPlate: glassMat('#c8c8d0', 0.22, 0.7, { iridescence: 0 }),
      legacyCap: new THREE.MeshPhysicalMaterial({ color: '#3a3a42', metalness: 0.3, roughness: 0.3, clearcoat: 0.6 }),
      bezel: new THREE.MeshPhysicalMaterial({ color: '#f4f4f7', metalness: 0.1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 })
    };
    var PAL = {
      ve: ['#FF3A2A', '#FF7A1A', '#FFB240'],
      lm: ['#3D6BFF', '#6C5CFF', '#A85BFF'],
      fut: ['#7D8BFF', '#B48CFF', '#E4D8FF'],
      act: ['#0FB89A', '#2ED3C6', '#7BE495'],
      robot: ['#16B364', '#12A6C4'],                // the robot demonstrations' traces into the generator: green, teal
      legacy: ['#9a9aa3', '#c4c4cc', '#8a8a93']
    };

    /* ---------------------------------------------------------------- helpers */
    var glowFrame = stage.fx.glowFrame, slab = stage.geo.slab;
    function mesh(geo, mat, parent, y) { var m = new THREE.Mesh(geo, mat); m.position.y = y || 0; parent.add(m); return m; }
    function roundedPlane(w, d, r) {   // flat picture plane in XZ with 0..1 UVs (image top at the back)
      var geo = new THREE.ShapeGeometry(stage.geo.roundedRectShape(w, d, r), 16);
      var p = geo.attributes.position, uv = geo.attributes.uv;
      for (var i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / d + 0.5);
      geo.rotateX(-Math.PI / 2); return geo;
    }
    function basic(texture, o) {
      return new THREE.MeshBasicMaterial(Object.assign({ map: texture, transparent: true, toneMapped: false, depthWrite: false }, o || {}));
    }
    /* a frame of a sprite atlas: [sx, sy, sw, sh] in pixels */
    function atlasRect(a, f) { f = Math.max(0, Math.min(a.n - 1, f)); return [(f % a.cols) * a.fw, Math.floor(f / a.cols) * a.fh, a.fw, a.fh]; }
    function printTexture(image, src, canvas) {   // the observation as the encoder sees it: a patch grid (half as strong as v3's)
      var S = 768, c = canvas || tex.canvas(S, S), g = c.getContext('2d');
      g.clearRect(0, 0, S, S);
      g.imageSmoothingQuality = 'high';
      tex.cover(g, image, 0, 0, S, S, 0, src);
      g.strokeStyle = 'rgba(255,255,255,.17)'; g.lineWidth = 1.4;
      for (var i = 1; i < 16; i++) { var p = S * i / 16; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
      var vg = g.createRadialGradient(S / 2, S / 2, S * 0.32, S / 2, S / 2, S * 0.76);
      vg.addColorStop(0, 'rgba(232,238,255,0)'); vg.addColorStop(1, 'rgba(232,238,255,.15)');
      g.fillStyle = vg; g.fillRect(0, 0, S, S);
      return c;
    }
    var patchCache = {};
    function patchColors(key, image, src) {   // the 32×32 mosaic of one picture, computed once
      if (!patchCache[key]) patchCache[key] = stage.patches(image, N, src).colors;
      return patchCache[key];
    }

    /* Shader cable: a glass tube along a quadratic Bézier A → B → C with light pulses flowing toward C.
       The curve lives in uniforms, so its ends can move every frame without rebuilding geometry. */
    var cables = [];
    function cable(o) {
      var segs = 72, rad = 10, aT = [], aA = [], pos = [], idx = [];
      for (var i = 0; i <= segs; i++) for (var j = 0; j <= rad; j++) { aT.push(i / segs); aA.push(j / rad * Math.PI * 2); pos.push(0, 0, 0); }
      for (i = 0; i < segs; i++) for (j = 0; j < rad; j++) {
        var a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1)); geo.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 1));
      geo.setIndex(idx);
      var mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uC: { value: new THREE.Vector3() },
          uR: { value: o.radius || 0.014 }, uTime: { value: 0 }, uO: { value: 0 }, uSpeed: { value: o.speed || 0.9 }, uCount: { value: o.count || 3 },
          uC1: { value: new THREE.Color(o.colors[0]) }, uC2: { value: new THREE.Color(o.colors[1]) }, uGlass: { value: new THREE.Color(o.glass || '#c9c6dc') },
          uBoost: { value: 1 }, uGrow: { value: 1 } },
        vertexShader: [
          'attribute float aT; attribute float aA; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uR; uniform float uGrow;',
          'varying float vT; varying vec3 vN; varying vec3 vV;',
          'void main(){ float t = aT * uGrow; float s = 1.0 - t;',
          '  vec3 p = s * s * uA + 2.0 * s * t * uB + t * t * uC;',
          '  vec3 T = normalize(2.0 * s * (uB - uA) + 2.0 * t * (uC - uB) + 1e-5);',
          '  vec3 up = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);',
          '  vec3 N = normalize(cross(T, up)); vec3 B = cross(T, N);',
          '  vec3 n = cos(aA) * N + sin(aA) * B;',
          '  vec4 w = modelMatrix * vec4(p + n * uR, 1.0);',
          '  vT = t; vN = normalize(mat3(modelMatrix) * n); vV = cameraPosition - w.xyz;',
          '  gl_Position = projectionMatrix * viewMatrix * w; }'].join('\n'),
        fragmentShader: [
          'uniform float uTime; uniform float uO; uniform float uSpeed; uniform float uCount; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uGlass;',
          'uniform float uBoost; varying float vT; varying vec3 vN; varying vec3 vV;',
          'void main(){ float f = pow(1.0 - abs(dot(normalize(vV), normalize(vN))), 1.6);',
          '  float ph = fract(vT * uCount - uTime * uSpeed); float pulse = smoothstep(0.0, 0.07, ph) * (1.0 - smoothstep(0.07, 0.34, ph));',
          '  vec3 c = mix(uC1, uC2, vT);',
          '  vec3 col = mix(uGlass, c, 0.55 + 0.45 * pulse) * (1.0 + 2.2 * pulse * uBoost);',
          '  float a = uO * clamp(0.22 + 0.55 * f + 0.85 * pulse, 0.0, 1.0);',
          '  gl_FragColor = vec4(col, a); }'].join('\n')
      });
      var m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 4;
      m.set = function (A, B, C) { mat.uniforms.uA.value.copy(A); mat.uniforms.uB.value.copy(B); mat.uniforms.uC.value.copy(C); };
      cables.push(m);
      return m;
    }
    function atlasMaterial(texture) {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { map: { value: texture }, uFrame: { value: new THREE.Vector4(0, 0, 1, 1) }, uO: { value: 1 }, uSize: { value: new THREE.Vector2(1, 1) }, uR: { value: 0.05 }, uDim: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D map; uniform vec4 uFrame; uniform float uO; uniform vec2 uSize; uniform float uR; uniform float uDim; varying vec2 vUv;' +
          'void main(){ vec4 c = texture2D(map, uFrame.xy + vUv * uFrame.zw);' +
          ' vec2 q = abs((vUv - 0.5) * uSize) - (uSize * 0.5 - uR); float d = length(max(q, 0.0)) - uR;' +
          ' float a = 1.0 - smoothstep(-0.004, 0.002, d); gl_FragColor = vec4(c.rgb * uDim, a * uO); }'
      });
    }
    var SMALL = Math.min(stage.size.w, stage.size.h) < 700 || matchMedia('(pointer: coarse)').matches;
    function atlasImage(image) {   // phones get the sprite atlases at half size: their screens are a few dozen pixels wide there
      if (!SMALL) return image;
      var c = tex.canvas(Math.round(image.width / 2), Math.round(image.height / 2)), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.drawImage(image, 0, 0, c.width, c.height);
      return c;
    }
    function atlasOf(a, image, orig) {   // the frame layout of `image`, an atlas drawn at another size than `orig`
      var k = image.width / orig.width;
      return k === 1 ? a : { cols: a.cols, rows: a.rows, n: a.n, fw: a.fw * k, fh: a.fh * k };
    }
    function atlasTexture(image) {
      var t = new THREE.Texture(image); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
    }
    function setFrame(mat, atlas, image, f) {   // half-texel inset so neighbouring frames never bleed in
      var r = atlasRect(atlas, f), W = image.width, H = image.height;
      mat.uniforms.uFrame.value.set((r[0] + 0.5) / W, 1 - (r[1] + r[3] - 0.5) / H, (r[2] - 1) / W, (r[3] - 1) / H);
    }

    /* the language condition: one card per transition (white in the studio, dark glass at night) */
    var CARD_K = 0.0023;   // world units per canvas pixel: the sentence is set 1.5× larger than V1's pill, never cut
    function cardCanvas(label, text, night) {
      var W = 940, pad = 52, px = 58, lh = 72, g0 = tex.canvas(8, 8).getContext('2d');
      g0.font = tex.font(560, px);
      var lines = tex.wrap(g0, text, W - pad * 2);
      var H = pad + 34 + 26 + lines.length * lh + pad - 14;
      var c = tex.canvas(W, H), g = c.getContext('2d');
      tex.rrect(g, 2, 2, W - 4, H - 4, 40); g.fillStyle = night ? '#18123E' : '#ffffff'; g.fill();   // opaque: blending is linear, any leak of the card behind shows
      g.lineWidth = 2; g.strokeStyle = night ? 'rgba(205,195,255,.3)' : 'rgba(40,30,110,.12)'; g.stroke();
      var gr = g.createLinearGradient(pad, 0, pad + 22, 0); gr.addColorStop(0, PAL.lm[0]); gr.addColorStop(1, PAL.lm[2]);
      g.fillStyle = gr; g.beginPath(); g.arc(pad + 9, pad + 15, 9, 0, Math.PI * 2); g.fill();
      g.font = tex.font(650, 27); g.fillStyle = night ? '#aaa3d8' : '#8a86a3'; g.textBaseline = 'middle';
      stage.fx.spacedText(g, label.toUpperCase(), pad + 32, pad + 16, 3.2, 'left');
      g.font = tex.font(560, px); g.fillStyle = night ? '#EEEAFF' : COL.lang; g.textBaseline = 'alphabetic';
      lines.forEach(function (ln, i) { g.fillText(ln, pad, pad + 34 + 26 + (i + 1) * lh - 18); });
      return c;
    }

    /* ---------------------------------------------------------------- the model: dimensions and timing */
    var PL = 1.7, PL_T = 0.028, OBS = 1.84, OBS_T = 0.032, CAP_T = 0.05;
    var NVE = 4, NLM = 8, P_VE = 0.09, P_LM = 0.1145, GAP_MID = 0.12;     // the predictor is two thirds of v3's (8 plates, not 12)
    var Y_OBS0 = 0.14, P_OBS = 0.18;                                       // the lowest observation slot; slot pitch
    var GAP_OBS = 0.33, FUT_GAP = 0.324;                                   // top observation → encoder: 1.5× v3; predictor → future: 1.2× v3
    var OBS_TOP = Y_OBS0 + 2 * P_OBS, Y_VE0 = OBS_TOP + GAP_OBS, Y_LM0 = Y_VE0 + (NVE - 1) * P_VE + GAP_MID;   // the resting layout
    var N = 32, TILE = 1.5 / N, GROW_Y = 1.25;                              // GROW_Y: the stack's middle, where a pop scales from
    var STEP_AT = [1.35, 2.35, 3.35], DOMAIN_LEN = 4.5;                    // a domain: three context frames arrive, then three steps
    var ACT_T0 = 0.06, ACT_FLY = 0.3, SIM_T0 = 0.25, SIM_FPS = 60, CHUNK_REST = 0.16, SAMPLE_REST = 0.45;   // LaLa-Policy: twice v3's pace
    var GEN_X = 1.62, GEN_S = 0.8, GEN_N = 4, ACT = 16, SIM_S = 1.42, GEN_Y = Y_LM0 + (NLM - 1) * P_LM + 0.1;   // GEN_Y: its lowest plate, at rest
    var POL = MEDIA.policy;
    var simTex = {}, simImg = {}, simAtlas = {};
    POL.forEach(function (p) {
      var o = img['sim:' + p.key]; simImg[p.key] = atlasImage(o); simAtlas[p.key] = atlasOf(p.sim, simImg[p.key], o); simTex[p.key] = atlasTexture(simImg[p.key]);
    });
    var imagCache = {};
    function imagColors(p, k) {
      var key = p.key + ':' + k;
      if (!imagCache[key]) imagCache[key] = stage.patches(img['imag:' + p.key], N, atlasRect(p.imag, k)).colors;
      return imagCache[key];
    }

    var byKey = {}; DOMAINS.forEach(function (d) { byKey[d.key] = d; }); byKey[WVID.key] = WVID;
    var WORLD_SEQ = ['pusht', 'metaworld', 'droid', 'granular', 'wall', 'rope', 'pointmaze', 'openvid'].map(function (k) { return byKey[k]; });
    var HERO_DOMAIN = 1;   // LaLa-World's chapter starts on Meta-World

    /* shared geometry / materials of the model parts */
    var tokenCapsule = new THREE.CapsuleGeometry(0.014, 0.028, 4, 10);   // two thirds of V1's token
    var tileGeo = new THREE.BoxGeometry(TILE * 0.88, 0.011, TILE * 0.88), tileMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    var actGeo = new THREE.CapsuleGeometry(0.02, 0.03, 4, 12);
    var actMat = new THREE.MeshPhysicalMaterial({ color: COL.act, emissive: COL.actGlow, emissiveIntensity: 1.0, roughness: 0.25, metalness: 0.1, clearcoat: 1 });
    var bezelGeo = new THREE.ExtrudeGeometry(stage.geo.roundedRectShape(SIM_S + 0.16, SIM_S + 0.42, 0.12),
      { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 12 });
    var rippleMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uBoost: { value: 1 } },
      vertexShader: 'attribute float aProg; attribute float aAlpha; attribute vec3 aColor; varying float vProg; varying float vAlpha; varying vec3 vColor; varying vec2 vUv;' +
        'void main(){ vProg = aProg; vAlpha = aAlpha; vColor = aColor; vUv = uv; vec4 p = vec4(position, 1.0);\n#ifdef USE_INSTANCING\n p = instanceMatrix * p;\n#endif\n' +
        ' gl_Position = projectionMatrix * modelViewMatrix * p; }',
      fragmentShader: 'uniform float uBoost; varying float vProg; varying float vAlpha; varying vec3 vColor; varying vec2 vUv;' +
        'void main(){ float r = length(vUv - 0.5) * 2.0; float rad = 0.12 + vProg * 0.88;' +
        ' float ring = exp(-pow((r - rad) * 8.0, 2.0)) + 0.5 * exp(-pow(r * 4.0, 2.0)) * (1.0 - vProg);' +
        ' float a = ring * (1.0 - vProg) * vAlpha; if (a < 0.004) discard; gl_FragColor = vec4(vColor * uBoost, a); }'
    });
    // training ring on the floor (fine-tuning progress in Evolve)
    var ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uP: { value: 0 }, uO: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uP; uniform float uO; varying vec2 vP;' +
        'void main(){ float a = atan(vP.x, vP.y) / 6.2831853; a = a < 0.0 ? a + 1.0 : a;' +
        ' vec3 c1 = vec3(0.06, 0.72, 0.6), c2 = vec3(0.18, 0.83, 0.78), c3 = vec3(0.48, 0.9, 0.58);' +
        ' vec3 col = a < 0.5 ? mix(c1, c2, a * 2.0) : mix(c2, c3, (a - 0.5) * 2.0);' +
        ' float on = step(a, uP); float head = smoothstep(0.03, 0.0, abs(a - uP)) * step(0.001, uP);' +
        ' gl_FragColor = vec4(mix(vec3(0.33, 0.32, 0.38), col * 2.2, on) + head * 3.0, uO * (0.25 + 0.75 * on)); }'
    });
    function tokenMat(color, glow) {
      return new THREE.MeshPhysicalMaterial({ color: color, emissive: glow, emissiveIntensity: 0.4, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
    }

    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    var A = new THREE.Vector3(), B = new THREE.Vector3(), Cv = new THREE.Vector3(), colA = new THREE.Color();
    var camR = new THREE.Vector3(), camU = new THREE.Vector3(), camF = new THREE.Vector3();
    var ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

    /* ================================================================ the model. V.gen: the action generator alone, without
       LaLa-Policy's simulator and players (the opening) */
    var models = [];
    function makeModel(opt) {
      var M = { id: models.length, opt: opt, active: true, pop: 1, grow: 1, anchors: {}, L: {},
        T: { explode: 0, card: 1, policy: 0 }, V: { explode: 0, card: 1, policy: 0, reveal: 1, gen: 0 } };
      var root = new THREE.Group(); scene.add(root);      // placed by the shots
      var world = new THREE.Group(); root.add(world);     // the stack (scaled while it pops in after the merge)
      M.root = root; M.world = world;
      var i;

      /* ---- observations: four plates for three slots (+ one entering or leaving), straight under the encoder;
         slot 0 = the oldest frame, at the top */
      var obs = [], obsQ = [], obsPending = [], obsAnim = { u: 1, dur: 1 }, printGeo = roundedPlane(OBS - 0.12, OBS - 0.12, 0.09);
      for (i = 0; i < 4; i++) {
        var og = new THREE.Group(); world.add(og); og.visible = false;
        var sm = MAT.frost.clone(); sm.transparent = true; sm.opacity = 0;
        mesh(slab(OBS, OBS, OBS_T, 0.14, 0.01), sm, og, 0).renderOrder = 1;
        var prints = [0, 1].map(function (k) {   // the print, and the next one dissolving in over it (a domain change)
          var c = tex.canvas(768, 768), t = tex.texture(c);
          var pm = new THREE.MeshPhysicalMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.22, roughness: 0.45, metalness: 0,
            clearcoat: 0.45, clearcoatRoughness: 0.14, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1 - k });
          mesh(printGeo, pm, og, OBS_T / 2 + 0.0015 * (1 + k)).renderOrder = 1 + k;
          return { mat: pm, canvas: c, tex: t };
        });
        prints[1].mat.visible = false;
        obs.push({ g: og, slab: sm, print: prints[0].mat, canvas: prints[0].canvas, tex: prints[0].tex,
          print2: prints[1].mat, canvas2: prints[1].canvas, tex2: prints[1].tex, fading: false, s0: 0, s1: 0, a0: 0, a1: 0 });
      }
      /* the window moves one frame, upward: frames past `keep` rise out of the top slot toward the encoder and fade, the
         others move up a slot, the new frame arrives from below in the next free slot (nothing ever moves down).
         o = { image, src, keep, dur } (no image: only trims to `keep`) */
      function startObs(o) {
        endFades();
        obs.forEach(function (p) { p.s0 = p.s1; p.a0 = p.a1; });
        var sp = -1;
        if (o.image) {
          sp = 0; while (obsQ.indexOf(sp) >= 0 || obs[sp].a0 > 0) sp++;
          printTexture(o.image, o.src, obs[sp].canvas); obs[sp].tex.needsUpdate = true;
          obsQ.push(sp);
        }
        while (obsQ.length > o.keep) { var gone = obs[obsQ.shift()]; gone.s1 = gone.s0 - 0.9; gone.a1 = 0; }
        obsQ.forEach(function (idx, s) { obs[idx].s1 = s; });
        if (obsQ.indexOf(sp) >= 0) { var p = obs[sp]; p.s0 = p.s1 + 0.6; p.a0 = 0; p.a1 = 1; }
        if (o.dur > 0) { obsAnim.u = 0; obsAnim.dur = o.dur; }
        else { obsAnim.u = 1; obs.forEach(function (p) { p.s0 = p.s1; p.a0 = p.a1; }); }
      }
      function pushObs(o) {
        if (o.dur > 0) { obsPending.push(o); return; }
        while (obsPending.length) startObs(Object.assign(obsPending.shift(), { dur: 0 }));
        startObs(o);
      }
      var shadow = stage.softShadow(OBS, OBS, { blur: 30, alpha: 0.32, radius: 0.12 }); shadow.position.y = 0.001; world.add(shadow);

      /* ---- vision encoder + predictor */
      function makePlates(n, mat, palette, phase) {
        var out = [];
        for (var k = 0; k < n; k++) {
          var p = mesh(slab(PL, PL, PL_T, 0.15, 0.008), mat, world, 0); p.renderOrder = 2;
          var edge = glowFrame(PL + 0.03, PL + 0.03, 0.022, palette, { radius: 0.165, innerRadius: 0.152, depth: PL_T * 0.8, transparent: true });
          edge.position.y = -PL_T * 0.4; edge.material.uniforms.uTime.value = (phase || 0) + k * 0.7; p.add(edge);
          out.push({ mesh: p, edge: edge, y: 0 });
        }
        return out;
      }
      var vePlates = makePlates(NVE, MAT.plateVE, PAL.ve, 0);
      var lmPlates = makePlates(NLM, MAT.plateLM, PAL.lm, 3);

      /* ---- future observation: dark plate, the predicted latent as a 32×32 patch mosaic */
      var futGroup = new THREE.Group(); world.add(futGroup);
      mesh(slab(PL, PL, CAP_T, 0.15, 0.012), MAT.cap, futGroup, 0);
      var futEdge = glowFrame(PL + 0.04, PL + 0.04, 0.026, PAL.fut, { radius: 0.17, innerRadius: 0.156, depth: CAP_T * 0.8 });
      futEdge.position.y = -CAP_T * 0.4; futGroup.add(futEdge);
      var tiles = new THREE.InstancedMesh(tileGeo, tileMat, N * N);
      tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * N * 3), 3); futGroup.add(tiles);
      var mosaic = { from: null, to: null, prog: 1, dur: 0.6, delay: 0, dim: false, fade: false };
      function currentColors() {
        var out = [], c = new THREE.Color();
        for (var k = 0; k < N * N; k++) { tiles.getColorAt(k, c); out.push(c.clone()); }
        return out;
      }
      function mosaicTo(to, o) {
        mosaic.from = o.from || (mosaic.to ? currentColors() : to); mosaic.to = to; mosaic.dim = !!o.dim; mosaic.fade = !!o.fade;
        mosaic.prog = o.instant ? 1 : 0; mosaic.delay = o.instant ? 0 : (o.delay || 0); mosaic.dur = o.dur || 0.6;
      }

      if (opt.ring) {
        var ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.555, 160), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; world.add(ring);
      }

      /* ---- tokens: spawn anywhere in the square, rise */
      var risers = [];
      function riser(parent, n, cols, o) {
        var sets = cols.map(function (c) {
          var mat = tokenMat(c[0], c[1]), im = new THREE.InstancedMesh(tokenCapsule, mat, n);
          im.frustumCulled = false; parent.add(im); return { im: im, mat: mat, glow: new THREE.Color(c[1]) };
        });
        var r = stage.rng(o.seed), lanes = [];
        for (var k = 0; k < n * cols.length; k++) lanes.push({ set: k % cols.length, idx: Math.floor(k / cols.length), ph: r(), sp: 0.85 + r() * 0.3, id: k + o.seed * 1000 });
        var R = { sets: sets, lanes: lanes, span: o.span, period: o.period };
        risers.push(R); return R;
      }
      var seed = M.id * 100;
      var tokVE = riser(world, 9, [[COL.ve, COL.veGlow], [COL.ve2, COL.ve2Glow]], { seed: 11 + seed, span: 1.36, period: 2.3 });
      var tokLM = riser(world, 12, [[COL.lm, COL.lmGlow], [COL.lm2, COL.lm2Glow]], { seed: 23 + seed, span: 1.36, period: 3.0 });

      /* ---- LaLa-Policy: the action generator (green / teal), beside the future observation */
      var gen = new THREE.Group(); root.add(gen);
      var genPlates = [];
      for (i = 0; i < GEN_N; i++) {
        var gp = mesh(slab(GEN_S, GEN_S, 0.026, 0.1, 0.007), MAT.plateAct, gen, 0); gp.renderOrder = 2;
        var ge = glowFrame(GEN_S + 0.03, GEN_S + 0.03, 0.02, PAL.act, { radius: 0.115, innerRadius: 0.103, depth: 0.02, transparent: true });
        ge.position.y = -0.01; ge.material.uniforms.uTime.value = i * 0.9; gp.add(ge); genPlates.push({ mesh: gp, edge: ge, y: 0 });
      }
      var tokAct = riser(gen, 4, [[COL.act, COL.actGlow], [COL.act2, COL.act2Glow]], { seed: 37 + seed, span: 0.58, period: 1.5 });

      // a ripple on the plate each token has just crossed
      var NRIP = 0; risers.forEach(function (R) { NRIP += R.lanes.length; });
      var rGeo = new THREE.PlaneGeometry(0.26, 0.26); rGeo.rotateX(-Math.PI / 2);
      var aProg = new Float32Array(NRIP), aAlpha = new Float32Array(NRIP), aColor = new Float32Array(NRIP * 3);
      rGeo.setAttribute('aProg', new THREE.InstancedBufferAttribute(aProg, 1));
      rGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(aAlpha, 1));
      rGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
      var ripples = new THREE.InstancedMesh(rGeo, rippleMat, NRIP); ripples.renderOrder = 3; ripples.frustumCulled = false; world.add(ripples);
      var rip = 0;
      function plateBelow(plates, y) { for (var p = plates.length - 1; p >= 0; p--) if (plates[p].y <= y) return p; return -1; }
      function runRiser(R, t, y0, y1, env0, plates, pitch, ox) {   // ox: where the riser's parent sits in the ripples' space
        R.sets.forEach(function (s) { s.mat.emissiveIntensity = lerp(0.4, 1.5, stage.night); });
        for (var k = 0; k < R.lanes.length; k++) {
          var Ln = R.lanes[k], s = Ln.ph + t / (R.period * Ln.sp), cyc = Math.floor(s), u = s - cyc;
          var x = (hash(Ln.id, cyc) - 0.5) * R.span, z = (hash(Ln.id + 7919, cyc) - 0.5) * R.span;
          var y = lerp(y0, y1, u), env = env0 * smooth(0, 0.1, u) * (1 - smooth(0.86, 1, u));
          var set = R.sets[Ln.set];
          if (env < 0.01) { set.im.setMatrixAt(Ln.idx, ZERO); aAlpha[rip++] = 0; continue; }
          m4.compose(v3.set(x, y, z), q.identity(), s3.set(env, env, env)); set.im.setMatrixAt(Ln.idx, m4);
          var pk = plateBelow(plates, y);
          if (pk >= 0 && y < plates[plates.length - 1].y + 0.02) {
            var pr = clamp01((y - plates[pk].y) / pitch);
            m4.makeTranslation(x + ox, plates[pk].y + PL_T / 2 + 0.002, z); ripples.setMatrixAt(rip, m4);
            aProg[rip] = pr; aAlpha[rip] = env * 0.7; set.glow.toArray(aColor, rip * 3);
          } else aAlpha[rip] = 0;
          rip++;
        }
        R.sets.forEach(function (s) { s.im.instanceMatrix.needsUpdate = true; });
      }

      /* ---- the language condition: a deck of cards (one per transition) beside the predictor, a cable into it */
      var deck = [], deckQ = [], deckPending = [], deckAnim = { u: 1, dur: 1 }, deckNight = false;
      var cardGeo = new THREE.PlaneGeometry(1, 1).translate(-0.5, 0, 0);   // origin = right edge, middle: the cable leaves there
      for (i = 0; i < 4; i++) {
        var faces = [0, 1].map(function () {   // the card, and its next text dissolving in over it (a domain change)
          var cm = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, opacity: 0 }));
          cm.visible = false; root.add(cm); return cm;
        });
        deck.push({ m: faces[0], m2: faces[1], s0: 0, s1: 0, a0: 0, a1: 0, w: 1, h: 1, w2: 1, h2: 1, label: '', text: '', fading: false });
      }
      function paintCard(C, next) {   // next: the face the card is dissolving to
        var m = next ? C.m2 : C.m, c = cardCanvas(next ? C.label2 : C.label, next ? C.text2 : C.text, deckNight);
        if (m.material.map) m.material.map.dispose();
        m.material.map = tex.texture(c); m.material.needsUpdate = true;
        if (next) { C.w2 = c.width * CARD_K; C.h2 = c.height * CARD_K; } else { C.w = c.width * CARD_K; C.h = c.height * CARD_K; }
      }
      function startCard(o) {   // same moves as the observations: the new card in front, the older ones step back
        endFades();
        deck.forEach(function (C) { C.s0 = C.s1; C.a0 = C.a1; });
        if (o.text) {
          var sp = 0; while (deckQ.indexOf(sp) >= 0 || deck[sp].a0 > 0) sp++;
          var C = deck[sp];
          C.label = o.label; C.text = o.text; paintCard(C);
          C.s0 = -0.5; C.a0 = 0; C.s1 = 0; C.a1 = 1;
          deckQ.unshift(sp);
          deckQ.forEach(function (idx, s) { if (idx !== sp) deck[idx].s1 = s; });
        }
        while (deckQ.length > o.keep) { var gone = deck[deckQ.pop()]; gone.s1 = gone.s0 + 0.7; gone.a1 = 0; }
        if (o.dur > 0) { deckAnim.u = 0; deckAnim.dur = o.dur; }
        else { deckAnim.u = 1; deck.forEach(function (C) { C.s0 = C.s1; C.a0 = C.a1; }); }
      }
      function pushCard(o) {
        if (o.dur > 0) { deckPending.push(o); return; }
        while (deckPending.length) startCard(Object.assign(deckPending.shift(), { dur: 0 }));
        startCard(o);
      }

      /* ---- a domain change in place: each print and card dissolves to the next domain's frame / action */
      var xfade = { u: 1, dur: 0.8 };
      function fadeObs(p, image) { printTexture(image, null, p.canvas2); p.tex2.needsUpdate = true; p.fading = true; }
      function fadeCard(C, label, text) { C.label2 = label; C.text2 = text; paintCard(C, true); C.fading = true; }
      function endFades() {   // the incoming faces become the faces
        obs.forEach(function (p) {
          if (!p.fading) return;
          var c = p.canvas, t = p.tex; p.canvas = p.canvas2; p.tex = p.tex2; p.canvas2 = c; p.tex2 = t;
          p.print.map = p.print.emissiveMap = p.tex; p.print2.map = p.print2.emissiveMap = p.tex2;
          p.print2.visible = p.fading = false;
        });
        deck.forEach(function (C) {
          if (!C.fading) return;
          var mt = C.m.material.map; C.m.material.map = C.m2.material.map; C.m2.material.map = mt;
          C.label = C.label2; C.text = C.text2; C.w = C.w2; C.h = C.h2;
          C.m2.visible = C.fading = false;
        });
        xfade.u = 1;
      }
      var cardAnchor = new THREE.Vector3();
      var langCable = cable({ colors: [PAL.lm[2], PAL.lm[0]], radius: 0.02, count: 2.2, speed: 0.75 }); root.add(langCable);
      var portMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.lm[1]).multiplyScalar(2.2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      var port = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), portMat); world.add(port);

      /* ---- LaLa-Policy: the bridge from the predictor, the actions, the simulator screen */
      var bridge = cable({ colors: [PAL.lm[1], PAL.act[1]], radius: 0.022, count: 1.6, speed: 0.9, glass: '#cfe9e4' }); root.add(bridge);
      var acts = new THREE.InstancedMesh(actGeo, actMat, ACT); acts.frustumCulled = false; root.add(acts);
      var actCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
      var SIM = new THREE.Vector3(3.0, 1.5, 0.35);
      var sim = new THREE.Group(); sim.position.copy(SIM); sim.rotation.y = -0.22; root.add(sim);
      var bezel = new THREE.Mesh(bezelGeo, MAT.bezel); bezel.position.set(0, 0.13, -0.05); sim.add(bezel);
      var simMat = atlasMaterial(simTex[POL[0].key]); simMat.uniforms.uSize.value.set(SIM_S, SIM_S); simMat.uniforms.uR.value = 0.06;
      var simScreen = new THREE.Mesh(new THREE.PlaneGeometry(SIM_S, SIM_S), simMat); simScreen.position.z = 0.03; simScreen.renderOrder = 5; sim.add(simScreen);
      var simTitleC = tex.canvas(640, 80), simTitle = new THREE.Mesh(new THREE.PlaneGeometry(SIM_S, SIM_S * 80 / 640), basic(tex.texture(simTitleC)));
      simTitle.position.set(0, SIM_S / 2 + 0.15, 0.03); simTitle.renderOrder = 5; sim.add(simTitle);
      function paintSimTitle(name) {
        var g = simTitleC.getContext('2d'); g.clearRect(0, 0, 640, 80);
        g.font = tex.font(650, 30); g.fillStyle = '#6e6a85'; g.textBaseline = 'middle';
        stage.fx.spacedText(g, 'SIMULATOR', 6, 40, 3.5, 'left');
        g.font = tex.font(560, 30); g.fillStyle = '#a3a0b8'; g.textAlign = 'right'; g.fillText(name, 634, 41); g.textAlign = 'left';
        simTitle.material.map.needsUpdate = true;
      }
      var simShadow = stage.softShadow(SIM_S + 0.2, 0.3, { blur: 24, alpha: 0.28, radius: 0.5 }); simShadow.position.set(SIM.x, 0.002, SIM.z + 0.1); root.add(simShadow);

      /* ---- label anchors */
      function anchor(name, parent) { var a = new THREE.Object3D(); parent.add(a); M.anchors[name] = a; return a; }
      anchor('obsMid', world); anchor('obsTop', world); anchor('ve', world); anchor('lm', world); anchor('acts', root);
      anchor('fut', futGroup).position.set(0.6, CAP_T / 2 + 0.01, -0.55);

      /* ---- the world player: per domain, three context frames (dissolved in place), then the window moves three times */
      var wp = { list: null, di: 0, k: 0, t: 0, wait: 0 };
      function domainLabel(d) { return d.name + (d.group === 'video' ? ' · caption' : ' · action'); }
      function frame(d, j) { return img[d.key + ':' + j]; }
      function enterDomain(instant, wait) {
        var d = wp.list[wp.di]; wp.k = 0; wp.t = 0; wp.wait = wait || 0;
        var to = patchColors(d.key + ':3', frame(d, 3));
        var settled = obsQ.length === 3 && deckQ.length === 3 && obsAnim.u >= 1 && deckAnim.u >= 1 && !obsPending.length && !deckPending.length;
        if (!instant && settled) {   // nothing moves: the three observations, their cards and the future dissolve
          endFades();
          obsQ.forEach(function (idx, s) { fadeObs(obs[idx], frame(d, s)); });                        // top = the oldest
          deckQ.forEach(function (idx, s) { fadeCard(deck[idx], domainLabel(d), d.steps[2 - s].text); });   // front = the newest
          xfade.u = 0;
          mosaicTo(to, { fade: true, dur: xfade.dur });
          return;
        }
        if (instant) { pushObs({ keep: 0, dur: 0 }); pushCard({ keep: 0, dur: 0 }); }
        for (var j = 0; j < 3; j++) {   // from LaLa-Policy's single observation: the window fills up
          pushObs({ image: frame(d, j), keep: 3, dur: instant ? 0 : 0.22 });
          pushCard({ label: domainLabel(d), text: d.steps[j].text, keep: 3, dur: instant ? 0 : 0.22 });
        }
        if (instant) mosaicTo(to, { from: patchColors(d.key + ':2', frame(d, 2)), dim: true, delay: (wait || 0) + 0.25, dur: 0.9 });
        else mosaicTo(to, { delay: 0.5, dur: 0.6 });
      }
      function worldStep(k) {   // context (f_k, f_k+1, f_k+2) and their three actions → f_k+3
        var d = wp.list[wp.di];
        pushObs({ image: frame(d, k + 2), keep: 3, dur: 0.42 });
        pushCard({ label: domainLabel(d), text: d.steps[k + 2].text, keep: 3, dur: 0.42 });
        mosaicTo(patchColors(d.key + ':' + (k + 3), frame(d, k + 3)), { delay: 0.25, dur: 0.6 });
      }
      M.playWorld = function (list, di, o) {
        o = o || {};
        wp.list = list; wp.di = ((di % list.length) + list.length) % list.length;
        enterDomain(!!o.instant, o.wait);
      };

      /* ---- the policy player: chunk by chunk */
      var pol = { i: 0, k: 0, t: 0 };
      function policySample(k, instant) {
        pol.i = ((k % POL.length) + POL.length) % POL.length; pol.k = -1; pol.t = 0;
        var p = POL[pol.i];
        simMat.uniforms.map.value = simTex[p.key]; paintSimTitle(p.name);
        pushCard({ label: 'Instruction · ' + p.name, text: p.text, keep: 1, dur: instant ? 0 : 0.4 });
        policyChunk(0, instant);
      }
      function policyChunk(k, instant) {
        var p = POL[pol.i]; pol.k = k; pol.t = 0;
        pushObs({ image: img['sim:' + p.key], src: atlasRect(p.sim, p.chunks[k]), keep: 1, dur: instant ? 0 : 0.3 });
        mosaicTo(imagColors(p, k), { instant: instant, dur: 0.3 });
        setFrame(simMat, simAtlas[p.key], simImg[p.key], p.chunks[k]);
      }
      function chunkFrames(p, k) { return (k + 1 < p.chunks.length ? p.chunks[k + 1] : p.sim.n) - p.chunks[k]; }
      M.setPolicy = function (on, o) {
        o = o || {};
        var inst = !!o.instant, was = M.T.policy, tag = 'policy' + M.id;
        M.T.policy = on ? 1 : 0;
        if (!!was !== on) { obsPending.length = 0; deckPending.length = 0; }   // the other player's queued frames and cards
        stage.cancel(tag);
        if (inst) M.V.policy = M.T.policy;
        else if (!on) { var from = M.V.policy; anim(0.8, function (k) { M.V.policy = from * (1 - k); }, ease.inOutCubic, tag); }
        else if (M.V.policy < 1) { var f0 = M.V.policy; anim((o.dur || 1.7) * (1 - f0), function (k) { M.V.policy = lerp(f0, 1, k); }, ease.linear, tag); }
        if (on && (!was || inst)) policySample(o.sample || 0, inst);
        if (!on && (was || inst)) M.playWorld(WORLD_SEQ, o.domain || 0, { instant: inst });
      };

      /* ---- per frame */
      M.update = function (dt, t) {
        root.visible = M.active && M.grow > 0.002;
        if (!M.active) return;
        root.scale.setScalar(Math.max(1e-4, M.grow)); root.position.y = GROW_Y * (1 - M.grow);   // a pop scales about the middle
        var n = stage.night, kk = 1 - Math.exp(-dt * 3.2);
        M.V.explode += (M.T.explode - M.V.explode) * kk; M.V.card += (M.T.card - M.V.card) * kk;
        var ws = M.pop;
        world.scale.setScalar(Math.max(0.0001, ws)); world.visible = ws > 0.001;
        // the build-up: observations, encoder plates, predictor plates, future plate
        var rv = M.V.reveal, built = function (start, dur) { if (rv >= 1) return 1; var u = clamp01((rv - start) / (dur || 0.2)); return u <= 0 ? 0.0001 : ease.outBackSoft(u); };

        /* layout: the stack fans apart for the latent shot */
        var e = ease.inOutCubic(clamp01(M.V.explode / 0.7));
        var pO = lerp(P_OBS, 0.3, e), pVE = lerp(P_VE, 0.14, e), pLM = lerp(P_LM, 0.15, e), gap = lerp(GAP_MID, 0.28, e);
        var yObsTop = Y_OBS0 + 2 * pO, yVE0 = yObsTop + lerp(GAP_OBS, 0.42, e), yLM0 = yVE0 + (NVE - 1) * pVE + gap;
        var yTop = yLM0 + (NLM - 1) * pLM, yFut = yTop + FUT_GAP + e * 0.18;
        M.L.yObsTop = yObsTop; M.L.yLM0 = yLM0; M.L.yTop = yTop; M.L.yFut = yFut;

        /* observations: the window of context frames */
        if (obsAnim.u < 1) obsAnim.u = Math.min(1, obsAnim.u + dt / obsAnim.dur);
        if (obsAnim.u >= 1 && obsPending.length) startObs(obsPending.shift());
        if (xfade.u < 1) { xfade.u = Math.min(1, xfade.u + dt / xfade.dur); if (xfade.u >= 1) endFades(); }
        var ou = ease.inOutCubic(obsAnim.u), xu = ease.inOutSine(xfade.u);
        obs.forEach(function (p) {
          var s = lerp(p.s0, p.s1, ou), a = lerp(p.a0, p.a1, ou);
          p.g.visible = a > 0.004;
          p.g.position.set(0, yObsTop - s * pO, 0);
          p.g.scale.setScalar(built(0.03 * (2 - Math.min(2, Math.max(0, s))), 0.24));   // lowest plate first
          p.slab.opacity = p.print.opacity = a; p.print.emissiveIntensity = p.print2.emissiveIntensity = lerp(0.22, 0.75, n);
          p.slab.depthWrite = p.print.depthWrite = a > 0.98;
          p.print2.visible = p.fading && a > 0.004; p.print2.opacity = a * xu;   // the next domain's frame, over the print
        });
        shadow.material.opacity = smooth(0, 0.3, rv);
        M.anchors.obsMid.position.set(0.72, yObsTop - pO + OBS_T / 2, 0.72);
        M.anchors.obsTop.position.set(0.72, yObsTop + OBS_T / 2, 0.72);

        /* plates */
        for (i = 0; i < NVE; i++) {
          vePlates[i].y = yVE0 + i * pVE + Math.sin(t * 0.9 + i * 0.55) * 0.003; vePlates[i].mesh.position.y = vePlates[i].y;
          vePlates[i].mesh.scale.setScalar(built(0.12 + i * 0.045));
        }
        for (i = 0; i < NLM; i++) {
          lmPlates[i].y = yLM0 + i * pLM + Math.sin(t * 0.9 + (i + 4) * 0.55) * 0.003; lmPlates[i].mesh.position.y = lmPlates[i].y;
          lmPlates[i].mesh.scale.setScalar(built(0.3 + i * 0.045));
        }
        futGroup.position.y = yFut; futGroup.scale.setScalar(built(0.7, 0.26));
        var edgeI = lerp(0.95, 1.6, n), edgeO = lerp(0.42, 0.85, n), train = opt.ring ? V.train * V.ringO : 0;
        vePlates.concat(lmPlates).forEach(function (p, k) {
          p.edge.material.uniforms.uI.value = edgeI * (1 + train * 0.9 * Math.max(0, Math.sin(t * 4 - k * 0.5)));
          p.edge.material.uniforms.uO.value = edgeO;
        });
        futEdge.material.uniforms.uI.value = lerp(1.15, 2.0, n);
        MAT.plateVE.opacity = MAT.plateLM.opacity = lerp(0.06, 0.05, n);
        MAT.plateVE.userData.fres.value = MAT.plateLM.userData.fres.value = lerp(0.5, 0.4, n);
        M.anchors.ve.position.set(PL / 2, lerp(yVE0, vePlates[NVE - 1].y, 0.5), 0.55);
        M.anchors.lm.position.set(PL / 2, lerp(yLM0, yTop, 0.55), 0.4);
        port.position.set(-PL / 2 - 0.01, yLM0 + 0.12, 0);

        /* tokens: red / orange inside the encoder (rising from the top observation), blue / violet in the predictor */
        rip = 0;
        runRiser(tokVE, t, yObsTop + 0.05, vePlates[NVE - 1].y + 0.05, smooth(0.35, 0.6, rv), vePlates, pVE, 0);
        runRiser(tokLM, t, yLM0 - 0.03, yTop + 0.06, smooth(0.6, 0.9, rv), lmPlates, pLM, 0);

        /* the players */
        var polOn = M.V.policy > 0.5 && M.T.policy;
        if (!M.T.policy && wp.list && ws > 0.5) {
          if (wp.wait > 0) wp.wait -= dt;
          else {
            wp.t += dt;
            while (wp.k < STEP_AT.length && wp.t >= STEP_AT[wp.k]) { wp.k++; worldStep(wp.k); }
            if (wp.t >= DOMAIN_LEN) { wp.di = (wp.di + 1) % wp.list.length; enterDomain(false); }
          }
        }
        if (polOn) {
          var P0 = POL[pol.i], nk = chunkFrames(P0, pol.k), chunkDur = SIM_T0 + nk / SIM_FPS + CHUNK_REST;
          pol.t += dt;
          setFrame(simMat, simAtlas[P0.key], simImg[P0.key], P0.chunks[pol.k] + Math.min(nk - 1, Math.max(0, Math.floor((pol.t - SIM_T0) * SIM_FPS))));
          if (pol.t > chunkDur) {
            if (pol.k + 1 < P0.chunks.length) policyChunk(pol.k + 1);
            else if (pol.t > chunkDur + SAMPLE_REST) policySample(pol.i + 1);
          }
        }

        /* the mosaic: now → next, sweeping left to right (a domain change: all tiles at once, flat) */
        if (mosaic.delay > 0) mosaic.delay -= dt;
        else mosaic.prog = Math.min(1, mosaic.prog + dt / mosaic.dur);
        var mp = mosaic.prog;
        for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) {
          var idx = b * N + a, w = mosaic.fade ? ease.inOutSine(mp) : smooth(a / N * 0.6, a / N * 0.6 + 0.4, mp), bump = mosaic.fade ? 0 : Math.sin(w * Math.PI) * 0.022;
          var bright = mosaic.dim ? lerp(0.42, 1, smooth(0.05, 0.25, mp)) : 1;
          colA.copy(mosaic.from[idx]).lerp(mosaic.to[idx], w).multiplyScalar(bright);
          tiles.setColorAt(idx, colA);
          m4.makeTranslation((a - (N - 1) / 2) * TILE, CAP_T / 2 + 0.006 + bump, (b - (N - 1) / 2) * TILE); tiles.setMatrixAt(idx, m4);
        }
        tiles.instanceColor.needsUpdate = true; tiles.instanceMatrix.needsUpdate = true;

        /* the language cards + the cable into the predictor */
        if ((n > 0.5) !== deckNight) { deckNight = n > 0.5; deck.forEach(function (C) { if (C.label) paintCard(C); if (C.fading) paintCard(C, true); }); }   // restyle at the halfway point
        if (deckAnim.u < 1) deckAnim.u = Math.min(1, deckAnim.u + dt / deckAnim.dur);
        if (deckAnim.u >= 1 && deckPending.length) startCard(deckPending.shift());
        var du = ease.inOutCubic(deckAnim.u);
        xu = ease.inOutSine(xfade.u);   // a domain change may have begun in this frame
        var cv = clamp01(M.V.card) * (opt.rows ? 1 - smooth(0.0, 0.6, V.rows) : 1) * (ws > 0.5 ? 1 : 0) * smooth(0.75, 1, rv);
        cardAnchor.set(-PL / 2 - 0.42, yLM0 + 0.42 + e * 0.15, 0.32);
        camR.set(1, 0, 0).applyQuaternion(stage.camera.quaternion); camU.set(0, 1, 0).applyQuaternion(stage.camera.quaternion);
        camF.set(0, 0, -1).applyQuaternion(stage.camera.quaternion);
        deck.forEach(function (C) {   // older cards step back: up and to the left, behind the newest
          var s = lerp(C.s0, C.s1, du), al = cv * (1 - 0.18 * clamp01(s / 2))   // a new card turns opaque early: the texts barely overlap
            * lerp(C.a0, C.a1, C.a1 > C.a0 ? smooth(0, 0.35, deckAnim.u) : du);
          var k = 1 - 0.04 * Math.max(0, s);
          // a domain change: the next text dissolves in on top, then the old face leaves (cards can differ in height)
          [[C.m, C.w, C.h, C.fading ? al * (1 - smooth(0.5, 1, xu)) : al, 0], [C.m2, C.w2, C.h2, C.fading ? al * smooth(0, 0.6, xu) : 0, 0.5]].forEach(function (F) {
            var m = F[0]; m.visible = F[3] > 0.01;
            if (!m.visible) return;
            m.position.copy(cardAnchor).addScaledVector(camR, -0.085 * s).addScaledVector(camU, 0.105 * s).addScaledVector(camF, 0.05 * Math.max(0, s));
            m.quaternion.copy(stage.camera.quaternion);
            m.scale.set(F[1] * k, F[2] * k, 1);
            m.material.opacity = F[3]; m.material.color.setScalar(lerp(1, 0.94, n) * (1 - 0.06 * clamp01(s)));
            m.renderOrder = 9 - Math.round(C.s1) + F[4];
          });
        });
        A.copy(cardAnchor);
        Cv.set(-PL / 2 - 0.01, yLM0 + 0.12, 0.0); B.set((A.x + Cv.x) / 2, A.y - 0.05, (A.z + Cv.z) / 2 + 0.05);
        langCable.set(A, B, Cv); langCable.material.uniforms.uO.value = cv * 0.95;
        portMat.opacity = Math.max(cv, opt.rows ? V.wires : 0) * 0.9;

        /* LaLa-Policy: the generator buds off beside the future plate, then acts (the opening's generator, V.gen: no simulator) */
        var pp = Math.max(M.V.policy, M.V.gen), sp = M.V.policy, pOn = smooth(0.85, 1.0, pp);
        gen.visible = bridge.visible = pp > 0.005; sim.visible = acts.visible = sp > 0.005;
        simShadow.visible = sim.visible;
        var popAt = function (start, dur, v) { var u = clamp01(((v == null ? pp : v) - start) / (dur || 0.24)); return u <= 0 ? 0.0001 : ease.outBack(u); };
        var genY = yTop + 0.1;
        gen.position.set(GEN_X, 0, 0);
        genPlates.forEach(function (g, k) {
          g.y = genY + k * 0.105; g.mesh.position.y = g.y; g.mesh.scale.setScalar(popAt(0.1 + k * 0.12));
          g.edge.material.uniforms.uI.value = lerp(1.1, 2.1, n); g.edge.material.uniforms.uO.value = lerp(0.6, 0.95, n);
        });
        MAT.plateAct.opacity = lerp(0.11, 0.09, n);
        runRiser(tokAct, t, genY - 0.02, genY + (GEN_N - 1) * 0.105 + 0.06, pOn, genPlates, 0.105, GEN_X);
        A.set(0.55, yTop + 0.02, 0.35); Cv.set(GEN_X - 0.12, genY - 0.03, 0.08); B.set(1.05, yTop + 0.02, 0.32);
        bridge.set(A, B, Cv); bridge.material.uniforms.uO.value = clamp01((pp - 0.55) / 0.3);
        sim.scale.setScalar(popAt(0.62, 0.3, sp)); simShadow.material.opacity = clamp01((sp - 0.62) / 0.3);
        M.anchors.acts.position.set(lerp(GEN_X, SIM.x, 0.5), genY + 0.75, 0.3);
        // the actions leave the generator, arc over and land on the simulator screen
        var gTop = genY + (GEN_N - 1) * 0.105 + 0.05;
        var land = SIM.x - SIM_S / 2 + 0.12;
        actCurve.points[0].set(GEN_X, gTop, 0); actCurve.points[1].set(lerp(GEN_X, land, 0.2), gTop + 0.42, 0.12);
        actCurve.points[2].set(lerp(GEN_X, land, 0.55), SIM.y + SIM_S / 2 + 0.35, 0.3); actCurve.points[3].set(land, SIM.y + 0.25, SIM.z + 0.05);
        actCurve.updateArcLengths();
        for (var j = 0; j < ACT; j++) {
          var ta = polOn ? (pol.t - ACT_T0 - j * 0.011) / ACT_FLY : -1;
          if (!polOn || ta <= 0 || ta >= 1) { acts.setMatrixAt(j, ZERO); continue; }
          var uu = ease.inOutSine(ta);
          actCurve.getPointAt(uu, v3); q.setFromUnitVectors(up, actCurve.getTangentAt(uu));
          var sc = pOn * smooth(0, 0.12, ta) * (1 - smooth(0.85, 1, ta));
          m4.compose(v3, q, s3.set(sc, sc, sc)); acts.setMatrixAt(j, m4);
        }
        acts.instanceMatrix.needsUpdate = true;

        ripples.instanceMatrix.needsUpdate = true;
        rGeo.attributes.aProg.needsUpdate = true; rGeo.attributes.aAlpha.needsUpdate = true; rGeo.attributes.aColor.needsUpdate = true;
      };
      models.push(M);
      return M;
    }

    var main = makeModel({ ring: true, rows: true });

    /* ---------------------------------------------------------------- domain-specific predecessors: seven small grey models */
    var legacySpec = [['PUSH-T', '2-D action', 'pusht'], ['POINTMAZE', '2-D action', 'pointmaze'], ['WALL', '2-D action', 'wall'],
      ['META-WORLD', '4-D action', 'metaworld'], ['ROPE', '4-D action', 'rope'], ['GRANULAR', '4-D action', 'granular'], ['DROID', '7-D action', 'droid']];
    var LEG_X = 1.75;
    function smallPrint(image) {
      var c = tex.canvas(256, 256), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; tex.cover(g, image, 0, 0, 256, 256, 0);
      return new THREE.MeshPhysicalMaterial({ map: tex.texture(c), roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.12, polygonOffset: true, polygonOffsetFactor: -1 });
    }
    var legacy = legacySpec.map(function (spec, i) {
      var g = new THREE.Group(); scene.add(g);
      var w = 0.6, d = byKey[spec[2]];
      // input observation below, four grey plates, the predicted future observation on top
      mesh(slab(w + 0.08, w + 0.08, 0.02, 0.06, 0.006), MAT.frost, g, 0.04);
      mesh(roundedPlane(w + 0.02, w + 0.02, 0.05), smallPrint(img[d.key + ':2']), g, 0.0515);
      for (var k = 0; k < 4; k++) {
        var lp = mesh(slab(w, w, 0.018, 0.06, 0.005), MAT.legacyPlate, g, 0.2 + k * 0.075); lp.renderOrder = 2;
        var le = glowFrame(w + 0.02, w + 0.02, 0.016, PAL.legacy, { radius: 0.065, innerRadius: 0.056, depth: 0.014, transparent: true });
        le.position.y = -0.007; le.material.uniforms.uO.value = 0.5; lp.add(le);
      }
      var yc = 0.2 + 4 * 0.075 + 0.06;
      mesh(slab(w + 0.04, w + 0.04, 0.03, 0.07, 0.008), MAT.legacyCap, g, yc);
      mesh(roundedPlane(w - 0.02, w - 0.02, 0.05), smallPrint(img[d.key + ':3']), g, yc + 0.0165);
      var c = tex.canvas(512, 160), cg = c.getContext('2d'); cg.textAlign = 'center';
      cg.fillStyle = '#1d1d1f'; cg.font = tex.font(650, 56); cg.fillText(spec[0], 256, 70);
      cg.fillStyle = '#86868b'; cg.font = tex.font(500, 40); cg.fillText(spec[1], 256, 128);
      var label = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.344), basic(tex.texture(c)));
      label.position.set(0, -0.24, 0.32); g.add(label);
      var sh = stage.softShadow(w + 0.1, w + 0.1, { blur: 22, alpha: 0.32, radius: 0.15 }); sh.position.y = 0.001; g.add(sh);
      var top = i < 4;   // four behind, three in front (between them)
      g.userData = { x0: top ? (i - 1.5) * LEG_X : (i - 5) * LEG_X, y0: top ? 0.8 : 0.42, z0: top ? -1.45 : 1.15, label: label };
      g.visible = false;
      return g;
    });

    /* ---------------------------------------------------------------- numbers → words: the talk's interface slide, in glass */
    var ROW_W = 1660, ROW_H = 204, ROW_K = 0.0024;
    var rowGroup = new THREE.Group(); main.root.add(rowGroup);
    var rows = MEDIA.rows.map(function (r, i) {
      var c = tex.canvas(ROW_W, ROW_H), t = tex.texture(c);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(ROW_W * ROW_K, ROW_H * ROW_K), basic(t, { opacity: 0 }));
      m.position.set(-3.85, 2.42 - i * 0.545, 0.3); m.renderOrder = 6; rowGroup.add(m);
      var w = cable({ colors: [PAL.lm[2], PAL.lm[0]], radius: 0.016, count: 2.0, speed: 0.8 }); rowGroup.add(w);
      return { r: r, canvas: c, tex: t, mesh: m, wire: w, u: -1 };
    });
    function paintRow(R, u) {   // u: 0 = numerical action, 1 = the same action in words
      var g = R.canvas.getContext('2d'), r = R.r, W = ROW_W, H = ROW_H;
      g.clearRect(0, 0, W, H);
      tex.rrect(g, 2, 2, W - 4, H - 4, 34); g.fillStyle = 'rgba(255,255,255,.96)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.07)'; g.stroke();
      tex.cover(g, img['row:' + r.key], 22, 22, H - 44, H - 44, 22);
      g.textBaseline = 'alphabetic'; g.fillStyle = '#1d1d1f'; g.font = tex.font(650, 48); g.fillText(r.name, H + 6, 90);
      g.fillStyle = '#86868b'; g.font = tex.font(500, 31); g.fillText(r.sub, H + 6, 138);
      var x0 = 610, k = ease.inOutCubic(clamp01(u * 1.6)), kw = clamp01((u - 0.25) / 0.75);
      // the numbers: a mono chip that slides out as the sentence arrives
      if (k < 1) {
        g.save(); g.globalAlpha = 1 - k; g.translate(-40 * k, 0);
        if (r.nums) {
          g.font = tex.font(500, 42, stage.MONO); var tw = g.measureText(r.nums).width;
          tex.rrect(g, x0, 60, tw + 60, 80, 24); g.fillStyle = '#f2f2f5'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.08)'; g.stroke();
          g.fillStyle = '#515154'; g.fillText(r.nums, x0 + 30, 114);
        } else { g.font = tex.font(600, 38); g.fillStyle = '#C55A11'; g.fillText('No numerical action label', x0, 114); }
        g.restore();
      }
      if (kw > 0) {   // the sentence wipes in, left to right
        g.save(); g.font = tex.font(560, 44);
        var lines = tex.wrap(g, r.text, W - x0 - 56), lh = 54, y0 = H / 2 - (lines.length * lh) / 2 + 39;
        g.beginPath(); g.rect(x0 - 4, 0, (W - x0) * ease.outCubic(kw) + 4, H); g.clip();
        g.fillStyle = COL.lang; lines.forEach(function (ln, i) { g.fillText(ln, x0, y0 + i * lh); });
        g.restore();
      }
      R.tex.needsUpdate = true;
    }

    /* ---------------------------------------------------------------- data: transition cards around the model */
    var data = new THREE.Group(); scene.add(data);
    var dataTurn = 0;   // the arc's turn about the model (the opening's OPEN.rot; eased only while it stays in view)
    var groupTag = { sim: 'Simulation', robot: 'Real robot', video: 'Video', edit: 'Image edit' };
    function pairCanvas(o) {   // name / tag, current → future, the sentence that links them
      var W = 1024, pad = 40, gap = 54, iw = (W - pad * 2 - gap) / 2, ih = Math.round(iw * Math.min(1, o.h / o.w));
      var H = pad + 44 + 22 + ih + 30 + 3 * 44 + pad - 6;
      var c = o.canvas || tex.canvas(W, H), g = c.getContext('2d');
      g.clearRect(0, 0, W, H);
      tex.rrect(g, 2, 2, W - 4, H - 4, 46); g.fillStyle = 'rgba(255,255,255,.97)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.07)'; g.stroke();
      g.textBaseline = 'alphabetic'; g.font = tex.font(650, 36); g.fillStyle = '#1d1d1f'; g.fillText(o.name, pad, pad + 34);
      g.font = tex.font(500, 25); g.fillStyle = '#86868b'; g.textAlign = 'right'; g.fillText(o.tag, W - pad, pad + 32); g.textAlign = 'left';
      var y0 = pad + 44 + 22;
      tex.cover(g, o.a, pad, y0, iw, ih, 22); tex.cover(g, o.b, pad + iw + gap, y0, iw, ih, 22);
      var ax = pad + iw + gap / 2, ay = y0 + ih / 2;
      g.strokeStyle = PAL.lm[1]; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax - 14, ay); g.lineTo(ax + 12, ay); g.moveTo(ax + 2, ay - 11); g.lineTo(ax + 13, ay); g.lineTo(ax + 2, ay + 11); g.stroke();
      g.font = tex.font(540, 33); g.fillStyle = COL.lang;
      tex.wrap(g, o.text, W - pad * 2).slice(0, 3).forEach(function (ln, i) { g.fillText(ln, pad, y0 + ih + 30 + 34 + i * 44); });
      return c;
    }
    var dataCards = [];
    function placeCard(o) {   // o: { angle, radius, y, width, tier, row, kind, ... }
      var a = THREE.MathUtils.degToRad(o.angle), dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      var grp = new THREE.Group(); data.add(grp);
      var home = dir.clone().multiplyScalar(o.radius).setY(o.y + o.height / 2);
      grp.position.copy(home); grp.lookAt(0, home.y, 0);
      var sh = stage.softShadow(o.width * 0.9, 0.22, { blur: 22, alpha: 0.26, radius: 0.5 });
      sh.position.set(home.x, 0.002, home.z); sh.rotation.z = -a; sh.material.opacity = 0; data.add(sh);
      // two light traces into the stack: the picture into the observations, the sentence into the predictor
      var streams = new THREE.Group(); data.add(streams);
      var side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      [[PAL.ve[1], OBS_TOP + 0.02, 1.0, -0.08], [PAL.lm[1], Y_LM0 + 0.1, 0.9, 0.08]].forEach(function (s, k) {
        var start = dir.clone().multiplyScalar(o.radius - 0.08).add(side.clone().multiplyScalar(s[3])).setY(o.y + 0.06);
        var end = dir.clone().multiplyScalar(s[2]).add(side.clone().multiplyScalar(s[3] * 0.6)).setY(s[1]);
        var mid = dir.clone().multiplyScalar(o.radius * 0.5).add(side.clone().multiplyScalar(s[3])).setY(Math.max(o.y, s[1]) + 0.75 + k * 0.12);
        var rb = stage.fx.ribbon(new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(64), 0.036);
        streams.add(new THREE.Mesh(rb.geometry, stage.fx.pulseMaterial(s[0], { gap: 1.0, speed: 1.15, offset: stage.rng(o.angle * 17 + k + 3 + o.radius)() })));
      });
      var C = Object.assign({ grp: grp, shadow: sh, streams: streams, home: home, mats: [], i: dataCards.length, born: 0 }, o);
      C.stag = o.tier === 1 ? C.i * 0.06 : (o.order || 0) * 0.05;   // entry stagger (the video cards join later)
      dataCards.push(C); return C;
    }
    /* a robot demonstration (the opening): on the arc like the others (angle, radius, y: its foot), facing the model; both
       its traces run from its foot into the action generator (green, teal) */
    var rdata = new THREE.Group(); scene.add(rdata);   // not turned with the others' arc (OPEN.rot)
    function placeRobot(o) {
      var a = THREE.MathUtils.degToRad(o.angle), grp = new THREE.Group(); rdata.add(grp);
      var home = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).multiplyScalar(o.radius).setY(o.y + o.height / 2);
      grp.position.copy(home); grp.lookAt(0, home.y, 0);
      var sh = stage.softShadow(o.width * 0.9, 0.22, { blur: 22, alpha: 0.26, radius: 0.5 });
      sh.position.set(home.x, 0.002, home.z); sh.rotation.z = -a; sh.material.opacity = 0; rdata.add(sh);
      var streams = new THREE.Group(); rdata.add(streams);
      var G = new THREE.Vector3(GEN_X, 0, 0), toCard = home.clone().setY(0).sub(G).normalize(), across = new THREE.Vector3(-toCard.z, 0, toCard.x);
      var face = new THREE.Vector3(1, 0, 0).applyQuaternion(grp.quaternion);   // the card's own left → right
      [[PAL.robot[0], GEN_Y + 0.06, -0.08], [PAL.robot[1], GEN_Y + 0.27, 0.08]].forEach(function (s, k) {
        var end = G.clone().addScaledVector(toCard, GEN_S / 2 + 0.03).addScaledVector(across, s[2]).setY(s[1]);
        var start = home.clone().addScaledVector(face, s[2]).setY(o.y + 0.06);
        var mid = start.clone().lerp(end, 0.5).setY(Math.max(o.y, s[1]) + 0.75 + k * 0.12);
        var rb = stage.fx.ribbon(new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(64), 0.036);
        streams.add(new THREE.Mesh(rb.geometry, stage.fx.pulseMaterial(s[0], { gap: 1.0, speed: 1.15, offset: stage.rng(o.ri * 31 + k + 7)() })));
      });
      var C = Object.assign({ grp: grp, shadow: sh, streams: streams, home: home, mats: [], i: dataCards.length, tier: 3, born: 0 }, o);
      dataCards.push(C); return C;
    }
    // tier 1: the control domains — each card steps through the six transitions of one episode
    var tier1 = DOMAINS.map(function (d, i) {
      var first = pairCanvas({ name: d.name, tag: groupTag[d.group] + ' · ' + d.dims + ' action', w: d.w, h: d.h, a: img[d.key + ':0'], b: img[d.key + ':1'], text: d.steps[0].text });
      var width = 1.62, height = width * first.height / first.width;
      var C = placeCard({ angle: -69 + i * 23, radius: 4.7, y: 0.18, width: width, height: height, tier: 1, kind: 'pair', d: d, step: 0, next: 0.7 + i * 0.135 });
      C.canvases = [first, tex.canvas(first.width, first.height)];
      C.texs = C.canvases.map(function (c) { return tex.texture(c); });
      C.planes = C.texs.map(function (t, k) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), basic(t, { opacity: 0 }));
        m.position.z = k * 0.002; C.grp.add(m); C.mats.push(m.material); return m;
      });
      C.front = 0; C.fade = 1;
      return C;
    });
    function stepPairCard(C, a, b, text, name, tag, dims) {
      var back = 1 - C.front;
      pairCanvas({ canvas: C.canvases[back], name: name, tag: tag, w: dims[0], h: dims[1], a: a, b: b, text: text });
      C.texs[back].needsUpdate = true; C.front = back; C.fade = 0;
    }
    // tier 2: real video (OpenVid, captions change every 0.5 s) and one image-edit card (OmniEdit)
    var VID_W = 1024, VID_PAD = 40, VID_IW = VID_W - VID_PAD * 2, VID_IH = Math.round(VID_IW * 9 / 16), VID_HEAD = 84, VID_CAP = 2 * 44 + 40;
    var VID_H = VID_PAD + VID_HEAD + VID_IH + VID_CAP + VID_PAD - 20;
    function videoCard(v, o) {
      var width = o.width, height = width * VID_H / VID_W, k = width / VID_W;
      var C = placeCard(Object.assign({ height: height, tier: 2, kind: 'video', v: v, vt: (o.vi * 0.37) % 1.5, capIdx: -1 }, o));
      var base = tex.canvas(VID_W, VID_H), g = base.getContext('2d');
      tex.rrect(g, 2, 2, VID_W - 4, VID_H - 4, 46); g.fillStyle = 'rgba(255,255,255,.97)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.07)'; g.stroke();
      g.textBaseline = 'alphabetic'; g.font = tex.font(650, 36); g.fillStyle = '#1d1d1f'; g.fillText('OpenVid', VID_PAD, VID_PAD + 34);
      g.font = tex.font(500, 25); g.fillStyle = '#86868b'; g.textAlign = 'right'; g.fillText('Video · no action label', VID_W - VID_PAD, VID_PAD + 32); g.textAlign = 'left';
      // explicit draw order: transparent planes of one card would otherwise sort by their own centres
      var bm = new THREE.Mesh(new THREE.PlaneGeometry(width, height), basic(tex.texture(base), { opacity: 0 })); bm.renderOrder = 5; C.grp.add(bm); C.mats.push(bm.material);
      var vimg = atlasImage(img['ov:' + v.key]);
      var vm = atlasMaterial(atlasTexture(vimg)); vm.uniforms.uSize.value.set(VID_IW * k, VID_IH * k); vm.uniforms.uR.value = 22 * k;
      var vp = new THREE.Mesh(new THREE.PlaneGeometry(VID_IW * k, VID_IH * k), vm);
      vp.position.set(0, height / 2 - (VID_PAD + VID_HEAD - 22 + VID_IH / 2) * k, 0.002); vp.renderOrder = 6; C.grp.add(vp);
      C.vmat = vm; C.vimg = vimg; C.vatlas = atlasOf(v.atlas, vimg, img['ov:' + v.key]);
      C.capCanvas = tex.canvas(VID_W, VID_CAP); C.capTex = tex.texture(C.capCanvas);
      var cm = new THREE.Mesh(new THREE.PlaneGeometry(width, VID_CAP * k), basic(C.capTex, { opacity: 0 }));
      cm.position.set(0, -height / 2 + (VID_PAD - 20 + VID_CAP / 2) * k, 0.003); cm.renderOrder = 6; C.grp.add(cm); C.mats.push(cm.material);
      return C;
    }
    function paintCaption(C, text) {
      var g = C.capCanvas.getContext('2d'); g.clearRect(0, 0, VID_W, VID_CAP);
      g.font = tex.font(540, 33); g.fillStyle = COL.lang; g.textBaseline = 'alphabetic';
      tex.wrap(g, text, VID_W - VID_PAD * 2).slice(0, 2).forEach(function (ln, i) { g.fillText(ln, VID_PAD, 50 + i * 44); });
      C.capTex.needsUpdate = true;
    }
    /* the OpenVid cards: their atlases come with media-video.js, which the page loads right after the model */
    var videoJob = null;
    function addVideo(OV) {
      if (videoJob) return videoJob;
      var jobs = [];
      ['lower', 'upper'].forEach(function (r) { OV[r].forEach(function (v) { jobs.push(load('ov:' + v.key, v.atlas.src)); }); });
      return (videoJob = Promise.all(jobs).then(function () {
        OV.upper.forEach(function (v, i) { videoCard(v, { vi: i, order: i, angle: -40 + i * 20, radius: 7.55, y: 2.55, width: 1.95, row: 'upper' }); });
        OV.lower.forEach(function (v, i) { videoCard(v, { vi: i + 5, order: 5 + i, angle: -44 + i * 22 + (i >= 2 ? 22 : 0), radius: 6.25, y: 0.95, width: 1.9, row: 'lower' }); });
        warm(data);
      }));
    }
    var oe = MEDIA.omniedit;
    (function () {   // the OmniEdit card, in the gap of the lower row
      var first = pairCanvas({ name: 'OmniEdit', tag: 'Image edit · no action label', w: 3, h: 2, a: img['oe:' + oe[0].key + ':cur'], b: img['oe:' + oe[0].key + ':fut'], text: oe[0].text });
      var width = 1.9, height = width * first.height / first.width;
      var C = placeCard({ angle: 0, radius: 6.25, y: 0.95 + (1.9 * VID_H / VID_W - height) / 2, width: width, height: height, tier: 2, kind: 'pair', row: 'lower', order: 9, step: 0, next: 2.2 });
      C.canvases = [first, tex.canvas(first.width, first.height)];
      C.texs = C.canvases.map(function (c) { return tex.texture(c); });
      C.planes = C.texs.map(function (t, k) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), basic(t, { opacity: 0 })); m.position.z = k * 0.002; C.grp.add(m); C.mats.push(m.material); return m;
      });
      C.front = 0; C.fade = 1; C.oe = true;
    })();
    // tier 3, the opening only: the robot demonstrations LaLa-Policy learns from (two views of one episode, its task
    // sentence), their traces into the action generator. Placed by OPEN.cards
    var RB_GAP = 32, RB_IW = (VID_IW - RB_GAP) / 2, RB_H = VID_PAD + VID_HEAD + RB_IW + VID_CAP + VID_PAD - 20;
    function robotCard(r, o) {
      var width = o.width, height = width * RB_H / VID_W, k = width / VID_W;
      var C = placeRobot(Object.assign({ height: height, kind: 'robot', r: r, vt: o.ri * 0.83 }, o));
      var base = tex.canvas(VID_W, RB_H), g = base.getContext('2d');
      tex.rrect(g, 2, 2, VID_W - 4, RB_H - 4, 46); g.fillStyle = 'rgba(255,255,255,.97)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(22,179,100,.3)'; g.stroke();   // LaLa-Policy's colour: the edge, and a dot by the name
      var dg = g.createLinearGradient(VID_PAD, 0, VID_PAD + 22, 0); dg.addColorStop(0, PAL.robot[0]); dg.addColorStop(1, PAL.robot[1]);
      g.fillStyle = dg; g.beginPath(); g.arc(VID_PAD + 10, VID_PAD + 22, 10, 0, Math.PI * 2); g.fill();
      g.textBaseline = 'alphabetic'; g.font = tex.font(650, 36); g.fillStyle = '#1d1d1f'; g.fillText(r.name, VID_PAD + 32, VID_PAD + 34);
      g.font = tex.font(500, 25); g.fillStyle = '#86868b'; g.textAlign = 'right'; g.fillText(r.tag, VID_W - VID_PAD, VID_PAD + 32); g.textAlign = 'left';
      g.font = tex.font(540, 33); g.fillStyle = COL.lang;
      tex.wrap(g, r.text, VID_W - VID_PAD * 2).slice(0, 2).forEach(function (ln, i) { g.fillText(ln, VID_PAD, RB_H - 98 + i * 44); });
      var bm = new THREE.Mesh(new THREE.PlaneGeometry(width, height), basic(tex.texture(base), { opacity: 0 })); bm.renderOrder = 5; C.grp.add(bm); C.mats.push(bm.material);
      C.views = r.views.map(function (a, vi) {   // side by side, played together
        var im0 = img['rb:' + r.key + ':' + vi], im = atlasImage(im0), vm = atlasMaterial(atlasTexture(im));
        vm.uniforms.uSize.value.set(RB_IW * k, RB_IW * k); vm.uniforms.uR.value = 22 * k;
        var vp = new THREE.Mesh(new THREE.PlaneGeometry(RB_IW * k, RB_IW * k), vm);
        vp.position.set((vi - 0.5) * (RB_IW + RB_GAP) * k, height / 2 - (VID_PAD + VID_HEAD - 22 + RB_IW / 2) * k, 0.002); vp.renderOrder = 6; C.grp.add(vp);
        return { mat: vm, atlas: atlasOf(a, im, im0), img: im };
      });
      return C;
    }
    /* the robot demonstrations: their atlases come with robot.js, which the page loads right after the model */
    var robotJob = null;
    function addRobots(RB) {
      if (robotJob) return robotJob;
      var jobs = [], byEp = {};
      RB.forEach(function (r) { byEp[r.key] = r; r.views.forEach(function (a, i) { jobs.push(load('rb:' + r.key + ':' + i, a.src)); }); });
      return (robotJob = Promise.all(jobs).then(function () {
        OPEN.cards.forEach(function (c, i) { if (byEp[c.ep]) robotCard(byEp[c.ep], Object.assign({ ri: i }, c)); });
        warm(rdata);
      }));
    }
    var NRB = OPEN.cards.length;

    /* ---------------------------------------------------------------- labels (the film's model) */
    var an = main.anchors;
    stage.labels.add({ anchor: an.obsMid, html: 'Observations', dx: 150, dy: 56, group: 'latent' });
    stage.labels.add({ anchor: an.ve, html: '<i class="ve">Vision encoder</i>', dx: 170, dy: 30, group: 'latent' });
    stage.labels.add({ anchor: an.lm, html: '<i class="lm">Predictor</i>', dx: 170, dy: 0, group: 'latent' });
    stage.labels.add({ anchor: an.fut, html: 'Future observation', dx: 160, dy: -60, group: 'latent' });
    stage.labels.add({ anchor: an.obsTop, html: 'Current observation', dx: -150, dy: 64, group: 'policy' });
    stage.labels.add({ anchor: an.fut, html: 'Future observation', dx: -250, dy: -40, group: 'policy' });
    stage.labels.add({ anchor: an.acts, html: '<i class="act">Actions</i>', dx: 50, dy: -55, group: 'policy' });

    /* ---------------------------------------------------------------- shot logic */
    var compact = false;   // a narrow opening frame (setCompact): the lens fits OPEN.compact
    function setScene(name, ctx, o) {
      var inst = ctx && ctx.instant, fromChart = !!charts.shown;
      if (!(o && o.chart)) charts.go(null);
      ['legacy', 'words', 'evolve', 'hero', 'reveal', 'grow', 'gen', 'datain', 'open', 'end'].forEach(function (tg) { stage.cancel(tg); });
      models.forEach(function (M) {   // a shot left mid-pop: back to full size
        if (M.grow === 1) return;
        var g0 = M.grow;
        if (inst) M.grow = 1; else anim(0.5, function (k) { M.grow = lerp(g0, 1, k); }, ease.outCubic, 'grow');
      });
      if (inst) main.V.reveal = 1;   // a shot left mid-build: built
      else if (main.V.reveal < 1) { var r0 = main.V.reveal; anim(0.6, function (k) { main.V.reveal = lerp(r0, 1, k); }, ease.outCubic, 'reveal'); }
      if (name !== 'open' && name !== 'policy' && main.V.gen > 0) {   // the opening's generator folds back (LaLa-Policy's takes it over)
        var g0 = main.V.gen;
        if (inst) main.V.gen = 0; else anim(0.7, function (k) { main.V.gen = g0 * (1 - k); }, ease.inOutCubic, 'gen');
      }
      V.legacy = 0; V.merge = 1; T.rows = 0; T.robot = 0;
      dataTurn = name === 'open' ? -THREE.MathUtils.degToRad(OPEN.rot || 0) : 0;   // OPEN.rot counts like the cards' angles (< 0: to the left)
      if (inst) data.rotation.y = dataTurn;
      main.T.explode = name === 'latent' ? 0.7 : 0;
      T.data = name === 'data1' ? 1 : name === 'data2' || name === 'evolve' ? 2 : 0;
      main.T.card = T.data ? 0 : 1;
      if (fromChart && T.data && !inst) {   // the data comes back once the chart has gone
        var td = T.data; T.data = 0;
        stage.wait(0.5, 'datain').then(function () { if (!ctx || ctx.alive()) T.data = td; });
      }
      if (name !== 'evolve' && V.train > 0 && V.ringO > 0) {   // the training ring fades once LaLa-Policy is on its own
        var o0 = V.ringO; stage.cancel('train');
        if (inst) V.ringO = 0; else anim(0.8, function (k) { V.ringO = o0 * (1 - k); }, ease.inOutCubic, 'train');
      }
      // labels come in once the camera has settled (and the background has finished changing)
      var lt = ++labelTok;   // a cancelled wait still resolves: only the latest may set the labels
      stage.cancel('labels'); labelGroup = '';
      var lgName = o && o.chart ? '' : name === 'latent' ? 'latent' : name === 'policy' ? 'policy' : '';
      if (lgName && inst) labelGroup = lgName;
      else if (lgName) stage.wait(2.1, 'labels').then(function () { if (lt === labelTok && (!ctx || ctx.alive())) labelGroup = lgName; });
      main.setPolicy(name === 'policy' || name === 'end', ctx);
      if (inst) { main.V.explode = main.T.explode; V.data = T.data; main.V.card = main.T.card; V.rows = T.rows; V.robot = T.robot; }
    }
    /* the opening — LaLa-World builds up in the middle while the camera closes in, and the data of "Video, too" comes in
       around it; then its action generator buds off beside it and the robot demonstrations come in (OPEN_AT). Video and
       robot cards whose files are still on their way drop in when they arrive */
    function openWall(ctx) {
      setScene('open', ctx);
      stage.cancel('reveal');
      main.T.card = 0;
      if (ctx.instant) { main.V.card = 0; main.V.reveal = main.V.gen = 1; T.data = V.data = 2; T.robot = V.robot = 1; return; }
      main.V.card = 0; main.V.reveal = main.V.gen = 0; T.data = V.data = 0; T.robot = V.robot = 0;
      stage.flyTo(OPEN.from, 0); stage.flyTo(viewOf(ctx.shot), OPEN.dur, ease.inOutSine);   // the slow approach
      main.playWorld(WORLD_SEQ, 0, { instant: true, wait: OPEN.wait });
      anim(OPEN.build, function (k) { main.V.reveal = k; }, ease.linear, 'open');
      [[OPEN_AT.data, OPEN.run.data, function (k) { T.data = V.data = 2 * k; }, ease.inOutSine],
        [OPEN_AT.gen, OPEN.run.gen, function (k) { main.V.gen = k; }, ease.linear],
        [OPEN_AT.robot, OPEN.run.robot, function (k) { T.robot = V.robot = k; }, ease.inOutSine]].forEach(function (a) {
        stage.wait(a[0], 'open').then(function () { if (ctx.alive()) anim(a[1], a[2], a[3], 'open'); });
      });
    }
    /* LaLa-World — the model in the middle with its instruction card. After a cut the opening's data, robot demonstrations
       and generator have scrolled away with the page: they are simply gone, and the world player starts again on
       Meta-World. (Played without a cut, the film's: they step away quickly, then the card comes) */
    function heroShot(ctx) {
      var fromWall = (V.data > 0.5 || V.robot > 0.5) && !ctx.instant && !ctx.cut;
      setScene('hero', ctx);
      if (fromWall) {
        var d0 = V.data, r0 = V.robot; main.T.card = 0;
        anim(0.7, function (k) { T.data = V.data = d0 * (1 - k); V.robot = r0 * (1 - k); }, ease.inOutSine, 'hero');
        stage.wait(0.8, 'hero').then(function () { if (ctx.alive()) main.T.card = 1; });
      }
      if (ctx.cut) { stage.cancel('gen'); main.V.gen = 0; V.data = 0; V.robot = 0; }
      if (ctx.instant || ctx.cut) main.playWorld(WORLD_SEQ, HERO_DOMAIN, { instant: true, wait: ctx.instant ? 0 : 0.5 });
    }
    /* P1–P4: the 3D scene under a chart — the model alone (the data steps away), or LaLa-Policy for its own chart — and
       the chart itself (after a cut, as the picture comes in) */
    function chartShot(name, ctx) {
      var policy = name === 'p4';
      setScene(policy ? 'policy' : 'chart', ctx, { chart: true });
      if (policy) main.T.card = 0;   // its instruction card would stand by the chart
      if (ctx.instant) main.V.card = main.T.card;
      charts.go(name, { at: ctx.instant ? 0 : ctx.cut ? Math.min(0.15, ctx.shot.chartAt) : ctx.shot.chartAt || 0, instant: ctx.instant });
    }
    /* 7 — the training ring closes under the model with all the data still around it; then the data steps away, the
       camera comes back to the model (about its size in shot 1) and the action generator buds off as the ring fades */
    var EVOLVE_NEAR = { key: 'evolveNear', pos: [0.25, 4.85, 10.7], target: [0.3, 1.4, 0], fov: 26 };
    function viewOf(v) { return opts.view ? opts.view(v) : v; }   // the page adapts a framing to the screen
    function evolve(ctx) {
      setScene('evolve', ctx);
      stage.cancel('train'); V.ringO = 1;
      if (ctx.instant) {
        V.train = 0; T.data = V.data = 0; main.T.card = main.V.card = 1;
        stage.flyTo(viewOf(EVOLVE_NEAR), 0); main.setPolicy(true, { instant: true }); return;
      }
      V.train = 0;
      return stage.wait(0.6, 'evolve').then(function () {   // the ring 0.6–2.4 s, the move to the model 2.6–4.3, LaLa-Policy 3.8–5.2
        if (!ctx.alive()) return;
        return anim(1.8, function (k) { V.train = k; }, ease.inOutSine, 'evolve');
      }).then(function () {
        if (!ctx.alive()) return;
        return stage.wait(0.2, 'evolve');
      }).then(function () {
        if (!ctx.alive()) return;
        stage.flyTo(viewOf(EVOLVE_NEAR), 1.7).then(function () { if (ctx.alive()) stage.drift(-4, 6); });
        return anim(1.0, function (k) { T.data = V.data = 2 * (1 - k); }, ease.inOutSine, 'evolve');   // the data steps away
      }).then(function () {
        if (!ctx.alive()) return;
        return stage.wait(0.2, 'evolve');
      }).then(function () {
        if (!ctx.alive()) return;
        main.setPolicy(true, { dur: 1.4 });
        stage.wait(0.45, 'evolve').then(function () { if (ctx.alive()) main.T.card = 1; });   // the instruction card, once the action cards have gone
        return anim(1.0, function (k) { V.ringO = 1 - k; }, ease.inOutSine, 'train');
      });
    }
    /* 4 — the one model (and the sentences of shot 3) pops away, seven domain-specific models pop in one by one and
       settle, then merge into the one model */
    function mergeLegacy(ctx) {
      setScene('legacy', ctx);
      main.T.card = 0; main.V.card = 0;
      if (ctx.instant) { V.legacy = 1; V.merge = 0; V.legacyIn = 1; return; }
      stage.cancel('grow');
      var g0 = main.grow, r0 = V.rows;
      if (ctx.cut) V.rows = 0;   // the last chapter's picture has scrolled away: the seven come at once
      var away = ctx.cut ? Promise.resolve() : anim(0.35, function (k) { main.grow = g0 * (1 - k); V.rows = r0 * (1 - k); }, ease.inBack, 'legacy');
      return away.then(function () {
        if (!ctx.alive()) return;
        V.legacy = 1; V.merge = 0; V.legacyIn = 0; main.grow = 1;   // the one model stays hidden (pop 0) until the merge
        return anim(0.8, function (k) { V.legacyIn = k; }, ease.linear, 'legacy');
      }).then(function () {
        if (!ctx.alive()) return;
        return stage.wait(1.1, 'legacy');
      }).then(function () {
        if (!ctx.alive()) return;
        return anim(1.5, function (k) { V.merge = k; }, ease.inOutCubic, 'legacy');
      }).then(function () {
        if (!ctx.alive()) return;
        V.legacy = 0; main.T.card = 1;
      });
    }
    function wordsShot(ctx) {
      setScene('words', ctx);
      T.rows = 1; main.T.card = 0;
      V.morph = 0; V.wires = 0;
      if (ctx.instant) { V.rows = 1; main.V.card = 0; V.morph = 1; V.wires = 1; return; }
      return stage.wait(1.9, 'words').then(function () {
        if (!ctx.alive()) return;
        return anim(1.6, function (k) { V.morph = k; }, ease.linear, 'words');
      }).then(function () {
        if (!ctx.alive()) return;
        return anim(0.9, function (k) { V.wires = k; }, ease.inOutCubic, 'words');
      });
    }
    /* end — the closing credits: LaLa-Policy bows out, the night sky stays */
    function endShot(ctx) {
      setScene('end', ctx);   // LaLa-Policy without its labels
      stage.cancel('grow');
      if (ctx.instant) { main.grow = 0; return; }
      var g0 = main.grow;
      return anim(0.55, function (k) { main.grow = g0 * (1 - k); }, ease.inBack, 'grow');
    }

    /* ---------------------------------------------------------------- the backgrounds, as the page mixes them */
    function lookOf(name) { return LOOK[name] || LOOK.paper; }   // 'paper' b, 'chart' b fainter, 'sky' c

    /* ---------------------------------------------------------------- per frame */
    stage.onUpdate(function (dt, t) {
      var n = stage.night, kk = 1 - Math.exp(-dt * 3.2);
      V.data += (T.data - V.data) * kk; V.rows += (T.rows - V.rows) * kk; V.robot += (T.robot - V.robot) * kk;

      /* domain-specific models → merge into one stack */
      var lg = V.legacy, mg = V.merge;
      legacy.forEach(function (g, i) {
        var u = g.userData, local = clamp01(mg * 1.25 - (Math.abs(u.x0) / (LEG_X * 1.5)) * 0.25), e = ease.inOutCubic(local);
        var pin = clamp01((V.legacyIn * 0.9 - i * 0.06) / 0.45);   // pop in one after another
        g.visible = lg > 0.01 && mg < 0.98 && pin > 0;
        g.position.set(lerp(u.x0, 0, e), lerp(u.y0, 0.95, e), lerp(u.z0, 0, e));
        g.scale.setScalar(Math.max(1e-4, lerp(1.3, 0.4, local) * ease.outBack(pin)));
        u.label.material.opacity = 1 - smooth(0.0, 0.25, local);
      });
      var pop = lg > 0.01 ? clamp01((mg - 0.62) / 0.38) : 1;
      main.pop = lg > 0.01 ? (pop > 0 ? ease.outBack(pop) : 0) : 1;

      rippleMat.uniforms.uBoost.value = lerp(1.0, 2.2, n);
      actMat.emissiveIntensity = lerp(1.0, 2.0, n);
      models.forEach(function (M) { M.update(dt, t); });
      var Lm = main.L;
      stage.labels.show('latent', labelGroup === 'latent' && main.V.explode > 0.5);
      stage.labels.show('policy', labelGroup === 'policy' && main.V.policy > 0.9);

      /* numbers → words */
      var rws = clamp01(V.rows);
      rowGroup.visible = rws > 0.01;
      rows.forEach(function (R, i) {
        var u = clamp01((V.morph - i * 0.09) / 0.55);
        if (Math.abs(u - R.u) > 0.02 || R.u < 0 || (u !== R.u && (u === 0 || u === 1))) { paintRow(R, u); R.u = u; }
        var local = clamp01(rws * 1.4 - i * 0.08);
        R.mesh.material.opacity = local; R.mesh.position.x = -3.85 - (1 - ease.outCubic(local)) * 0.4;
        A.set(R.mesh.position.x + ROW_W * ROW_K / 2 + 0.01, R.mesh.position.y, R.mesh.position.z);
        Cv.set(-PL / 2 - 0.01, Lm.yLM0 + 0.12, 0); B.set(lerp(A.x, Cv.x, 0.55), lerp(A.y, Cv.y, 0.85), lerp(A.z, Cv.z, 0.5));
        R.wire.set(A, B, Cv); R.wire.material.uniforms.uO.value = rws * clamp01(V.wires * 1.3 - i * 0.06);
      });

      /* data cards: tier 1 = control domains; tier 2 = video + image edit, drops in second; tier 3 = the robot
         demonstrations (the opening), on their own clock */
      var d1 = clamp01(V.data), d2 = clamp01(V.data - 1), d3 = clamp01(V.robot);
      data.visible = d1 > 0.01; rdata.visible = d3 > 0.01;
      if (V.data < 0.02) data.rotation.y = dataTurn; else if (T.data > 0) data.rotation.y += (dataTurn - data.rotation.y) * kk;   // leaving, it keeps its turn
      dataCards.forEach(function (C) {
        if (C.born < 1) C.born = Math.min(1, C.born + dt / 0.6);   // a card whose file came late drops in on its own
        var local = Math.min(C.born, C.tier === 1 ? clamp01(d1 * 1.5 - C.stag) : C.tier === 2 ? clamp01(d2 * 1.6 - C.stag)
          : clamp01(d3 * 1.5 - 0.5 * C.ri / Math.max(1, NRB - 1)));
        C.grp.position.y = C.home.y + (1 - ease.outCubic(local)) * (C.tier === 1 ? 0.25 : 1.6);
        C.shadow.material.opacity = local;
        stage.fx.setUniform(C.streams, 'uOpacity', local);
        var cc = lerp(1, 0.82, n);
        if (C.kind === 'pair') {
          C.fade = Math.min(1, C.fade + dt / 0.25);
          C.planes.forEach(function (m, k) { var fr = k === C.front; m.material.opacity = local * (fr ? 1 : 1 - C.fade); m.material.color.setScalar(cc);
            m.position.z = fr ? 0.003 : 0; m.renderOrder = fr ? 7 : 6; });
          if (local > 0.5) {
            C.next -= dt;
            if (C.next <= 0) {
              C.next = C.oe ? 2.4 : 0.85;   // tier 1: a new transition every 0.85 s
              if (C.oe) { C.step = (C.step + 1) % oe.length; var o = oe[C.step];
                stepPairCard(C, img['oe:' + o.key + ':cur'], img['oe:' + o.key + ':fut'], o.text, 'OmniEdit', 'Image edit · no action label', [3, 2]); }
              else { C.step = (C.step + 1) % C.d.steps.length; var st = C.d.steps[C.step];
                stepPairCard(C, img[C.d.key + ':' + st.a], img[C.d.key + ':' + st.b], st.text, C.d.name, groupTag[C.d.group] + ' · ' + C.d.dims + ' action', [C.d.w, C.d.h]); }
            }
          }
        } else if (C.kind === 'robot') {
          C.mats.forEach(function (m) { m.opacity = local; m.color.setScalar(cc); });
          C.views.forEach(function (w) { w.mat.uniforms.uO.value = local; w.mat.uniforms.uDim.value = cc; });
          if (local > 0.01) {
            C.vt += dt;
            var rf = Math.floor(C.vt * C.r.fps) % C.r.views[0].n;
            C.views.forEach(function (w) { setFrame(w.mat, w.atlas, w.img, rf); });
          }
        } else {
          C.mats.forEach(function (m) { m.opacity = local; m.color && m.color.setScalar(cc); });
          C.vmat.uniforms.uO.value = local; C.vmat.uniforms.uDim.value = cc;
          if (local > 0.01) {
            var v = C.v, len = v.atlas.n / v.fps;
            C.vt = (C.vt + dt) % len;
            setFrame(C.vmat, C.vatlas, C.vimg, Math.floor(C.vt * v.fps));
            var ci = Math.min(v.caps.length - 1, Math.floor(C.vt / v.step));   // one caption per 0.5 s of video
            if (ci !== C.capIdx) { C.capIdx = ci; paintCaption(C, v.caps[ci]); }
          }
        }
      });
      ringMat.uniforms.uO.value = V.train > 0.001 ? V.ringO : 0;
      ringMat.uniforms.uP.value = V.train;
      cables.forEach(function (c) { c.material.uniforms.uTime.value = t; c.material.uniforms.uBoost.value = lerp(1, 1.6, n); });
    });

    /* ---------------------------------------------------------------- warm-up: every program compiled and every texture
       on the GPU before its chapter, so a shot change never stalls (a few uploads per frame, after the model stands) */
    var warmQueue = [];
    function warm(root) {
      root.traverse(function (o) {
        (o.material ? [].concat(o.material) : []).forEach(function (m) {
          ['map', 'emissiveMap'].forEach(function (k) { if (m[k] && m[k].isTexture) warmQueue.push(m[k]); });
          if (m.uniforms) Object.keys(m.uniforms).forEach(function (k) { var v = m.uniforms[k].value; if (v && v.isTexture) warmQueue.push(v); });
        });
      });
    }
    stage.onUpdate(function () {
      for (var budget = 4e6; budget > 0 && warmQueue.length;) {   // pixels per frame
        var t = warmQueue.shift(), im = t.image; if (!im) continue;
        budget -= (im.width || 1) * (im.height || 1); stage.renderer.initTexture(t);
      }
    });

    /* ---------------------------------------------------------------- boot */
    window.__lala = { T: T, V: V, main: main, dataCards: dataCards, stage: stage, charts: charts, SHOTS: SHOTS };   // for the console
    main.playWorld(WORLD_SEQ, 0, { instant: true });
    stage.renderer.compile(scene, stage.camera);
    stage.start();
    stage.ready();
    setTimeout(function () { warm(scene); }, 1600);

    var byShot = {}; SHOTS.forEach(function (s, i) { byShot[s.key] = i; });
    var box3 = new THREE.Box3();
    return {
      stage: stage, shots: SHOTS, byShot: byShot,
      goShot: function (i, o) { return stage.goShot(i, o); },
      get shot() { return stage.shotIndex; },
      /* the lens that scales and moves shot i's box (seen from its framing) into `rect` (NDC, y up), for stage.lens; a shot
         without one (a chart: nothing of the stage in its frame) keeps the film's framing */
      fitShot: function (i, rect, sMax) {
        var sh = SHOTS[i], b = sh.key === 'start' && compact ? OPEN.compact : sh.box;
        if (!b) return { s: 1, x: 0, y: 0 };
        var p = stage.projectBox(box3.set(box3.min.fromArray(b), box3.max.fromArray(b, 3)), viewOf(sh.key === 'evolve' ? EVOLVE_NEAR : sh));
        var s = Math.min((rect.x1 - rect.x0) / (p.x1 - p.x0), (rect.y1 - rect.y0) / (p.y1 - p.y0));
        s = Math.max(0.3, Math.min(sMax || 1.2, s));
        return { s: s, x: (rect.x0 + rect.x1) / 2 - s * (p.x0 + p.x1) / 2, y: (rect.y0 + rect.y1) / 2 - s * (p.y0 + p.y1) / 2 };
      },
      /* a narrow opening frame: the lens fits the model and the cards nearest it (OPEN.compact), the rest is cut */
      setCompact: function (on) { compact = !!on; },
      /* the turn about the model that goes with the scroll (degrees); snap: from there at once (a new chapter) */
      setYaw: function (deg, snap) { stage.orbit.yaw = THREE.MathUtils.degToRad(deg); if (snap) stage.orbit.snap = true; },
      /* the picture's opacity over the background: the page fades a chapter's model (or chart) in and out with the scroll */
      setFade: function (v) { stage.fade.v = v; },
      /* the picture only inside a rectangle of the canvas (px: x0, y0, x1, y1, soft), or everywhere (null) */
      setMask: function (r) {
        var m = stage.mask; m.on = !!r;
        if (r) { m.x0 = r.x0; m.y0 = r.y0; m.x1 = r.x1; m.y1 = r.y1; if (r.soft != null) m.soft = r.soft; }
      },
      /* the backgrounds, by name ('paper' b, 'chart' b fainter, 'sky' c): one look; or two, the second from `at` (screens
         from the top) down, as the next section of the page scrolls in; or a's pass at u (0 … 1), over the whole screen */
      look: function (name) { stage.bg.to(lookOf(name), 0); stage.bg.split(null); },
      split: function (above, below, at, soft) { stage.bg.to(lookOf(above), 0); stage.bg.split(lookOf(below), at, soft); },
      pass: function (u) { stage.bg.to(passLook(u), 0); stage.bg.split(null); },
      lookName: function (i) { var l = SHOTS[i].look; return l === LOOK.sky ? 'sky' : l === LOOK.chart ? 'chart' : 'paper'; },
      isNight: function (name) { return lookOf(name).night > 0.5; },
      /* the model's lighting (studio or night), and the page's colours */
      setLight: function (night) { stage.bg.light = night ? 1 : 0; },
      setNight: function (on) { if ((stage.mode === 'night') !== !!on) stage.setMode(on ? 'night' : 'studio', null); },
      setPaused: stage.setPaused,
      /* the files that come after the model: the OpenVid clips (media-video.js) and the robot demonstrations (robot.js) */
      addVideo: function () { return window.LALA_MEDIA_VIDEO ? addVideo(window.LALA_MEDIA_VIDEO) : Promise.reject(new Error('no video media')); },
      addRobots: function () { return window.LALA_ROBOT_MEDIA ? addRobots(window.LALA_ROBOT_MEDIA) : Promise.reject(new Error('no robot media')); },
      /* a chart chapter's pin, every frame (see LalaCharts' place); null when none is on the screen */
      placeChart: function (f) { charts.place(f); }
    };
  }
})();
