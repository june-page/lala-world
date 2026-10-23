/* LaLa-World project page — the 3D stage (from the LaLa 3D film, claude-3d-model_v6/assets/lala-stage.js).
   Classic script so the page also works when opened from file:// (local ES modules would be blocked).
   lala-world.js loads three.js from the CDN and calls
     LalaStage.create({ THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass }, config)
   The stage owns: renderer + bloom, studio / night lighting, the background layer, camera shots, 3D-anchored labels and
   small texture/geometry helpers. The product lives in lala-world.js; the page (page.js) owns every DOM element.

   What changed from the film: the page scrolls, so
     - the visitor's camera (`rig`) is what the shots fly and OrbitControls turns (drag to rotate; the wheel scrolls);
     - the camera that renders (`camera`) is the rig turned about the target by `orbit.yaw` (scroll-linked, eased)
       and seen through a `lens`: a scale and shift after projection, so the page can frame the model in a band and
       move it with its chapter as the chapter scrolls;
     - `fade` mixes everything but the background toward the background, so a chapter's model can come and go with it;
     - the titles are the page's (config.caption, if given, still hears goShot's captionAt), and with config.pageBg
       the page owns the background too.

   Background: one full-screen shader layer mixes the studio sweep, the night sky of the talk's section slides and the
   LaLa-World poster. stage.bg.to({...}, seconds) eases its parameters, so a shot can dissolve one into another:
     night  0 studio … 1 night sky        amt   poster opacity          lift  poster pulled toward white   sat  its saturation
     band   0 full frame … 1 lower band   blur  0 sharp … 1 blurred   zoom/panU/panV  poster framing (cover fit × zoom;
                                                                     zoom < 1: its blurred edges run on into the base)
     glow   bloom strength (0 studio … 1 night)
   The light rig follows `night` (it swaps at the halfway point). */
(function () {
  'use strict';

  var FONT = '"Inter V", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
  var MONO = '"JetBrains Mono V", ui-monospace, Menlo, Consolas, monospace';

  /* Colour language of the film. LaLa-World: vision encoder = warm (red → orange), language model = cool
     (blue → violet), LaLa-Policy action generator = green → teal. Language text = indigo. Glow variants are brighter. */
  var COLORS = {
    ve: '#F0472E', veGlow: '#FF7A45', ve2: '#F28A1E', ve2Glow: '#FFB04D',
    lm: '#3E6BF0', lmGlow: '#6F9BFF', lm2: '#8653F0', lm2Glow: '#B58CFF',
    act: '#0EA88F', actGlow: '#2FE0C2', act2: '#22B8C9', act2Glow: '#5FE6F0',
    lang: '#3A2E9E', langNight: '#C9C0FF',
    violet: '#5B4EA2', night: '#0B0925', night2: '#151039', night3: '#241A5C',
    gold: '#F1D17D', cream: '#F8F5EE', lav: '#BFB8D5', ink: '#1d1d1f'
  };

  var ease = {
    linear: function (t) { return t; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    inOutQuint: function (t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    inBack: function (t) { var s = 1.70158; return (s + 1) * t * t * t - s * t * t; },
    outBack: function (t) { var s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
    outBackSoft: function (t) { var s = 0.9; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
  };
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // deterministic PRNG so every load looks the same
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(a, b) { var h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* The size the canvas is drawn at: the full width, and the large viewport height (100lvh), so a phone's toolbar
     sliding in and out never resizes the renderer. */
  var probe = null;
  function viewSize() {
    if (!probe) {
      probe = el('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
      document.body.appendChild(probe);
    }
    return { w: document.documentElement.clientWidth || window.innerWidth, h: Math.max(probe.offsetHeight, window.innerHeight) };
  }

  function create(lib, config) {
    var THREE = lib.THREE;
    var fontsReady = document.fonts && document.fonts.load ?   // canvas textures need the faces loaded, not just declared
      Promise.all([document.fonts.load('600 32px "Inter V"'), document.fonts.load('500 32px "JetBrains Mono V"')]).catch(function () {}) :
      Promise.resolve();

    /* ------------------------------------------------------------ renderer */
    var size = viewSize(), W = size.w, H = size.h;
    var renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    var small = Math.min(W, H) < 700 || matchMedia('(pointer: coarse)').matches;
    var pr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2, Math.max(1, Math.sqrt(7.5e6 / (W * H))));   // ≤ 7.5 MP drawn
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.className = 'lala';
    (config.host || document.body).appendChild(renderer.domElement);
    var maxAniso = renderer.capabilities.getMaxAnisotropy();

    var scene = new THREE.Scene();
    var cam0 = config.camera || {};
    var baseFov = cam0.fov || 28;   // shots are framed for 16:9; narrower screens get a wider vertical fov
    var fitCap = config.fitCap || 1e9;
    function effFov(f) {
      var k = Math.min(fitCap, Math.max(1, (16 / 9) / (W / H)));
      return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f) / 2) * k));
    }
    var rig = new THREE.PerspectiveCamera(effFov(baseFov), W / H, 0.05, 200);      // the shots fly it, the visitor turns it
    var camera = new THREE.PerspectiveCamera(effFov(baseFov), W / H, 0.05, 200);   // what renders: rig + orbit + lens
    rig.position.fromArray(cam0.pos || [0, 3, 8]);

    var controls = new lib.OrbitControls(rig, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.enableZoom = false;   // the wheel scrolls the page
    controls.enablePan = false;
    controls.rotateSpeed = 0.6;
    controls.minPolarAngle = 0.12; controls.maxPolarAngle = 1.5;
    controls.target.fromArray(cam0.target || [0, 0, 0]);
    controls.update();
    renderer.domElement.style.touchAction = 'pan-y';   // a vertical swipe scrolls the page, a sideways one turns the model
    var interacting = false;
    controls.addEventListener('start', function () { interacting = true; cancel('drift'); if (config.onInteract) config.onInteract(); });
    controls.addEventListener('end', function () { interacting = false; });

    var rtt = new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples: small ? 2 : 4 });
    var composer = new lib.EffectComposer(renderer, rtt);
    composer.setPixelRatio(pr);
    composer.setSize(W, H);
    composer.addPass(new lib.RenderPass(scene, camera));
    var bloom = new lib.UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.2, 0.45, 2.0);
    composer.addPass(bloom);
    composer.addPass(new lib.OutputPass());

    /* ------------------------------------------------------------ studio lighting (environment map) */
    var pmrem = new THREE.PMREMGenerator(renderer);
    function buildEnv(mode) {
      var s = new THREE.Scene();
      var night = mode === 'night';
      var dome = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(night ? '#4a3d92' : '#f4f4f6').multiplyScalar(night ? 0.8 : 1.0) },
          mid: { value: new THREE.Color(night ? '#2c2260' : '#c4c4cb').multiplyScalar(night ? 0.7 : 0.8) },
          bot: { value: new THREE.Color(night ? '#0c0a24' : '#38383e').multiplyScalar(0.5) }
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;' +
          'void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.9, y)) : mix(mid, bot, smoothstep(0.0, 0.5, -y));' +
          ' gl_FragColor = vec4(c, 1.0); }'
      }));
      s.add(dome);
      function panel(w, h, pos, intensity, color, gradient) {
        var mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color || '#ffffff').multiplyScalar(intensity), side: THREE.DoubleSide });
        if (gradient) {   // vertical falloff: gives glass a light-to-dark sweep instead of a flat tone
          var gc = el('canvas'); gc.width = 4; gc.height = 256; var gg = gc.getContext('2d'), lg = gg.createLinearGradient(0, 0, 0, 256);
          lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.45, '#9a9a9a'); lg.addColorStop(1, '#0a0a0a');
          gg.fillStyle = lg; gg.fillRect(0, 0, 4, 256);
          mat.map = new THREE.CanvasTexture(gc); mat.map.colorSpace = THREE.SRGBColorSpace;
        }
        var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.fromArray(pos); m.lookAt(0, pos[1] * 0.35, 0); s.add(m);
      }
      panel(16, 7, [0, 15, 3], 2.0, night ? '#cfc6ff' : '#ffffff');
      panel(26, 12, [0, 8, -15], night ? 2.4 : 1.45, night ? '#b7a8ff' : '#ffffff', true);
      panel(1.8, 16, [-13, 3, -6], night ? 5.0 : 2.8, night ? '#b9a6ff' : '#ffffff');
      panel(1.8, 16, [13, 3, -6], night ? 5.0 : 2.8, night ? '#ffd29a' : '#ffffff');
      panel(18, 3.2, [0, 2, 15], night ? 0.9 : 1.1, night ? '#8f7fe0' : '#ffffff');
      panel(6, 6, [-10, 9, 9], night ? 1.0 : 1.3, night ? '#e9e4ff' : '#ffffff');
      var tex = pmrem.fromScene(s, 0.03).texture;
      s.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      return tex;
    }
    var envs = { studio: buildEnv('studio'), night: buildEnv('night') };

    /* ------------------------------------------------------------ background layer (screen space) */
    function canvas(w, h) { var c = el('canvas'); c.width = w; c.height = h; return c; }
    function texture(c, srgb) {
      var t = new THREE.CanvasTexture(c);
      if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso; return t;
    }
    var studioCanvas = canvas(8, 8), nightCanvas = canvas(8, 8), nightSky = null;
    function ellipse(g, cx, cy, rx, ry, stops) {   // CSS radial-gradient(rx ry at cx cy, …) over the 1920×1080 page
      g.save(); g.translate(cx, cy); g.scale(rx / ry, 1);
      var rg = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      stops.forEach(function (st) { rg.addColorStop(st[0], st[1]); });
      g.fillStyle = rg; g.fillRect(-cx * ry / rx - 1, -cy - 1, 1920 * ry / rx + 2, 1080 + 2); g.restore();
    }
    var studioTex = texture(studioCanvas), nightTex = texture(nightCanvas);
    function paintBackgrounds() {
      var w = Math.min(2048, Math.round(W * 1.25)), h = Math.round(w * H / W);
      studioCanvas.width = nightCanvas.width = w; studioCanvas.height = nightCanvas.height = h;
      var g = studioCanvas.getContext('2d');
      var rg2 = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.hypot(w, h) * 0.62);
      rg2.addColorStop(0, '#ffffff'); rg2.addColorStop(0.45, '#f7f7f9'); rg2.addColorStop(1, '#dedee3');
      g.fillStyle = rg2; g.fillRect(0, 0, w, h);
      /* the night: the talk's section slides (deck.css .night-bg), laid out on their 1920×1080 page, cover-fit */
      g = nightCanvas.getContext('2d');
      var sc = Math.max(w / 1920, h / 1080);
      g.setTransform(sc, 0, 0, sc, (w - 1920 * sc) / 2, (h - 1080 * sc) / 2);
      var lg = g.createLinearGradient(0, 0, 0, 1080);
      lg.addColorStop(0, '#0A0823'); lg.addColorStop(0.48, '#0E0A2E'); lg.addColorStop(1, '#19113F');
      g.fillStyle = lg; g.fillRect(0, 0, 1920, 1080);
      ellipse(g, 960, 1080 * 1.18, 1920 * 1.2, 1080 * 0.7, [[0, 'rgba(108,70,220,.55)'], [0.32, 'rgba(62,40,150,.32)'], [0.62, 'rgba(11,9,37,0)']]);
      if (nightSky) g.drawImage(nightSky, 0, 0, 1920, 1080);
      ellipse(g, 960, 1080 + 30, 2304 * 0.5, 300, [[0, 'rgba(241,209,125,.10)'], [0.7, 'rgba(241,209,125,0)']]);   // the gold haze at the foot
      g.setTransform(1, 0, 0, 1, 0, 0);
      studioTex.needsUpdate = true; nightTex.needsUpdate = true;
    }
    var blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
    /* the background at a screen position: the layer under the scene, and what the fade below mixes toward. Two looks can
       share the screen: the second one from an edge up the screen down (the page's next section scrolling in), whole below
       the edge, mixed over a soft band above it */
    var LOOK_U = ['Night', 'Amt', 'Lift', 'Band', 'Blur', 'Top', 'Sat', 'PUV', 'Feather'];
    var BG_GLSL = [
      'uniform sampler2D tStudio; uniform sampler2D tNight; uniform sampler2D tPoster; uniform sampler2D tPosterBlur; uniform vec2 uEdge;',
      LOOK_U.map(function (n) { return 'uniform ' + (n === 'PUV' ? 'vec4' : 'float') + ' u' + n + '; uniform ' + (n === 'PUV' ? 'vec4' : 'float') + ' u' + n + '2;'; }).join(' '),
      'vec3 lalaLook(vec2 vUv, float night, float amt, float lift, float band, float blur, float top, float sat, vec4 puv, float feather){',
      '  vec3 base = mix(texture2D(tStudio, vUv).rgb, texture2D(tNight, vUv).rgb, night);',
      '  vec2 p = vUv * puv.xy + puv.zw;',
      '  float side = max(-p.x, p.x - 1.0);',   // > 0 beyond the poster's sides (zoomed out)
      '  float soft = feather > 0.0 ? max(blur, smoothstep(-feather, 0.0, side)) : blur;',
      '  vec3 post = mix(texture2D(tPoster, p).rgb, texture2D(tPosterBlur, p).rgb, soft);',
      '  post = mix(vec3(dot(post, vec3(0.2126, 0.7152, 0.0722))), post, sat);',
      '  post = mix(post, vec3(1.0), lift);',
      '  float a = amt * mix(1.0, 1.0 - smoothstep(0.04, 0.46, vUv.y), band);',
      '  a *= step(0.0, p.y) * step(p.y, 1.0);',
      '  if (feather > 0.0) a *= 1.0 - smoothstep(0.0, 2.2 * feather, side);',   // zoomed out: the blurred edge runs on, then fades
      '  vec3 col = mix(base, post, a);',
      '  return col * (1.0 - top * (0.55 * smoothstep(0.55, 1.0, vUv.y)));',   // darker sky behind the title
      '}',
      'vec3 lalaBackground(vec2 vUv){',
      '  float k = uEdge.x < -1.0 ? 0.0 : 1.0 - smoothstep(uEdge.x, uEdge.x + uEdge.y, vUv.y);',   // 1 below the edge
      '  vec3 c1 = k < 1.0 ? lalaLook(vUv, uNight, uAmt, uLift, uBand, uBlur, uTop, uSat, uPUV, uFeather) : vec3(0.0);',
      '  if (k <= 0.0) return c1;',
      '  vec3 c2 = lalaLook(vUv, uNight2, uAmt2, uLift2, uBand2, uBlur2, uTop2, uSat2, uPUV2, uFeather2);',
      '  if (k >= 1.0) return c2;',
      '  return pow(mix(pow(c1, vec3(0.4545)), pow(c2, vec3(0.4545)), k), vec3(2.2));',   // mixed as the eye sees it, not in linear light
      '}'].join('\n');
    var bgUniforms = { tStudio: { value: studioTex }, tNight: { value: nightTex }, tPoster: { value: blank }, tPosterBlur: { value: blank }, uEdge: { value: new THREE.Vector2(-2, 0.3) } };
    LOOK_U.forEach(function (n) { ['', '2'].forEach(function (k) { bgUniforms['u' + n + k] = { value: n === 'PUV' ? new THREE.Vector4(1, 1, 0, 0) : n === 'Sat' ? 1 : 0 }; }); });
    var bgMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false, uniforms: bgUniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BG_GLSL + '\nvarying vec2 vUv; void main(){ gl_FragColor = vec4(lalaBackground(vUv), 1.0); }'
    });
    var bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
    bgQuad.frustumCulled = false; bgQuad.renderOrder = -1e9; scene.add(bgQuad);
    scene.background = null;
    /* the fade: the whole picture but the background, mixed toward the background (before the bloom, so the glow goes too).
       The page fades a chapter's model in and out with the scroll; 1 = no pass at all */
    var fadeMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ tDiffuse: { value: null }, uFade: { value: 1 } }, bgUniforms),   // the background's own uniforms, shared
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: BG_GLSL + '\nuniform sampler2D tDiffuse; uniform float uFade; varying vec2 vUv;' +
        'void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(mix(lalaBackground(vUv), c.rgb, uFade), c.a); }'
    });
    var fadePass = new lib.ShaderPass(fadeMat);
    fadePass.enabled = false;
    composer.insertPass(fadePass, 1);   // after the render, before the bloom
    var fade = { v: 1 };

    var BG = { night: 0, glow: 0, amt: 0, lift: 0, band: 0, blur: 0, sat: 1, zoom: 1, panU: 0.5, panV: 0, top: 0 };
    var BG2 = Object.assign({}, BG), EDGE = { at: 9, soft: 0.3 };   // at: where the second look is whole (screens from the top)
    var posterAspect = 1;
    var bg = {
      v: BG,
      light: null,   // the lighting the model gets (night 0 … 1); null: the background's
      setNightSky: function (img) { nightSky = img; paintBackgrounds(); },
      setPoster: function (img, blurImg) {
        var t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.needsUpdate = true;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        bgUniforms.tPoster.value = t;
        var tb = new THREE.Texture(blurImg || img); tb.colorSpace = THREE.SRGBColorSpace; tb.needsUpdate = true;
        bgUniforms.tPosterBlur.value = tb;
        posterAspect = img.width / img.height;
      },
      /* ease the background toward `o` over `dur` seconds (0 = snap) */
      to: function (o, dur, easing) {
        cancel('bg');
        var from = Object.assign({}, BG), keys = Object.keys(o);
        if (!dur) { keys.forEach(function (k) { BG[k] = o[k]; }); return Promise.resolve(); }
        return anim(dur, function (k) { keys.forEach(function (key) { BG[key] = lerp(from[key], o[key], k); }); }, easing || ease.inOutCubic, 'bg');
      },
      /* a second look `o` from `at` (screens from the top) down, mixed over `soft` screens above it; no `o`: none */
      split: function (o, at, soft) {
        if (!o) { EDGE.at = 9; return; }
        Object.keys(o).forEach(function (k) { BG2[k] = o[k]; });
        EDGE.at = at; EDGE.soft = soft || 0.3;
      }
    };
    function setLook(L, k) {   // one look's uniforms (k: '' or '2')
      var A = W / H, z = Math.max(0.5, L.zoom);
      var sx = 1 / z, sy = posterAspect / (A * z);   // cover the screen width (the poster is taller than 16:9), then zoom
      if (sy > 1) { sy = 1; sx = A / posterAspect / z * 1; }
      var u = bgUniforms;
      u['uPUV' + k].value.set(sx, sy, L.panU * (1 - sx), L.panV * (1 - sy));
      u['uFeather' + k].value = sx > 1.001 ? Math.min(0.07, (sx - 1) * 0.6) : 0;   // narrower than the screen: soft sides
      u['uNight' + k].value = L.night; u['uAmt' + k].value = L.amt; u['uLift' + k].value = L.lift; u['uBand' + k].value = L.band;
      u['uBlur' + k].value = L.blur; u['uTop' + k].value = L.top; u['uSat' + k].value = L.sat;
    }
    function applyBackground() {
      setLook(BG, '');
      var two = EDGE.at < 1 + EDGE.soft;
      bgUniforms.uEdge.value.set(two ? 1 - EDGE.at : -2, EDGE.soft);
      if (two) setLook(BG2, '2');
      var cover = two ? clamp01(1 - EDGE.at + EDGE.soft / 2) : 0, glow = lerp(BG.glow, BG2.glow, cover);   // the glow of what fills the screen
      bloom.strength = lerp(0.2, 0.62, glow); bloom.threshold = lerp(2.0, 0.92, glow); bloom.radius = lerp(0.45, 0.5, glow);
      var n = bg.light != null ? bg.light : BG.night, envMode = n > 0.5 ? 'night' : 'studio';
      if (scene.environment !== envs[envMode]) scene.environment = envs[envMode];
      scene.environmentIntensity = lerp(1.0, 0.9, n);
    }

    var mode = config.bg || 'studio';
    var modeHandlers = [];
    /* night / studio: the page text colours switch at once (captions are hidden while shots change);
       the picture eases over `dur` seconds. */
    function setMode(m, dur) {   // dur === null: the caller eases the background itself (a shot's `look`)
      mode = m;
      document.documentElement.classList.toggle('night', m === 'night');
      if (dur !== null) bg.to({ night: m === 'night' ? 1 : 0, glow: m === 'night' ? 1 : 0 }, dur == null ? 1.6 : dur);
      modeHandlers.forEach(function (fn) { fn(m); });
    }

    /* ------------------------------------------------------------ clock + tasks */
    var clock = { t: 0, dt: 0 };
    var tasks = [], updates = [];
    function anim(dur, fn, easing, tag) {
      return new Promise(function (resolve) {
        var task = { t: 0, dur: Math.max(1e-4, dur), fn: fn, ease: easing || ease.inOutCubic, resolve: resolve, tag: tag };
        tasks.push(task); fn(task.ease(0), 0);
      });
    }
    function wait(sec, tag) { return anim(sec, function () {}, ease.linear, tag || 'wait'); }
    function cancel(tag) {
      for (var i = tasks.length - 1; i >= 0; i--) {
        if (!tag || tasks[i].tag === tag) { var tk = tasks[i]; tasks.splice(i, 1); tk.resolve(); }
      }
    }
    function onUpdate(fn) { updates.push(fn); }

    /* ------------------------------------------------------------ camera moves (orbit-style arcs around the target) */
    var tmpS0 = new THREE.Spherical(), tmpS1 = new THREE.Spherical(), tmpV = new THREE.Vector3();
    var flight = 0, limS = new THREE.Spherical(), tmpV2 = new THREE.Vector3();
    function stopSpin() {   // a drag's damping tail would keep turning the rig under a flight
      if (controls._sphericalDelta) controls._sphericalDelta.set(0, 0, 0);
    }
    /* view.limit = [azimuth, polar] radians either side of the view: how far a drag may turn it (none: all the way) */
    function setLimits(view) {
      var L = view && view.limit;
      if (L) limS.setFromVector3(tmpV.fromArray(view.pos).sub(tmpV2.fromArray(view.target || [0, 0, 0])));
      controls.minAzimuthAngle = L ? limS.theta - L[0] : -Infinity; controls.maxAzimuthAngle = L ? limS.theta + L[0] : Infinity;
      controls.minPolarAngle = L ? Math.max(0.12, limS.phi - L[1]) : 0.12; controls.maxPolarAngle = L ? Math.min(1.5, limS.phi + L[1]) : 1.5;
    }
    function flyTo(view, dur, easing) {
      var p1 = new THREE.Vector3().fromArray(view.pos), t1 = new THREE.Vector3().fromArray(view.target || [0, 0, 0]);
      var f1 = view.fov || baseFov, my = ++flight;
      cancel('camera'); cancel('drift'); stopSpin(); setLimits(null);
      if (!dur) {
        rig.position.copy(p1); controls.target.copy(t1); baseFov = f1; rig.fov = effFov(f1); rig.updateProjectionMatrix();
        rig.lookAt(t1); controls.enabled = true; setLimits(view); controls.update();
        return Promise.resolve();
      }
      var p0 = rig.position.clone(), t0 = controls.target.clone(), f0 = baseFov;
      tmpS0.setFromVector3(tmpV.copy(p0).sub(t0)); tmpS1.setFromVector3(tmpV.copy(p1).sub(t1));
      var r0 = tmpS0.radius, r1 = tmpS1.radius, ph0 = tmpS0.phi, ph1 = tmpS1.phi, th0 = tmpS0.theta, th1 = tmpS1.theta;
      var dth = th1 - th0; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
      controls.enabled = false;
      return anim(dur, function (k) {
        var tg = tmpV.copy(t0).lerp(t1, k);
        var sph = new THREE.Spherical(lerp(r0, r1, k), lerp(ph0, ph1, k), th0 + dth * k);
        rig.position.setFromSpherical(sph).add(tg);
        controls.target.copy(tg);
        baseFov = lerp(f0, f1, k); rig.fov = effFov(baseFov); rig.updateProjectionMatrix();
        rig.lookAt(tg);
      }, easing || ease.inOutCubic, 'camera').then(function () {
        if (my === flight) { controls.enabled = true; setLimits(view); controls.update(); }   // not when a newer flight cut this one short
      });
    }
    /* slow orbit: `deg` degrees of azimuth (and `rise` units of height) over `sec` seconds; a drag ends it */
    function drift(deg, sec, rise) {
      cancel('drift');
      if (interacting) return Promise.resolve();
      var t0 = controls.target.clone(), s = new THREE.Spherical().setFromVector3(tmpV.copy(rig.position).sub(t0));
      var th0 = s.theta, y0 = rig.position.y, dth = THREE.MathUtils.degToRad(deg);
      return anim(sec, function (k) {
        s.theta = th0 + dth * k;
        rig.position.setFromSpherical(s).add(t0); rig.position.y = y0 + (rise || 0) * k;
        rig.lookAt(t0);
      }, ease.inOutSine, 'drift');
    }

    /* ------------------------------------------------------------ the render camera: rig + scroll orbit + lens */
    var orbit = { yaw: 0, snap: false }, orbitV = { yaw: 0 };   // radians about the target's vertical; the page sets orbit, the stage eases
    var lens = { s: 1, x: 0, y: 0, snap: false }, lensV = { s: 1, x: 0, y: 0 };   // after projection: NDC scale, shift (y > 0: up)
    var lensM = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0), qYaw = new THREE.Quaternion();
    function syncCamera(dt) {
      var k = 1 - Math.exp(-dt * 5.5);
      if (orbit.snap) { orbitV.yaw = orbit.yaw; orbit.snap = false; }   // a new chapter starts from its own turn, not the last one's
      orbitV.yaw += (orbit.yaw - orbitV.yaw) * k;
      if (lens.snap) { lensV.s = lens.s; lensV.x = lens.x; lensV.y = lens.y; }
      else { var kl = 1 - Math.exp(-dt * 4.2); lensV.s += (lens.s - lensV.s) * kl; lensV.x += (lens.x - lensV.x) * kl; lensV.y += (lens.y - lensV.y) * kl; }
      qYaw.setFromAxisAngle(UP, orbitV.yaw);
      camera.position.copy(rig.position).sub(controls.target).applyQuaternion(qYaw).add(controls.target);
      camera.quaternion.copy(rig.quaternion).premultiply(qYaw);
      camera.fov = rig.fov; camera.aspect = rig.aspect;
      camera.updateProjectionMatrix();
      lensM.set(lensV.s, 0, 0, lensV.x, 0, lensV.s, 0, lensV.y, 0, 0, 1, 0, 0, 0, 0, 1);
      camera.projectionMatrix.premultiply(lensM);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld();
    }
    /* the screen box (NDC) of a world-space box seen from `view` (a shot), before the lens */
    var probeCam = new THREE.PerspectiveCamera();
    function projectBox(box, view) {
      probeCam.fov = effFov(view.fov || baseFov); probeCam.aspect = W / H; probeCam.near = 0.05; probeCam.far = 200;
      probeCam.position.fromArray(view.pos); probeCam.lookAt(tmpV.fromArray(view.target || [0, 0, 0]));
      probeCam.updateProjectionMatrix(); probeCam.updateMatrixWorld();
      var out = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }, v = new THREE.Vector3();
      for (var i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(probeCam);
        out.x0 = Math.min(out.x0, v.x); out.x1 = Math.max(out.x1, v.x); out.y0 = Math.min(out.y0, v.y); out.y1 = Math.max(out.y1, v.y);
      }
      return out;
    }

    /* ------------------------------------------------------------ 3D-anchored labels with leader lines */
    var labLayer = el('div', 'labels'), svgNS = 'http://www.w3.org/2000/svg';
    labLayer.setAttribute('aria-hidden', 'true');
    var svg = document.createElementNS(svgNS, 'svg'); labLayer.appendChild(svg); (config.labelHost || document.body).appendChild(labLayer);
    var labels = [];
    var labelApi = {
      add: function (o) {
        var L = { anchor: o.anchor, dx: o.dx || 60, dy: o.dy || -40, group: o.group || 'default', on: false,
          div: el('div', 'lbl', o.html), line: document.createElementNS(svgNS, 'line'), dot: document.createElementNS(svgNS, 'circle') };
        L.dot.setAttribute('r', 2.6);
        svg.appendChild(L.line); svg.appendChild(L.dot); labLayer.appendChild(L.div);
        labels.push(L); return L;
      },
      show: function (group, on) {
        labels.forEach(function (L) { if (L.group === group) L.on = !!on; });
      }
    };
    var wpos = new THREE.Vector3();
    function updateLabels() {
      labels.forEach(function (L) {
        if (L.anchor.isObject3D) L.anchor.getWorldPosition(wpos); else wpos.copy(L.anchor);
        wpos.project(camera);
        var vis = L.on && wpos.z < 1;
        if (!vis && !L.shown) return;
        L.shown = vis;
        var x = (wpos.x * 0.5 + 0.5) * W, y = (-wpos.y * 0.5 + 0.5) * H;
        var sc = Math.min(1, W / 1600) * lensV.s, tx = x + L.dx * sc, ty = y + L.dy * sc, right = L.dx < 0;
        L.line.setAttribute('x1', x); L.line.setAttribute('y1', y);
        L.line.setAttribute('x2', tx + (right ? 6 : -6)); L.line.setAttribute('y2', ty);
        L.dot.setAttribute('cx', x); L.dot.setAttribute('cy', y);
        L.div.style.transform = 'translate(' + (right ? 'calc(' + tx + 'px - 100%)' : tx + 'px') + ',' + (ty - 11) + 'px)';
        L.div.style.textAlign = right ? 'right' : 'left';
        L.div.classList.toggle('on', vis); L.line.classList.toggle('on', vis); L.dot.classList.toggle('on', vis);
      });
    }

    /* ------------------------------------------------------------ shots */
    var shots = config.shots || [];
    var shotIndex = -1, seq = 0;
    /* o.instant: the shot's end state at once. o.cut: the camera is simply there (the page brings the picture in with the
       scroll), the shot's own motion still plays. config.pageBg: the page owns the background, shots leave it alone. */
    function goShot(i, o) {
      o = o || {};
      var s = shots[i]; if (!s) return Promise.resolve();
      shotIndex = i;
      var my = ++seq;
      var ctx = { instant: !!o.instant, cut: !!o.cut, alive: function () { return my === seq; }, shot: s, index: i };
      if (!config.pageBg) {
        if (s.bg && (s.bg !== mode || o.instant)) setMode(s.bg, s.look ? null : o.instant ? 0 : s.bgDur);
        if (s.look) bg.to(s.look, o.instant ? 0 : (s.bgDur != null ? s.bgDur : 1.6));
      }
      var dur = o.instant || o.cut ? 0 : (s.dur != null ? s.dur : 2.4);
      var view = config.view ? config.view(s, i) : s;   // the page adapts a shot's framing to the screen
      var pCam = flyTo(view, dur, s.ease);
      var pApply = s.apply ? Promise.resolve(s.apply(ctx)) : Promise.resolve();
      cancel('cap');
      if (config.caption) {
        if (o.instant) config.caption(i, true);
        else {   // the previous line leaves with the camera move; the new one arrives after it
          config.caption(i, false);
          wait(s.captionAt != null ? s.captionAt : 0.9, 'cap').then(function () { if (ctx.alive()) config.caption(i, true); });
        }
      }
      return Promise.all([pCam, pApply]);
    }

    var resizeTimer = 0;
    function resize() {
      var sz = viewSize();
      if (sz.w === W && Math.abs(sz.h - H) < 2) return;
      W = sz.w; H = sz.h;
      rig.aspect = W / H; rig.fov = effFov(baseFov); rig.updateProjectionMatrix();
      renderer.setSize(W, H, false); composer.setSize(W, H); bloom.setSize(W / 2, H / 2);
      clearTimeout(resizeTimer); resizeTimer = setTimeout(paintBackgrounds, 120);
      resizeHandlers.forEach(function (fn) { fn(W, H); });
    }
    var resizeHandlers = [];
    window.addEventListener('resize', resize);

    /* ------------------------------------------------------------ texture helpers */
    function rrect(g, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }
    function wrap(g, text, maxW) {
      var words = text.split(/\s+/), lines = [], cur = '';
      words.forEach(function (w) {
        var t = cur ? cur + ' ' + w : w;
        if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
      });
      if (cur) lines.push(cur);
      return lines;
    }
    function font(weight, px, family) { return weight + ' ' + px + 'px ' + (family || FONT); }
    function cover(g, img, x, y, w, h, r, src) {
      g.save(); rrect(g, x, y, w, h, r); g.clip();
      var sw = src ? src[2] : img.width, sh = src ? src[3] : img.height, sx = src ? src[0] : 0, sy = src ? src[1] : 0;
      var s = Math.max(w / sw, h / sh), iw = sw * s, ih = sh * s;
      g.drawImage(img, sx, sy, sw, sh, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); g.restore();
    }
    /* Soft rounded-rect shadow under a floating object (no floor plane, so the background stays seamless). */
    function softShadow(w, d, o) {
      o = o || {};
      var S = 256, blur = o.blur || 26, c = canvas(S, S), g = c.getContext('2d');
      var m = blur * 1.6, rw = S - m * 2, rh = (S - m * 2) * (d / w);
      g.shadowColor = 'rgba(0,0,0,' + (o.alpha || 0.55) + ')'; g.shadowBlur = blur; g.shadowOffsetX = 10000;
      rrect(g, m - 10000, (S - rh) / 2, rw, rh, (o.radius || 0.1) * rw); g.fillStyle = '#000'; g.fill();
      var t = texture(c);
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * S / rw, w * S / rw),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: o.opacity != null ? o.opacity : 1, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = -1;
      return mesh;
    }
    function loadImage(src) {
      return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
    }
    /* Average colour of an n×n grid of patches (centre square crop) — a stand-in for the latent patch grid. */
    var patchCanvas = null;
    function patches(img, n, src) {
      if (!patchCanvas || patchCanvas.width !== n) { patchCanvas = canvas(n, n); }
      var g = patchCanvas.getContext('2d', { willReadFrequently: true });
      var sw = src ? src[2] : img.width, sh = src ? src[3] : img.height, sx = src ? src[0] : 0, sy = src ? src[1] : 0;
      var s = Math.min(sw, sh);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, sx + (sw - s) / 2, sy + (sh - s) / 2, s, s, 0, 0, n, n);
      var d = g.getImageData(0, 0, n, n).data, out = { colors: [] };
      for (var i = 0; i < n * n; i++) {
        out.colors.push(new THREE.Color().setRGB(d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255, THREE.SRGBColorSpace));
      }
      return out;
    }

    /* ------------------------------------------------------------ geometry helpers */
    function roundedRectShape(w, h, r) {
      var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      r = Math.min(r, w / 2, h / 2);
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
      s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
      s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
      s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
      return s;
    }
    /* Flat rounded slab lying in XZ, centred, thickness along Y, with a small edge bevel. */
    function slab(w, d, h, r, bevel, curveSegs) {
      bevel = bevel == null ? Math.min(h * 0.35, 0.02) : bevel;
      var shape = roundedRectShape(w - bevel * 2, d - bevel * 2, Math.max(0.001, r - bevel));
      var geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, h - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel,
        bevelSize: bevel, bevelSegments: 4, curveSegments: curveSegs || 12 });
      geo.translate(0, 0, -(h - bevel * 2) / 2);
      geo.rotateX(-Math.PI / 2);
      geo.computeVertexNormals();
      return geo;
    }

    /* ------------------------------------------------------------ shared effects (light traces, glow frames, dots) */
    var pulseMats = [], timeMats = [];
    /* Flat strip along a polyline; `up` sets the strip normal (default: lies in XZ). aDist = length from the start. */
    function ribbon(points, width, up) {
      up = up || new THREE.Vector3(0, 1, 0);
      var pos = [], dist = [], side = [], idx = [], acc = 0, tg = new THREE.Vector3(), sd = new THREE.Vector3();
      for (var i = 0; i < points.length; i++) {
        var p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        tg.subVectors(b, a).normalize(); sd.crossVectors(tg, up).normalize().multiplyScalar(width / 2);
        if (i > 0) acc += p.distanceTo(points[i - 1]);
        pos.push(p.x + sd.x, p.y + sd.y, p.z + sd.z, p.x - sd.x, p.y - sd.y, p.z - sd.z); dist.push(acc, acc); side.push(1, -1);
        if (i < points.length - 1) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
      g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
      g.setIndex(idx); return { geometry: g, length: acc };
    }
    /* Light pulses travelling along a ribbon toward its end. uOpacity fades the whole trace. */
    function pulseMaterial(color, o) {
      o = o || {};
      var m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSpeed: { value: o.speed || 1.1 },
          uGap: { value: o.gap || 0.9 }, uLen: { value: o.len || 0.3 }, uBase: { value: o.base != null ? o.base : 0.3 },
          uPulse: { value: o.pulse != null ? o.pulse : 3.0 }, uOpacity: { value: o.opacity != null ? o.opacity : 0 }, uOffset: { value: o.offset || 0 } },
        vertexShader: 'attribute float aDist; attribute float aSide; varying float vDist; varying float vSide;' +
          'void main(){ vDist = aDist; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uTime; uniform float uSpeed; uniform float uGap; uniform float uLen;' +
          'uniform float uBase; uniform float uPulse; uniform float uOpacity; uniform float uOffset; varying float vDist; varying float vSide;' +
          'void main(){ float ph = fract((vDist - uTime * uSpeed) / uGap + uOffset);' +
          ' float pulse = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.06, uLen, ph));' +
          ' float edge = 1.0 - smoothstep(0.5, 1.0, abs(vSide));' +
          ' gl_FragColor = vec4(uColor * (1.0 + uPulse * pulse), uOpacity * edge * clamp(uBase + pulse, 0.0, 1.0)); }'
      });
      pulseMats.push(m); return m;
    }
    /* Emissive frame around a rounded rectangle, conic gradient through three colours, slowly turning.
       Lies in XZ (y = thickness). uI = intensity (HDR, > 1 blooms). */
    function glowFrame(w, d, inner, palette, o) {
      o = o || {};
      var shape = roundedRectShape(w, d, o.radius || 0.09);
      shape.holes.push(roundedRectShape(w - inner, d - inner, o.innerRadius || 0.06));
      var geo = new THREE.ExtrudeGeometry(shape, { depth: o.depth || 0.024, bevelEnabled: false, curveSegments: 16 });
      geo.rotateX(-Math.PI / 2);
      var mat = new THREE.ShaderMaterial({
        transparent: !!o.transparent,
        uniforms: { uTime: { value: 0 }, uI: { value: o.intensity || 1.5 }, uO: { value: 1 }, uA: { value: new THREE.Color(palette[0]) },
          uB: { value: new THREE.Color(palette[1]) }, uC: { value: new THREE.Color(palette[2]) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uTime; uniform float uI; uniform float uO; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; varying vec3 vP;' +
          'vec3 pal(float t){ t = fract(t); return t < 0.3333 ? mix(uA, uB, t * 3.0) : t < 0.6666 ? mix(uB, uC, (t - 0.3333) * 3.0) : mix(uC, uA, (t - 0.6666) * 3.0); }' +
          'void main(){ float a = atan(vP.z, vP.x) / 6.2831853 + 0.5; gl_FragColor = vec4(pal(a + uTime * 0.04) * uI, uO); }'
      });
      timeMats.push(mat);
      return new THREE.Mesh(geo, mat);
    }
    function setUniform(obj, name, value) {
      obj.traverse(function (n) { if (n.material && n.material.uniforms && n.material.uniforms[name]) n.material.uniforms[name].value = value; });
    }
    var cached = {};
    function dotTexture() {
      if (cached.dot) return cached.dot;
      var c = canvas(64, 64), g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.5, 'rgba(255,255,255,.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      return (cached.dot = texture(c));
    }
    function spacedText(g, text, x, y, spacing, align) {   // letter-spaced (canvas letterSpacing is not everywhere yet)
      var chars = Array.from(text), widths = chars.map(function (ch) { return g.measureText(ch).width; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
      var cx = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
      chars.forEach(function (ch, i) { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
      return total;
    }
    onUpdate(function (dt, t) {
      for (var i = 0; i < pulseMats.length; i++) pulseMats[i].uniforms.uTime.value = t;
      for (var j = 0; j < timeMats.length; j++) timeMats[j].uniforms.uTime.value = t;
    });

    /* ------------------------------------------------------------ loop */
    var last = performance.now(), frames = 0, readyFlag = false, paused = false, running = false;
    function step(dt) {
      clock.dt = dt; clock.t += dt;
      for (var i = 0; i < tasks.length; i++) {
        var tk = tasks[i]; tk.t += dt;
        var k = clamp01(tk.t / tk.dur); tk.fn(tk.ease(k), k);
        if (k >= 1) { tasks.splice(i, 1); i--; tk.resolve(); }
      }
      for (var j = 0; j < updates.length; j++) updates[j](dt, clock.t);
      applyBackground();
    }
    /* a GPU that cannot keep up gets fewer pixels: after the start has settled, 90 slow frames in a row step the pixel
       ratio down (three times at most, never below 1) */
    var slow = { t: 0, n: 0, sum: 0, cuts: 0 };
    function adapt(dt) {
      if (slow.cuts >= 3 || pr <= 1) return;
      slow.t += dt; if (slow.t < 5) return;
      slow.n++; slow.sum += dt;
      if (slow.n < 90) return;
      var avg = slow.sum / slow.n; slow.n = 0; slow.sum = 0;
      if (avg < 1 / 42) return;
      pr = Math.max(1, pr - 0.35); slow.cuts++;
      renderer.setPixelRatio(pr); renderer.setSize(W, H, false); composer.setPixelRatio(pr); composer.setSize(W, H);
    }
    function frame(now) {
      if (paused) { running = false; return; }
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      adapt(dt);
      step(dt);
      controls.update();
      if (config.onFrame) config.onFrame(dt);   // the page reads the scroll here: the picture moves in the same frame as the page
      syncCamera(dt);
      updateLabels();
      var fv = clamp01(fade.v);
      fadePass.enabled = fv < 0.999; fadeMat.uniforms.uFade.value = fv;
      var lo = fv < 0.999 ? fv.toFixed(3) : '';
      if (labLayer.style.opacity !== lo) labLayer.style.opacity = lo;   // the labels go with the model
      composer.render();
      frames++;
      if (readyFlag && frames === 3 && config.onFirstFrames) config.onFirstFrames();
    }
    function run() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

    paintBackgrounds();
    var stage = {
      THREE: THREE, scene: scene, camera: camera, rig: rig, renderer: renderer, controls: controls, composer: composer, bloom: bloom,
      fontsReady: fontsReady, clock: clock, colors: COLORS, ease: ease, rng: rng, hash: hash, smooth: smooth, clamp01: clamp01, lerp: lerp,
      FONT: FONT, MONO: MONO,
      get mode() { return mode; }, get night() { return bg.light != null ? bg.light : BG.night; }, setMode: setMode, onMode: function (fn) { modeHandlers.push(fn); },
      bg: bg, onUpdate: onUpdate, anim: anim, wait: wait, cancel: cancel, flyTo: flyTo, drift: drift,
      labels: labelApi, goShot: goShot, get shotIndex() { return shotIndex; },
      orbit: orbit, lens: lens, fade: fade, projectBox: projectBox, effFov: effFov,
      get size() { return { w: W, h: H }; }, onResize: function (fn) { resizeHandlers.push(fn); },
      get interacting() { return interacting; },
      tex: { canvas: canvas, texture: texture, rrect: rrect, wrap: wrap, font: font, cover: cover },
      softShadow: softShadow, loadImage: loadImage, patches: patches,
      geo: { roundedRectShape: roundedRectShape, slab: slab },
      fx: { ribbon: ribbon, pulseMaterial: pulseMaterial, glowFrame: glowFrame, setUniform: setUniform, dotTexture: dotTexture, spacedText: spacedText },
      /* the page stops drawing while nothing on screen changes (the closing credits over a still sky) */
      setPaused: function (p) { paused = !!p; if (!paused) run(); },
      start: function () { setMode(mode, 0); run(); },
      ready: function () { readyFlag = true; }
    };
    return stage;
  }

  window.LalaStage = { create: create, COLORS: COLORS, FONT: FONT };
})();
