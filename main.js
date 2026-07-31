// AURA Robot Activity — Main Application Logic
// Load order matters (see index.html): three.min.js, then quiz-questions.js, then this file.
// LANDMARK_QUESTIONS comes from quiz-questions.js, loaded as a plain script just before this one.

(function(){
  const WORLD_SIZE = 1620;
  const BOUNDARY_LIMIT = WORLD_SIZE / 2 - 2;
  const GRID_SIZE = 6; // Grid cell size in world units for Nature Placement

  const paletteEl = document.getElementById('palette');
  const toggleBtn = document.getElementById('toggleBtn');
  toggleBtn.addEventListener('click', () => {
    paletteEl.classList.toggle('collapsed');
    toggleBtn.textContent = paletteEl.classList.contains('collapsed') ? '►' : '◄';
    toggleBtn.title = paletteEl.classList.contains('collapsed') ? 'Expand Toolbar' : 'Collapse Toolbar';
  });

  const COLORS = { bg: 0xF4E8D6, orange: 0xFF5E13, orangeDk: 0xDF3C00, outline: 0x000000, grey: 0x33353D, greyLt: 0x4A4D57 };

  // ---------- BUILD DISPENSER MATERIAL TYPES ----------
  // Order here also controls the left/right cycling order while in Build Mode.
  const BLOCK_TYPES = {
    "🪵 Wood Block": { color: 0xA0632E, opacity: 1.0, metal: false },
    "🧱 Concrete Block": { color: 0x9AA3B0, opacity: 1.0, metal: false },
    "🔷 Glass Block": { color: 0x8ECDF7, opacity: 0.55, metal: false },
    "⚙️ Steel Block": { color: 0x86AEDD, opacity: 1.0, metal: true }
  };
  const BLOCK_TYPE_ORDER = Object.keys(BLOCK_TYPES);
  function hexCss(num) { return '#' + num.toString(16).padStart(6, '0'); }

  // Procedural wood-grain canvas texture, generated once and reused on every Wood Block.
  function createWoodGrainTexture(baseHex) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const base = new THREE.Color(baseHex);
    const br = Math.round(base.r * 255), bg = Math.round(base.g * 255), bb = Math.round(base.b * 255);
    ctx.fillStyle = `rgb(${br},${bg},${bb})`;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 55; i++) {
      const y = Math.random() * 256;
      const shade = (Math.random() - 0.5) * 0.5;
      const r = Math.min(255, Math.max(0, Math.round(br * (1 + shade))));
      const g = Math.min(255, Math.max(0, Math.round(bg * (1 + shade))));
      const b = Math.min(255, Math.max(0, Math.round(bb * (1 + shade))));
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + Math.random() * 0.4})`;
      ctx.lineWidth = 0.8 + Math.random() * 2.2;
      ctx.beginPath();
      let cx = 0, cy = y;
      ctx.moveTo(cx, cy);
      while (cx < 256) {
        cx += 16 + Math.random() * 18;
        cy += (Math.random() - 0.5) * 9;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const kx = Math.random() * 256, ky = Math.random() * 256, kr = 12 + Math.random() * 10;
      const grad = ctx.createRadialGradient(kx, ky, 1, kx, ky, kr);
      grad.addColorStop(0, 'rgba(35,18,8,0.55)');
      grad.addColorStop(1, 'rgba(35,18,8,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const woodGrainTex = createWoodGrainTexture(BLOCK_TYPES["🪵 Wood Block"].color);

  // Shared material builder so every wood/concrete/glass/steel cube - whether on the
  // dispenser shelf or placed in the world - looks consistent. Steel gets extra
  // metalness/clearcoat so it actually reads as shiny under the environment lighting.
  function createBlockMaterial(type) {
    const info = BLOCK_TYPES[type] || BLOCK_TYPES[BLOCK_TYPE_ORDER[0]];
    const isWood = type.includes('Wood');
    return new THREE.MeshPhysicalMaterial({
      color: isWood ? 0xffffff : info.color,
      map: isWood ? woodGrainTex : null,
      roughness: info.metal ? 0.08 : 0.85,
      metalness: info.metal ? 0.95 : 0.0,
      clearcoat: info.metal ? 0.7 : 0.0,
      clearcoatRoughness: info.metal ? 0.06 : 0.1,
      transparent: info.opacity < 1,
      opacity: info.opacity,
      envMap: envMapTexture,
      envMapIntensity: info.metal ? 1.4 : 0.5
    });
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 110, 195);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth/window.innerHeight, 0.1, 900);
  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function createProceduralEnvMap(renderer) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.3, '#777888'); grad.addColorStop(0.5, '#111116');
    grad.addColorStop(0.8, '#333344'); grad.addColorStop(1, '#050508');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(180, 80, 180, 220); ctx.fillRect(620, 40, 240, 120);
    const rainbow = ctx.createLinearGradient(0, 0, c.width, 0);
    rainbow.addColorStop(0, 'rgba(160,240,255,0.7)'); rainbow.addColorStop(0.33, 'rgba(255,176,224,0.7)');
    rainbow.addColorStop(0.66, 'rgba(208,160,255,0.7)'); rainbow.addColorStop(1, 'rgba(160,240,255,0.7)');
    ctx.fillStyle = rainbow; ctx.fillRect(0, 240, c.width, 90);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const renderTarget = pmremGenerator.fromEquirectangular(tex);
    tex.dispose(); pmremGenerator.dispose(); return renderTarget.texture;
  }
  const envMapTexture = createProceduralEnvMap(renderer);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.65);
  scene.add(hemi);
  const lightsGroup = new THREE.Group(); scene.add(lightsGroup);
  const key = new THREE.DirectionalLight(0xffffff, 0.75);
  key.position.set(5, 12, 7); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12; key.shadow.camera.right = 12;
  key.shadow.camera.top = 12; key.shadow.camera.bottom = -12; key.shadow.bias = -0.0015;
  lightsGroup.add(key); lightsGroup.add(key.target);
  const fill = new THREE.DirectionalLight(0xffeedd, 0.35);
  fill.position.set(-6, 4, -4); lightsGroup.add(fill);

  // ---------- DAY / NIGHT CYCLE ----------
  // settings.dayNightSpeed is adjusted live from the Settings panel slider.
  const settings = {
    dayNightEnabled: true, dayNightSpeed: 1.0, fogFar: 195,
    petGapDog: 6.8, petGapCat: 4.4, petGapBird: 4.0, petGapAlpaca: 4.0, petGapBunny: 3.2, petGapFrog: 2.6, petGapMonkey: 2.0, petGapPanda: 3.0, petGapOwl: 5.0, petGapDragon: 4.6, petGapLamb: 3.6
  };
  const DAYNIGHT_SUN_DIST = 55;
  const DAYNIGHT_BASE_DURATION = 90; // seconds for one full day/night cycle at speed = 1.0x
  let dayNightPhase = 0.30; // 0..1 — start partway into a bright, sunny daytime
  let nightFactor = 0; // 0 (full day) .. 1 (full night) — drives the stars' fade-in, updated below

  function computeSkyColor(sunHeight) {
    // sunHeight ranges -1 (midnight) .. 0 (horizon) .. 1 (noon)
    const night = new THREE.Color(0x0B1026);
    const sunset = new THREE.Color(0xFF8A50);
    const day = new THREE.Color(COLORS.bg);
    const color = new THREE.Color();
    if (sunHeight >= 0) {
      color.lerpColors(sunset, day, Math.min(1, sunHeight / 0.35));
    } else {
      color.lerpColors(sunset, night, Math.min(1, -sunHeight / 0.35));
    }
    return color;
  }

  function updateDayNightCycle(dt) {
    if (settings.dayNightEnabled) {
      const cycleDuration = DAYNIGHT_BASE_DURATION / settings.dayNightSpeed;
      dayNightPhase = (dayNightPhase + dt / cycleDuration) % 1;
    }
    const angle = dayNightPhase * Math.PI * 2;
    const sunHeight = Math.sin(angle); // -1 (midnight) .. 1 (noon)
    const dayFactor = (sunHeight + 1) / 2; // 0..1, used for ambient light so night isn't pitch black

    const rawHeight = sunHeight * 40 + 15;
    key.position.set(Math.cos(angle) * DAYNIGHT_SUN_DIST, Math.max(3, rawHeight), 10);

    hemi.intensity = THREE.MathUtils.lerp(0.12, 0.65, dayFactor);
    key.intensity = THREE.MathUtils.lerp(0.03, 0.75, Math.max(0, sunHeight));
    fill.intensity = THREE.MathUtils.lerp(0.10, 0.35, dayFactor);

    const skyColor = computeSkyColor(sunHeight);
    scene.background.copy(skyColor);
    scene.fog.color.copy(skyColor);

    // 0 while the sun's up, ramping to 1 once it dips more than ~30% below the horizon
    nightFactor = THREE.MathUtils.clamp(-sunHeight / 0.3, 0, 1);
  }
  updateDayNightCycle(0); // initialize sky/lighting to match the starting phase before the first frame

  // ---------- BACKGROUND: JUPITER ----------
  // A big stylized planet sitting far off in the sky behind the map. It's placed
  // well beyond all the landmarks/dispensers (which top out around ±65 units) so
  // it reads as a distant backdrop, with subtle parallax as AURA moves around.
  function createJupiterTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    const bandColors = ['#D9BA8C', '#C9A876', '#E8CBA0', '#B98A54', '#F0DAB0', '#A9754B', '#DFC194', '#8B5A2B', '#EAD2A6', '#C08A52'];
    let y = 0;
    while (y < c.height) {
      const bandH = 10 + Math.random() * 42;
      ctx.fillStyle = bandColors[Math.floor(Math.random() * bandColors.length)];
      ctx.fillRect(0, y, c.width, bandH);
      y += bandH;
    }
    // soft turbulent swirls layered over the bands for texture
    for (let i = 0; i < 50; i++) {
      ctx.globalAlpha = 0.12 + Math.random() * 0.18;
      ctx.fillStyle = bandColors[Math.floor(Math.random() * bandColors.length)];
      const cx = Math.random() * c.width, cy = Math.random() * c.height;
      const rx = 30 + Math.random() * 100, ry = 8 + Math.random() * 22;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the Great Red Spot
    const spotGrad = ctx.createRadialGradient(700, 330, 6, 700, 330, 78);
    spotGrad.addColorStop(0, '#C1442D'); spotGrad.addColorStop(0.55, '#B5502E'); spotGrad.addColorStop(1, 'rgba(181,80,46,0)');
    ctx.fillStyle = spotGrad;
    ctx.beginPath(); ctx.ellipse(700, 330, 92, 52, 0, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }
  const jupiterGroup = new THREE.Group();
  jupiterGroup.position.set(170, 130, -400);
  jupiterGroup.rotation.z = 0.32; // slight axial tilt, shared by the planet and its ring
  jupiterGroup.renderOrder = -1; // always draw behind regular scene geometry
  scene.add(jupiterGroup);

  const jupiter = new THREE.Mesh(
    new THREE.SphereGeometry(52, 48, 32),
    new THREE.MeshBasicMaterial({ map: createJupiterTexture(), fog: false })
  );
  jupiterGroup.add(jupiter);

  // A soft, banded ring - RingGeometry's UVs map radius to V and angle to U, so
  // horizontal bands in this texture read as concentric bands around the ring.
  function createJupiterRingTexture() {
    const c = document.createElement('canvas'); c.width = 8; c.height = 256;
    const ctx = c.getContext('2d');
    const bandColors = ['#D9C39A', '#C7AD7E', '#E4D3AC', '#B79868', '#DCC796'];
    let y = 0;
    while (y < c.height) {
      const bandH = 6 + Math.random() * 20;
      ctx.fillStyle = bandColors[Math.floor(Math.random() * bandColors.length)];
      ctx.globalAlpha = 0.35 + Math.random() * 0.45;
      ctx.fillRect(0, y, c.width, bandH);
      y += bandH;
    }
    // fade both the inner and outer edges to fully transparent
    const fade = ctx.createLinearGradient(0, 0, 0, c.height);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.12, 'rgba(0,0,0,0)');
    fade.addColorStop(0.88, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade; ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'source-over';
    return new THREE.CanvasTexture(c);
  }
  const jupiterRing = new THREE.Mesh(
    new THREE.RingGeometry(72, 108, 64, 1),
    new THREE.MeshBasicMaterial({ map: createJupiterRingTexture(), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false })
  );
  jupiterRing.rotation.x = Math.PI / 2; // lie flat in the planet's equatorial plane
  jupiterGroup.add(jupiterRing);

  // ---------- BACKGROUND: NIGHT STARS ----------
  // A scattered field of soft glowing dots on a huge sphere shell around the map.
  // Invisible by day - opacity is driven every frame by nightFactor (see animate()).
  function createStarDotTexture() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }
  const STAR_COUNT = 1100, STAR_RADIUS = 480;
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starColors = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // random direction, biased toward the upper hemisphere so stars aren't wasted underground
    let x = Math.random() * 2 - 1, y = Math.random() * 0.85 + 0.1, z = Math.random() * 2 - 1;
    const len = Math.hypot(x, y, z);
    x /= len; y /= len; z /= len;
    starPositions[i * 3] = x * STAR_RADIUS; starPositions[i * 3 + 1] = y * STAR_RADIUS; starPositions[i * 3 + 2] = z * STAR_RADIUS;
    const brightness = 0.55 + Math.random() * 0.45;
    const tint = Math.random() < 0.15 ? [brightness * 0.85, brightness * 0.9, brightness] : [brightness, brightness, brightness * 0.95]; // a few faint blue-white stars
    starColors[i * 3] = tint[0]; starColors[i * 3 + 1] = tint[1]; starColors[i * 3 + 2] = tint[2];
  }
  const nightStarGeo = new THREE.BufferGeometry();
  nightStarGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  nightStarGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.6, map: createStarDotTexture(), vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending, fog: false
  });
  const stars = new THREE.Points(nightStarGeo, starMat);
  stars.renderOrder = -2;
  scene.add(stars);

  const outlineMaterial = new THREE.ShaderMaterial({
    uniforms: { outlineColor: { value: new THREE.Color(COLORS.outline) }, outlineThickness: { value: 0.05 }, outlineOpacity: { value: 1.0 } },
    vertexShader: `precision highp float; uniform float outlineThickness; void main() { vec3 pos = position + normal * outlineThickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0); }`,
    fragmentShader: `precision highp float; uniform vec3 outlineColor; uniform float outlineOpacity; void main() { gl_FragColor = vec4(outlineColor, outlineOpacity); }`,
    side: THREE.BackSide,
    transparent: true
  });
  function addOutline(mesh, thickness = 0.05) {
    if (!mesh || !mesh.geometry) return;
    const outline = new THREE.Mesh(mesh.geometry, outlineMaterial.clone());
    outline.material.uniforms.outlineThickness.value = thickness;
    outline.isOutlineMesh = true;
    mesh.add(outline);
  }

  // --- SUBDIVIDED LOW-POLY GROUND TERRAIN ---
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 60, 60);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    if (Math.abs(vx) > 12 || Math.abs(vz) > 12) {
      posAttr.setY(i, -4.65 + (Math.sin(vx * 0.15) * Math.cos(vz * 0.15) * 0.18) + (Math.random() - 0.5) * 0.08);
    } else {
      posAttr.setY(i, -4.65);
    }
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: COLORS.bg, roughness: 1.0, flatShading: true }));
  ground.receiveShadow = true; scene.add(ground);

  // --- INDEXED LOW-POLY GROUND STONES & ROCKS ---
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xD6C4AF, roughness: 1.0, flatShading: true });
  const rockMatWhite = new THREE.MeshStandardMaterial({ color: 0xEAE0D0, roughness: 0.9, flatShading: true });
  const rocksGroup = new THREE.Group(); scene.add(rocksGroup);
  const gridRocks = {}; 

  for (let i = 0; i < 450; i++) {
    const radius = 0.3 + Math.random() * 0.8;
    const isWhite = Math.random() < 0.5;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), isWhite ? rockMatWhite : rockMat);
    const rx = (Math.random() - 0.5) * (WORLD_SIZE - 20);
    const rz = (Math.random() - 0.5) * (WORLD_SIZE - 20);
    rock.position.set(rx, -4.65 + (radius * 0.25), rz);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.scale.set(1 + Math.random() * 0.4, 0.4 + Math.random() * 0.4, 1 + Math.random() * 0.5);
    rock.castShadow = true; rock.receiveShadow = true; addOutline(rock, 0.04);
    rocksGroup.add(rock);

    const gx = Math.round(rx / GRID_SIZE);
    const gz = Math.round(rz / GRID_SIZE);
    const key = `${gx},${gz}`;
    if (!gridRocks[key]) gridRocks[key] = [];
    gridRocks[key].push(rock);
  }

  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function roundedRectShape(w, h, r){
    const shape = new THREE.Shape(); const x = -w/2, y = -h/2;
    shape.moveTo(x, y+r); shape.lineTo(x, y+h-r); shape.quadraticCurveTo(x, y+h, x+r, y+h);
    shape.lineTo(x+w-r, y+h); shape.quadraticCurveTo(x+w, y+h, x+w, y+h-r); shape.lineTo(x+w, y+r);
    shape.quadraticCurveTo(x+w, y, x+w-r, y); shape.lineTo(x+r, y); shape.quadraticCurveTo(x, y, x, y+r); return shape;
  }
  function roundedBoxGeometry(w, h, d, r){
    const shape = roundedRectShape(w, h, r); const bevel = Math.min(0.08, d*0.12, r*0.6);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d - bevel*2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
    geo.translate(0, 0, -(d)/2 + bevel); geo.computeVertexNormals(); return geo;
  }

  function bodyMat(color){ 
    return new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, metalness: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.1, envMap: envMapTexture, envMapIntensity: 0.5 }); 
  }
  const matOrange = bodyMat(COLORS.orange); const matOrangeDk = bodyMat(COLORS.orangeDk);

  const faceCanvas = document.createElement('canvas'); faceCanvas.width = 512; faceCanvas.height = 384;
  const faceCtx = faceCanvas.getContext('2d'); const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); faceTex.encoding = THREE.sRGBEncoding;
  function redrawFace(eyeScaleY = 1.0){
    faceCtx.fillStyle = '#0B0C10'; faceCtx.fillRect(0,0,faceCanvas.width,faceCanvas.height);
    function drawEye(cx, cy, w, h){
      faceCtx.save(); faceCtx.beginPath();
      faceCtx.ellipse(cx, cy, w/2, Math.max(4, h * eyeScaleY)/2, 0, 0, Math.PI * 2);
      faceCtx.fillStyle = '#2EE2FA'; faceCtx.shadowColor = '#2EE2FA'; faceCtx.shadowBlur = 12;
      faceCtx.fill(); faceCtx.restore();
    }
    drawEye(140, 192, 160, 220); drawEye(372, 192, 160, 220); faceTex.needsUpdate = true;
  }
  redrawFace(1.0);

  let userText = "BIG AURA";
  document.getElementById('nameInput').addEventListener('input', e => { userText = e.target.value.trim() !== "" ? e.target.value : "AURA"; });

  const chestCanvas = document.createElement('canvas'); chestCanvas.width = 512; chestCanvas.height = 700; 
  const chestCtx = chestCanvas.getContext('2d'); const chestTex = new THREE.CanvasTexture(chestCanvas);
  chestTex.encoding = THREE.sRGBEncoding;
  function updateChestCanvas(time) {
    chestCtx.clearRect(0, 0, 512, 700);
    const pad = 24, badgeTopY = pad + 10;
    roundRect(chestCtx, pad, badgeTopY, 512 - pad*2, 700 - pad*2 - 80, 26);
    chestCtx.fillStyle = '#78288C'; chestCtx.fill(); chestCtx.lineWidth = 14; chestCtx.strokeStyle = '#000000'; chestCtx.stroke();
    const beatCycle = time % 1100; let heartScale = 2.3;
    if (beatCycle < 160) heartScale += Math.sin((beatCycle / 160) * Math.PI) * 0.22;
    else if (beatCycle >= 200 && beatCycle < 330) heartScale += Math.sin(((beatCycle - 200) / 130) * Math.PI) * 0.12;
    chestCtx.save(); chestCtx.translate(256, badgeTopY + 170); chestCtx.scale(heartScale, heartScale);
    chestCtx.beginPath(); chestCtx.moveTo(0, 18); chestCtx.bezierCurveTo(-45,-20, -35,-55, 0,-25); chestCtx.bezierCurveTo(35,-55, 45,-20, 0, 18);
    chestCtx.closePath(); chestCtx.fillStyle = '#FF5A5F'; chestCtx.fill(); chestCtx.lineWidth = 4 / (heartScale / 2.3); chestCtx.strokeStyle = '#000000'; chestCtx.stroke(); chestCtx.restore();
    const clipX = 42, clipY = badgeTopY + 360, clipW = 512 - 84, clipH = 144; 
    chestCtx.save(); roundRect(chestCtx, clipX, clipY, clipW, clipH, 16);
    chestCtx.fillStyle = '#0B0C10'; chestCtx.fill(); chestCtx.lineWidth = 10; chestCtx.strokeStyle = '#000000'; chestCtx.stroke(); chestCtx.clip(); 
    const displayText = userText.toUpperCase(); chestCtx.font = '900 96px "Arial Black", sans-serif';
    chestCtx.fillStyle = '#2EE2FA'; chestCtx.shadowColor = '#2EE2FA'; chestCtx.shadowBlur = 18; chestCtx.textBaseline = 'middle';
    const textWidth = Math.max(chestCtx.measureText(displayText).width, 100), totalLoopWidth = textWidth + clipW;
    const scrollX = (time * 0.08) % totalLoopWidth, drawX = (clipX + clipW) - scrollX;
    chestCtx.fillText(displayText, drawX, clipY + clipH / 2 + 5);
    if (drawX + textWidth < clipX + clipW) chestCtx.fillText(displayText, drawX + totalLoopWidth, clipY + clipH / 2 + 5);
    chestCtx.restore(); chestTex.needsUpdate = true;
  }

  function ribbedTube(length, radius, ribCount, colorMain, colorRib){
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(radius*0.86, radius*0.86, length, 20, 1, true), bodyMat(colorMain));
    core.castShadow = true; core.receiveShadow = true; addOutline(core, 0.05); g.add(core);
    const ribW = length/ribCount;
    for(let i=0;i<ribCount;i++){
      const rib = new THREE.Mesh(new THREE.TorusGeometry(radius, radius*0.14, 10, 24), bodyMat(colorRib));
      rib.rotation.x = Math.PI/2; rib.position.y = -length/2 + ribW*(i+0.5); rib.castShadow = true; addOutline(rib, 0.03); g.add(rib);
    }
    return g;
  }

  const animBones = { armL: { shoulder: null, elbow: null }, armR: { shoulder: null, elbow: null }, legL: { hip: null, knee: null }, legR: { hip: null, knee: null }, torso: null, head: null };
  const robot = new THREE.Group(); scene.add(robot);

  const head = new THREE.Group(); head.position.set(0, 3.15, 0); animBones.head = head; robot.add(head);
  const headShell = new THREE.Mesh(roundedBoxGeometry(3.5, 2.55, 2.15, 0.4), matOrange); headShell.castShadow = true; headShell.receiveShadow = true; addOutline(headShell, 0.07); head.add(headShell);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(3.05, 2.1, 0.12), matOrangeDk); bezel.position.z = 1.05; addOutline(bezel, 0.04); head.add(bezel);
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(2.82, 1.9), new THREE.MeshStandardMaterial({ map: faceTex, roughness:1.0, metalness:0.0, emissive:0x111111, emissiveIntensity:0.1 })); facePlane.position.z = 1.12; head.add(facePlane);
  function buildEar(sign){
    const ear = new THREE.Group(); ear.position.set(sign*1.95, 0.05, 0);
    const earOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,0.28,28), matOrange); earOuter.rotation.z = Math.PI/2; earOuter.castShadow = true; addOutline(earOuter, 0.05); ear.add(earOuter);
    const earRing = new THREE.Mesh(new THREE.TorusGeometry(0.4,0.07,10,28), matOrangeDk); earRing.rotation.y = Math.PI/2; earRing.position.x = sign*0.12; addOutline(earRing, 0.03); ear.add(earRing); return ear;
  }
  head.add(buildEar(-1)); head.add(buildEar(1));  
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.5,0.45,20), matOrangeDk); neck.position.set(0, 1.675, 0); neck.castShadow = true; addOutline(neck, 0.04); robot.add(neck);
  const torso = new THREE.Group(); torso.position.set(0, 0.2, 0); animBones.torso = torso; robot.add(torso);
  const torsoShell = new THREE.Mesh(roundedBoxGeometry(2.9, 2.65, 1.85, 0.32), matOrange); torsoShell.castShadow = true; torsoShell.receiveShadow = true; addOutline(torsoShell, 0.07); torso.add(torsoShell);
  const chestPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 3.1), new THREE.MeshStandardMaterial({ map: chestTex, transparent:true, roughness:1.0, metalness:0.0 })); chestPlane.position.set(0, 0.05, 0.96); torso.add(chestPlane);

  function buildArm(sign){
    const shoulderJoint = new THREE.Group(); shoulderJoint.position.set(sign*1.55, 0.775, 0);
    const shoulderGeo = new THREE.Mesh(new THREE.SphereGeometry(0.55,20,16), matOrange); shoulderGeo.castShadow = true; addOutline(shoulderGeo, 0.05); shoulderJoint.add(shoulderGeo);
    const upperArm = ribbedTube(1.3, 0.42, 3, COLORS.grey, COLORS.greyLt); upperArm.position.set(0, -0.65, 0); shoulderJoint.add(upperArm);
    const elbowJoint = new THREE.Group(); elbowJoint.position.set(0, -1.3, 0); shoulderJoint.add(elbowJoint);
    const lowerArm = ribbedTube(1.3, 0.38, 3, COLORS.grey, COLORS.greyLt); lowerArm.position.set(0, -0.65, 0); elbowJoint.add(lowerArm);
    const hand = new THREE.Group(); hand.position.set(0, -1.4, 0);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.44,0.44,0.22,20), matOrangeDk); addOutline(cuff, 0.04); hand.add(cuff);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.7,0.38), matOrange); palm.position.y = -0.35; palm.castShadow = true; addOutline(palm, 0.05); hand.add(palm); elbowJoint.add(hand);
    const bones = { shoulder: shoulderJoint, elbow: elbowJoint };
    if (sign > 0) animBones.armR = bones; else animBones.armL = bones; return shoulderJoint;
  }
  torso.add(buildArm(1)); torso.add(buildArm(-1));

  function buildLeg(sign){
    const hipJoint = new THREE.Group(); hipJoint.position.set(sign*0.62, -1.15, 0);
    const thigh = ribbedTube(1.8, 0.38, 4, COLORS.grey, COLORS.greyLt); thigh.position.y = -0.9; hipJoint.add(thigh);
    const kneeJoint = new THREE.Group(); kneeJoint.position.set(0, -1.8, 0); hipJoint.add(kneeJoint);
    const kneeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 16), matOrange); kneeSphere.castShadow = true; addOutline(kneeSphere, 0.05); kneeJoint.add(kneeSphere);
    const bootHeight = 1.7;
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.8, bootHeight, 24), matOrange); boot.position.y = -bootHeight / 2 - 0.1; boot.castShadow = true; boot.receiveShadow = true; addOutline(boot, 0.06); kneeJoint.add(boot);
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 24), matOrangeDk); sole.position.y = -bootHeight / 2 + 0.11; sole.castShadow = true; addOutline(sole, 0.05); boot.add(sole);
    const rivetMat = bodyMat(COLORS.grey), rivetGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
    const rivetTop = new THREE.Mesh(rivetGeo, rivetMat); rivetTop.rotation.z = Math.PI / 2; rivetTop.position.set(sign * 0.62, 0.15, 0.15); addOutline(rivetTop, 0.03); boot.add(rivetTop);
    const rivetBottom = new THREE.Mesh(rivetGeo, rivetMat); rivetBottom.rotation.z = Math.PI / 2; rivetBottom.position.set(sign * 0.75, -0.4, 0.2); addOutline(rivetBottom, 0.03); boot.add(rivetBottom);
    const bones = { hip: hipJoint, knee: kneeJoint };
    if (sign > 0) animBones.legR = bones; else animBones.legL = bones; return hipJoint;
  }
  robot.add(buildLeg(1)); robot.add(buildLeg(-1)); 
  
  robot.position.y = 0.1;

  // ======================================================================
  // ---------- PET: LITTLE ROBOT DOG COMPANION (follows AURA) ----------
  // Built from the same materials/helpers as AURA (dogMatMain, dogMatDark,
  // ribbedTube, roundedBoxGeometry, addOutline) so it automatically matches
  // AURA's current color theme and outline style.
  // ======================================================================
  const DOG_BODY_WID = 0.85, DOG_BODY_LEN = 1.55, DOG_BODY_HT = 0.68;
  const DOG_HIP_Y = -1.0;            // hip-joint height, relative to the dog's root group
  const DOG_LEG_SEG = 0.42;          // thigh & shin segment length (equal)
  const DOG_PAW_HT = 0.16;
  const DOG_LEG_REACH = DOG_LEG_SEG * 2 + DOG_PAW_HT; // hip-to-paw-bottom distance
  const DOG_BASE_Y = -4.65 - (DOG_HIP_Y - DOG_LEG_REACH); // puts paws on the same ground plane as AURA's feet
  const DOG_BODY_Y = DOG_HIP_Y + DOG_BODY_HT / 2 - 0.06;  // body group sits just above the hips

  const dogAnimBones = { legFL:{hip:null,knee:null}, legFR:{hip:null,knee:null}, legBL:{hip:null,knee:null}, legBR:{hip:null,knee:null}, tail:null, head:null };
  const petDog = new THREE.Group();
  petDog.position.set(robot.position.x, DOG_BASE_Y, robot.position.z - 3.4);
  scene.add(petDog);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const dogMatMain = bodyMat(COLORS.orange);
  const dogMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (torso + head + tail all ride together as one animated group) ----
  const dogBody = new THREE.Group(); dogBody.position.set(0, DOG_BODY_Y, 0); petDog.add(dogBody);
  const dogTorso = new THREE.Mesh(roundedBoxGeometry(DOG_BODY_WID, DOG_BODY_HT, DOG_BODY_LEN, 0.26), dogMatMain);
  dogTorso.castShadow = true; dogTorso.receiveShadow = true; addOutline(dogTorso, 0.05); dogBody.add(dogTorso);
  const dogBelly = new THREE.Mesh(new THREE.BoxGeometry(DOG_BODY_WID * 0.72, 0.1, DOG_BODY_LEN * 0.7), dogMatDark);
  dogBelly.position.set(0, -DOG_BODY_HT / 2 + 0.02, 0); addOutline(dogBelly, 0.03); dogBody.add(dogBelly);
  const dogBackPlate = new THREE.Mesh(new THREE.BoxGeometry(DOG_BODY_WID * 0.55, 0.12, DOG_BODY_LEN * 0.55), dogMatDark);
  dogBackPlate.position.set(0, DOG_BODY_HT / 2 - 0.02, 0); addOutline(dogBackPlate, 0.03); dogBody.add(dogBackPlate);
  const dogNub = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  dogNub.position.set(0, DOG_BODY_HT / 2 + 0.08, DOG_BODY_LEN * 0.12); dogBody.add(dogNub);

  // ---- Head ----
  const dogHead = new THREE.Group();
  dogHead.position.set(0, DOG_BODY_HT / 2 + 0.22, DOG_BODY_LEN / 2 + 0.02);
  dogAnimBones.head = dogHead; dogBody.add(dogHead);
  const dogHeadShell = new THREE.Mesh(roundedBoxGeometry(0.78, 0.68, 0.72, 0.2), dogMatMain);
  dogHeadShell.castShadow = true; addOutline(dogHeadShell, 0.05); dogHead.add(dogHeadShell);
  const dogSnout = new THREE.Mesh(roundedBoxGeometry(0.42, 0.34, 0.4, 0.14), dogMatMain);
  dogSnout.position.set(0, -0.1, 0.5); dogSnout.castShadow = true; addOutline(dogSnout, 0.04); dogHead.add(dogSnout);
  const dogNose = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), bodyMat(COLORS.outline));
  dogNose.position.set(0, -0.04, 0.71); dogHead.add(dogNose);
  const dogEyeGeo = new THREE.SphereGeometry(0.075, 12, 10);
  const dogEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const dogEyeL = new THREE.Mesh(dogEyeGeo, dogEyeMat); dogEyeL.position.set(-0.19, 0.07, 0.34); dogHead.add(dogEyeL);
  const dogEyeR = new THREE.Mesh(dogEyeGeo, dogEyeMat); dogEyeR.position.set(0.19, 0.07, 0.34); dogHead.add(dogEyeR);
  function buildDogEar(sign) {
    const hinge = new THREE.Group(); hinge.position.set(sign * 0.36, 0.24, -0.06); hinge.rotation.z = sign * -0.18;
    const earShape = new THREE.Shape();
    earShape.moveTo(0, 0); earShape.lineTo(sign * 0.05, -0.42); earShape.lineTo(sign * 0.26, -0.34); earShape.lineTo(sign * 0.22, 0.05); earShape.closePath();
    const earGeo = new THREE.ExtrudeGeometry(earShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    earGeo.translate(0, 0, -0.03);
    const ear = new THREE.Mesh(earGeo, dogMatDark); ear.castShadow = true; addOutline(ear, 0.03); hinge.add(ear);
    return hinge;
  }
  dogHead.add(buildDogEar(-1)); dogHead.add(buildDogEar(1));

  // ---- Tail (wags from a tilted hinge at the back of the body) ----
  const dogTailHinge = new THREE.Group();
  dogTailHinge.position.set(0, DOG_BODY_HT * 0.12, -DOG_BODY_LEN / 2 - 0.02);
  dogTailHinge.rotation.x = -0.85;
  dogAnimBones.tail = dogTailHinge; dogBody.add(dogTailHinge);
  const dogTailSeg = ribbedTube(0.5, 0.10, 2, COLORS.orange, COLORS.orangeDk);
  dogTailSeg.position.y = 0.25; dogTailHinge.add(dogTailSeg);
  const dogTailTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), dogMatDark);
  dogTailTip.position.y = 0.5; addOutline(dogTailTip, 0.03); dogTailHinge.add(dogTailTip);

  // ---- Legs (quadruped: front-left/right, back-left/right) ----
  function buildDogLeg(signX, isFront) {
    const legZ = isFront ? DOG_BODY_LEN * 0.30 : -DOG_BODY_LEN * 0.30;
    const hip = new THREE.Group(); hip.position.set(signX * (DOG_BODY_WID / 2 - 0.06), DOG_HIP_Y, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), dogMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.04); hip.add(hipBall);
    const thigh = ribbedTube(DOG_LEG_SEG, 0.115, 2, COLORS.grey, COLORS.greyLt); thigh.position.y = -DOG_LEG_SEG / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -DOG_LEG_SEG, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 14), dogMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.03); knee.add(kneeBall);
    const shin = ribbedTube(DOG_LEG_SEG, 0.095, 2, COLORS.grey, COLORS.greyLt); shin.position.y = -DOG_LEG_SEG / 2; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.14, DOG_PAW_HT, 16), dogMatDark);
    paw.position.set(0, -(DOG_LEG_SEG + DOG_PAW_HT / 2), 0.02); paw.castShadow = true; addOutline(paw, 0.03); knee.add(paw);
    return { hip, knee };
  }
  dogAnimBones.legFL = buildDogLeg(-1, true);  petDog.add(dogAnimBones.legFL.hip);
  dogAnimBones.legFR = buildDogLeg(1, true);   petDog.add(dogAnimBones.legFR.hip);
  dogAnimBones.legBL = buildDogLeg(-1, false); petDog.add(dogAnimBones.legBL.hip);
  dogAnimBones.legBR = buildDogLeg(1, false);  petDog.add(dogAnimBones.legBR.hip);

  // ---- Follow / gait state ----
  let dogFacing = robot.rotation.y;
  let dogWalkPhase = 0;
  let dogSitAmount = 0;      // 0 = standing/trotting, 1 = fully sat down
  let dogIdleTimer = 0;
  let dogIsTrotting = false; // read by the cat, which trails behind the dog
  let DOG_FOLLOW_DIST = 6.8;    // preferred trailing distance behind AURA
  const DOG_FOLLOW_SIDE = 1.35;   // offset to the side so it isn't walking in AURA's exact footprints
  const DOG_ARRIVE_DIST = 0.55;   // within this range of its spot, the dog considers itself "arrived"
  const DOG_MAX_TROT_SPEED = 0.30;

  function updatePetDog(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * DOG_FOLLOW_DIST + rightX * DOG_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * DOG_FOLLOW_DIST + rightZ * DOG_FOLLOW_SIDE;

    const prevX = petDog.position.x, prevZ = petDog.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    // Glide toward the follow spot on an invisible leash - lags a little, then catches up
    const followLerp = 1 - Math.pow(0.0025, dt);
    petDog.position.x += (targetX - prevX) * followLerp;
    petDog.position.z += (targetZ - prevZ) * followLerp;

    const dx = petDog.position.x - prevX, dz = petDog.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isTrotting = stepDist > 0.0009;
    dogIsTrotting = isTrotting;

    // --- Facing: turn toward travel direction while moving, otherwise settle to match AURA ---
    if (isTrotting) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - dogFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      dogFacing += diff * Math.min(1, dt * 9);
    } else {
      let diff = leader.rotY - dogFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      dogFacing += diff * Math.min(1, dt * 2.2);
    }
    petDog.rotation.y = dogFacing;

    // --- Sit / stand decision ---
    const leaderStill = !leader.moving;
    if (!isTrotting && distToSpot < DOG_ARRIVE_DIST && leaderStill) dogIdleTimer += dt;
    else dogIdleTimer = 0;
    const wantsToSit = dogIdleTimer > 0.35;
    dogSitAmount = THREE.MathUtils.lerp(dogSitAmount, wantsToSit ? 1 : 0, Math.min(1, dt * 4));

    // --- Trot gait: diagonal leg pairs move together (FL+BR, FR+BL) ---
    const speedRatio = Math.min(1.5, instantSpeed / DOG_MAX_TROT_SPEED);
    if (isTrotting) dogWalkPhase += dt * (15 * Math.max(speedRatio, 0.45));
    const strideAmt = Math.min(1, speedRatio + 0.35) * (1 - dogSitAmount);
    const strideA = Math.sin(dogWalkPhase) * 0.75 * strideAmt;
    const strideB = -strideA;

    const sitFrontHip = -0.12, sitBackHip = -1.05, sitFrontKnee = 0.15, sitBackKnee = 1.35;
    const baseFrontKnee = 0.12, baseBackKnee = 0.38;

    dogAnimBones.legFL.hip.rotation.x = strideA + sitFrontHip * dogSitAmount;
    dogAnimBones.legBR.hip.rotation.x = strideA + sitBackHip * dogSitAmount;
    dogAnimBones.legFR.hip.rotation.x = strideB + sitFrontHip * dogSitAmount;
    dogAnimBones.legBL.hip.rotation.x = strideB + sitBackHip * dogSitAmount;

    dogAnimBones.legFL.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitFrontKnee, dogSitAmount);
    dogAnimBones.legFR.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitFrontKnee, dogSitAmount);
    dogAnimBones.legBL.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, dogSitAmount);
    dogAnimBones.legBR.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, dogSitAmount);

    // --- Body posture: gentle bob while trotting, settles down when sitting ---
    const walkBob = isTrotting ? Math.abs(Math.sin(dogWalkPhase * 2)) * 0.06 : Math.sin(time * 0.003) * 0.02;
    dogBody.position.y = DOG_BODY_Y + walkBob - dogSitAmount * 0.22;
    dogBody.rotation.x = -dogSitAmount * 0.22;

    // --- Head: little idle look-around while waiting, nose-up while sitting ---
    dogHead.rotation.x = dogSitAmount * 0.18 + (isTrotting ? Math.sin(dogWalkPhase) * 0.03 : Math.sin(time * 0.0007) * 0.05 * dogSitAmount);
    dogHead.rotation.y = isTrotting ? 0 : Math.sin(time * 0.0005) * 0.12 * dogSitAmount;

    // --- Tail wag: always happy, a bit quicker and wider when sitting/waiting ---
    const wagSpeed = THREE.MathUtils.lerp(6.5, 10, dogSitAmount);
    const wagAmp = THREE.MathUtils.lerp(0.32, 0.52, dogSitAmount);
    dogAnimBones.tail.rotation.y = Math.sin(time * 0.001 * wagSpeed) * wagAmp;

    // --- Whole-body settle bounce, keeps paws reading as planted on the ground ---
    petDog.position.y = DOG_BASE_Y + (isTrotting ? Math.abs(Math.sin(dogWalkPhase * 2)) * 0.05 : 0);
  }

  // ======================================================================
  // ---------- PET: LITTLE ROBOT CAT COMPANION (follows the DOG) ----------
  // Same build style and same follow/sit logic as the dog, just chained one
  // link further down the line: AURA -> dog -> cat. Smaller, pointier ears,
  // no snout, an upright tail, and a couple of whiskers for flavor.
  // ======================================================================
  const CAT_BODY_WID = 0.5, CAT_BODY_LEN = 1.0, CAT_BODY_HT = 0.44;
  const CAT_HIP_Y = -0.62;
  const CAT_LEG_SEG = 0.26;
  const CAT_PAW_HT = 0.10;
  const CAT_LEG_REACH = CAT_LEG_SEG * 2 + CAT_PAW_HT;
  const CAT_BASE_Y = -4.65 - (CAT_HIP_Y - CAT_LEG_REACH);
  const CAT_BODY_Y = CAT_HIP_Y + CAT_BODY_HT / 2 - 0.04;

  const catAnimBones = { legFL:{hip:null,knee:null}, legFR:{hip:null,knee:null}, legBL:{hip:null,knee:null}, legBR:{hip:null,knee:null}, tail:null, head:null };
  const petCat = new THREE.Group();
  petCat.position.set(petDog.position.x, CAT_BASE_Y, petDog.position.z - 2.2);
  scene.add(petCat);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const catMatMain = bodyMat(COLORS.orange);
  const catMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body ----
  const catBody = new THREE.Group(); catBody.position.set(0, CAT_BODY_Y, 0); petCat.add(catBody);
  const catTorso = new THREE.Mesh(roundedBoxGeometry(CAT_BODY_WID, CAT_BODY_HT, CAT_BODY_LEN, 0.2), catMatMain);
  catTorso.castShadow = true; catTorso.receiveShadow = true; addOutline(catTorso, 0.045); catBody.add(catTorso);
  const catBelly = new THREE.Mesh(new THREE.BoxGeometry(CAT_BODY_WID * 0.7, 0.08, CAT_BODY_LEN * 0.68), catMatDark);
  catBelly.position.set(0, -CAT_BODY_HT / 2 + 0.015, 0); addOutline(catBelly, 0.025); catBody.add(catBelly);
  const catBackPlate = new THREE.Mesh(new THREE.BoxGeometry(CAT_BODY_WID * 0.5, 0.09, CAT_BODY_LEN * 0.5), catMatDark);
  catBackPlate.position.set(0, CAT_BODY_HT / 2 - 0.015, 0); addOutline(catBackPlate, 0.025); catBody.add(catBackPlate);
  const catNub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  catNub.position.set(0, CAT_BODY_HT / 2 + 0.06, CAT_BODY_LEN * 0.1); catBody.add(catNub);

  // ---- Head (rounder, flatter face than the dog - no snout) ----
  const catHead = new THREE.Group();
  catHead.position.set(0, CAT_BODY_HT / 2 + 0.16, CAT_BODY_LEN / 2 - 0.03);
  catAnimBones.head = catHead; catBody.add(catHead);
  const catHeadShell = new THREE.Mesh(roundedBoxGeometry(0.5, 0.44, 0.46, 0.16), catMatMain);
  catHeadShell.castShadow = true; addOutline(catHeadShell, 0.04); catHead.add(catHeadShell);
  const catNose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bodyMat(COLORS.outline));
  catNose.position.set(0, -0.06, 0.25); catHead.add(catNose);
  const catEyeGeo = new THREE.SphereGeometry(0.06, 12, 10);
  const catEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const catEyeL = new THREE.Mesh(catEyeGeo, catEyeMat); catEyeL.position.set(-0.135, 0.03, 0.21); catHead.add(catEyeL);
  const catEyeR = new THREE.Mesh(catEyeGeo, catEyeMat); catEyeR.position.set(0.135, 0.03, 0.21); catHead.add(catEyeR);
  // whiskers - thin unlit strips, three a side, fanned slightly
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  function buildWhisker(sign, yOff, fan) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.012), whiskerMat);
    w.position.set(sign * 0.29, yOff, 0.18); w.rotation.y = sign * fan; catHead.add(w);
  }
  [-1, 1].forEach(sign => { buildWhisker(sign, 0.0, 0.35); buildWhisker(sign, -0.035, 0.55); buildWhisker(sign, 0.035, 0.18); });
  // pointy upright ears
  function buildCatEar(sign) {
    const ear = new THREE.Group(); ear.position.set(sign * 0.16, 0.24, -0.02); ear.rotation.z = sign * 0.3; ear.rotation.x = -0.1;
    const earMesh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 4), catMatMain);
    earMesh.rotation.y = Math.PI / 4; earMesh.position.y = 0.12; earMesh.castShadow = true; addOutline(earMesh, 0.025);
    ear.add(earMesh); return ear;
  }
  catHead.add(buildCatEar(-1)); catHead.add(buildCatEar(1));

  // ---- Tail (held upright, gentle sway - not a floppy wag like the dog's) ----
  const catTailHinge = new THREE.Group();
  catTailHinge.position.set(0, CAT_BODY_HT * 0.1, -CAT_BODY_LEN / 2 - 0.01);
  catTailHinge.rotation.x = -1.2;
  catAnimBones.tail = catTailHinge; catBody.add(catTailHinge);
  const catTailSeg = ribbedTube(0.6, 0.07, 3, COLORS.orange, COLORS.orangeDk);
  catTailSeg.position.y = 0.3; catTailHinge.add(catTailSeg);
  const catTailTip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), catMatDark);
  catTailTip.position.y = 0.6; addOutline(catTailTip, 0.025); catTailHinge.add(catTailTip);

  // ---- Legs ----
  function buildCatLeg(signX, isFront) {
    const legZ = isFront ? CAT_BODY_LEN * 0.30 : -CAT_BODY_LEN * 0.30;
    const hip = new THREE.Group(); hip.position.set(signX * (CAT_BODY_WID / 2 - 0.04), CAT_HIP_Y, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), catMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.03); hip.add(hipBall);
    const thigh = ribbedTube(CAT_LEG_SEG, 0.075, 2, COLORS.grey, COLORS.greyLt); thigh.position.y = -CAT_LEG_SEG / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -CAT_LEG_SEG, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), catMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.02); knee.add(kneeBall);
    const shin = ribbedTube(CAT_LEG_SEG, 0.06, 2, COLORS.grey, COLORS.greyLt); shin.position.y = -CAT_LEG_SEG / 2; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, CAT_PAW_HT, 14), catMatDark);
    paw.position.set(0, -(CAT_LEG_SEG + CAT_PAW_HT / 2), 0.015); paw.castShadow = true; addOutline(paw, 0.02); knee.add(paw);
    return { hip, knee };
  }
  catAnimBones.legFL = buildCatLeg(-1, true);  petCat.add(catAnimBones.legFL.hip);
  catAnimBones.legFR = buildCatLeg(1, true);   petCat.add(catAnimBones.legFR.hip);
  catAnimBones.legBL = buildCatLeg(-1, false); petCat.add(catAnimBones.legBL.hip);
  catAnimBones.legBR = buildCatLeg(1, false);  petCat.add(catAnimBones.legBR.hip);

  // ---- Follow / gait state (chained to the DOG instead of AURA) ----
  let catFacing = petDog.rotation.y;
  let catWalkPhase = 0;
  let catSitAmount = 0;
  let catIdleTimer = 0;
  let catIsTrotting = false; // read by the bird, which trails behind the cat
  let CAT_FOLLOW_DIST = 4.4;
  const CAT_FOLLOW_SIDE = -1.05;  // opposite side from the dog's offset so the two don't overlap
  const CAT_ARRIVE_DIST = 0.4;
  const CAT_MAX_TROT_SPEED = 0.30;

  function updatePetCat(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * CAT_FOLLOW_DIST + rightX * CAT_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * CAT_FOLLOW_DIST + rightZ * CAT_FOLLOW_SIDE;

    const prevX = petCat.position.x, prevZ = petCat.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    const followLerp = 1 - Math.pow(0.0025, dt);
    petCat.position.x += (targetX - prevX) * followLerp;
    petCat.position.z += (targetZ - prevZ) * followLerp;

    const dx = petCat.position.x - prevX, dz = petCat.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isTrotting = stepDist > 0.0009;
    catIsTrotting = isTrotting;

    if (isTrotting) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - catFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      catFacing += diff * Math.min(1, dt * 9);
    } else {
      let diff = leader.rotY - catFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      catFacing += diff * Math.min(1, dt * 2.2);
    }
    petCat.rotation.y = catFacing;

    const leaderStill = !leader.moving;
    if (!isTrotting && distToSpot < CAT_ARRIVE_DIST && leaderStill) catIdleTimer += dt;
    else catIdleTimer = 0;
    const wantsToSit = catIdleTimer > 0.35;
    catSitAmount = THREE.MathUtils.lerp(catSitAmount, wantsToSit ? 1 : 0, Math.min(1, dt * 4));

    const speedRatio = Math.min(1.5, instantSpeed / CAT_MAX_TROT_SPEED);
    if (isTrotting) catWalkPhase += dt * (17 * Math.max(speedRatio, 0.5));
    const strideAmt = Math.min(1, speedRatio + 0.35) * (1 - catSitAmount);
    const strideA = Math.sin(catWalkPhase) * 0.7 * strideAmt;
    const strideB = -strideA;

    const sitFrontHip = -0.10, sitBackHip = -1.15, sitFrontKnee = 0.12, sitBackKnee = 1.5;
    const baseFrontKnee = 0.10, baseBackKnee = 0.32;

    catAnimBones.legFL.hip.rotation.x = strideA + sitFrontHip * catSitAmount;
    catAnimBones.legBR.hip.rotation.x = strideA + sitBackHip * catSitAmount;
    catAnimBones.legFR.hip.rotation.x = strideB + sitFrontHip * catSitAmount;
    catAnimBones.legBL.hip.rotation.x = strideB + sitBackHip * catSitAmount;

    catAnimBones.legFL.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitFrontKnee, catSitAmount);
    catAnimBones.legFR.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitFrontKnee, catSitAmount);
    catAnimBones.legBL.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, catSitAmount);
    catAnimBones.legBR.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, catSitAmount);

    const walkBob = isTrotting ? Math.abs(Math.sin(catWalkPhase * 2)) * 0.045 : Math.sin(time * 0.0035) * 0.015;
    catBody.position.y = CAT_BODY_Y + walkBob - catSitAmount * 0.16;
    catBody.rotation.x = -catSitAmount * 0.16;

    catHead.rotation.x = catSitAmount * 0.12 + (isTrotting ? Math.sin(catWalkPhase) * 0.025 : Math.sin(time * 0.0006) * 0.06 * catSitAmount);
    catHead.rotation.y = isTrotting ? 0 : Math.sin(time * 0.00045) * 0.15 * catSitAmount;

    // slow, cool sway while walking; a slower curling flick while sitting - much calmer than the dog's wag
    const tailSpeed = isTrotting ? 2.2 : THREE.MathUtils.lerp(1.4, 2.6, catSitAmount);
    const tailAmp = isTrotting ? 0.18 : THREE.MathUtils.lerp(0.12, 0.3, catSitAmount);
    catAnimBones.tail.rotation.y = Math.sin(time * 0.001 * tailSpeed) * tailAmp;

    petCat.position.y = CAT_BASE_Y + (isTrotting ? Math.abs(Math.sin(catWalkPhase * 2)) * 0.035 : 0);
  }

  // ======================================================================
  // ---------- PET: LITTLE ROBOT BIRD COMPANION (follows the CAT) ----------
  // Same family, same "join the line" idea, but flight instead of a gait:
  // it cruises at an altitude just above AURA's own height while tracking
  // the cat's horizontal path, then folds its wings and drops down to
  // perch on the ground the moment the whole chain settles.
  // ======================================================================
  const BIRD_BODY_WID = 0.34, BIRD_BODY_LEN = 0.52, BIRD_BODY_HT = 0.30;
  const BIRD_HIP_Y = -0.13;      // leg attach height, relative to the bird's root group
  const BIRD_LEG_LEN = 0.24;
  const BIRD_FOOT_HT = 0.045;
  const BIRD_LEG_REACH = BIRD_LEG_LEN + BIRD_FOOT_HT / 2;
  const BIRD_GROUND_Y = -4.65 - (BIRD_HIP_Y - BIRD_LEG_REACH); // feet touch the same ground plane as the others
  const BIRD_BODY_Y = BIRD_HIP_Y + BIRD_BODY_HT / 2 - 0.02;
  const BIRD_FLIGHT_Y = 5.0; // cruising altitude - comfortably clears AURA's head, even mid-dance-bounce

  const birdAnimBones = { legL: null, legR: null, wingL: null, wingR: null, head: null };
  const petBird = new THREE.Group();
  petBird.position.set(petCat.position.x, BIRD_FLIGHT_Y, petCat.position.z - 2.0);
  scene.add(petBird);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const birdMatMain = bodyMat(COLORS.orange);
  const birdMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body ----
  const birdBody = new THREE.Group(); birdBody.position.set(0, BIRD_BODY_Y, 0); petBird.add(birdBody);
  const birdTorso = new THREE.Mesh(roundedBoxGeometry(BIRD_BODY_WID, BIRD_BODY_HT, BIRD_BODY_LEN, 0.13), birdMatMain);
  birdTorso.castShadow = true; birdTorso.receiveShadow = true; addOutline(birdTorso, 0.03); birdBody.add(birdTorso);
  const birdBelly = new THREE.Mesh(new THREE.BoxGeometry(BIRD_BODY_WID * 0.7, 0.06, BIRD_BODY_LEN * 0.6), birdMatDark);
  birdBelly.position.set(0, -BIRD_BODY_HT / 2 + 0.01, 0); addOutline(birdBelly, 0.02); birdBody.add(birdBelly);

  // tail feathers - a simple flat fan angled down-and-back
  const birdTailShape = new THREE.Shape();
  birdTailShape.moveTo(-0.1, 0); birdTailShape.lineTo(0.1, 0); birdTailShape.lineTo(0.03, -0.32); birdTailShape.lineTo(-0.03, -0.32); birdTailShape.closePath();
  const birdTailGeo = new THREE.ExtrudeGeometry(birdTailShape, { depth: 0.03, bevelEnabled: false });
  birdTailGeo.translate(0, 0, -0.015);
  const birdTail = new THREE.Mesh(birdTailGeo, birdMatDark); birdTail.castShadow = true; addOutline(birdTail, 0.02);
  birdTail.rotation.x = Math.PI / 2 - 0.35;
  birdTail.position.set(0, BIRD_BODY_HT * 0.05, -BIRD_BODY_LEN / 2 + 0.02);
  birdBody.add(birdTail);

  // ---- Head ----
  const birdHead = new THREE.Group();
  birdHead.position.set(0, BIRD_BODY_HT / 2 + 0.09, BIRD_BODY_LEN / 2 - 0.03);
  birdAnimBones.head = birdHead; birdBody.add(birdHead);
  const birdHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14), birdMatMain);
  birdHeadShell.castShadow = true; addOutline(birdHeadShell, 0.035); birdHead.add(birdHeadShell);
  const birdBeak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 10), birdMatDark);
  birdBeak.rotation.x = Math.PI / 2; birdBeak.position.set(0, -0.02, 0.19); birdBeak.castShadow = true; addOutline(birdBeak, 0.02); birdHead.add(birdBeak);
  const birdEyeGeo = new THREE.SphereGeometry(0.032, 10, 8);
  const birdEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const birdEyeL = new THREE.Mesh(birdEyeGeo, birdEyeMat); birdEyeL.position.set(-0.09, 0.03, 0.11); birdHead.add(birdEyeL);
  const birdEyeR = new THREE.Mesh(birdEyeGeo, birdEyeMat); birdEyeR.position.set(0.09, 0.03, 0.11); birdHead.add(birdEyeR);
  const birdNub = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  birdNub.position.set(0, 0.15, -0.03); birdHead.add(birdNub);

  // ---- Wings (hinged at the shoulders, flap on the Z axis) ----
  function buildBirdWing(sign) {
    const hinge = new THREE.Group();
    hinge.position.set(sign * BIRD_BODY_WID * 0.42, BIRD_BODY_HT * 0.12, -0.02);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.02); wingShape.lineTo(sign * 0.5, 0.1); wingShape.lineTo(sign * 0.58, -0.02);
    wingShape.lineTo(sign * 0.34, -0.24); wingShape.lineTo(sign * 0.05, -0.1); wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
    wingGeo.translate(0, 0, -0.0175);
    const wingMesh = new THREE.Mesh(wingGeo, birdMatMain); wingMesh.castShadow = true; addOutline(wingMesh, 0.025);
    hinge.add(wingMesh); return hinge;
  }
  birdAnimBones.wingL = buildBirdWing(-1); birdBody.add(birdAnimBones.wingL);
  birdAnimBones.wingR = buildBirdWing(1); birdBody.add(birdAnimBones.wingR);

  // ---- Legs (simple single-segment, tucked in flight / planted on landing) ----
  function buildBirdLeg(signX) {
    const hip = new THREE.Group(); hip.position.set(signX * (BIRD_BODY_WID / 2 - 0.03), BIRD_HIP_Y, 0);
    const shank = ribbedTube(BIRD_LEG_LEN, 0.045, 2, COLORS.grey, COLORS.greyLt); shank.position.y = -BIRD_LEG_LEN / 2; hip.add(shank);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, BIRD_FOOT_HT, 10), birdMatDark);
    foot.position.set(0, -(BIRD_LEG_LEN + BIRD_FOOT_HT / 2), 0.015); foot.castShadow = true; addOutline(foot, 0.02); hip.add(foot);
    return { hip };
  }
  birdAnimBones.legL = buildBirdLeg(-1); petBird.add(birdAnimBones.legL.hip);
  birdAnimBones.legR = buildBirdLeg(1);  petBird.add(birdAnimBones.legR.hip);

  // ---- Follow / flight state (chained to the CAT) ----
  let birdFacing = petCat.rotation.y;
  let birdGroundedAmount = 0;   // 0 = airborne, 1 = fully landed
  let birdIdleTimer = 0;
  let BIRD_FOLLOW_DIST = 4.0;
  const BIRD_FOLLOW_SIDE = 0.4;
  const BIRD_ARRIVE_DIST = 0.4;

  function updatePetBird(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * BIRD_FOLLOW_DIST + rightX * BIRD_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * BIRD_FOLLOW_DIST + rightZ * BIRD_FOLLOW_SIDE;

    const prevX = petBird.position.x, prevZ = petBird.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    const followLerp = 1 - Math.pow(0.0025, dt);
    petBird.position.x += (targetX - prevX) * followLerp;
    petBird.position.z += (targetZ - prevZ) * followLerp;

    const dx = petBird.position.x - prevX, dz = petBird.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const isMoving = stepDist > 0.0009;

    let turnDiff = 0;
    if (isMoving) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - birdFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      birdFacing += diff * Math.min(1, dt * 7);
      turnDiff = diff;
    } else {
      let diff = leader.rotY - birdFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      birdFacing += diff * Math.min(1, dt * 1.8);
    }
    petBird.rotation.y = birdFacing;

    // --- Land / take off decision ---
    const leaderStill = !leader.moving;
    if (!isMoving && distToSpot < BIRD_ARRIVE_DIST && leaderStill) birdIdleTimer += dt;
    else birdIdleTimer = 0;
    const wantsToLand = birdIdleTimer > 0.4;
    birdGroundedAmount = THREE.MathUtils.lerp(birdGroundedAmount, wantsToLand ? 1 : 0, Math.min(1, dt * 3.2));

    // --- Altitude: cruises just above AURA's height, descends to the ground once landed ---
    const altitude = THREE.MathUtils.lerp(BIRD_FLIGHT_Y, BIRD_GROUND_Y, birdGroundedAmount);
    const flightBob = (1 - birdGroundedAmount) * Math.sin(time * 0.0022) * 0.18;
    petBird.position.y = altitude + flightBob;

    // --- Body pitch while gliding + a little bank into turns ---
    birdBody.rotation.x = -0.15 * (1 - birdGroundedAmount) + Math.sin(time * 0.003) * 0.03 * (1 - birdGroundedAmount);
    birdBody.rotation.z = THREE.MathUtils.clamp(-turnDiff * 3, -0.5, 0.5) * (1 - birdGroundedAmount);

    // --- Wings: flap while airborne, fold flat against the body once landed ---
    const wingBase = THREE.MathUtils.lerp(0.55, 0.08, birdGroundedAmount);
    const flapValue = Math.sin(time * 0.001 * 9.5) * 0.55 * (1 - birdGroundedAmount);
    birdAnimBones.wingL.rotation.z = -(wingBase + flapValue);
    birdAnimBones.wingR.rotation.z = (wingBase + flapValue);

    // --- Legs: tucked up against the belly in flight, planted once landed ---
    const legAngle = THREE.MathUtils.lerp(-1.3, -0.05, birdGroundedAmount);
    birdAnimBones.legL.hip.rotation.x = legAngle;
    birdAnimBones.legR.hip.rotation.x = legAngle;

    // --- Head: little look-around once perched ---
    birdHead.rotation.y = Math.sin(time * 0.0006) * 0.2 * birdGroundedAmount;
    birdHead.rotation.x = Math.sin(time * 0.0009) * 0.08 * birdGroundedAmount;
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT ALPACA COMPANION (follows the BIRD) ----------
  // Last link in the chain: AURA -> dog -> cat -> bird -> alpaca. Same
  // materials/helpers as the rest of the family, but built tall instead of
  // long: long legs and a long upright neck instead of a low, stretched-out
  // body, standing about half of AURA's own height. Instead of sitting like
  // the dog/cat or landing like the bird, it "kushes" - folding all four
  // legs under itself the way real alpacas rest - dips its long neck into a
  // contented little graze, perks its ears, and gives a slow side-to-side
  // sway like it's humming to itself (real alpacas hum when they're happy).
  // ======================================================================
  const ALPACA_BODY_WID = 1.0, ALPACA_BODY_LEN = 1.8, ALPACA_BODY_HT = 1.1;
  const ALPACA_HIP_Y = -1.85;              // hip-joint height, relative to the alpaca's root group
  const ALPACA_LEG_SEG = 1.0;              // thigh & shin segment length (equal) - long, gangly legs
  const ALPACA_PAW_HT = 0.22;
  const ALPACA_LEG_REACH = ALPACA_LEG_SEG * 2 + ALPACA_PAW_HT; // hip-to-paw-bottom distance
  const ALPACA_BASE_Y = -4.65 - (ALPACA_HIP_Y - ALPACA_LEG_REACH); // puts paws on the same ground plane as everyone else
  const ALPACA_BODY_Y = ALPACA_HIP_Y + ALPACA_BODY_HT / 2 - 0.06;  // body group sits just above the hips
  const ALPACA_NECK_LEN = 1.15;
  const matWool = bodyMat(0xFFEFD9); // soft cream accent for fluffy tufts, topknot & tail - reads as "wool" against AURA's orange shell

  const alpacaAnimBones = { legFL:{hip:null,knee:null}, legFR:{hip:null,knee:null}, legBL:{hip:null,knee:null}, legBR:{hip:null,knee:null}, tail:null, head:null, neck:null, earL:null, earR:null };
  const petAlpaca = new THREE.Group();
  petAlpaca.position.set(petBird.position.x, ALPACA_BASE_Y, petBird.position.z - 2.0);
  scene.add(petAlpaca);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const alpacaMatMain = bodyMat(COLORS.orange);
  const alpacaMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (torso, neck, head and tail all ride together as one animated group) ----
  const alpacaBody = new THREE.Group(); alpacaBody.position.set(0, ALPACA_BODY_Y, 0); petAlpaca.add(alpacaBody);
  const alpacaTorso = new THREE.Mesh(roundedBoxGeometry(ALPACA_BODY_WID, ALPACA_BODY_HT, ALPACA_BODY_LEN, 0.3), alpacaMatMain);
  alpacaTorso.castShadow = true; alpacaTorso.receiveShadow = true; addOutline(alpacaTorso, 0.05); alpacaBody.add(alpacaTorso);
  const alpacaBelly = new THREE.Mesh(new THREE.BoxGeometry(ALPACA_BODY_WID * 0.72, 0.1, ALPACA_BODY_LEN * 0.7), alpacaMatDark);
  alpacaBelly.position.set(0, -ALPACA_BODY_HT / 2 + 0.02, 0); addOutline(alpacaBelly, 0.03); alpacaBody.add(alpacaBelly);
  // Fluffy "wool" tufts along the back - stylized puffs instead of a smooth plate, to read as fleece
  function alpacaTuft(x, y, z, r) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), matWool);
    tuft.position.set(x, y, z); tuft.castShadow = true; addOutline(tuft, r * 0.3); alpacaBody.add(tuft);
    return tuft;
  }
  alpacaTuft(0, ALPACA_BODY_HT * 0.42, ALPACA_BODY_LEN * 0.2, 0.26);
  alpacaTuft(-0.24, ALPACA_BODY_HT * 0.36, -ALPACA_BODY_LEN * 0.06, 0.24);
  alpacaTuft(0.24, ALPACA_BODY_HT * 0.36, -ALPACA_BODY_LEN * 0.06, 0.24);
  alpacaTuft(0, ALPACA_BODY_HT * 0.32, -ALPACA_BODY_LEN * 0.32, 0.24);
  const alpacaNub = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  alpacaNub.position.set(0, ALPACA_BODY_HT / 2 + 0.1, ALPACA_BODY_LEN * 0.35); alpacaBody.add(alpacaNub);

  // ---- Neck (the alpaca's signature feature - long, upright, gently ribbed) ----
  const alpacaNeckHinge = new THREE.Group();
  alpacaNeckHinge.position.set(0, ALPACA_BODY_HT * 0.34, ALPACA_BODY_LEN / 2 - 0.12);
  alpacaNeckHinge.rotation.x = 0.27;
  alpacaAnimBones.neck = alpacaNeckHinge; alpacaBody.add(alpacaNeckHinge);
  const alpacaNeckSeg = ribbedTube(ALPACA_NECK_LEN, 0.2, 3, COLORS.orange, COLORS.orangeDk);
  alpacaNeckSeg.position.y = ALPACA_NECK_LEN / 2; alpacaNeckHinge.add(alpacaNeckSeg);

  // ---- Head (small, long-muzzled, banana-eared, with a fluffy topknot) ----
  const alpacaHead = new THREE.Group();
  alpacaHead.position.set(0, ALPACA_NECK_LEN + 0.06, 0);
  alpacaAnimBones.head = alpacaHead; alpacaNeckHinge.add(alpacaHead);
  const alpacaHeadShell = new THREE.Mesh(roundedBoxGeometry(0.42, 0.4, 0.58, 0.16), alpacaMatMain);
  alpacaHeadShell.castShadow = true; addOutline(alpacaHeadShell, 0.035); alpacaHead.add(alpacaHeadShell);
  const alpacaMuzzle = new THREE.Mesh(roundedBoxGeometry(0.26, 0.22, 0.26, 0.09), alpacaMatMain);
  alpacaMuzzle.position.set(0, -0.08, 0.36); alpacaMuzzle.castShadow = true; addOutline(alpacaMuzzle, 0.03); alpacaHead.add(alpacaMuzzle);
  const alpacaNose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bodyMat(COLORS.outline));
  alpacaNose.position.set(0, -0.05, 0.49); alpacaHead.add(alpacaNose);
  const alpacaEyeGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const alpacaEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const alpacaEyeL = new THREE.Mesh(alpacaEyeGeo, alpacaEyeMat); alpacaEyeL.position.set(-0.13, 0.03, 0.22); alpacaHead.add(alpacaEyeL);
  const alpacaEyeR = new THREE.Mesh(alpacaEyeGeo, alpacaEyeMat); alpacaEyeR.position.set(0.13, 0.03, 0.22); alpacaHead.add(alpacaEyeR);
  const alpacaTopknot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), matWool);
  alpacaTopknot.position.set(0, 0.24, 0.02); addOutline(alpacaTopknot, 0.03); alpacaHead.add(alpacaTopknot);

  // Banana-shaped ears - a curved extruded silhouette, tall and leaning forward
  function buildAlpacaEar(sign) {
    const hinge = new THREE.Group(); hinge.position.set(sign * 0.16, 0.2, 0.02); hinge.rotation.z = sign * -0.12; hinge.rotation.x = -0.1;
    const earShape = new THREE.Shape();
    earShape.moveTo(0, 0);
    earShape.quadraticCurveTo(sign * 0.14, 0.22, sign * 0.05, 0.42);
    earShape.quadraticCurveTo(sign * -0.02, 0.24, sign * -0.06, 0.02);
    earShape.closePath();
    const earGeo = new THREE.ExtrudeGeometry(earShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
    earGeo.translate(0, 0, -0.025);
    const ear = new THREE.Mesh(earGeo, alpacaMatMain); ear.castShadow = true; addOutline(ear, 0.025); hinge.add(ear);
    return hinge;
  }
  alpacaAnimBones.earL = buildAlpacaEar(-1); alpacaHead.add(alpacaAnimBones.earL);
  alpacaAnimBones.earR = buildAlpacaEar(1);  alpacaHead.add(alpacaAnimBones.earR);

  // ---- Tail (short and stubby, held low, with a fluffy tip) ----
  const alpacaTailHinge = new THREE.Group();
  alpacaTailHinge.position.set(0, ALPACA_BODY_HT * 0.05, -ALPACA_BODY_LEN / 2 - 0.02);
  alpacaTailHinge.rotation.x = -0.6;
  alpacaAnimBones.tail = alpacaTailHinge; alpacaBody.add(alpacaTailHinge);
  const alpacaTailSeg = ribbedTube(0.28, 0.09, 2, COLORS.orange, COLORS.orangeDk);
  alpacaTailSeg.position.y = 0.14; alpacaTailHinge.add(alpacaTailSeg);
  const alpacaTailTuft = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), matWool);
  alpacaTailTuft.position.y = 0.3; addOutline(alpacaTailTuft, 0.03); alpacaTailHinge.add(alpacaTailTuft);

  // ---- Legs (quadruped: front-left/right, back-left/right - long, like the real animal) ----
  function buildAlpacaLeg(signX, isFront) {
    const legZ = isFront ? ALPACA_BODY_LEN * 0.28 : -ALPACA_BODY_LEN * 0.28;
    const hip = new THREE.Group(); hip.position.set(signX * (ALPACA_BODY_WID / 2 - 0.05), ALPACA_HIP_Y, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 14), alpacaMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.035); hip.add(hipBall);
    const thigh = ribbedTube(ALPACA_LEG_SEG, 0.105, 3, COLORS.grey, COLORS.greyLt); thigh.position.y = -ALPACA_LEG_SEG / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -ALPACA_LEG_SEG, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 14), alpacaMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.03); knee.add(kneeBall);
    const shin = ribbedTube(ALPACA_LEG_SEG, 0.085, 3, COLORS.grey, COLORS.greyLt); shin.position.y = -ALPACA_LEG_SEG / 2; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, ALPACA_PAW_HT, 16), alpacaMatDark);
    paw.position.set(0, -(ALPACA_LEG_SEG + ALPACA_PAW_HT / 2), 0.02); paw.castShadow = true; addOutline(paw, 0.03); knee.add(paw);
    return { hip, knee };
  }
  alpacaAnimBones.legFL = buildAlpacaLeg(-1, true);  petAlpaca.add(alpacaAnimBones.legFL.hip);
  alpacaAnimBones.legFR = buildAlpacaLeg(1, true);   petAlpaca.add(alpacaAnimBones.legFR.hip);
  alpacaAnimBones.legBL = buildAlpacaLeg(-1, false); petAlpaca.add(alpacaAnimBones.legBL.hip);
  alpacaAnimBones.legBR = buildAlpacaLeg(1, false);  petAlpaca.add(alpacaAnimBones.legBR.hip);

  // ---- Follow / gait state (chained to the BIRD) ----
  let alpacaFacing = petBird.rotation.y;
  let alpacaWalkPhase = 0;
  let alpacaKushAmount = 0;      // 0 = standing/walking, 1 = fully kushed (resting on folded legs)
  let alpacaIdleTimer = 0;
  let ALPACA_FOLLOW_DIST = 4.0;
  const ALPACA_FOLLOW_SIDE = -0.5;  // opposite side from the bird's landing offset so they don't overlap
  const ALPACA_ARRIVE_DIST = 0.45;
  const ALPACA_MAX_WALK_SPEED = 0.30;

  function updatePetAlpaca(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * ALPACA_FOLLOW_DIST + rightX * ALPACA_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * ALPACA_FOLLOW_DIST + rightZ * ALPACA_FOLLOW_SIDE;

    const prevX = petAlpaca.position.x, prevZ = petAlpaca.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    // Glide toward the follow spot on an invisible leash - lags a little, then catches up
    const followLerp = 1 - Math.pow(0.0025, dt);
    petAlpaca.position.x += (targetX - prevX) * followLerp;
    petAlpaca.position.z += (targetZ - prevZ) * followLerp;

    const dx = petAlpaca.position.x - prevX, dz = petAlpaca.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isWalking = stepDist > 0.0009;

    // --- Facing: turn toward travel direction while moving, otherwise settle to match the bird ---
    if (isWalking) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - alpacaFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      alpacaFacing += diff * Math.min(1, dt * 8);
    } else {
      let diff = leader.rotY - alpacaFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      alpacaFacing += diff * Math.min(1, dt * 2.0);
    }
    petAlpaca.rotation.y = alpacaFacing;

    // --- Kush / stand decision - waits for the leader to have actually settled, not just paused ---
    const leaderStill = !leader.moving;
    if (!isWalking && distToSpot < ALPACA_ARRIVE_DIST && leaderStill) alpacaIdleTimer += dt;
    else alpacaIdleTimer = 0;
    const wantsToKush = alpacaIdleTimer > 0.45;
    alpacaKushAmount = THREE.MathUtils.lerp(alpacaKushAmount, wantsToKush ? 1 : 0, Math.min(1, dt * 3.5));

    // --- Walk gait: diagonal leg pairs move together (FL+BR, FR+BL) ---
    const speedRatio = Math.min(1.5, instantSpeed / ALPACA_MAX_WALK_SPEED);
    if (isWalking) alpacaWalkPhase += dt * (11 * Math.max(speedRatio, 0.4));
    const strideAmt = Math.min(1, speedRatio + 0.35) * (1 - alpacaKushAmount);
    const strideA = Math.sin(alpacaWalkPhase) * 0.6 * strideAmt;
    const strideB = -strideA;

    // Kush pose: all four legs fold up underneath, settling the whole body down onto its heels
    const kushFrontHip = -0.25, kushBackHip = -1.3, kushFrontKnee = 1.7, kushBackKnee = 1.75;
    const baseFrontKnee = 0.08, baseBackKnee = 0.28;

    alpacaAnimBones.legFL.hip.rotation.x = strideA + kushFrontHip * alpacaKushAmount;
    alpacaAnimBones.legBR.hip.rotation.x = strideA + kushBackHip * alpacaKushAmount;
    alpacaAnimBones.legFR.hip.rotation.x = strideB + kushFrontHip * alpacaKushAmount;
    alpacaAnimBones.legBL.hip.rotation.x = strideB + kushBackHip * alpacaKushAmount;

    alpacaAnimBones.legFL.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, kushFrontKnee, alpacaKushAmount);
    alpacaAnimBones.legFR.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, kushFrontKnee, alpacaKushAmount);
    alpacaAnimBones.legBL.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, kushBackKnee, alpacaKushAmount);
    alpacaAnimBones.legBR.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, kushBackKnee, alpacaKushAmount);

    // --- Body posture: gentle bob while walking, sinks down onto its folded legs once kushed ---
    const walkBob = isWalking ? Math.abs(Math.sin(alpacaWalkPhase * 2)) * 0.05 : Math.sin(time * 0.0028) * 0.02;
    alpacaBody.position.y = ALPACA_BODY_Y + walkBob - alpacaKushAmount * 0.48;
    alpacaBody.rotation.x = -alpacaKushAmount * 0.08;

    // --- Neck & head: proud and upright while walking, dips into a happy little graze once
    //     settled, with a slow side-to-side sway like it's humming to itself ---
    const humSway = Math.sin(time * 0.0012) * 0.1 * alpacaKushAmount;
    alpacaNeckHinge.rotation.x = 0.27 + alpacaKushAmount * 0.55 + (isWalking ? Math.sin(alpacaWalkPhase) * 0.03 : 0);
    alpacaNeckHinge.rotation.y = humSway;
    alpacaHead.rotation.x = isWalking ? 0 : Math.sin(time * 0.0008) * 0.06 * alpacaKushAmount;

    // --- Ears: perk up and swivel forward once settled and content ---
    const earPerk = alpacaKushAmount * 0.3;
    alpacaAnimBones.earL.rotation.x = -0.1 - earPerk + Math.sin(time * 0.002) * 0.03 * alpacaKushAmount;
    alpacaAnimBones.earR.rotation.x = -0.1 - earPerk + Math.sin(time * 0.002 + 0.5) * 0.03 * alpacaKushAmount;

    // --- Tail: a happy little flick, quicker and wider once settled ---
    const tailSpeed = isWalking ? 2.0 : THREE.MathUtils.lerp(1.6, 3.2, alpacaKushAmount);
    const tailAmp = isWalking ? 0.12 : THREE.MathUtils.lerp(0.1, 0.28, alpacaKushAmount);
    alpacaAnimBones.tail.rotation.y = Math.sin(time * 0.001 * tailSpeed) * tailAmp;

    // --- Whole-body settle bounce, keeps paws reading as planted on the ground ---
    petAlpaca.position.y = ALPACA_BASE_Y + (isWalking ? Math.abs(Math.sin(alpacaWalkPhase * 2)) * 0.04 : 0);
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT BUNNY COMPANION (follows the ALPACA) ----------
  // Newest and smallest link in the chain: AURA -> dog -> cat -> bird ->
  // alpaca -> bunny. Short front legs, long powerful back legs, and tall
  // thin ears set it apart at a glance. Instead of trotting it hops - the
  // whole body arcs up in little bounces, tucking its legs mid-air and
  // planting them again on landing. The moment the chain stops, it does the
  // classic bunny "periscope": rearing up onto its hind legs, front paws
  // tucked to its chest, ears snapping straight up to listen.
  // ======================================================================
  const BUNNY_BODY_WID = 0.42, BUNNY_BODY_LEN = 0.62, BUNNY_BODY_HT = 0.38;
  const BUNNY_BACK_HIP_Y = -0.34;          // hind hip height - hindquarters ride higher than the shoulders
  const BUNNY_BACK_LEG_SEG = 0.30;         // long, powerful hind legs
  const BUNNY_FRONT_LEG_SEG = 0.16;        // short front legs
  const BUNNY_PAW_HT = 0.08;
  const BUNNY_BACK_LEG_REACH = BUNNY_BACK_LEG_SEG * 2 + BUNNY_PAW_HT;
  const BUNNY_FRONT_LEG_REACH = BUNNY_FRONT_LEG_SEG * 2 + BUNNY_PAW_HT;
  const BUNNY_GROUND_OFFSET = BUNNY_BACK_HIP_Y - BUNNY_BACK_LEG_REACH;   // shared constant so front & back paws land on the same ground plane
  const BUNNY_FRONT_HIP_Y = BUNNY_GROUND_OFFSET + BUNNY_FRONT_LEG_REACH; // sits lower than the back hip since the legs are shorter
  const BUNNY_BASE_Y = -4.65 - BUNNY_GROUND_OFFSET;
  const BUNNY_BODY_Y = BUNNY_BACK_HIP_Y + BUNNY_BODY_HT / 2 - 0.05;

  const bunnyAnimBones = { legFL:{hip:null,knee:null}, legFR:{hip:null,knee:null}, legBL:{hip:null,knee:null}, legBR:{hip:null,knee:null}, tail:null, head:null, earL:null, earR:null };
  const petBunny = new THREE.Group();
  petBunny.position.set(petAlpaca.position.x, BUNNY_BASE_Y, petAlpaca.position.z - 1.6);
  scene.add(petBunny);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const bunnyMatMain = bodyMat(COLORS.orange);
  const bunnyMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (torso + head + tail all ride together as one animated group) ----
  const bunnyBody = new THREE.Group(); bunnyBody.position.set(0, BUNNY_BODY_Y, 0); petBunny.add(bunnyBody);
  const bunnyTorso = new THREE.Mesh(roundedBoxGeometry(BUNNY_BODY_WID, BUNNY_BODY_HT, BUNNY_BODY_LEN, 0.18), bunnyMatMain);
  bunnyTorso.castShadow = true; bunnyTorso.receiveShadow = true; addOutline(bunnyTorso, 0.04); bunnyBody.add(bunnyTorso);
  const bunnyBelly = new THREE.Mesh(new THREE.BoxGeometry(BUNNY_BODY_WID * 0.7, 0.07, BUNNY_BODY_LEN * 0.65), bunnyMatDark);
  bunnyBelly.position.set(0, -BUNNY_BODY_HT / 2 + 0.015, 0); addOutline(bunnyBelly, 0.02); bunnyBody.add(bunnyBelly);
  const bunnyChestFluff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), matWool);
  bunnyChestFluff.position.set(0, -BUNNY_BODY_HT * 0.05, BUNNY_BODY_LEN / 2 - 0.06); addOutline(bunnyChestFluff, 0.025); bunnyBody.add(bunnyChestFluff);
  const bunnyNub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  bunnyNub.position.set(0, BUNNY_BODY_HT / 2 + 0.04, -BUNNY_BODY_LEN * 0.15); bunnyBody.add(bunnyNub);

  // ---- Head (small and round, big eyes, with a little twitchy nose) ----
  const bunnyHead = new THREE.Group();
  bunnyHead.position.set(0, BUNNY_BODY_HT / 2 + 0.14, BUNNY_BODY_LEN / 2 - 0.02);
  bunnyAnimBones.head = bunnyHead; bunnyBody.add(bunnyHead);
  const bunnyHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 14), bunnyMatMain);
  bunnyHeadShell.castShadow = true; addOutline(bunnyHeadShell, 0.04); bunnyHead.add(bunnyHeadShell);
  const bunnyMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), bunnyMatMain);
  bunnyMuzzle.position.set(0, -0.08, 0.15); bunnyMuzzle.castShadow = true; addOutline(bunnyMuzzle, 0.025); bunnyHead.add(bunnyMuzzle);
  const bunnyNose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), bodyMat(COLORS.outline));
  bunnyNose.position.set(0, -0.05, 0.25); bunnyHead.add(bunnyNose);
  const bunnyEyeGeo = new THREE.SphereGeometry(0.055, 12, 10);
  const bunnyEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const bunnyEyeL = new THREE.Mesh(bunnyEyeGeo, bunnyEyeMat); bunnyEyeL.position.set(-0.11, 0.03, 0.13); bunnyHead.add(bunnyEyeL);
  const bunnyEyeR = new THREE.Mesh(bunnyEyeGeo, bunnyEyeMat); bunnyEyeR.position.set(0.11, 0.03, 0.13); bunnyHead.add(bunnyEyeR);

  // Tall thin ears - droop back a little at rest/mid-hop, snap straight up when it stands to listen
  function buildBunnyEar(sign) {
    const hinge = new THREE.Group(); hinge.position.set(sign * 0.08, 0.16, -0.02); hinge.rotation.z = sign * -0.08; hinge.rotation.x = -0.3;
    const earShape = new THREE.Shape();
    earShape.moveTo(0, 0);
    earShape.quadraticCurveTo(sign * 0.09, 0.24, sign * 0.03, 0.46);
    earShape.quadraticCurveTo(sign * -0.02, 0.24, sign * -0.05, 0.02);
    earShape.closePath();
    const earGeo = new THREE.ExtrudeGeometry(earShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
    earGeo.translate(0, 0, -0.0175);
    const earOuter = new THREE.Mesh(earGeo, bunnyMatMain); earOuter.castShadow = true; addOutline(earOuter, 0.02); hinge.add(earOuter);
    const earInner = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.34), matWool);
    earInner.position.set(sign * -0.005, 0.24, 0.02); hinge.add(earInner);
    return hinge;
  }
  bunnyAnimBones.earL = buildBunnyEar(-1); bunnyHead.add(bunnyAnimBones.earL);
  bunnyAnimBones.earR = buildBunnyEar(1);  bunnyHead.add(bunnyAnimBones.earR);

  // ---- Tail (a simple round cotton-ball puff) ----
  const bunnyTailHinge = new THREE.Group();
  bunnyTailHinge.position.set(0, BUNNY_BODY_HT * 0.15, -BUNNY_BODY_LEN / 2 + 0.02);
  bunnyAnimBones.tail = bunnyTailHinge; bunnyBody.add(bunnyTailHinge);
  const bunnyTailPuff = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), matWool);
  addOutline(bunnyTailPuff, 0.025); bunnyTailHinge.add(bunnyTailPuff);

  // ---- Legs (short front legs, long hind legs - built separately so each pair keeps its own proportions) ----
  function buildBunnyLeg(signX, isFront) {
    const legSeg = isFront ? BUNNY_FRONT_LEG_SEG : BUNNY_BACK_LEG_SEG;
    const hipY = isFront ? BUNNY_FRONT_HIP_Y : BUNNY_BACK_HIP_Y;
    const legZ = isFront ? BUNNY_BODY_LEN * 0.32 : -BUNNY_BODY_LEN * 0.3;
    const legRadius = isFront ? 0.055 : 0.075;
    const hip = new THREE.Group(); hip.position.set(signX * (BUNNY_BODY_WID / 2 - 0.03), hipY, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), bunnyMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.02); hip.add(hipBall);
    const thigh = ribbedTube(legSeg, legRadius, 2, COLORS.grey, COLORS.greyLt); thigh.position.y = -legSeg / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -legSeg, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), bunnyMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.018); knee.add(kneeBall);
    const shin = ribbedTube(legSeg, legRadius * 0.8, 2, COLORS.grey, COLORS.greyLt); shin.position.y = -legSeg / 2; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 0.9, legRadius, BUNNY_PAW_HT, 14), bunnyMatDark);
    paw.position.set(0, -(legSeg + BUNNY_PAW_HT / 2), 0.015); paw.castShadow = true; addOutline(paw, 0.015); knee.add(paw);
    return { hip, knee };
  }
  bunnyAnimBones.legFL = buildBunnyLeg(-1, true);  petBunny.add(bunnyAnimBones.legFL.hip);
  bunnyAnimBones.legFR = buildBunnyLeg(1, true);   petBunny.add(bunnyAnimBones.legFR.hip);
  bunnyAnimBones.legBL = buildBunnyLeg(-1, false); petBunny.add(bunnyAnimBones.legBL.hip);
  bunnyAnimBones.legBR = buildBunnyLeg(1, false);  petBunny.add(bunnyAnimBones.legBR.hip);

  // ---- Follow / hop state (chained to the ALPACA) ----
  let bunnyFacing = petAlpaca.rotation.y;
  let bunnyHopPhase = 0;
  let bunnyStandAmount = 0;      // 0 = on all fours (hopping/resting), 1 = fully reared up on hind legs
  let bunnyIdleTimer = 0;
  let BUNNY_FOLLOW_DIST = 3.2;
  const BUNNY_FOLLOW_SIDE = 0.5;  // opposite side from the alpaca's own offset so they don't overlap
  const BUNNY_ARRIVE_DIST = 0.4;
  const BUNNY_MAX_HOP_SPEED = 0.30;
  const BUNNY_HOP_RATE = 9; // hops/sec worth of phase speed at full tilt

  function updatePetBunny(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * BUNNY_FOLLOW_DIST + rightX * BUNNY_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * BUNNY_FOLLOW_DIST + rightZ * BUNNY_FOLLOW_SIDE;

    const prevX = petBunny.position.x, prevZ = petBunny.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    // Glide toward the follow spot on an invisible leash - lags a little, then catches up
    const followLerp = 1 - Math.pow(0.0025, dt);
    petBunny.position.x += (targetX - prevX) * followLerp;
    petBunny.position.z += (targetZ - prevZ) * followLerp;

    const dx = petBunny.position.x - prevX, dz = petBunny.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isHopping = stepDist > 0.0009;

    // --- Facing: turn toward travel direction while moving, otherwise settle to match the alpaca ---
    if (isHopping) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - bunnyFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bunnyFacing += diff * Math.min(1, dt * 10);
    } else {
      let diff = leader.rotY - bunnyFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bunnyFacing += diff * Math.min(1, dt * 2.2);
    }
    petBunny.rotation.y = bunnyFacing;

    // --- Stand / drop-down decision - waits for the leader to have actually settled, not just paused ---
    const leaderStill = !leader.moving;
    if (!isHopping && distToSpot < BUNNY_ARRIVE_DIST && leaderStill) bunnyIdleTimer += dt;
    else bunnyIdleTimer = 0;
    const wantsToStand = bunnyIdleTimer > 0.4;
    bunnyStandAmount = THREE.MathUtils.lerp(bunnyStandAmount, wantsToStand ? 1 : 0, Math.min(1, dt * 4.5));

    // --- Hop gait: one continuous phase drives a parabolic bounce - legs push off at the start
    //     of each cycle, tuck up through the airborne arc, then reach down again to land ---
    const speedRatio = Math.min(1.5, instantSpeed / BUNNY_MAX_HOP_SPEED);
    if (isHopping) bunnyHopPhase += dt * BUNNY_HOP_RATE * Math.max(speedRatio, 0.55);
    const cyclePos = (bunnyHopPhase / (Math.PI * 2)) % 1;
    const hopArc = isHopping ? Math.sin(cyclePos * Math.PI) : 0; // 0 at push-off/landing, 1 at the peak
    const hopBlend = hopArc * (1 - bunnyStandAmount);

    const baseFrontHip = 0.05, baseFrontKnee = 0.1, baseBackHip = -0.05, baseBackKnee = 0.15;
    const airFrontHip = -0.9, airFrontKnee = 1.5, airBackHip = -0.6, airBackKnee = 1.4;
    const standFrontHip = -1.35, standFrontKnee = 1.65, standBackHip = -0.12, standBackKnee = 0.3;

    const frontHip = THREE.MathUtils.lerp(baseFrontHip, airFrontHip, hopBlend) * (1 - bunnyStandAmount) + standFrontHip * bunnyStandAmount;
    const frontKnee = THREE.MathUtils.lerp(baseFrontKnee, airFrontKnee, hopBlend) * (1 - bunnyStandAmount) + standFrontKnee * bunnyStandAmount;
    const backHip = THREE.MathUtils.lerp(baseBackHip, airBackHip, hopBlend) * (1 - bunnyStandAmount) + standBackHip * bunnyStandAmount;
    const backKnee = THREE.MathUtils.lerp(baseBackKnee, airBackKnee, hopBlend) * (1 - bunnyStandAmount) + standBackKnee * bunnyStandAmount;

    bunnyAnimBones.legFL.hip.rotation.x = frontHip;   bunnyAnimBones.legFR.hip.rotation.x = frontHip;
    bunnyAnimBones.legFL.knee.rotation.x = frontKnee; bunnyAnimBones.legFR.knee.rotation.x = frontKnee;
    bunnyAnimBones.legBL.hip.rotation.x = backHip;    bunnyAnimBones.legBR.hip.rotation.x = backHip;
    bunnyAnimBones.legBL.knee.rotation.x = backKnee;  bunnyAnimBones.legBR.knee.rotation.x = backKnee;

    // --- Body: arcs up through the air on each hop, leans forward slightly mid-flight,
    //     and rears all the way up onto its hind legs once it decides to stand ---
    const bodyLean = hopBlend * 0.18;
    bunnyBody.rotation.x = bodyLean - bunnyStandAmount * 1.3;
    bunnyBody.position.y = BUNNY_BODY_Y + hopBlend * 0.05;

    // --- Head: counter-tilts to stay roughly level as the body rears up, little idle bob otherwise ---
    bunnyHead.rotation.x = bunnyStandAmount * 1.05 + (isHopping ? -hopBlend * 0.1 : Math.sin(time * 0.0009) * 0.05 * (1 - bunnyStandAmount));

    // --- Ears: trail back a little on each hop, then snap straight up and alert once it stands ---
    const earFlop = hopBlend * 0.35;
    const earStand = bunnyStandAmount * 0.35;
    bunnyAnimBones.earL.rotation.x = -0.3 - earFlop + earStand + Math.sin(time * 0.003) * 0.02 * bunnyStandAmount;
    bunnyAnimBones.earR.rotation.x = -0.3 - earFlop + earStand + Math.sin(time * 0.003 + 0.4) * 0.02 * bunnyStandAmount;

    // --- Tail: little flick, quickest right after landing each hop ---
    bunnyAnimBones.tail.rotation.x = -hopBlend * 0.4 - bunnyStandAmount * 0.2;

    // --- Whole-body hop bounce, plus a little extra lift once reared up on its hind legs ---
    petBunny.position.y = BUNNY_BASE_Y + hopArc * 0.32 + bunnyStandAmount * 0.22;
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT FROG COMPANION (follows whoever's ahead of it) ----------
  // Squat, wide body sitting low in a permanent crouch, with big round eyes
  // bulging up off the top of its head and a webbed paw on each foot.
  // Instead of trotting or hopping steadily, it covers ground in big,
  // spaced-out leaps - a explosive push off the powerful back legs, a tucked
  // mid-air arc, then a soft crouch-landing. The moment the chain stops, it
  // settles into a rhythmic croak: throat sac puffing out in sharp pulses,
  // head tilted back a little, eyes blinking shut on each pulse.
  // ======================================================================
  const FROG_BODY_WID = 0.55, FROG_BODY_LEN = 0.5, FROG_BODY_HT = 0.3;
  const FROG_BACK_HIP_Y = -0.28;           // hindquarters ride high, coiled and ready to spring
  const FROG_BACK_LEG_SEG = 0.26;          // powerful hind legs for the leap
  const FROG_FRONT_LEG_SEG = 0.14;         // short front legs, mostly just for landing balance
  const FROG_PAW_HT = 0.07;
  const FROG_BACK_LEG_REACH = FROG_BACK_LEG_SEG * 2 + FROG_PAW_HT;
  const FROG_FRONT_LEG_REACH = FROG_FRONT_LEG_SEG * 2 + FROG_PAW_HT;
  const FROG_GROUND_OFFSET = FROG_BACK_HIP_Y - FROG_BACK_LEG_REACH; // shared constant so front & back paws land on the same ground plane
  const FROG_FRONT_HIP_Y = FROG_GROUND_OFFSET + FROG_FRONT_LEG_REACH;
  const FROG_BASE_Y = -4.65 - FROG_GROUND_OFFSET;
  const FROG_BODY_Y = FROG_BACK_HIP_Y + FROG_BODY_HT / 2 - 0.02;

  const frogAnimBones = { legFL:{hip:null,knee:null}, legFR:{hip:null,knee:null}, legBL:{hip:null,knee:null}, legBR:{hip:null,knee:null}, head:null, throat:null, eyeL:null, eyeR:null };
  const petFrog = new THREE.Group();
  petFrog.position.set(petBunny.position.x, FROG_BASE_Y, petBunny.position.z - 1.6);
  scene.add(petFrog);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const frogMatMain = bodyMat(COLORS.orange);
  const frogMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (torso + head all ride together as one animated group - no tail on a frog) ----
  const frogBody = new THREE.Group(); frogBody.position.set(0, FROG_BODY_Y, 0); petFrog.add(frogBody);
  const frogTorso = new THREE.Mesh(roundedBoxGeometry(FROG_BODY_WID, FROG_BODY_HT, FROG_BODY_LEN, 0.2), frogMatMain);
  frogTorso.castShadow = true; frogTorso.receiveShadow = true; addOutline(frogTorso, 0.04); frogBody.add(frogTorso);
  const frogBelly = new THREE.Mesh(new THREE.BoxGeometry(FROG_BODY_WID * 0.75, 0.06, FROG_BODY_LEN * 0.65), matWool);
  frogBelly.position.set(0, -FROG_BODY_HT / 2 + 0.01, 0.02); addOutline(frogBelly, 0.02); frogBody.add(frogBelly);
  const frogNub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  frogNub.position.set(0, FROG_BODY_HT / 2 + 0.03, -FROG_BODY_LEN * 0.2); frogBody.add(frogNub);

  // ---- Head (wide and flat, with big eyes bulging up off the top and a puffing throat sac underneath) ----
  const frogHead = new THREE.Group();
  frogHead.position.set(0, FROG_BODY_HT / 2 + 0.02, FROG_BODY_LEN / 2 - 0.08);
  frogAnimBones.head = frogHead; frogBody.add(frogHead);
  const frogHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), frogMatMain);
  frogHeadShell.scale.set(1.15, 0.62, 1.05); frogHeadShell.castShadow = true; addOutline(frogHeadShell, 0.035); frogHead.add(frogHeadShell);
  const frogMouth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.02), bodyMat(COLORS.outline));
  frogMouth.position.set(0, -0.03, 0.19); frogHead.add(frogMouth);

  // Eyes ride on short stalks poking up off the top of the head - the classic frog silhouette
  function buildFrogEyeStalk(sign) {
    const stalk = new THREE.Group(); stalk.position.set(sign * 0.1, 0.07, 0.03);
    const stalkPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.05, 12), frogMatMain);
    stalkPost.position.y = 0.02; addOutline(stalkPost, 0.012); stalk.add(stalkPost);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 }));
    eye.position.y = 0.065; stalk.add(eye);
    return { group: stalk, eye };
  }
  const frogEyeStalkL = buildFrogEyeStalk(-1); frogHead.add(frogEyeStalkL.group); frogAnimBones.eyeL = frogEyeStalkL.eye;
  const frogEyeStalkR = buildFrogEyeStalk(1);  frogHead.add(frogEyeStalkR.group); frogAnimBones.eyeR = frogEyeStalkR.eye;

  // Throat sac - tucked under the chin, hidden at rest and puffs out in rhythmic pulses while croaking
  const frogThroat = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), matWool);
  frogThroat.position.set(0, -0.12, 0.13); addOutline(frogThroat, 0.02); frogAnimBones.throat = frogThroat; frogHead.add(frogThroat);

  // ---- Legs (short front legs for balance, long powerful hind legs for the leap; wide flat webbed paws) ----
  function buildFrogLeg(signX, isFront) {
    const legSeg = isFront ? FROG_FRONT_LEG_SEG : FROG_BACK_LEG_SEG;
    const hipY = isFront ? FROG_FRONT_HIP_Y : FROG_BACK_HIP_Y;
    const legZ = isFront ? FROG_BODY_LEN * 0.35 : -FROG_BODY_LEN * 0.32;
    const legRadius = isFront ? 0.05 : 0.07;
    const hip = new THREE.Group(); hip.position.set(signX * (FROG_BODY_WID / 2 - 0.02), hipY, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 12), frogMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.02); hip.add(hipBall);
    const thigh = ribbedTube(legSeg, legRadius, 2, COLORS.grey, COLORS.greyLt); thigh.position.y = -legSeg / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -legSeg, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), frogMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.016); knee.add(kneeBall);
    const shin = ribbedTube(legSeg, legRadius * 0.85, 2, COLORS.grey, COLORS.greyLt); shin.position.y = -legSeg / 2; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(legRadius * 3.2, FROG_PAW_HT * 0.7, legRadius * 2.4), frogMatDark);
    paw.position.set(0, -(legSeg + FROG_PAW_HT / 2), legRadius * 0.6); paw.castShadow = true; addOutline(paw, 0.014); knee.add(paw);
    return { hip, knee };
  }
  frogAnimBones.legFL = buildFrogLeg(-1, true);  petFrog.add(frogAnimBones.legFL.hip);
  frogAnimBones.legFR = buildFrogLeg(1, true);   petFrog.add(frogAnimBones.legFR.hip);
  frogAnimBones.legBL = buildFrogLeg(-1, false); petFrog.add(frogAnimBones.legBL.hip);
  frogAnimBones.legBR = buildFrogLeg(1, false);  petFrog.add(frogAnimBones.legBR.hip);

  // ---- Follow / leap state ----
  let frogFacing = petBunny.rotation.y;
  let frogLeapPhase = 0;
  let frogCroakAmount = 0;   // 0 = quiet, 1 = fully settled into its croak
  let frogIdleTimer = 0;
  let FROG_FOLLOW_DIST = 2.6;
  const FROG_FOLLOW_SIDE = -0.5;
  const FROG_ARRIVE_DIST = 0.35;
  const FROG_MAX_LEAP_SPEED = 0.34; // frogs cover a lot of ground per leap
  const FROG_LEAP_RATE = 5;         // slower cadence than the bunny's hop - big leaps, longer pause between

  function updatePetFrog(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * FROG_FOLLOW_DIST + rightX * FROG_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * FROG_FOLLOW_DIST + rightZ * FROG_FOLLOW_SIDE;

    const prevX = petFrog.position.x, prevZ = petFrog.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    // Glide toward the follow spot on an invisible leash - lags a little, then catches up
    const followLerp = 1 - Math.pow(0.0025, dt);
    petFrog.position.x += (targetX - prevX) * followLerp;
    petFrog.position.z += (targetZ - prevZ) * followLerp;

    const dx = petFrog.position.x - prevX, dz = petFrog.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isLeaping = stepDist > 0.0009;

    // --- Facing: turn toward travel direction while leaping, otherwise settle to match the leader ---
    if (isLeaping) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - frogFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      frogFacing += diff * Math.min(1, dt * 9);
    } else {
      let diff = leader.rotY - frogFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      frogFacing += diff * Math.min(1, dt * 2.2);
    }
    petFrog.rotation.y = frogFacing;

    // --- Croak decision - waits for the leader to have actually settled, not just paused ---
    const leaderStill = !leader.moving;
    if (!isLeaping && distToSpot < FROG_ARRIVE_DIST && leaderStill) frogIdleTimer += dt;
    else frogIdleTimer = 0;
    const wantsToCroak = frogIdleTimer > 0.5;
    frogCroakAmount = THREE.MathUtils.lerp(frogCroakAmount, wantsToCroak ? 1 : 0, Math.min(1, dt * 3.5));

    // --- Leap gait: one continuous phase drives a parabolic bounce, spaced further apart
    //     than the bunny's hop so each leap reads as a single explosive push ---
    const speedRatio = Math.min(1.5, instantSpeed / FROG_MAX_LEAP_SPEED);
    if (isLeaping) frogLeapPhase += dt * FROG_LEAP_RATE * Math.max(speedRatio, 0.5);
    const cyclePos = (frogLeapPhase / (Math.PI * 2)) % 1;
    const leapArc = isLeaping ? Math.sin(cyclePos * Math.PI) : 0; // 0 at push-off/landing, 1 at the peak

    const baseFrontHip = 0.35, baseFrontKnee = 0.7, baseBackHip = -0.55, baseBackKnee = 1.3;   // deep resting crouch
    const airFrontHip = -0.6, airFrontKnee = 0.3, airBackHip = 0.15, airBackKnee = 0.25;        // extended mid-leap

    const frontHip = THREE.MathUtils.lerp(baseFrontHip, airFrontHip, leapArc);
    const frontKnee = THREE.MathUtils.lerp(baseFrontKnee, airFrontKnee, leapArc);
    const backHip = THREE.MathUtils.lerp(baseBackHip, airBackHip, leapArc);
    const backKnee = THREE.MathUtils.lerp(baseBackKnee, airBackKnee, leapArc);

    frogAnimBones.legFL.hip.rotation.x = frontHip;   frogAnimBones.legFR.hip.rotation.x = frontHip;
    frogAnimBones.legFL.knee.rotation.x = frontKnee; frogAnimBones.legFR.knee.rotation.x = frontKnee;
    frogAnimBones.legBL.hip.rotation.x = backHip;    frogAnimBones.legBR.hip.rotation.x = backHip;
    frogAnimBones.legBL.knee.rotation.x = backKnee;  frogAnimBones.legBR.knee.rotation.x = backKnee;

    // --- Body: dips into the crouch before/after each leap, stretches out low and level mid-air ---
    frogBody.rotation.x = -leapArc * 0.2;
    frogBody.position.y = FROG_BODY_Y + leapArc * 0.03 - (1 - leapArc) * 0.02;

    // --- Croak cycle: sharp, spaced-out pulses rather than a smooth wobble - throat puffs out,
    //     head tips back a touch, eyes blink shut right on each pulse ---
    const croakPulse = Math.pow(Math.max(0, Math.sin(time * 0.005)), 4) * frogCroakAmount;
    frogHead.rotation.x = -frogCroakAmount * 0.3 - croakPulse * 0.12 + (isLeaping ? -leapArc * 0.1 : Math.sin(time * 0.0008) * 0.03 * (1 - frogCroakAmount));
    const throatInflate = 1 + croakPulse * 1.8;
    frogThroat.scale.set(throatInflate, throatInflate * 0.85, throatInflate);
    const eyeBlink = 1 - croakPulse * 0.75;
    frogAnimBones.eyeL.scale.y = eyeBlink; frogAnimBones.eyeR.scale.y = eyeBlink;

    // --- Whole-body leap arc - big and floaty compared to the bunny's quick hop ---
    petFrog.position.y = FROG_BASE_Y + leapArc * 0.42;
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT MONKEY COMPANION (follows whoever's ahead of it) ----------
  // Long-armed, long-tailed scamperer - knuckle-walks on all fours using the
  // same diagonal trot as the dog/cat, its longer front arms reaching down
  // to the ground. The moment the chain stops, it hops up onto its haunches,
  // tail curling up over its back, right arm reaching down to "produce" a
  // banana and bring it up to its mouth for a happy, repeating munch - jaw
  // opening and closing on each bite, head dipping to meet it.
  // ======================================================================
  const MONKEY_BODY_WID = 0.42, MONKEY_BODY_LEN = 0.56, MONKEY_BODY_HT = 0.42;
  const MONKEY_BACK_HIP_Y = -0.38;          // back hips ride a little high, like the frog's coiled crouch
  const MONKEY_BACK_LEG_SEG = 0.17;         // short back legs
  const MONKEY_FRONT_LEG_SEG = 0.22;        // longer front arms for that knuckle-walking silhouette
  const MONKEY_PAW_HT = 0.07;
  const MONKEY_BACK_LEG_REACH = MONKEY_BACK_LEG_SEG * 2 + MONKEY_PAW_HT;
  const MONKEY_FRONT_LEG_REACH = MONKEY_FRONT_LEG_SEG * 2 + MONKEY_PAW_HT;
  const MONKEY_GROUND_OFFSET = MONKEY_BACK_HIP_Y - MONKEY_BACK_LEG_REACH; // shared constant so front & back paws land on the same ground plane
  const MONKEY_FRONT_HIP_Y = MONKEY_GROUND_OFFSET + MONKEY_FRONT_LEG_REACH;
  const MONKEY_BASE_Y = -4.65 - MONKEY_GROUND_OFFSET;
  const MONKEY_BODY_Y = MONKEY_BACK_HIP_Y + MONKEY_BODY_HT / 2 + 0.05;

  const monkeyAnimBones = { legFL:{hip:null,knee:null,hand:null}, legFR:{hip:null,knee:null,hand:null}, legBL:{hip:null,knee:null}, legBR:{hip:null,knee:null}, tail:null, head:null, jaw:null };
  const petMonkey = new THREE.Group();
  petMonkey.position.set(petFrog.position.x, MONKEY_BASE_Y, petFrog.position.z - 1.6);
  scene.add(petMonkey);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const monkeyMatMain = bodyMat(COLORS.orange);
  const monkeyMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (torso + head + tail all ride together as one animated group) ----
  const monkeyBody = new THREE.Group(); monkeyBody.position.set(0, MONKEY_BODY_Y, 0); petMonkey.add(monkeyBody);
  const monkeyTorso = new THREE.Mesh(roundedBoxGeometry(MONKEY_BODY_WID, MONKEY_BODY_HT, MONKEY_BODY_LEN, 0.16), monkeyMatMain);
  monkeyTorso.castShadow = true; monkeyTorso.receiveShadow = true; addOutline(monkeyTorso, 0.035); monkeyBody.add(monkeyTorso);
  const monkeyBelly = new THREE.Mesh(new THREE.BoxGeometry(MONKEY_BODY_WID * 0.7, 0.08, MONKEY_BODY_LEN * 0.62), matWool);
  monkeyBelly.position.set(0, -MONKEY_BODY_HT / 2 + 0.015, 0.02); addOutline(monkeyBelly, 0.02); monkeyBody.add(monkeyBelly);
  const monkeyNub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  monkeyNub.position.set(0, MONKEY_BODY_HT / 2 + 0.05, -MONKEY_BODY_LEN * 0.15); monkeyBody.add(monkeyNub);

  // ---- Head (round, with big rounded ears, a small forward muzzle and a hinged chewing jaw) ----
  const monkeyHead = new THREE.Group();
  monkeyHead.position.set(0, MONKEY_BODY_HT / 2 + 0.14, MONKEY_BODY_LEN / 2 - 0.02);
  monkeyAnimBones.head = monkeyHead; monkeyBody.add(monkeyHead);
  const monkeyHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), monkeyMatMain);
  monkeyHeadShell.scale.set(1.0, 0.92, 0.95); monkeyHeadShell.castShadow = true; addOutline(monkeyHeadShell, 0.032); monkeyHead.add(monkeyHeadShell);
  const monkeyMuzzle = new THREE.Mesh(roundedBoxGeometry(0.19, 0.15, 0.16, 0.06), matWool);
  monkeyMuzzle.position.set(0, -0.07, 0.16); monkeyMuzzle.castShadow = true; addOutline(monkeyMuzzle, 0.025); monkeyHead.add(monkeyMuzzle);
  const monkeyNose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), bodyMat(COLORS.outline));
  monkeyNose.position.set(0, 0.03, 0.095); monkeyMuzzle.add(monkeyNose);
  const monkeyEyeGeo = new THREE.SphereGeometry(0.05, 12, 10);
  const monkeyEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const monkeyEyeL = new THREE.Mesh(monkeyEyeGeo, monkeyEyeMat); monkeyEyeL.position.set(-0.09, 0.05, 0.15); monkeyHead.add(monkeyEyeL);
  const monkeyEyeR = new THREE.Mesh(monkeyEyeGeo, monkeyEyeMat); monkeyEyeR.position.set(0.09, 0.05, 0.15); monkeyHead.add(monkeyEyeR);

  // Hinged lower jaw, tucked right under the muzzle - opens and closes for the munch cycle
  const monkeyJawHinge = new THREE.Group(); monkeyJawHinge.position.set(0, -0.13, 0.11);
  monkeyAnimBones.jaw = monkeyJawHinge; monkeyHead.add(monkeyJawHinge);
  const monkeyJaw = new THREE.Mesh(roundedBoxGeometry(0.14, 0.06, 0.12, 0.03), matWool);
  monkeyJaw.position.set(0, -0.02, 0.02); monkeyJaw.castShadow = true; addOutline(monkeyJaw, 0.018); monkeyJawHinge.add(monkeyJaw);

  // Big, round, forward-facing ears - the classic monkey silhouette
  function buildMonkeyEar(sign) {
    const ear = new THREE.Group(); ear.position.set(sign * 0.19, 0.02, -0.01);
    const earOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.035, 20), monkeyMatMain);
    earOuter.rotation.z = Math.PI / 2; earOuter.castShadow = true; addOutline(earOuter, 0.02); ear.add(earOuter);
    const earInner = new THREE.Mesh(new THREE.CircleGeometry(0.058, 16), matWool);
    earInner.rotation.y = Math.PI / 2; earInner.position.x = sign * 0.019; ear.add(earInner);
    return ear;
  }
  monkeyHead.add(buildMonkeyEar(-1)); monkeyHead.add(buildMonkeyEar(1));

  // ---- Tail (long, trails low while it scampers, curls up over its back once it settles) ----
  const monkeyTailHinge = new THREE.Group();
  monkeyTailHinge.position.set(0, MONKEY_BODY_HT * 0.1, -MONKEY_BODY_LEN / 2 + 0.02);
  monkeyTailHinge.rotation.x = -1.0;
  monkeyAnimBones.tail = monkeyTailHinge; monkeyBody.add(monkeyTailHinge);
  const monkeyTailSeg = ribbedTube(0.85, 0.045, 5, COLORS.orange, COLORS.orangeDk);
  monkeyTailSeg.position.y = 0.425; monkeyTailHinge.add(monkeyTailSeg);
  const monkeyTailTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), monkeyMatDark);
  monkeyTailTip.position.y = 0.85; addOutline(monkeyTailTip, 0.016); monkeyTailHinge.add(monkeyTailTip);

  // ---- Legs (front = long arms that reach the ground while scampering, back = short legs) ----
  function buildMonkeyLeg(signX, isFront) {
    const legSeg = isFront ? MONKEY_FRONT_LEG_SEG : MONKEY_BACK_LEG_SEG;
    const hipY = isFront ? MONKEY_FRONT_HIP_Y : MONKEY_BACK_HIP_Y;
    const legZ = isFront ? MONKEY_BODY_LEN * 0.38 : -MONKEY_BODY_LEN * 0.3;
    const legRadius = isFront ? 0.045 : 0.05;
    const hip = new THREE.Group(); hip.position.set(signX * (MONKEY_BODY_WID / 2 - 0.02), hipY, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), monkeyMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.018); hip.add(hipBall);
    const thigh = ribbedTube(legSeg, legRadius, 2, COLORS.grey, COLORS.greyLt); thigh.position.y = -legSeg / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -legSeg, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), monkeyMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.015); knee.add(kneeBall);
    const shin = ribbedTube(legSeg, legRadius * 0.85, 2, COLORS.grey, COLORS.greyLt); shin.position.y = -legSeg / 2; knee.add(shin);
    const pawGeo = isFront ? roundedBoxGeometry(0.1, 0.08, 0.11, 0.03) : new THREE.CylinderGeometry(0.06, 0.07, MONKEY_PAW_HT, 14);
    const paw = new THREE.Mesh(pawGeo, monkeyMatDark);
    paw.position.set(0, -(legSeg + MONKEY_PAW_HT / 2), isFront ? 0.02 : 0.015); paw.castShadow = true; addOutline(paw, 0.016); knee.add(paw);
    return { hip, knee, hand: paw };
  }
  monkeyAnimBones.legFL = buildMonkeyLeg(-1, true);  petMonkey.add(monkeyAnimBones.legFL.hip);
  monkeyAnimBones.legFR = buildMonkeyLeg(1, true);   petMonkey.add(monkeyAnimBones.legFR.hip);
  monkeyAnimBones.legBL = buildMonkeyLeg(-1, false); petMonkey.add(monkeyAnimBones.legBL.hip);
  monkeyAnimBones.legBR = buildMonkeyLeg(1, false);  petMonkey.add(monkeyAnimBones.legBR.hip);

  // ---- Banana - a simple curved silhouette held in the right hand, "produced" once it settles in ----
  const monkeyBananaGroup = new THREE.Group(); monkeyBananaGroup.position.set(0, 0.02, 0.06); monkeyBananaGroup.scale.set(0.001, 0.001, 0.001);
  monkeyAnimBones.legFR.hand.add(monkeyBananaGroup);
  const bananaMat = bodyMat(0xFFD93D);
  const bananaTipMat = bodyMat(0x4A3323);
  const monkeyBanana = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.042, 8, 14, Math.PI * 0.8), bananaMat);
  monkeyBanana.rotation.z = Math.PI * 0.55; monkeyBanana.castShadow = true; addOutline(monkeyBanana, 0.014); monkeyBananaGroup.add(monkeyBanana);
  const monkeyBananaTip = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), bananaTipMat);
  monkeyBananaTip.position.set(0.11, 0.1, 0); monkeyBananaGroup.add(monkeyBananaTip);

  // ---- Follow / gait state ----
  let monkeyFacing = petFrog.rotation.y;
  let monkeyWalkPhase = 0;
  let monkeySitAmount = 0;   // 0 = standing/scampering, 1 = fully sat down and munching
  let monkeyIdleTimer = 0;
  let monkeyIsScampering = false;
  let MONKEY_FOLLOW_DIST = 2.0;
  const MONKEY_FOLLOW_SIDE = 0.6;
  const MONKEY_ARRIVE_DIST = 0.35;
  const MONKEY_MAX_TROT_SPEED = 0.30;

  function updatePetMonkey(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * MONKEY_FOLLOW_DIST + rightX * MONKEY_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * MONKEY_FOLLOW_DIST + rightZ * MONKEY_FOLLOW_SIDE;

    const prevX = petMonkey.position.x, prevZ = petMonkey.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    // Glide toward the follow spot on an invisible leash - lags a little, then catches up
    const followLerp = 1 - Math.pow(0.0025, dt);
    petMonkey.position.x += (targetX - prevX) * followLerp;
    petMonkey.position.z += (targetZ - prevZ) * followLerp;

    const dx = petMonkey.position.x - prevX, dz = petMonkey.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isScampering = stepDist > 0.0009;
    monkeyIsScampering = isScampering;

    // --- Facing: turn toward travel direction while moving, otherwise settle to match the leader ---
    if (isScampering) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - monkeyFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      monkeyFacing += diff * Math.min(1, dt * 9);
    } else {
      let diff = leader.rotY - monkeyFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      monkeyFacing += diff * Math.min(1, dt * 2.2);
    }
    petMonkey.rotation.y = monkeyFacing;

    // --- Sit / stand decision - waits for the leader to have actually settled, not just paused ---
    const leaderStill = !leader.moving;
    if (!isScampering && distToSpot < MONKEY_ARRIVE_DIST && leaderStill) monkeyIdleTimer += dt;
    else monkeyIdleTimer = 0;
    const wantsToSit = monkeyIdleTimer > 0.4;
    monkeySitAmount = THREE.MathUtils.lerp(monkeySitAmount, wantsToSit ? 1 : 0, Math.min(1, dt * 3.5));

    // --- Scamper gait: diagonal leg pairs move together (FL+BR, FR+BL), same as the dog/cat trot ---
    const speedRatio = Math.min(1.5, instantSpeed / MONKEY_MAX_TROT_SPEED);
    if (isScampering) monkeyWalkPhase += dt * (14 * Math.max(speedRatio, 0.45));
    const strideAmt = Math.min(1, speedRatio + 0.35) * (1 - monkeySitAmount);
    const strideA = Math.sin(monkeyWalkPhase) * 0.7 * strideAmt;
    const strideB = -strideA;

    // Sit pose: back legs fold under like the dog's; the left arm rests down near its feet while
    // the right arm reaches up and in, bringing its hand (and the banana) toward its mouth
    const sitBackHip = -1.1, sitBackKnee = 1.4;
    const sitLFHip = -0.2, sitLFKnee = 0.5;
    const sitRFHip = -2.0, sitRFKnee = 2.0;
    const baseFrontKnee = 0.15, baseBackKnee = 0.3;

    monkeyAnimBones.legBL.hip.rotation.x = strideA + sitBackHip * monkeySitAmount;
    monkeyAnimBones.legBR.hip.rotation.x = strideB + sitBackHip * monkeySitAmount;
    monkeyAnimBones.legBL.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, monkeySitAmount);
    monkeyAnimBones.legBR.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, monkeySitAmount);

    monkeyAnimBones.legFL.hip.rotation.x = strideB + sitLFHip * monkeySitAmount;
    monkeyAnimBones.legFL.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitLFKnee, monkeySitAmount);
    monkeyAnimBones.legFR.hip.rotation.x = strideA + sitRFHip * monkeySitAmount;
    monkeyAnimBones.legFR.hip.rotation.z = -0.3 * monkeySitAmount;
    monkeyAnimBones.legFR.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitRFKnee, monkeySitAmount);

    // --- Body posture: gentle bob while scampering, settles back onto its haunches when sitting ---
    const walkBob = isScampering ? Math.abs(Math.sin(monkeyWalkPhase * 2)) * 0.045 : Math.sin(time * 0.0026) * 0.015;
    monkeyBody.position.y = MONKEY_BODY_Y + walkBob - monkeySitAmount * 0.16;
    monkeyBody.rotation.x = -monkeySitAmount * 0.1;

    // --- Munch cycle: sharp, repeating bite pulses once fully settled - head dips down to meet
    //     the banana, jaw opens and closes right on each pulse ---
    const bitePulse = Math.pow(Math.max(0, Math.sin(time * 0.005)), 5) * monkeySitAmount;
    monkeyHead.rotation.x = monkeySitAmount * 0.32 - bitePulse * 0.12 + (isScampering ? Math.sin(monkeyWalkPhase) * 0.02 : Math.sin(time * 0.0006) * 0.03 * (1 - monkeySitAmount));
    monkeyHead.rotation.y = isScampering ? 0 : Math.sin(time * 0.0005) * 0.1 * (1 - monkeySitAmount);
    monkeyJawHinge.rotation.x = bitePulse * 0.55;

    // --- Banana: pops into the hand as it settles in, gives a little nibbling wobble on each bite ---
    const bananaScale = Math.max(0.001, monkeySitAmount);
    monkeyBananaGroup.scale.set(bananaScale, bananaScale, bananaScale);
    monkeyBananaGroup.rotation.x = -bitePulse * 0.3;

    // --- Tail: trails and sways while scampering, curls up over its back once settled ---
    const tailSway = isScampering ? Math.sin(monkeyWalkPhase * 0.5) * 0.25 : Math.sin(time * 0.0015) * 0.06 * monkeySitAmount;
    monkeyTailHinge.rotation.x = -1.0 + monkeySitAmount * 1.7;
    monkeyTailHinge.rotation.y = tailSway;

    // --- Whole-body settle bounce, keeps paws reading as planted on the ground ---
    petMonkey.position.y = MONKEY_BASE_Y + (isScampering ? Math.abs(Math.sin(monkeyWalkPhase * 2)) * 0.04 : 0);
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT PANDA COMPANION (follows whoever's ahead of it) ----------
  // Stocky, round-bodied waddler - black "socks" up all four legs, a black
  // shoulder band, big round black ears and bold black eye patches against
  // white fur (the two-tone main/dark materials only recolor the WHITE fur,
  // so the black patches always read as a panda no matter the chosen color).
  // Instead of trotting it waddles, rolling gently side to side. The moment
  // the chain stops, it plops down onto its haunches the way real pandas
  // sit - legs splayed out in front - and a stalk of bamboo appears, held up
  // to its mouth in both paws for a slow, happy, repeating munch.
  // ======================================================================
  const PANDA_BODY_WID = 0.58, PANDA_BODY_LEN = 0.66, PANDA_BODY_HT = 0.5;
  const PANDA_HIP_Y = -0.5;               // hip-joint height, relative to the panda's root group
  const PANDA_LEG_SEG = 0.2;              // short, stubby bear legs
  const PANDA_PAW_HT = 0.09;
  const PANDA_LEG_REACH = PANDA_LEG_SEG * 2 + PANDA_PAW_HT;
  const PANDA_SCALE = 2; // kid-favorite pet, sized up so it reads clearly at a glance
  const PANDA_BASE_Y = -4.65 - PANDA_SCALE * (PANDA_HIP_Y - PANDA_LEG_REACH); // puts paws on the same ground plane as everyone else, accounting for the scale-up
  const PANDA_BODY_Y = PANDA_HIP_Y + PANDA_BODY_HT / 2 - 0.04;

  const pandaAnimBones = { legFL:{hip:null,knee:null}, legFR:{hip:null,knee:null}, legBL:{hip:null,knee:null}, legBR:{hip:null,knee:null}, head:null, jaw:null };
  const petPanda = new THREE.Group();
  petPanda.scale.set(PANDA_SCALE, PANDA_SCALE, PANDA_SCALE);
  petPanda.position.set(petMonkey.position.x, PANDA_BASE_Y, petMonkey.position.z - 1.8);
  scene.add(petPanda);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // WHITE fur can be recolored independently from the Pet Menu color swatches.
  // The black patches below use a fixed material instead, so it always still reads as a panda.
  const pandaMatMain = bodyMat(COLORS.orange);
  const pandaMatDark = bodyMat(COLORS.orangeDk);
  const pandaBlack = bodyMat(0x1A1A1A);

  // ---- Body (torso + head all ride together as one animated group) ----
  const pandaBody = new THREE.Group(); pandaBody.position.set(0, PANDA_BODY_Y, 0); petPanda.add(pandaBody);
  const pandaTorso = new THREE.Mesh(roundedBoxGeometry(PANDA_BODY_WID, PANDA_BODY_HT, PANDA_BODY_LEN, 0.24), pandaMatMain);
  pandaTorso.castShadow = true; pandaTorso.receiveShadow = true; addOutline(pandaTorso, 0.045); pandaBody.add(pandaTorso);
  const pandaBelly = new THREE.Mesh(new THREE.BoxGeometry(PANDA_BODY_WID * 0.72, 0.1, PANDA_BODY_LEN * 0.7), pandaMatDark);
  pandaBelly.position.set(0, -PANDA_BODY_HT / 2 + 0.02, 0); addOutline(pandaBelly, 0.028); pandaBody.add(pandaBelly);
  // Black "shoulder band" - wraps the front of the torso where the black leg fur meets the body,
  // the classic panda marking that reads even at a glance
  const pandaShoulderBand = new THREE.Mesh(new THREE.BoxGeometry(PANDA_BODY_WID + 0.02, PANDA_BODY_HT * 0.62, 0.16), pandaBlack);
  pandaShoulderBand.position.set(0, 0.02, PANDA_BODY_LEN * 0.32); addOutline(pandaShoulderBand, 0.03); pandaBody.add(pandaShoulderBand);
  const pandaNub = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  pandaNub.position.set(0, PANDA_BODY_HT / 2 + 0.06, -PANDA_BODY_LEN * 0.18); pandaBody.add(pandaNub);
  // Tiny stub tail - real pandas barely have one, so it's just a small fixed nub
  const pandaTailStub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), pandaMatMain);
  pandaTailStub.position.set(0, -PANDA_BODY_HT * 0.05, -PANDA_BODY_LEN / 2 + 0.02); addOutline(pandaTailStub, 0.016); pandaBody.add(pandaTailStub);

  // ---- Head (big and round, with bold black eye patches, round black ears and a hinged chewing jaw) ----
  const pandaHead = new THREE.Group();
  pandaHead.position.set(0, PANDA_BODY_HT / 2 + 0.2, PANDA_BODY_LEN / 2 - 0.02);
  pandaAnimBones.head = pandaHead; pandaBody.add(pandaHead);
  const pandaHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), pandaMatMain);
  pandaHeadShell.scale.set(1.05, 0.95, 1.0); pandaHeadShell.castShadow = true; addOutline(pandaHeadShell, 0.04); pandaHead.add(pandaHeadShell);
  const pandaMuzzle = new THREE.Mesh(roundedBoxGeometry(0.24, 0.19, 0.2, 0.08), pandaMatMain);
  pandaMuzzle.position.set(0, -0.1, 0.2); pandaMuzzle.castShadow = true; addOutline(pandaMuzzle, 0.03); pandaHead.add(pandaMuzzle);
  const pandaNose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), pandaBlack);
  pandaNose.position.set(0, 0.05, 0.11); pandaMuzzle.add(pandaNose);

  // Bold black eye patches sitting proud of the white head shell, with the glowing eye
  // riding right on top of each one - the single most recognizable panda feature
  function buildPandaEyePatch(sign) {
    const patch = new THREE.Group(); patch.position.set(sign * 0.12, 0.06, 0.18);
    const patchMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), pandaBlack);
    patchMesh.scale.set(0.85, 1.1, 0.6); patchMesh.castShadow = true; addOutline(patchMesh, 0.02); patch.add(patchMesh);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 }));
    eye.position.set(0, 0.01, 0.075); patch.add(eye);
    return patch;
  }
  pandaHead.add(buildPandaEyePatch(-1)); pandaHead.add(buildPandaEyePatch(1));

  // Hinged lower jaw, tucked under the muzzle - opens and closes for the munch cycle
  const pandaJawHinge = new THREE.Group(); pandaJawHinge.position.set(0, -0.16, 0.14);
  pandaAnimBones.jaw = pandaJawHinge; pandaHead.add(pandaJawHinge);
  const pandaJaw = new THREE.Mesh(roundedBoxGeometry(0.17, 0.07, 0.14, 0.035), pandaMatMain);
  pandaJaw.position.set(0, -0.02, 0.02); pandaJaw.castShadow = true; addOutline(pandaJaw, 0.02); pandaJawHinge.add(pandaJaw);

  // Big, round, black ears perched on top of the head
  function buildPandaEar(sign) {
    const ear = new THREE.Group(); ear.position.set(sign * 0.21, 0.24, -0.03);
    const earMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), pandaBlack);
    earMesh.scale.set(1, 1, 0.55); earMesh.castShadow = true; addOutline(earMesh, 0.022); ear.add(earMesh);
    return ear;
  }
  pandaHead.add(buildPandaEar(-1)); pandaHead.add(buildPandaEar(1));

  // ---- Legs (quadruped: front-left/right, back-left/right - short and stubby, fully black "socks") ----
  function buildPandaLeg(signX, isFront) {
    const legZ = isFront ? PANDA_BODY_LEN * 0.3 : -PANDA_BODY_LEN * 0.3;
    const hip = new THREE.Group(); hip.position.set(signX * (PANDA_BODY_WID / 2 - 0.04), PANDA_HIP_Y, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), pandaBlack); hipBall.castShadow = true; addOutline(hipBall, 0.03); hip.add(hipBall);
    const thigh = ribbedTube(PANDA_LEG_SEG, 0.095, 2, 0x1A1A1A, 0x0D0D0D); thigh.position.y = -PANDA_LEG_SEG / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -PANDA_LEG_SEG, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 14), pandaBlack); kneeBall.castShadow = true; addOutline(kneeBall, 0.026); knee.add(kneeBall);
    const shin = ribbedTube(PANDA_LEG_SEG, 0.08, 2, 0x1A1A1A, 0x0D0D0D); shin.position.y = -PANDA_LEG_SEG / 2; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, PANDA_PAW_HT, 16), pandaBlack);
    paw.position.set(0, -(PANDA_LEG_SEG + PANDA_PAW_HT / 2), 0.015); paw.castShadow = true; addOutline(paw, 0.026); knee.add(paw);
    return { hip, knee, hand: paw };
  }
  pandaAnimBones.legFL = buildPandaLeg(-1, true);  petPanda.add(pandaAnimBones.legFL.hip);
  pandaAnimBones.legFR = buildPandaLeg(1, true);   petPanda.add(pandaAnimBones.legFR.hip);
  pandaAnimBones.legBL = buildPandaLeg(-1, false); petPanda.add(pandaAnimBones.legBL.hip);
  pandaAnimBones.legBR = buildPandaLeg(1, false);  petPanda.add(pandaAnimBones.legBR.hip);

  // ---- Bamboo stalk - held up to the mouth in both paws once settled, "produced" out of nowhere
  //      the same way the monkey's banana appears, since it's only meant to exist while eating ----
  const pandaBambooGroup = new THREE.Group(); pandaBambooGroup.position.set(0, PANDA_BODY_HT * 0.42, PANDA_BODY_LEN * 0.42); pandaBambooGroup.rotation.x = -0.35;
  pandaBambooGroup.scale.set(0.001, 0.001, 0.001); pandaBody.add(pandaBambooGroup);
  const pandaBambooStalk = ribbedTube(0.42, 0.035, 4, 0x6FAF4F, 0x3F7A2F); pandaBambooStalk.position.y = 0.21; pandaBambooGroup.add(pandaBambooStalk);
  function buildBambooLeaf(y, sign) {
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(sign * 0.1, 0.05, sign * 0.16, 0.02);
    leafShape.quadraticCurveTo(sign * 0.08, -0.02, 0, 0); leafShape.closePath();
    const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.012, bevelEnabled: false });
    leafGeo.translate(0, 0, -0.006);
    const leaf = new THREE.Mesh(leafGeo, bodyMat(0x6FAF4F)); leaf.position.set(0, y, 0); leaf.rotation.y = sign * 0.3; addOutline(leaf, 0.008);
    pandaBambooGroup.add(leaf);
  }
  buildBambooLeaf(0.34, 1); buildBambooLeaf(0.4, -1); buildBambooLeaf(0.26, -1);

  // ---- Follow / gait state ----
  let pandaFacing = petMonkey.rotation.y;
  let pandaWalkPhase = 0;
  let pandaSitAmount = 0;    // 0 = standing/waddling, 1 = fully sat down and munching
  let pandaIdleTimer = 0;
  let pandaIsWaddling = false;
  let PANDA_FOLLOW_DIST = 3.0;
  const PANDA_FOLLOW_SIDE = -0.8;
  const PANDA_ARRIVE_DIST = 0.4;
  const PANDA_MAX_WALK_SPEED = 0.22; // pandas are unhurried

  function updatePetPanda(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * PANDA_FOLLOW_DIST + rightX * PANDA_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * PANDA_FOLLOW_DIST + rightZ * PANDA_FOLLOW_SIDE;

    const prevX = petPanda.position.x, prevZ = petPanda.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    // Glide toward the follow spot on an invisible leash - lags a little, then catches up
    const followLerp = 1 - Math.pow(0.0025, dt);
    petPanda.position.x += (targetX - prevX) * followLerp;
    petPanda.position.z += (targetZ - prevZ) * followLerp;

    const dx = petPanda.position.x - prevX, dz = petPanda.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isWaddling = stepDist > 0.0009;
    pandaIsWaddling = isWaddling;

    // --- Facing: turn toward travel direction while moving, otherwise settle to match the leader ---
    if (isWaddling) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - pandaFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      pandaFacing += diff * Math.min(1, dt * 7);
    } else {
      let diff = leader.rotY - pandaFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      pandaFacing += diff * Math.min(1, dt * 2.0);
    }
    petPanda.rotation.y = pandaFacing;

    // --- Sit / stand decision - waits for the leader to have actually settled, not just paused ---
    const leaderStill = !leader.moving;
    if (!isWaddling && distToSpot < PANDA_ARRIVE_DIST && leaderStill) pandaIdleTimer += dt;
    else pandaIdleTimer = 0;
    const wantsToSit = pandaIdleTimer > 0.45;
    pandaSitAmount = THREE.MathUtils.lerp(pandaSitAmount, wantsToSit ? 1 : 0, Math.min(1, dt * 3.2));

    // --- Waddle gait: diagonal leg pairs move together (FL+BR, FR+BL), slower and heavier than the dog's trot ---
    const speedRatio = Math.min(1.5, instantSpeed / PANDA_MAX_WALK_SPEED);
    if (isWaddling) pandaWalkPhase += dt * (9 * Math.max(speedRatio, 0.4));
    const strideAmt = Math.min(1, speedRatio + 0.35) * (1 - pandaSitAmount);
    const strideA = Math.sin(pandaWalkPhase) * 0.55 * strideAmt;
    const strideB = -strideA;

    // Sit pose: back legs splay forward and outward the way a real panda plops down, front paws
    // lift symmetrically to flank the bamboo stalk up near its mouth
    const sitBackHip = -0.95, sitBackKnee = 1.55, sitBackSplay = 0.35;
    const sitFrontHip = -1.75, sitFrontKnee = 1.6, sitFrontSplay = 0.28;
    const baseFrontKnee = 0.14, baseBackKnee = 0.32;

    pandaAnimBones.legBL.hip.rotation.x = strideA + sitBackHip * pandaSitAmount;
    pandaAnimBones.legBL.hip.rotation.z = sitBackSplay * pandaSitAmount;
    pandaAnimBones.legBR.hip.rotation.x = strideB + sitBackHip * pandaSitAmount;
    pandaAnimBones.legBR.hip.rotation.z = -sitBackSplay * pandaSitAmount;
    pandaAnimBones.legBL.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, pandaSitAmount);
    pandaAnimBones.legBR.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, sitBackKnee, pandaSitAmount);

    pandaAnimBones.legFL.hip.rotation.x = strideB + sitFrontHip * pandaSitAmount;
    pandaAnimBones.legFL.hip.rotation.z = sitFrontSplay * pandaSitAmount;
    pandaAnimBones.legFR.hip.rotation.x = strideA + sitFrontHip * pandaSitAmount;
    pandaAnimBones.legFR.hip.rotation.z = -sitFrontSplay * pandaSitAmount;
    pandaAnimBones.legFL.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitFrontKnee, pandaSitAmount);
    pandaAnimBones.legFR.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, sitFrontKnee, pandaSitAmount);

    // --- Body posture: a gentle side-to-side roll while waddling, settles low onto its haunches when sitting ---
    const waddleRoll = isWaddling ? Math.sin(pandaWalkPhase) * 0.09 : 0;
    const waddleBob = isWaddling ? Math.abs(Math.sin(pandaWalkPhase * 2)) * 0.04 : Math.sin(time * 0.0024) * 0.014;
    pandaBody.position.y = PANDA_BODY_Y + waddleBob - pandaSitAmount * 0.24;
    pandaBody.rotation.z = waddleRoll;
    pandaBody.rotation.x = -pandaSitAmount * 0.06;

    // --- Munch cycle: slow, contented bite pulses once fully settled - head dips to meet the
    //     bamboo, jaw opens and closes right on each pulse ---
    const bitePulse = Math.pow(Math.max(0, Math.sin(time * 0.0035)), 5) * pandaSitAmount;
    pandaHead.rotation.x = pandaSitAmount * 0.22 - bitePulse * 0.14 + (isWaddling ? Math.sin(pandaWalkPhase) * 0.02 : Math.sin(time * 0.0006) * 0.03 * (1 - pandaSitAmount));
    pandaHead.rotation.y = isWaddling ? 0 : Math.sin(time * 0.0004) * 0.07 * (1 - pandaSitAmount);
    pandaJawHinge.rotation.x = bitePulse * 0.5;

    // --- Bamboo: pops up into both paws as it settles in, gives a slow little nibble wobble on each bite ---
    const bambooScale = Math.max(0.001, pandaSitAmount);
    pandaBambooGroup.scale.set(bambooScale, bambooScale, bambooScale);
    pandaBambooGroup.rotation.z = bitePulse * 0.15;

    // --- Whole-body settle bounce, keeps paws reading as planted on the ground ---
    petPanda.position.y = PANDA_BASE_Y + (isWaddling ? Math.abs(Math.sin(pandaWalkPhase * 2)) * 0.035 : 0);
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT OWL COMPANION (follows whoever's ahead of it) ----------
  // Flies the same way the bird does - cruising altitude, banking into
  // turns, wings folding to land - and settles down on the ground the
  // moment the chain stops, exactly like the bird. Once landed, its own
  // little signature move is a slow, deliberate owl head-swivel - looking
  // forward, then back over its shoulder, then forward again.
  // ======================================================================
  const OWL_SCALE = 2; // kid-favorite pet, sized up so it reads clearly at a glance
  const OWL_BODY_RADIUS = 0.24;
  const OWL_HIP_Y = -0.15;      // leg attach height, relative to the owl's root group
  const OWL_LEG_LEN = 0.2;
  const OWL_FOOT_HT = 0.045;
  const OWL_LEG_REACH = OWL_LEG_LEN + OWL_FOOT_HT / 2;
  const OWL_BODY_Y = 0;
  const OWL_FLIGHT_Y = 5.3; // cruises just a touch above the bird's altitude so their paths don't cross
  const OWL_GROUND_Y = -4.65 - OWL_SCALE * (OWL_HIP_Y - OWL_LEG_REACH); // feet touch the same ground plane as everyone else, accounting for the scale-up

  const owlAnimBones = { legL: null, legR: null, wingL: null, wingR: null, head: null, eyeL: null, eyeR: null, tuftL: null, tuftR: null };
  const petOwl = new THREE.Group();
  petOwl.scale.set(OWL_SCALE, OWL_SCALE, OWL_SCALE);
  petOwl.position.set(petPanda.position.x, OWL_FLIGHT_Y, petPanda.position.z - 2.0);
  scene.add(petOwl);


  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const owlMatMain = bodyMat(COLORS.orange);
  const owlMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (round and compact, no visible neck - classic owl silhouette) ----
  const owlBody = new THREE.Group(); owlBody.position.set(0, OWL_BODY_Y, 0); petOwl.add(owlBody);
  const owlTorso = new THREE.Mesh(new THREE.SphereGeometry(OWL_BODY_RADIUS, 18, 14), owlMatMain);
  owlTorso.scale.set(1.0, 1.15, 0.92); owlTorso.castShadow = true; owlTorso.receiveShadow = true; addOutline(owlTorso, 0.032); owlBody.add(owlTorso);
  const owlBelly = new THREE.Mesh(new THREE.SphereGeometry(OWL_BODY_RADIUS * 0.78, 14, 12), matWool);
  owlBelly.scale.set(0.85, 1.0, 0.7); owlBelly.position.set(0, -0.02, 0.1); addOutline(owlBelly, 0.02); owlBody.add(owlBelly);

  // ---- Head (big and round, sits almost directly on the body - owls barely have a neck) ----
  const owlHead = new THREE.Group();
  owlHead.position.set(0, OWL_BODY_RADIUS * 0.92, 0.02);
  owlAnimBones.head = owlHead; owlBody.add(owlHead);
  const owlHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), owlMatMain);
  owlHeadShell.castShadow = true; addOutline(owlHeadShell, 0.036); owlHead.add(owlHeadShell);
  // Flat facial disc - the feature that makes an owl read as an owl instead of a generic bird
  const owlFacialDisc = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), matWool);
  owlFacialDisc.position.set(0, -0.01, 0.175); addOutline(owlFacialDisc, 0.018); owlHead.add(owlFacialDisc);
  const owlBeak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 10), owlMatDark);
  owlBeak.rotation.x = Math.PI / 2; owlBeak.position.set(0, -0.05, 0.2); owlBeak.castShadow = true; addOutline(owlBeak, 0.016); owlHead.add(owlBeak);
  // Big forward-facing eyes - much larger than the bird's, the classic wide-eyed owl stare
  const owlEyeGeo = new THREE.SphereGeometry(0.062, 14, 12);
  const owlEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const owlEyeL = new THREE.Mesh(owlEyeGeo, owlEyeMat); owlEyeL.position.set(-0.08, 0.02, 0.165); owlAnimBones.eyeL = owlEyeL; owlHead.add(owlEyeL);
  const owlEyeR = new THREE.Mesh(owlEyeGeo, owlEyeMat); owlEyeR.position.set(0.08, 0.02, 0.165); owlAnimBones.eyeR = owlEyeR; owlHead.add(owlEyeR);
  const owlNub = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  owlNub.position.set(0, 0.19, -0.05); owlHead.add(owlNub);
  // Little pointed ear tufts on top of the head - the other classic owl silhouette cue
  function buildOwlTuft(sign) {
    const tuftShape = new THREE.Shape();
    tuftShape.moveTo(-0.03, 0); tuftShape.lineTo(0.03, 0); tuftShape.lineTo(0, 0.12); tuftShape.closePath();
    const tuftGeo = new THREE.ExtrudeGeometry(tuftShape, { depth: 0.03, bevelEnabled: false });
    tuftGeo.translate(0, 0, -0.015);
    const tuft = new THREE.Mesh(tuftGeo, owlMatDark); tuft.castShadow = true; addOutline(tuft, 0.012);
    tuft.position.set(sign * 0.1, 0.16, -0.02); tuft.rotation.z = sign * 0.25;
    return tuft;
  }
  owlAnimBones.tuftL = buildOwlTuft(-1); owlHead.add(owlAnimBones.tuftL);
  owlAnimBones.tuftR = buildOwlTuft(1); owlHead.add(owlAnimBones.tuftR);

  // ---- Wings (hinged at the shoulders, flap on the Z axis - broader and rounder than the bird's) ----
  function buildOwlWing(sign) {
    const hinge = new THREE.Group();
    hinge.position.set(sign * OWL_BODY_RADIUS * 0.75, 0.06, -0.02);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.03); wingShape.lineTo(sign * 0.42, 0.14); wingShape.lineTo(sign * 0.5, -0.05);
    wingShape.lineTo(sign * 0.3, -0.26); wingShape.lineTo(sign * 0.04, -0.1); wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
    wingGeo.translate(0, 0, -0.0175);
    const wingMesh = new THREE.Mesh(wingGeo, owlMatMain); wingMesh.castShadow = true; addOutline(wingMesh, 0.024);
    hinge.add(wingMesh); return hinge;
  }
  owlAnimBones.wingL = buildOwlWing(-1); owlBody.add(owlAnimBones.wingL);
  owlAnimBones.wingR = buildOwlWing(1); owlBody.add(owlAnimBones.wingR);

  // ---- Legs (simple single-segment, tucked in flight / gripping once perched) ----
  function buildOwlLeg(signX) {
    const hip = new THREE.Group(); hip.position.set(signX * (OWL_BODY_RADIUS * 0.55), OWL_HIP_Y, 0.02);
    const shank = ribbedTube(OWL_LEG_LEN, 0.04, 2, COLORS.grey, COLORS.greyLt); shank.position.y = -OWL_LEG_LEN / 2; hip.add(shank);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, OWL_FOOT_HT, 10), owlMatDark);
    foot.position.set(0, -(OWL_LEG_LEN + OWL_FOOT_HT / 2), 0.012); foot.castShadow = true; addOutline(foot, 0.018); hip.add(foot);
    return { hip };
  }
  owlAnimBones.legL = buildOwlLeg(-1); petOwl.add(owlAnimBones.legL.hip);
  owlAnimBones.legR = buildOwlLeg(1);  petOwl.add(owlAnimBones.legR.hip);

  // ---- Follow / flight state ----
  let owlFacing = petPanda.rotation.y;
  let owlGroundedAmount = 0;   // 0 = airborne, 1 = fully landed
  let owlIdleTimer = 0;
  let owlBlinkTimer = 1.5 + Math.random() * 2;
  let owlBlinkPhase = 0;     // 0 = eyes open, ramps to 1 and back for a quick blink
  let OWL_FOLLOW_DIST = 5.0;
  const OWL_FOLLOW_SIDE = -0.6;
  const OWL_ARRIVE_DIST = 0.4;

  function updatePetOwl(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * OWL_FOLLOW_DIST + rightX * OWL_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * OWL_FOLLOW_DIST + rightZ * OWL_FOLLOW_SIDE;

    const prevX = petOwl.position.x, prevZ = petOwl.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    const followLerp = 1 - Math.pow(0.0025, dt);
    petOwl.position.x += (targetX - prevX) * followLerp;
    petOwl.position.z += (targetZ - prevZ) * followLerp;

    const dx = petOwl.position.x - prevX, dz = petOwl.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const isFlying = stepDist > 0.0009;

    // --- Facing: turn toward travel direction while flying, otherwise settle to match the leader ---
    let turnDiff = 0;
    if (isFlying) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - owlFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      owlFacing += diff * Math.min(1, dt * 7);
      turnDiff = diff;
    } else {
      let diff = leader.rotY - owlFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      owlFacing += diff * Math.min(1, dt * 1.8);
    }
    petOwl.rotation.y = owlFacing;

    // --- Land / take off decision ---
    const leaderStill = !leader.moving;
    if (!isFlying && distToSpot < OWL_ARRIVE_DIST && leaderStill) owlIdleTimer += dt;
    else owlIdleTimer = 0;
    const wantsToLand = owlIdleTimer > 0.4;
    owlGroundedAmount = THREE.MathUtils.lerp(owlGroundedAmount, wantsToLand ? 1 : 0, Math.min(1, dt * 3.2));

    // --- Altitude: cruises above the bird, descends to the ground once landed ---
    const altitude = THREE.MathUtils.lerp(OWL_FLIGHT_Y, OWL_GROUND_Y, owlGroundedAmount);
    const flightBob = (1 - owlGroundedAmount) * Math.sin(time * 0.002) * 0.16;
    petOwl.position.y = altitude + flightBob;

    // --- Body pitch while gliding + a little bank into turns ---
    owlBody.rotation.x = -0.12 * (1 - owlGroundedAmount) + Math.sin(time * 0.0027) * 0.03 * (1 - owlGroundedAmount);
    owlBody.rotation.z = THREE.MathUtils.clamp(-turnDiff * 3, -0.5, 0.5) * (1 - owlGroundedAmount);

    // --- Wings: flap while airborne, fold flat against the body once landed ---
    const wingBase = THREE.MathUtils.lerp(0.5, 0.1, owlGroundedAmount);
    const flapValue = Math.sin(time * 0.001 * 8.5) * 0.5 * (1 - owlGroundedAmount);
    owlAnimBones.wingL.rotation.z = -(wingBase + flapValue);
    owlAnimBones.wingR.rotation.z = (wingBase + flapValue);

    // --- Legs: tucked up in flight, planted once landed ---
    const legAngle = THREE.MathUtils.lerp(-1.2, -0.05, owlGroundedAmount);
    owlAnimBones.legL.hip.rotation.x = legAngle;
    owlAnimBones.legR.hip.rotation.x = legAngle;

    // --- Head: the signature move - a slow, deliberate swivel forward and back over its shoulder,
    //     only once it's actually landed and settled ---
    owlHead.rotation.y = Math.sin(time * 0.00028) * 2.1 * owlGroundedAmount;
    owlHead.rotation.x = Math.sin(time * 0.0006) * 0.08 * owlGroundedAmount;
    owlAnimBones.tuftL.rotation.x = Math.sin(time * 0.001) * 0.05 * owlGroundedAmount;
    owlAnimBones.tuftR.rotation.x = -Math.sin(time * 0.001) * 0.05 * owlGroundedAmount;

    // --- Blink: a quick eyelid-close only while landed and settled, using eye squash instead of
    //     a proper eyelid mesh - simple, cheap, and reads fine at this scale ---
    owlBlinkTimer -= dt;
    if (owlBlinkTimer <= 0 && owlGroundedAmount > 0.9) { owlBlinkTimer = 2.5 + Math.random() * 3; owlBlinkPhase = 0.0001; }
    if (owlBlinkPhase > 0) {
      owlBlinkPhase += dt * 8;
      const closeAmt = owlBlinkPhase < 1 ? owlBlinkPhase : Math.max(0, 2 - owlBlinkPhase);
      const eyeScaleY = 1 - Math.min(1, closeAmt) * 0.85;
      owlAnimBones.eyeL.scale.y = eyeScaleY; owlAnimBones.eyeR.scale.y = eyeScaleY;
      if (owlBlinkPhase >= 2) { owlBlinkPhase = 0; owlAnimBones.eyeL.scale.y = 1; owlAnimBones.eyeR.scale.y = 1; }
    }
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT BABY DRAGON COMPANION (follows whoever's ahead of it) ----------
  // Quadruped trot like the cat's, with a spiny back ridge, small folded
  // bat wings, brow horns and a long serpentine tail. The moment the chain
  // stops it curls up nose-to-tail into a tight ball, just like the cat -
  // only with little puffs of smoke (and the occasional spark) drifting up
  // from its nostrils the whole time, whether it's walking or dozing.
  // ======================================================================
  const DRAGON_BODY_WID = 0.46, DRAGON_BODY_LEN = 0.68, DRAGON_BODY_HT = 0.42;
  const DRAGON_HIP_Y = -0.36;
  const DRAGON_LEG_SEG = 0.19;
  const DRAGON_PAW_HT = 0.075;
  const DRAGON_LEG_REACH = DRAGON_LEG_SEG * 2 + DRAGON_PAW_HT;
  const DRAGON_SCALE = 2; // kid-favorite pet, sized up so it reads clearly at a glance
  const DRAGON_BASE_Y = -4.65 - DRAGON_SCALE * (DRAGON_HIP_Y - DRAGON_LEG_REACH); // paws on the same ground plane as everyone else, accounting for the scale-up
  const DRAGON_BODY_Y = DRAGON_HIP_Y + DRAGON_BODY_HT / 2 - 0.02;

  const dragonAnimBones = { legFL: null, legFR: null, legBL: null, legBR: null, tail: null, head: null, wingL: null, wingR: null };
  const petDragon = new THREE.Group();
  petDragon.scale.set(DRAGON_SCALE, DRAGON_SCALE, DRAGON_SCALE);
  petDragon.position.set(petOwl.position.x, DRAGON_BASE_Y, petOwl.position.z - 2.0);
  scene.add(petDragon);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const dragonMatMain = bodyMat(COLORS.orange);
  const dragonMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (torso + head + tail all ride together as one animated group) ----
  const dragonBody = new THREE.Group(); dragonBody.position.set(0, DRAGON_BODY_Y, 0); petDragon.add(dragonBody);
  const dragonTorso = new THREE.Mesh(roundedBoxGeometry(DRAGON_BODY_WID, DRAGON_BODY_HT, DRAGON_BODY_LEN, 0.17), dragonMatMain);
  dragonTorso.castShadow = true; dragonTorso.receiveShadow = true; addOutline(dragonTorso, 0.036); dragonBody.add(dragonTorso);
  const dragonBelly = new THREE.Mesh(new THREE.BoxGeometry(DRAGON_BODY_WID * 0.68, 0.08, DRAGON_BODY_LEN * 0.72), dragonMatDark);
  dragonBelly.position.set(0, -DRAGON_BODY_HT / 2 + 0.015, 0); addOutline(dragonBelly, 0.02); dragonBody.add(dragonBelly);
  const dragonNub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  dragonNub.position.set(0, DRAGON_BODY_HT / 2 + 0.05, -DRAGON_BODY_LEN * 0.1); dragonBody.add(dragonNub);

  // ---- Spiny back ridge - a row of small triangular fins from between the shoulders to the tail base ----
  function buildDragonSpike(scale) {
    const spikeShape = new THREE.Shape();
    spikeShape.moveTo(-0.05, 0); spikeShape.lineTo(0.05, 0); spikeShape.lineTo(0, 0.11); spikeShape.closePath();
    const spikeGeo = new THREE.ExtrudeGeometry(spikeShape, { depth: 0.03, bevelEnabled: false });
    spikeGeo.translate(0, 0, -0.015);
    const spike = new THREE.Mesh(spikeGeo, dragonMatDark); spike.castShadow = true; addOutline(spike, 0.012);
    spike.scale.set(scale, scale, 1); spike.rotation.x = -Math.PI / 2;
    return spike;
  }
  const DRAGON_SPIKE_COUNT = 6;
  for (let i = 0; i < DRAGON_SPIKE_COUNT; i++) {
    const t = i / (DRAGON_SPIKE_COUNT - 1);
    const spike = buildDragonSpike(THREE.MathUtils.lerp(1.05, 0.55, t));
    spike.position.set(0, DRAGON_BODY_HT / 2 - 0.01, DRAGON_BODY_LEN / 2 * 0.75 - t * DRAGON_BODY_LEN * 0.95);
    dragonBody.add(spike);
  }

  // ---- Head (elongated reptilian snout, brow horns, and nostrils that puff smoke) ----
  const dragonHead = new THREE.Group();
  dragonHead.position.set(0, DRAGON_BODY_HT / 2 + 0.1, DRAGON_BODY_LEN / 2 - 0.02);
  dragonAnimBones.head = dragonHead; dragonBody.add(dragonHead);
  const dragonHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 14), dragonMatMain);
  dragonHeadShell.scale.set(0.95, 0.85, 1.0); dragonHeadShell.castShadow = true; addOutline(dragonHeadShell, 0.03); dragonHead.add(dragonHeadShell);
  const dragonMuzzle = new THREE.Mesh(roundedBoxGeometry(0.14, 0.12, 0.22, 0.05), dragonMatMain);
  dragonMuzzle.position.set(0, -0.05, 0.2); dragonMuzzle.castShadow = true; addOutline(dragonMuzzle, 0.022); dragonHead.add(dragonMuzzle);
  const dragonNose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), dragonMatDark);
  dragonNose.position.set(0, 0.01, 0.13); dragonMuzzle.add(dragonNose);
  const dragonEyeGeo = new THREE.SphereGeometry(0.042, 12, 10);
  const dragonEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const dragonEyeL = new THREE.Mesh(dragonEyeGeo, dragonEyeMat); dragonEyeL.position.set(-0.08, 0.03, 0.11); dragonHead.add(dragonEyeL);
  const dragonEyeR = new THREE.Mesh(dragonEyeGeo, dragonEyeMat); dragonEyeR.position.set(0.08, 0.03, 0.11); dragonHead.add(dragonEyeR);

  // Small backward-curving brow horns
  function buildDragonHorn(sign) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 8), dragonMatDark);
    horn.position.set(sign * 0.07, 0.13, -0.02); horn.rotation.x = 0.55; horn.rotation.z = sign * 0.15;
    horn.castShadow = true; addOutline(horn, 0.012); return horn;
  }
  dragonHead.add(buildDragonHorn(-1)); dragonHead.add(buildDragonHorn(1));

  // Nostril anchor points - smoke/spark puffs spawn from these local positions
  const dragonNostrilL = new THREE.Object3D(); dragonNostrilL.position.set(-0.038, 0.01, 0.24); dragonMuzzle.add(dragonNostrilL);
  const dragonNostrilR = new THREE.Object3D(); dragonNostrilR.position.set(0.038, 0.01, 0.24); dragonMuzzle.add(dragonNostrilR);

  // ---- Small folded bat wings on the back - decorative, this dragon walks rather than flies ----
  function buildDragonWing(sign) {
    const hinge = new THREE.Group();
    hinge.position.set(sign * DRAGON_BODY_WID * 0.46, DRAGON_BODY_HT * 0.22, DRAGON_BODY_LEN * 0.05);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.02); wingShape.lineTo(sign * 0.28, 0.2); wingShape.lineTo(sign * 0.34, 0.02);
    wingShape.lineTo(sign * 0.22, -0.16); wingShape.lineTo(sign * 0.04, -0.06); wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.025, bevelEnabled: false });
    wingGeo.translate(0, 0, -0.0125);
    const wingMesh = new THREE.Mesh(wingGeo, dragonMatDark); wingMesh.castShadow = true; addOutline(wingMesh, 0.018);
    hinge.add(wingMesh); return hinge;
  }
  dragonAnimBones.wingL = buildDragonWing(-1); dragonBody.add(dragonAnimBones.wingL);
  dragonAnimBones.wingR = buildDragonWing(1); dragonBody.add(dragonAnimBones.wingR);

  // ---- Tail (long and serpentine, ends in a small arrow-shaped spade) ----
  const dragonTailHinge = new THREE.Group();
  dragonTailHinge.position.set(0, DRAGON_BODY_HT * 0.05, -DRAGON_BODY_LEN / 2 + 0.02);
  dragonTailHinge.rotation.x = 0.15;
  dragonAnimBones.tail = dragonTailHinge; dragonBody.add(dragonTailHinge);
  const dragonTailSeg = ribbedTube(0.68, 0.05, 5, COLORS.orange, COLORS.orangeDk);
  dragonTailSeg.position.y = -0.34; dragonTailHinge.add(dragonTailSeg);
  const dragonSpadeShape = new THREE.Shape();
  dragonSpadeShape.moveTo(-0.09, 0); dragonSpadeShape.lineTo(0.09, 0); dragonSpadeShape.lineTo(0, -0.16); dragonSpadeShape.closePath();
  const dragonSpadeGeo = new THREE.ExtrudeGeometry(dragonSpadeShape, { depth: 0.025, bevelEnabled: false });
  dragonSpadeGeo.translate(0, 0, -0.0125);
  const dragonTailSpade = new THREE.Mesh(dragonSpadeGeo, dragonMatDark); dragonTailSpade.castShadow = true; addOutline(dragonTailSpade, 0.016);
  dragonTailSpade.rotation.x = Math.PI / 2 + 0.2; dragonTailSpade.position.y = -0.66; dragonTailHinge.add(dragonTailSpade);

  // ---- Legs (quadruped: front-left/right, back-left/right - small clawed feet) ----
  function buildDragonLeg(signX, isFront) {
    const legZ = isFront ? DRAGON_BODY_LEN * 0.32 : -DRAGON_BODY_LEN * 0.3;
    const hip = new THREE.Group(); hip.position.set(signX * (DRAGON_BODY_WID / 2 - 0.03), DRAGON_HIP_Y, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), dragonMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.02); hip.add(hipBall);
    const thigh = ribbedTube(DRAGON_LEG_SEG, 0.06, 2, COLORS.grey, COLORS.greyLt); thigh.position.y = -DRAGON_LEG_SEG / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -DRAGON_LEG_SEG, 0); hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), dragonMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.018); knee.add(kneeBall);
    const shin = ribbedTube(DRAGON_LEG_SEG, 0.05, 2, COLORS.grey, COLORS.greyLt); shin.position.y = -DRAGON_LEG_SEG / 2; knee.add(shin);
    const paw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 8), dragonMatDark);
    paw.position.set(0, -(DRAGON_LEG_SEG + DRAGON_PAW_HT / 2), 0.02); paw.rotation.x = Math.PI; paw.castShadow = true; addOutline(paw, 0.016); knee.add(paw);
    return { hip, knee };
  }
  dragonAnimBones.legFL = buildDragonLeg(-1, true);  petDragon.add(dragonAnimBones.legFL.hip);
  dragonAnimBones.legFR = buildDragonLeg(1, true);   petDragon.add(dragonAnimBones.legFR.hip);
  dragonAnimBones.legBL = buildDragonLeg(-1, false); petDragon.add(dragonAnimBones.legBL.hip);
  dragonAnimBones.legBR = buildDragonLeg(1, false);  petDragon.add(dragonAnimBones.legBR.hip);

  // ---- Smoke puffs + occasional sparks, drifting up from both nostrils - a small reusable pool so
  //      nothing gets allocated per-frame. Each entry tracks its own age/lifetime/drift. Sized and
  //      timed to read clearly even at a distance, since AURA and the scene around it are large. ----
  function buildDragonPuffPool(count, isSpark) {
    const pool = [];
    for (let i = 0; i < count; i++) {
      const mat = isSpark
        ? new THREE.MeshStandardMaterial({ color: 0xFFB347, emissive: 0xFF8A1E, emissiveIntensity: 1.4, transparent: true, opacity: 0, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: 0xD5DAE1, transparent: true, opacity: 0, depthWrite: false, roughness: 1.0 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(isSpark ? 0.032 : 0.07, 8, 6), mat);
      mesh.visible = false;
      pool.push({ mesh, active: false, age: 0, life: isSpark ? 0.6 : 1.6, driftX: 0, driftY: 0, driftZ: 0, startScale: 1, endScale: 1, baseOpacity: isSpark ? 1.0 : 0.9 });
    }
    return pool;
  }
  const dragonSmokePool = buildDragonPuffPool(7, false);
  const dragonSparkPool = buildDragonPuffPool(3, true);
  dragonSmokePool.forEach(p => dragonMuzzle.add(p.mesh));
  dragonSparkPool.forEach(p => dragonMuzzle.add(p.mesh));

  function spawnDragonPuff(pool, fromLeft, isSpark) {
    const entry = pool.find(p => !p.active) || pool[0];
    const anchor = fromLeft ? dragonNostrilL : dragonNostrilR;
    entry.mesh.position.copy(anchor.position);
    entry.active = true; entry.age = 0;
    entry.driftX = (Math.random() - 0.5) * (isSpark ? 0.1 : 0.05);
    entry.driftY = isSpark ? 0.06 + Math.random() * 0.07 : 0.13 + Math.random() * 0.08;
    entry.driftZ = 0.03 + Math.random() * 0.04;
    entry.startScale = isSpark ? 0.6 : 0.4;
    entry.endScale = isSpark ? 1.4 : (2.2 + Math.random() * 1.2);
    entry.mesh.visible = true;
  }

  function updateDragonPuffPool(pool, dt) {
    for (const p of pool) {
      if (!p.active) continue;
      p.age += dt;
      const t = Math.min(1, p.age / p.life);
      p.mesh.position.x += p.driftX * dt;
      p.mesh.position.y += p.driftY * dt;
      p.mesh.position.z += p.driftZ * dt;
      const s = THREE.MathUtils.lerp(p.startScale, p.endScale, t);
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = p.baseOpacity * (1 - t) * (1 - t);
      if (t >= 1) { p.active = false; p.mesh.visible = false; }
    }
  }

  // ---- Follow / gait state ----
  let dragonFacing = petOwl.rotation.y;
  let dragonWalkPhase = 0;
  let dragonCurlAmount = 0;  // 0 = standing/trotting, 1 = fully curled up asleep
  let dragonIdleTimer = 0;
  let dragonIsTrotting = false;
  let dragonSmokeTimer = 0.8;
  let dragonNextNostrilLeft = true;
  let DRAGON_FOLLOW_DIST = 4.6;
  const DRAGON_FOLLOW_SIDE = 0.9;
  const DRAGON_ARRIVE_DIST = 0.4;
  const DRAGON_MAX_TROT_SPEED = 0.28;

  function updatePetDragon(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * DRAGON_FOLLOW_DIST + rightX * DRAGON_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * DRAGON_FOLLOW_DIST + rightZ * DRAGON_FOLLOW_SIDE;

    const prevX = petDragon.position.x, prevZ = petDragon.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);

    const followLerp = 1 - Math.pow(0.0025, dt);
    petDragon.position.x += (targetX - prevX) * followLerp;
    petDragon.position.z += (targetZ - prevZ) * followLerp;

    const dx = petDragon.position.x - prevX, dz = petDragon.position.z - prevZ;
    const stepDist = Math.hypot(dx, dz);
    const instantSpeed = stepDist / Math.max(dt, 0.0001);
    const isTrotting = stepDist > 0.0009;
    dragonIsTrotting = isTrotting;

    if (isTrotting) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - dragonFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      dragonFacing += diff * Math.min(1, dt * 9);
    } else {
      let diff = leader.rotY - dragonFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      dragonFacing += diff * Math.min(1, dt * 2.2);
    }
    petDragon.rotation.y = dragonFacing;

    // --- Curl up / stand decision - waits for the leader to have actually settled ---
    const leaderStill = !leader.moving;
    if (!isTrotting && distToSpot < DRAGON_ARRIVE_DIST && leaderStill) dragonIdleTimer += dt;
    else dragonIdleTimer = 0;
    const wantsToCurl = dragonIdleTimer > 0.4;
    dragonCurlAmount = THREE.MathUtils.lerp(dragonCurlAmount, wantsToCurl ? 1 : 0, Math.min(1, dt * 3.0));

    // --- Trot gait: diagonal leg pairs move together (FL+BR, FR+BL), same as the cat's ---
    const speedRatio = Math.min(1.5, instantSpeed / DRAGON_MAX_TROT_SPEED);
    if (isTrotting) dragonWalkPhase += dt * (16 * Math.max(speedRatio, 0.5));
    const strideAmt = Math.min(1, speedRatio + 0.35) * (1 - dragonCurlAmount);
    const strideA = Math.sin(dragonWalkPhase) * 0.7 * strideAmt;
    const strideB = -strideA;

    // Curled pose: all four legs tuck in tight underneath, well past a normal sit
    const curlFrontHip = -0.55, curlBackHip = -1.5, curlFrontKnee = 1.5, curlBackKnee = 1.85;
    const baseFrontKnee = 0.1, baseBackKnee = 0.32;

    dragonAnimBones.legFL.hip.rotation.x = strideA + curlFrontHip * dragonCurlAmount;
    dragonAnimBones.legBR.hip.rotation.x = strideA + curlBackHip * dragonCurlAmount;
    dragonAnimBones.legFR.hip.rotation.x = strideB + curlFrontHip * dragonCurlAmount;
    dragonAnimBones.legBL.hip.rotation.x = strideB + curlBackHip * dragonCurlAmount;

    dragonAnimBones.legFL.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, curlFrontKnee, dragonCurlAmount);
    dragonAnimBones.legFR.knee.rotation.x = THREE.MathUtils.lerp(baseFrontKnee, curlFrontKnee, dragonCurlAmount);
    dragonAnimBones.legBL.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, curlBackKnee, dragonCurlAmount);
    dragonAnimBones.legBR.knee.rotation.x = THREE.MathUtils.lerp(baseBackKnee, curlBackKnee, dragonCurlAmount);

    // --- Body posture: gentle bob while trotting, curls down and forward into a tight ball when settled ---
    const walkBob = isTrotting ? Math.abs(Math.sin(dragonWalkPhase * 2)) * 0.045 : Math.sin(time * 0.0022) * 0.012 * (1 - dragonCurlAmount);
    dragonBody.position.y = DRAGON_BODY_Y + walkBob - dragonCurlAmount * 0.19;
    dragonBody.rotation.x = -dragonCurlAmount * 0.32;

    // --- Head: tucks down close to the curled-up tail while dozing, little look-around while walking ---
    dragonHead.rotation.x = dragonCurlAmount * 0.85 + (isTrotting ? Math.sin(dragonWalkPhase) * 0.025 : Math.sin(time * 0.0005) * 0.05 * (1 - dragonCurlAmount));
    dragonHead.rotation.y = isTrotting ? 0 : Math.sin(time * 0.0004) * 0.12 * (1 - dragonCurlAmount);

    // --- Tail: low serpentine sway while trotting, wraps up and around the curled body once settled ---
    const tailSway = isTrotting ? Math.sin(dragonWalkPhase * 0.6) * 0.2 : Math.sin(time * 0.0012) * 0.04 * dragonCurlAmount;
    dragonTailHinge.rotation.x = THREE.MathUtils.lerp(0.15, 2.35, dragonCurlAmount);
    dragonTailHinge.rotation.y = tailSway;

    // --- Wings: a light idle flutter while trotting, fold in tight once curled up ---
    const wingFlutter = isTrotting ? Math.sin(time * 0.004) * 0.06 : Math.sin(time * 0.0009) * 0.02;
    const wingFold = THREE.MathUtils.lerp(0.12, 0.42, dragonCurlAmount);
    dragonAnimBones.wingL.rotation.z = -(wingFold + wingFlutter);
    dragonAnimBones.wingR.rotation.z = (wingFold + wingFlutter);

    // --- Smoke (and the occasional spark) - puffs from alternating nostrils the whole time, faster
    //     and steadier once curled up and dozing, lighter and less frequent while on the move ---
    dragonSmokeTimer -= dt;
    if (dragonSmokeTimer <= 0) {
      spawnDragonPuff(dragonSmokePool, dragonNextNostrilLeft, false);
      if (Math.random() < 0.3) spawnDragonPuff(dragonSparkPool, dragonNextNostrilLeft, true);
      dragonNextNostrilLeft = !dragonNextNostrilLeft;
      const baseInterval = THREE.MathUtils.lerp(1.1, 0.55, dragonCurlAmount);
      dragonSmokeTimer = baseInterval + Math.random() * 0.3;
    }
    updateDragonPuffPool(dragonSmokePool, dt);
    updateDragonPuffPool(dragonSparkPool, dt);

    // --- Whole-body settle bounce, keeps paws reading as planted on the ground ---
    petDragon.position.y = DRAGON_BASE_Y + (isTrotting ? Math.abs(Math.sin(dragonWalkPhase * 2)) * 0.035 : 0);
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT KOALA COMPANION (rides piggyback on AURA - never walks the ground) ----------
  // Every other pet steers toward a leader and has a walking/settled state.
  // The koala skips all of that: it's simply anchored to a fixed spot on
  // AURA's upper back at all times, arms wrapped forward in a hug, tracked
  // directly off the robot's own position/rotation every frame - a single,
  // constant target, never blended with anything else, so there's nothing
  // for it to get stuck fighting over. Its whole personality is idle: a
  // slow sleepy breathing sway, occasional ear twitches, eyes that stay
  // sleepily half-closed and blink open for a peek now and then, plus a
  // gentle jostle whenever AURA is actually walking.
  // ======================================================================
  const KOALA_BODY_RADIUS = 0.24;
  const KOALA_SCALE = 3; // kid-favorite pet, sized up so it reads clearly riding on AURA's back
  // Anchor: a fixed spot on AURA's upper back/shoulders, expressed in AURA's own local space so it
  // rides along correctly with every turn and every idle/walk bob of the robot itself. Pulled back
  // and up a bit further than a small rider would need, to give the larger koala clearance.
  const KOALA_ANCHOR_LOCAL = { x: 0, y: 1.15, z: -2.5 };

  const koalaAnimBones = { armL: null, armR: null, legL: null, legR: null, earL: null, earR: null, head: null, eyeL: null, eyeR: null };
  const petKoala = new THREE.Group();
  petKoala.scale.set(KOALA_SCALE, KOALA_SCALE, KOALA_SCALE);
  scene.add(petKoala);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const koalaMatMain = bodyMat(COLORS.orange);
  const koalaMatDark = bodyMat(COLORS.orangeDk);

  // ---- Body (round and chunky, sits snugly against AURA's back) ----
  const koalaBody = new THREE.Group(); petKoala.add(koalaBody);
  const koalaTorso = new THREE.Mesh(new THREE.SphereGeometry(KOALA_BODY_RADIUS, 18, 14), koalaMatMain);
  koalaTorso.scale.set(1.05, 1.05, 0.85); koalaTorso.castShadow = true; koalaTorso.receiveShadow = true; addOutline(koalaTorso, 0.034); koalaBody.add(koalaTorso);
  const koalaBelly = new THREE.Mesh(new THREE.SphereGeometry(KOALA_BODY_RADIUS * 0.75, 14, 12), matWool);
  koalaBelly.scale.set(0.9, 0.95, 0.55); koalaBelly.position.set(0, -0.02, 0.14); addOutline(koalaBelly, 0.02); koalaBody.add(koalaBelly);
  // Tiny stub tail - real koalas barely have one
  const koalaTailStub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), koalaMatMain);
  koalaTailStub.position.set(0, -0.05, -KOALA_BODY_RADIUS * 0.8); addOutline(koalaTailStub, 0.014); koalaBody.add(koalaTailStub);

  // ---- Head (round, with big fluffy ears and a bold oval nose - the classic koala face) ----
  const koalaHead = new THREE.Group();
  koalaHead.position.set(0, KOALA_BODY_RADIUS * 0.95, 0.05);
  koalaAnimBones.head = koalaHead; koalaBody.add(koalaHead);
  const koalaHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14), koalaMatMain);
  koalaHeadShell.scale.set(1.0, 0.92, 0.92); koalaHeadShell.castShadow = true; addOutline(koalaHeadShell, 0.034); koalaHead.add(koalaHeadShell);
  const koalaMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), matWool);
  koalaMuzzle.scale.set(1.0, 0.8, 0.75); koalaMuzzle.position.set(0, -0.05, 0.13); koalaMuzzle.castShadow = true; addOutline(koalaMuzzle, 0.022); koalaHead.add(koalaMuzzle);
  // Big bold oval nose - the single most recognizable koala feature
  const koalaNose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), koalaMatDark);
  koalaNose.scale.set(1.1, 0.85, 0.7); koalaNose.position.set(0, 0.02, 0.17); koalaNose.castShadow = true; addOutline(koalaNose, 0.016); koalaHead.add(koalaNose);
  // Sleepy half-closed eyes - squashed thin by default, occasionally peek open for a moment
  const koalaEyeGeo = new THREE.SphereGeometry(0.042, 12, 10);
  const koalaEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const koalaEyeL = new THREE.Mesh(koalaEyeGeo, koalaEyeMat); koalaEyeL.position.set(-0.075, 0.05, 0.135); koalaEyeL.scale.y = 0.35; koalaAnimBones.eyeL = koalaEyeL; koalaHead.add(koalaEyeL);
  const koalaEyeR = new THREE.Mesh(koalaEyeGeo, koalaEyeMat); koalaEyeR.position.set(0.075, 0.05, 0.135); koalaEyeR.scale.y = 0.35; koalaAnimBones.eyeR = koalaEyeR; koalaHead.add(koalaEyeR);
  const koalaNub = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 0.9 }));
  koalaNub.position.set(0, 0.17, -0.06); koalaHead.add(koalaNub);

  // Big, round, fluffy ears with a two-tone inner disc
  function buildKoalaEar(sign) {
    const ear = new THREE.Group(); ear.position.set(sign * 0.16, 0.14, -0.03);
    const earOuter = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), koalaMatMain);
    earOuter.scale.set(1, 1, 0.5); earOuter.castShadow = true; addOutline(earOuter, 0.024); ear.add(earOuter);
    const earInner = new THREE.Mesh(new THREE.CircleGeometry(0.065, 16), koalaMatDark);
    earInner.position.z = 0.045; ear.add(earInner);
    return ear;
  }
  koalaAnimBones.earL = buildKoalaEar(-1); koalaHead.add(koalaAnimBones.earL);
  koalaAnimBones.earR = buildKoalaEar(1); koalaHead.add(koalaAnimBones.earR);

  // ---- Arms (wrapped forward in a hug, hands meeting near the front - a fixed clinging pose) ----
  function buildKoalaArm(sign) {
    const shoulder = new THREE.Group(); shoulder.position.set(sign * KOALA_BODY_RADIUS * 0.8, 0.08, 0.06);
    shoulder.rotation.set(-1.7, sign * 0.35, sign * 0.3);
    const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), koalaMatMain); shoulderBall.castShadow = true; addOutline(shoulderBall, 0.016); shoulder.add(shoulderBall);
    const upperArm = ribbedTube(0.16, 0.042, 2, COLORS.grey, COLORS.greyLt); upperArm.position.y = -0.08; shoulder.add(upperArm);
    const elbow = new THREE.Group(); elbow.position.set(0, -0.16, 0); elbow.rotation.x = -1.0; shoulder.add(elbow);
    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), koalaMatMain); elbowBall.castShadow = true; addOutline(elbowBall, 0.014); elbow.add(elbowBall);
    const forearm = ribbedTube(0.13, 0.036, 2, COLORS.grey, COLORS.greyLt); forearm.position.y = -0.065; elbow.add(forearm);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), koalaMatDark);
    paw.position.set(0, -0.13, 0.015); paw.castShadow = true; addOutline(paw, 0.014); elbow.add(paw);
    return { shoulder, elbow, paw };
  }
  koalaAnimBones.armL = buildKoalaArm(-1); koalaBody.add(koalaAnimBones.armL.shoulder);
  koalaAnimBones.armR = buildKoalaArm(1);  koalaBody.add(koalaAnimBones.armR.shoulder);

  // ---- Legs (gripping down and back around AURA's sides - also a fixed clinging pose) ----
  function buildKoalaLeg(sign) {
    const hip = new THREE.Group(); hip.position.set(sign * KOALA_BODY_RADIUS * 0.65, -0.14, -0.08);
    hip.rotation.set(0.5, 0, sign * 0.55);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), koalaMatMain); hipBall.castShadow = true; addOutline(hipBall, 0.017); hip.add(hipBall);
    const thigh = ribbedTube(0.15, 0.048, 2, COLORS.grey, COLORS.greyLt); thigh.position.y = -0.075; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.set(0, -0.15, 0); knee.rotation.x = 0.9; hip.add(knee);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), koalaMatMain); kneeBall.castShadow = true; addOutline(kneeBall, 0.015); knee.add(kneeBall);
    const shin = ribbedTube(0.12, 0.04, 2, COLORS.grey, COLORS.greyLt); shin.position.y = -0.06; knee.add(shin);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), koalaMatDark);
    foot.position.set(0, -0.12, 0.012); foot.castShadow = true; addOutline(foot, 0.015); knee.add(foot);
    return { hip, knee };
  }
  koalaAnimBones.legL = buildKoalaLeg(-1); koalaBody.add(koalaAnimBones.legL.hip);
  koalaAnimBones.legR = buildKoalaLeg(1);  koalaBody.add(koalaAnimBones.legR.hip);

  // ---- State: no leader-chasing or arrival logic at all - just idle animation timers, plus its
  //      own tracking of AURA's actual movement (independent of chain position/leader argument) ----
  let koalaPrevRobotX = robot.position.x, koalaPrevRobotZ = robot.position.z;
  let koalaJostle = 0;          // smoothed 0-1, how much AURA is currently walking
  let koalaStillTimer = 0;
  let koalaWaveAmount = 0;      // 0 = riding along normally, 1 = fully turned to camera and waving
  let koalaEarTwitchTimer = 2 + Math.random() * 2;
  let koalaPeekTimer = 3 + Math.random() * 3;
  let koalaPeekPhase = 0;       // 0 = sleepy, ramps up and back down for a brief eyes-open peek
  // Resting hug pose for the right arm (the one that raises to wave), captured once so the wave can
  // blend smoothly back to it - matches the pose it was originally built with.
  const KOALA_ARM_R_REST = { x: -1.7, y: 0.35, z: 0.3 };
  const KOALA_ARM_R_WAVE = { x: -0.15, y: 0.5, z: -1.15 };

  function updatePetKoala(dt, time, leader) {
    // --- Anchor: always the same fixed spot on AURA's back, recomputed fresh off the robot's own
    //     live position/rotation every frame - a single target, never blended with anything else ---
    const auraRotY = robot.rotation.y;
    const auraRightX = Math.cos(auraRotY), auraRightZ = -Math.sin(auraRotY);
    const auraForwardX = Math.sin(auraRotY), auraForwardZ = Math.cos(auraRotY);
    const anchorX = robot.position.x + KOALA_ANCHOR_LOCAL.x * auraRightX + KOALA_ANCHOR_LOCAL.z * auraForwardX;
    const anchorZ = robot.position.z + KOALA_ANCHOR_LOCAL.x * auraRightZ + KOALA_ANCHOR_LOCAL.z * auraForwardZ;
    const anchorY = robot.position.y + KOALA_ANCHOR_LOCAL.y;

    // Rigidly locked to the anchor every frame - it's riding on AURA's back, so there should never
    // be any gap or lag, even when AURA is walking quickly. The subtle sway/breathing life is added
    // separately below, on koalaBody's own *local* offset relative to this root - never on the root
    // itself - so the root (and therefore the whole rider) always stays glued exactly in place.
    petKoala.position.set(anchorX, anchorY, anchorZ);
    petKoala.rotation.y = auraRotY;

    // --- How much is AURA actually walking right now? Tracked directly off the robot's own
    //     position deltas, independent of which pet (if any) the koala is nominally chained behind ---
    const robotDx = robot.position.x - koalaPrevRobotX, robotDz = robot.position.z - koalaPrevRobotZ;
    const robotSpeed = Math.hypot(robotDx, robotDz) / Math.max(dt, 0.0001);
    koalaPrevRobotX = robot.position.x; koalaPrevRobotZ = robot.position.z;
    const walkingAmt = Math.min(1, robotSpeed / 3.0);
    koalaJostle = THREE.MathUtils.lerp(koalaJostle, walkingAmt, Math.min(1, dt * 4));

    // --- Wave decision: once AURA has been genuinely still for a moment, turn and wave at the camera ---
    if (koalaJostle < 0.08) koalaStillTimer += dt; else koalaStillTimer = 0;
    const wantsToWave = koalaStillTimer > 0.6;
    koalaWaveAmount = THREE.MathUtils.lerp(koalaWaveAmount, wantsToWave ? 1 : 0, Math.min(1, dt * 3));

    // --- Sleepy breathing sway, plus a gentle jostle layered on top whenever AURA is walking ---
    const breathe = Math.sin(time * 0.0016) * 0.02;
    const jostleBob = koalaJostle * Math.abs(Math.sin(time * 0.012)) * 0.05;
    koalaBody.position.y = breathe + jostleBob;
    koalaBody.rotation.z = Math.sin(time * 0.0016) * 0.025 + koalaJostle * Math.sin(time * 0.013) * 0.05;
    koalaBody.scale.y = 1 + Math.sin(time * 0.0016) * 0.018;

    // --- Head: normally a small sleepy sway, but once settled and waving it turns to look toward
    //     the camera instead - clamped to a believable head-turn range ---
    const sleepyHeadYaw = Math.sin(time * 0.0011) * 0.04 * (1 - koalaJostle * 0.5);
    const camDx = camera.position.x - petKoala.position.x, camDz = camera.position.z - petKoala.position.z;
    const desiredWorldYaw = Math.atan2(camDx, camDz);
    let localYawDiff = desiredWorldYaw - auraRotY;
    while (localYawDiff > Math.PI) localYawDiff -= Math.PI * 2;
    while (localYawDiff < -Math.PI) localYawDiff += Math.PI * 2;
    const cameraLookYaw = THREE.MathUtils.clamp(localYawDiff, -1.3, 1.3);
    koalaHead.rotation.y = THREE.MathUtils.lerp(sleepyHeadYaw, cameraLookYaw, koalaWaveAmount);
    koalaHead.rotation.x = koalaJostle * Math.sin(time * 0.013) * 0.04 * (1 - koalaWaveAmount);
    koalaHead.rotation.z = Math.sin(time * 0.0011) * 0.04 * (1 - koalaJostle * 0.5) * (1 - koalaWaveAmount);

    // --- Ear twitch: an occasional lazy flick, purely for personality ---
    koalaEarTwitchTimer -= dt;
    if (koalaEarTwitchTimer <= 0) { koalaEarTwitchTimer = 2.5 + Math.random() * 3; }
    const twitchT = Math.max(0, 1 - koalaEarTwitchTimer / 0.35);
    const twitchWiggle = twitchT > 0 && twitchT < 1 ? Math.sin(twitchT * Math.PI) * 0.35 : 0;
    koalaAnimBones.earL.rotation.z = -twitchWiggle;
    koalaAnimBones.earR.rotation.z = twitchWiggle;

    // --- Eyes: sleepily half-closed almost always, with the occasional brief peek - but wide open
    //     and alert while it's looking over and waving ---
    koalaPeekTimer -= dt;
    if (koalaPeekTimer <= 0) { koalaPeekTimer = 3.5 + Math.random() * 4; koalaPeekPhase = 0.0001; }
    let eyeOpen = 0.35;
    if (koalaPeekPhase > 0) {
      koalaPeekPhase += dt * 2.2;
      const openAmt = koalaPeekPhase < 1 ? koalaPeekPhase : Math.max(0, 2 - koalaPeekPhase);
      eyeOpen = 0.35 + Math.min(1, openAmt) * 0.65;
      if (koalaPeekPhase >= 2) koalaPeekPhase = 0;
    }
    eyeOpen = THREE.MathUtils.lerp(eyeOpen, 1, koalaWaveAmount);
    koalaAnimBones.eyeL.scale.y = eyeOpen; koalaAnimBones.eyeR.scale.y = eyeOpen;

    // --- Grip: a slow, subtle squeeze on the arms/legs, synced to the breathing cycle ---
    const gripPulse = Math.sin(time * 0.0016) * 0.06;
    koalaAnimBones.armL.elbow.rotation.x = -1.0 + gripPulse;
    koalaAnimBones.legL.knee.rotation.x = 0.9 - gripPulse;
    koalaAnimBones.legR.knee.rotation.x = 0.9 - gripPulse;

    // --- Right arm: stays gripped on in the resting hug pose until it's settled in, then raises up
    //     and waves side to side at the camera ---
    const waveWobble = Math.sin(time * 0.0075) * 0.4 * koalaWaveAmount;
    koalaAnimBones.armR.shoulder.rotation.x = THREE.MathUtils.lerp(KOALA_ARM_R_REST.x, KOALA_ARM_R_WAVE.x, koalaWaveAmount);
    koalaAnimBones.armR.shoulder.rotation.y = THREE.MathUtils.lerp(KOALA_ARM_R_REST.y, KOALA_ARM_R_WAVE.y, koalaWaveAmount);
    koalaAnimBones.armR.shoulder.rotation.z = THREE.MathUtils.lerp(KOALA_ARM_R_REST.z, KOALA_ARM_R_WAVE.z, koalaWaveAmount) + waveWobble;
    koalaAnimBones.armR.elbow.rotation.x = THREE.MathUtils.lerp(-1.0 + gripPulse, -0.5, koalaWaveAmount);
  }

  // ======================================================================
  // ---------- PET: MINI ROBOT LAMB COMPANION (follows whoever's ahead of it) ----------
  // Unlike the other companions, the Lamb only ever leaps - even at rest it keeps
  // bouncing gently in place, like a real lamb. It also only offers 3 color looks
  // (White / Black / Black & White) instead of the full palette - see the
  // LAMB_COLOR_PALETTE + petPaletteOverrides section further down.
  // ======================================================================
  const LAMB_BODY_WID = 0.36, LAMB_BODY_HT = 0.30, LAMB_BODY_LEN = 0.42;
  const LAMB_LEG_LEN = 0.20, LAMB_PAW_HT = 0.05;
  const LAMB_LEG_REACH = LAMB_LEG_LEN + LAMB_PAW_HT;
  const LAMB_HIP_Y = -0.05;
  const LAMB_GROUND_OFFSET = LAMB_HIP_Y - LAMB_LEG_REACH;
  const LAMB_BASE_Y = -4.65 - LAMB_GROUND_OFFSET;
  const LAMB_BODY_Y = LAMB_HIP_Y + LAMB_BODY_HT / 2 + 0.06;

  const lambAnimBones = { legFL: null, legFR: null, legBL: null, legBR: null, head: null, earL: null, earR: null, tail: null };
  const petLamb = new THREE.Group();
  petLamb.position.set(petDragon.position.x, LAMB_BASE_Y, petDragon.position.z - 2.0);
  scene.add(petLamb);

  // Own material instances (not shared with AURA or other pets) so this pet's
  // body color can be set independently from the Pet Menu color swatches.
  const lambMatMain = bodyMat(0xF7F5EF); // fleece - White/Black/Black&White base
  const lambMatFace = bodyMat(0x2B2B2E); // face, ears, legs, and (when shown) patches

  // ---- Body (torso + a scatter of wool "puff" spheres for a fluffy silhouette) ----
  const lambBody = new THREE.Group(); lambBody.position.set(0, LAMB_BODY_Y, 0); petLamb.add(lambBody);
  const lambTorso = new THREE.Mesh(roundedBoxGeometry(LAMB_BODY_WID, LAMB_BODY_HT, LAMB_BODY_LEN, 0.15), lambMatMain);
  lambTorso.castShadow = true; lambTorso.receiveShadow = true; addOutline(lambTorso, 0.035); lambBody.add(lambTorso);

  // Wool puffs: most always match the fleece; two are set aside as "patches" and
  // stay hidden unless the Black & White look is selected (see setColor below).
  const lambPatches = [];
  const puffSpots = [
    { x: -0.13, y: 0.09, z: 0.1, r: 0.1, patch: false },
    { x: 0.13, y: 0.09, z: 0.1, r: 0.1, patch: true },
    { x: -0.14, y: 0.08, z: -0.12, r: 0.1, patch: true },
    { x: 0.14, y: 0.08, z: -0.12, r: 0.1, patch: false },
    { x: 0, y: 0.13, z: -0.02, r: 0.11, patch: false },
  ];
  puffSpots.forEach(s => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(s.r, 12, 10), s.patch ? lambMatFace : lambMatMain);
    puff.position.set(s.x, s.y, s.z); puff.castShadow = true; addOutline(puff, 0.025); lambBody.add(puff);
    if (s.patch) { puff.visible = false; lambPatches.push(puff); }
  });

  // ---- Head (small, dark "face" like a classic Suffolk lamb, with a wool tuft) ----
  const lambHead = new THREE.Group();
  lambHead.position.set(0, LAMB_BODY_HT / 2 + 0.1, LAMB_BODY_LEN / 2 - 0.02);
  lambAnimBones.head = lambHead; lambBody.add(lambHead);
  const lambHeadShell = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 14), lambMatFace);
  lambHeadShell.castShadow = true; addOutline(lambHeadShell, 0.032); lambHead.add(lambHeadShell);
  const lambMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), lambMatFace);
  lambMuzzle.position.set(0, -0.06, 0.11); lambMuzzle.castShadow = true; addOutline(lambMuzzle, 0.02); lambHead.add(lambMuzzle);
  const lambTopknot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), lambMatMain);
  lambTopknot.position.set(0, 0.1, -0.02); addOutline(lambTopknot, 0.02); lambHead.add(lambTopknot);
  const lambEyeGeo = new THREE.SphereGeometry(0.04, 12, 10);
  const lambEyeMat = new THREE.MeshStandardMaterial({ color: 0x2EE2FA, emissive: 0x2EE2FA, emissiveIntensity: 1.0 });
  const lambEyeL = new THREE.Mesh(lambEyeGeo, lambEyeMat); lambEyeL.position.set(-0.08, 0.02, 0.1); lambHead.add(lambEyeL);
  const lambEyeR = new THREE.Mesh(lambEyeGeo, lambEyeMat); lambEyeR.position.set(0.08, 0.02, 0.1); lambHead.add(lambEyeR);

  // Small floppy ears
  function buildLambEar(sign) {
    const hinge = new THREE.Group(); hinge.position.set(sign * 0.14, 0.02, 0.03); hinge.rotation.z = sign * 0.5;
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 10), lambMatFace);
    ear.rotation.x = Math.PI / 2 * 0.9; ear.position.set(0, 0, 0.02);
    ear.castShadow = true; addOutline(ear, 0.018); hinge.add(ear);
    return hinge;
  }
  lambAnimBones.earL = buildLambEar(-1); lambHead.add(lambAnimBones.earL);
  lambAnimBones.earR = buildLambEar(1); lambHead.add(lambAnimBones.earR);

  // ---- Tail (little wool stub) ----
  const lambTailHinge = new THREE.Group();
  lambTailHinge.position.set(0, LAMB_BODY_HT * 0.1, -LAMB_BODY_LEN / 2 + 0.02);
  lambAnimBones.tail = lambTailHinge; lambBody.add(lambTailHinge);
  const lambTailPuff = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lambMatMain);
  addOutline(lambTailPuff, 0.02); lambTailHinge.add(lambTailPuff);

  // ---- Legs (simple single-segment robot legs - hip joint only, no knee) ----
  function buildLambLeg(signX, isFront) {
    const legZ = isFront ? LAMB_BODY_LEN * 0.3 : -LAMB_BODY_LEN * 0.3;
    const hip = new THREE.Group(); hip.position.set(signX * (LAMB_BODY_WID / 2 - 0.04), LAMB_HIP_Y, legZ);
    const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), lambMatFace); hipBall.castShadow = true; addOutline(hipBall, 0.015); hip.add(hipBall);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, LAMB_LEG_LEN, 12), lambMatFace);
    thigh.position.y = -LAMB_LEG_LEN / 2; thigh.castShadow = true; addOutline(thigh, 0.014); hip.add(thigh);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), lambMatFace);
    paw.position.y = -(LAMB_LEG_LEN + LAMB_PAW_HT / 2); paw.castShadow = true; addOutline(paw, 0.014); hip.add(paw);
    return { hip };
  }
  lambAnimBones.legFL = buildLambLeg(-1, true);  petLamb.add(lambAnimBones.legFL.hip);
  lambAnimBones.legFR = buildLambLeg(1, true);   petLamb.add(lambAnimBones.legFR.hip);
  lambAnimBones.legBL = buildLambLeg(-1, false); petLamb.add(lambAnimBones.legBL.hip);
  lambAnimBones.legBR = buildLambLeg(1, false);  petLamb.add(lambAnimBones.legBR.hip);

  // ---- Follow / leap state ----
  let lambFacing = petDragon.rotation.y;
  let lambHopPhase = 0;
  let lambIsMoving = false;
  let lambSettleAmount = 0;
  let LAMB_FOLLOW_DIST = 3.6;
  const LAMB_FOLLOW_SIDE = -0.5;
  const LAMB_ARRIVE_DIST = 0.4;
  const LAMB_IDLE_HOP_RATE = 2.6;  // gentle continuous bounce while settled - it never really stands still
  const LAMB_MOVE_HOP_RATE = 6.5;  // quicker leaping cadence while actually travelling to catch up

  function updatePetLamb(dt, time, leader) {
    const forwardX = Math.sin(leader.rotY), forwardZ = Math.cos(leader.rotY);
    const rightX = Math.cos(leader.rotY), rightZ = -Math.sin(leader.rotY);
    const targetX = leader.x - forwardX * LAMB_FOLLOW_DIST + rightX * LAMB_FOLLOW_SIDE;
    const targetZ = leader.z - forwardZ * LAMB_FOLLOW_DIST + rightZ * LAMB_FOLLOW_SIDE;

    const prevX = petLamb.position.x, prevZ = petLamb.position.z;
    const distToSpot = Math.hypot(targetX - prevX, targetZ - prevZ);
    const isTravelling = distToSpot > LAMB_ARRIVE_DIST;
    lambIsMoving = isTravelling;
    lambSettleAmount = THREE.MathUtils.lerp(lambSettleAmount, isTravelling ? 0 : 1, Math.min(1, dt * 4));

    const followLerp = 1 - Math.pow(0.0025, dt);
    petLamb.position.x += (targetX - prevX) * followLerp;
    petLamb.position.z += (targetZ - prevZ) * followLerp;

    const dx = petLamb.position.x - prevX, dz = petLamb.position.z - prevZ;
    if (Math.hypot(dx, dz) > 0.0006) {
      const desiredFacing = Math.atan2(dx, dz);
      let diff = desiredFacing - lambFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      lambFacing += diff * Math.min(1, dt * 9);
    } else {
      let diff = leader.rotY - lambFacing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      lambFacing += diff * Math.min(1, dt * 2);
    }
    petLamb.rotation.y = lambFacing;

    // --- The leap: always bouncing, whether it's catching up or just hanging around ---
    const hopRate = isTravelling ? LAMB_MOVE_HOP_RATE : LAMB_IDLE_HOP_RATE;
    lambHopPhase += dt * hopRate;
    const hopArc = Math.abs(Math.sin(lambHopPhase)); // 0 on the ground, 1 at the peak of each leap
    const hopAmplitude = isTravelling ? 0.34 : 0.16;
    petLamb.position.y = LAMB_BASE_Y + hopArc * hopAmplitude;

    // Legs kick out mid-air and tuck back down on landing - front & back pairs
    // swing in a simple opposing rhythm for a springy, four-on-the-floor leap.
    const legSwing = Math.sin(lambHopPhase) * 0.55;
    lambAnimBones.legFL.hip.rotation.x = -legSwing; lambAnimBones.legFR.hip.rotation.x = -legSwing;
    lambAnimBones.legBL.hip.rotation.x = legSwing;  lambAnimBones.legBR.hip.rotation.x = legSwing;

    // Body dips slightly right before push-off and stretches a touch at the peak
    lambBody.rotation.x = hopArc * 0.1;
    lambBody.position.y = LAMB_BODY_Y + hopArc * 0.02;

    // Head bobs opposite the body, ears flop on the way down, tail flicks on landing
    lambHead.rotation.x = -hopArc * 0.15 + Math.sin(time * 0.002) * 0.02;
    const earFlop = (1 - hopArc) * 0.25;
    lambAnimBones.earL.rotation.x = earFlop; lambAnimBones.earR.rotation.x = earFlop;
    lambTailHinge.rotation.x = -Math.max(0, 1 - hopArc - 0.7) * 1.2;
  }


  // Each pet type already knows how to steer toward a "leader" and how to
  // report whether it's currently settled. That's everything needed to chain
  // them together dynamically: AURA hands off a leader object to whichever
  // pet is first in petActiveOrder, that pet's own position/facing/settledness
  // becomes the leader object for the next active pet, and so on. Only pets
  // in the "Following" list are animated and rendered as part of the chain -
  // anyone moved to "Not Following" is hidden from the scene entirely and
  // skipped every frame. Drag rows between (or within) the two lists in the
  // Pet Menu to change all of this live.
  // ======================================================================
  const MAX_ACTIVE_PETS = 3;

  const petTypes = {
    dog:    { label: 'Dog',    icon: '🐶', group: petDog,    update: updatePetDog,    isMoving: () => dogIsTrotting,                settled: () => dogSitAmount,          setColor: (m, d) => { dogMatMain.color.setHex(m); dogMatDark.color.setHex(d); } },
    cat:    { label: 'Cat',    icon: '🐱', group: petCat,    update: updatePetCat,    isMoving: () => catIsTrotting,                settled: () => catSitAmount,          setColor: (m, d) => { catMatMain.color.setHex(m); catMatDark.color.setHex(d); } },
    bird:   { label: 'Bird',   icon: '🐦', group: petBird,   update: updatePetBird,   isMoving: () => birdGroundedAmount <= 0.9,    settled: () => birdGroundedAmount,    setColor: (m, d) => { birdMatMain.color.setHex(m); birdMatDark.color.setHex(d); } },
    alpaca: { label: 'Alpaca', icon: '🦙', group: petAlpaca, update: updatePetAlpaca, isMoving: () => alpacaKushAmount <= 0.9,      settled: () => alpacaKushAmount,      setColor: (m, d) => { alpacaMatMain.color.setHex(m); alpacaMatDark.color.setHex(d); } },
    bunny:  { label: 'Bunny',  icon: '🐰', group: petBunny,  update: updatePetBunny,  isMoving: () => bunnyStandAmount <= 0.9,      settled: () => bunnyStandAmount,      setColor: (m, d) => { bunnyMatMain.color.setHex(m); bunnyMatDark.color.setHex(d); } },
    frog:   { label: 'Frog',   icon: '🐸', group: petFrog,   update: updatePetFrog,   isMoving: () => frogCroakAmount <= 0.9,       settled: () => frogCroakAmount,       setColor: (m, d) => { frogMatMain.color.setHex(m); frogMatDark.color.setHex(d); } },
    monkey: { label: 'Monkey', icon: '🐒', group: petMonkey, update: updatePetMonkey, isMoving: () => monkeyIsScampering,           settled: () => monkeySitAmount,       setColor: (m, d) => { monkeyMatMain.color.setHex(m); monkeyMatDark.color.setHex(d); } },
    panda:  { label: 'Panda',  icon: '🐼', group: petPanda,  update: updatePetPanda,  isMoving: () => pandaIsWaddling,              settled: () => pandaSitAmount,        setColor: (m, d) => { pandaMatMain.color.setHex(m); pandaMatDark.color.setHex(d); } },
    owl:    { label: 'Owl',    icon: '🦉', group: petOwl,    update: updatePetOwl,    isMoving: () => owlGroundedAmount <= 0.9,     settled: () => owlGroundedAmount,     setColor: (m, d) => { owlMatMain.color.setHex(m); owlMatDark.color.setHex(d); } },
    dragon: { label: 'Dragon', icon: '🐉', group: petDragon, update: updatePetDragon, isMoving: () => dragonIsTrotting,             settled: () => dragonCurlAmount,      setColor: (m, d) => { dragonMatMain.color.setHex(m); dragonMatDark.color.setHex(d); } },
    koala:  { label: 'Koala',  icon: '🐨', group: petKoala,  update: updatePetKoala,  isMoving: () => false,                        settled: () => 1,                     setColor: (m, d) => { koalaMatMain.color.setHex(m); koalaMatDark.color.setHex(d); } },
    lamb:   { label: 'Lamb',   icon: '🐑', group: petLamb,   update: updatePetLamb,   isMoving: () => lambIsMoving,                 settled: () => lambSettleAmount,      setColor: (m, d) => { lambMatMain.color.setHex(m); lambMatFace.color.setHex(d); lambPatches.forEach(p => { p.visible = petColors.lamb === 'blackwhite'; }); } },
  };
  const ALL_PET_IDS = Object.keys(petTypes);

  // AURA starts with NO pets at all. Pets are only ever added to petOwned (and,
  // from there, to the active/inactive rosters below) by adopting them from the
  // Pet Adoption Box (see "PET ADOPTION BOX" landmark further down). Only owned
  // pets ever occupy a slot in petActiveOrder/petInactiveOrder or show up in the
  // Pet Menu (press P) - unowned pets stay fully hidden and untouched.
  const petOwned = {};
  ALL_PET_IDS.forEach(id => { petOwned[id] = false; });
  let petActiveOrder = [];   // owned pets currently following AURA, in order - max 3
  let petInactiveOrder = []; // owned pets currently benched ("Not Following")
  const petNames = { dog: 'Dog', cat: 'Cat', bird: 'Bird', alpaca: 'Alpaca', bunny: 'Bunny', frog: 'Frog', monkey: 'Monkey', panda: 'Panda', owl: 'Owl', dragon: 'Dragon', koala: 'Koala', lamb: 'Lamb' };

  // Toon-flat colors pulled from this app's own palette (status badges, HUD
  // accents, AURA's theme swatches) so every option already matches the vibe.
  const PET_COLOR_PALETTE = [
    { id: 'orange', label: 'Orange', main: 0xFF5E13, dark: 0xDF3C00 },
    { id: 'cyan',   label: 'Cyan',   main: 0x2EE2FA, dark: 0x0FA8C4 },
    { id: 'blue',   label: 'Blue',   main: 0x1E88E5, dark: 0x125EA1 },
    { id: 'green',  label: 'Green',  main: 0x00C853, dark: 0x00873D },
    { id: 'gold',   label: 'Gold',   main: 0xFFB800, dark: 0xC98D00 },
    { id: 'pink',   label: 'Pink',   main: 0xFF007F, dark: 0xC00060 },
    { id: 'purple', label: 'Purple', main: 0x9C27B0, dark: 0x6A1B7A },
    { id: 'silver', label: 'Silver', main: 0xD0D5DD, dark: 0x8A94A6 },
    { id: 'brown',  label: 'Brown',  main: 0x8B5A2B, dark: 0x5C3A1A },
    { id: 'white',  label: 'White',  main: 0xF5F5F0, dark: 0xD8D8D0 },
  ];
  const petColors = { dog: 'orange', cat: 'orange', bird: 'orange', alpaca: 'orange', bunny: 'orange', frog: 'green', monkey: 'brown', panda: 'white', owl: 'gold', dragon: 'green', koala: 'silver', lamb: 'white' };

  // The Lamb only offers 3 looks (real lambs don't come in Prismatic!) instead of
  // the full 10-color palette above - this map lets a pet swap out its whole
  // palette; anyone not listed here just uses PET_COLOR_PALETTE as normal.
  const LAMB_COLOR_PALETTE = [
    { id: 'white',      label: 'White',           main: 0xF7F5EF, dark: 0x2B2B2E },
    { id: 'black',      label: 'Black',           main: 0x2B2B2E, dark: 0x141416 },
    { id: 'blackwhite', label: 'Black & White',   main: 0xF7F5EF, dark: 0x2B2B2E, swatch: 'linear-gradient(135deg, #F7F5EF 50%, #2B2B2E 50%)' },
  ];
  const petPaletteOverrides = { lamb: LAMB_COLOR_PALETTE };
  function paletteFor(id) { return petPaletteOverrides[id] || PET_COLOR_PALETTE; }
  function colorDefFor(id) { return paletteFor(id).find(c => c.id === petColors[id]) || paletteFor(id)[0]; }

  const PET_SETTINGS_KEY = 'aura_pets_v1';
  function savePetSettings() {
    try {
      localStorage.setItem(PET_SETTINGS_KEY, JSON.stringify({
        owned: ALL_PET_IDS.filter(id => petOwned[id]),
        active: petActiveOrder, inactive: petInactiveOrder, names: petNames, colors: petColors
      }));
    } catch (err) { console.error('AURA pet settings save failed:', err); }
  }
  function loadPetSettings() {
    let raw;
    try { raw = localStorage.getItem(PET_SETTINGS_KEY); } catch (err) { return; }
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch (err) { return; }
    if (!data || typeof data !== 'object') return;

    const validIds = arr => Array.isArray(arr) && arr.every(id => petTypes[id]);

    // Only ever restore pets that were actually adopted - anything else stays
    // un-owned and invisible, even if it's referenced in old/corrupt data.
    let ownedSet = new Set();
    if (validIds(data.owned)) {
      ownedSet = new Set(data.owned);
    } else if (validIds(data.active) && validIds(data.inactive) && !('owned' in data)) {
      // Legacy save from before the ownership/adoption system existed - back then
      // every pet in active/inactive was simply available by default, with no
      // separate "owned" concept. Treat whatever it already lists as owned so
      // upgrading to the newer code doesn't quietly wipe out an existing roster.
      ownedSet = new Set([...data.active, ...data.inactive]);
    }

    if (validIds(data.active) && validIds(data.inactive) &&
        data.active.length <= MAX_ACTIVE_PETS &&
        data.active.every(id => ownedSet.has(id)) &&
        data.inactive.every(id => ownedSet.has(id)) &&
        new Set([...data.active, ...data.inactive]).size === ownedSet.size &&
        data.active.length + data.inactive.length === ownedSet.size) {
      ownedSet.forEach(id => { petOwned[id] = true; });
      petActiveOrder = data.active;
      petInactiveOrder = data.inactive;
    }
    if (data.names && typeof data.names === 'object') {
      Object.keys(petNames).forEach(id => {
        if (typeof data.names[id] === 'string' && data.names[id].trim()) petNames[id] = data.names[id].trim().slice(0, 20);
      });
    }
    if (data.colors && typeof data.colors === 'object') {
      Object.keys(petColors).forEach(id => {
        if (paletteFor(id).some(c => c.id === data.colors[id])) petColors[id] = data.colors[id];
      });
    }
  }
  loadPetSettings();
  // Apply loaded (or default) colors to the actual materials right away.
  ALL_PET_IDS.forEach(id => { const c = colorDefFor(id); petTypes[id].setColor(c.main, c.dark); });

  // Set (non-null) by the Pet Adoption Box code further down while a freshly-
  // purchased pet is popping out of the box and walking over to AURA. Declared
  // up-front so applyPetVisibility (called immediately below, before the box
  // code exists) can safely check it.
  let petAdoptionAnim = null;

  // Only OWNED pets that are also actively following are ever visible in the
  // scene - unowned pets and anyone benched to "Not Following" are fully hidden
  // (and skipped in updateAllPets below). A pet mid-adoption-animation (see the
  // Pet Adoption Box further down) manages its own group.visible directly and
  // is skipped here so the reveal/walk-in animation isn't stomped on.
  function applyPetVisibility() {
    ALL_PET_IDS.forEach(id => {
      if (petAdoptionAnim && petAdoptionAnim.id === id) return;
      petTypes[id].group.visible = petOwned[id] && petActiveOrder.includes(id);
    });
  }
  applyPetVisibility();

  // Called the instant a newly-purchased pet finishes emerging from the Pet
  // Adoption Box and walking over to join AURA. Marks it owned, slots it into
  // the follow chain if there's room (else benches it "Not Following"), and
  // refreshes the Pet Menu so it shows up there from now on.
  function acquirePet(id) {
    if (petOwned[id]) return;
    petOwned[id] = true;
    if (petActiveOrder.length < MAX_ACTIVE_PETS) petActiveOrder.push(id);
    else petInactiveOrder.push(id);
    applyPetVisibility();
    renderPetLists();
    savePetSettings();
  }

  // Walks the current active follow order, handing each pet a leader object
  // built from whoever (or whatever - AURA herself, for the first link) is
  // ahead of it. Inactive ("not following") pets are hidden and untouched.
  function updateAllPets(dt, time, auraIsStill) {
    let leader = { x: robot.position.x, z: robot.position.z, rotY: robot.rotation.y, moving: !auraIsStill };
    for (const id of petActiveOrder) {
      const pet = petTypes[id];
      pet.update(dt, time, leader);
      leader = { x: pet.group.position.x, z: pet.group.position.z, rotY: pet.group.rotation.y, moving: pet.isMoving() };
    }
  }

  // ---- Pet Menu UI: cross-list drag-and-drop (max 3 active), double-click rename, color swatches ----
  const petActiveListEl = document.getElementById('petActiveList');
  const petInactiveListEl = document.getElementById('petInactiveList');
  const petActiveCountEl = document.getElementById('petActiveCount');
  const petActiveHeaderEl = document.getElementById('petActiveHeader');

  function orderArrayFor(listName) { return listName === 'active' ? petActiveOrder : petInactiveOrder; }

  // Moves `id` out of whichever list it's currently in and into `toList`,
  // inserted just before `beforeId` (or at the end if `beforeId` is omitted).
  // Refuses the move if it would push the active list past MAX_ACTIVE_PETS.
  function movePet(id, toList, beforeId) {
    const fromList = petActiveOrder.includes(id) ? 'active' : 'inactive';
    if (toList === 'active' && fromList !== 'active' && petActiveOrder.length >= MAX_ACTIVE_PETS) {
      flashActiveLimit();
      return false;
    }
    const fromArr = orderArrayFor(fromList);
    const toArr = orderArrayFor(toList);
    const fromIdx = fromArr.indexOf(id);
    if (fromIdx !== -1) fromArr.splice(fromIdx, 1);
    let insertAt = toArr.length;
    if (beforeId) {
      const bIdx = toArr.indexOf(beforeId);
      if (bIdx !== -1) insertAt = bIdx;
    }
    toArr.splice(insertAt, 0, id);
    return true;
  }

  function flashActiveLimit() {
    petActiveHeaderEl.classList.remove('limit-shake');
    void petActiveHeaderEl.offsetWidth; // restart animation
    petActiveHeaderEl.classList.add('limit-shake');
  }

  function buildPetRow(id, index, listName) {
    const pet = petTypes[id];
    const row = document.createElement('div');
    row.className = 'pet-item';
    row.draggable = true;
    row.dataset.petId = id;

    const mainLine = document.createElement('div');
    mainLine.className = 'pet-item-main';

    const handle = document.createElement('span');
    handle.className = 'pet-drag-handle';
    handle.textContent = '⠿';
    mainLine.appendChild(handle);

    if (listName === 'active') {
      const orderBadge = document.createElement('span');
      orderBadge.className = 'pet-order-num';
      orderBadge.textContent = String(index + 1);
      mainLine.appendChild(orderBadge);
    }

    const iconEl = document.createElement('span');
    iconEl.className = 'pet-icon';
    iconEl.textContent = pet.icon;
    mainLine.appendChild(iconEl);

    const nameEl = document.createElement('span');
    nameEl.className = 'pet-name';
    nameEl.textContent = petNames[id];
    mainLine.appendChild(nameEl);

    nameEl.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pet-name-input';
      input.maxLength = 20;
      input.draggable = false;
      input.value = petNames[id];
      mainLine.replaceChild(input, nameEl);
      input.focus();
      input.select();
      let committed = false;
      function commit() {
        if (committed) return;
        committed = true;
        const val = input.value.trim();
        petNames[id] = val ? val.slice(0, 20) : pet.label;
        savePetSettings();
        renderPetLists();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') input.blur();
        if (ev.key === 'Escape') { input.value = petNames[id]; input.blur(); }
      });
      input.addEventListener('mousedown', ev => ev.stopPropagation());
    });

    row.appendChild(mainLine);

    // ---- Color swatches: a compact row of toon-palette dots to recolor this pet ----
    const swatchLine = document.createElement('div');
    swatchLine.className = 'pet-color-row';
    paletteFor(id).forEach(c => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.draggable = false;
      sw.className = 'pet-swatch' + (petColors[id] === c.id ? ' selected' : '');
      sw.style.background = c.swatch || hexCss(c.main);
      sw.title = c.label;
      sw.addEventListener('click', e => {
        e.stopPropagation();
        petColors[id] = c.id;
        pet.setColor(c.main, c.dark);
        savePetSettings();
        swatchLine.querySelectorAll('.pet-swatch').forEach(el => el.classList.remove('selected'));
        sw.classList.add('selected');
      });
      sw.addEventListener('mousedown', e => e.stopPropagation());
      swatchLine.appendChild(sw);
    });
    row.appendChild(swatchLine);

    row.addEventListener('dragstart', e => {
      if (e.target.closest('.pet-name-input') || e.target.closest('.pet-color-row')) { e.preventDefault(); return; }
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('.pet-item').forEach(el => el.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === id) return;
      if (movePet(draggedId, listName, id)) { savePetSettings(); renderPetLists(); }
    });

    return row;
  }

  function wireDropzone(el, listName) {
    el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); });
    el.addEventListener('dragleave', e => { if (e.target === el) el.classList.remove('drag-over'); });
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId) return;
      if (movePet(draggedId, listName)) { savePetSettings(); renderPetLists(); }
    });
  }
  wireDropzone(petActiveListEl, 'active');
  wireDropzone(petInactiveListEl, 'inactive');

  function renderPetLists() {
    petActiveListEl.innerHTML = '';
    if (petActiveOrder.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pet-empty';
      empty.textContent = ALL_PET_IDS.some(id => petOwned[id])
        ? 'Nobody following right now - drag a pet up from below!'
        : "No pets yet - visit the 📦 Pet Adoption Box to adopt one!";
      petActiveListEl.appendChild(empty);
    } else {
      petActiveOrder.forEach((id, index) => petActiveListEl.appendChild(buildPetRow(id, index, 'active')));
    }
    petInactiveListEl.innerHTML = '';
    petInactiveOrder.forEach((id, index) => petInactiveListEl.appendChild(buildPetRow(id, index, 'inactive')));
    petActiveCountEl.textContent = String(petActiveOrder.length);
    applyPetVisibility();
  }
  renderPetLists();

  // ======================================================================
  // ---------- GROUP CHEER: everyone shares one happy beat when they ALL stop ----------
  // The moment AURA and the whole line of pets are simultaneously settled -
  // dog sat, cat sat, bird landed, alpaca kushed, bunny reared up - they get
  // one synchronized burst of joy together: a quick little bounce, an ear
  // perk, a tail flick and a wing flutter, before easing back into their own
  // separate idle poses. A small reward for bringing the whole gang along.
  // ======================================================================
  let groupWasSettled = false;
  let groupCheerStart = -Infinity;
  const GROUP_CHEER_DURATION = 1100; // ms

  function updateGroupCheer(time) {
    const allSettled = petActiveOrder.every(id => petTypes[id].settled() > 0.97);
    if (allSettled && !groupWasSettled) groupCheerStart = time;
    groupWasSettled = allSettled;

    const elapsed = time - groupCheerStart;
    if (elapsed < 0 || elapsed > GROUP_CHEER_DURATION) return;
    const pulse = Math.sin((elapsed / GROUP_CHEER_DURATION) * Math.PI); // eases 0 -> 1 -> 0

    const hop = pulse * 0.22;
    petDog.position.y += hop;
    petCat.position.y += hop * 0.85;
    petAlpaca.position.y += hop * 0.7;
    petBunny.position.y += hop * 0.5;
    petFrog.position.y += hop * 0.6;
    birdAnimBones.wingL.rotation.z -= pulse * 0.25;
    birdAnimBones.wingR.rotation.z += pulse * 0.25;
    alpacaAnimBones.earL.rotation.x -= pulse * 0.35;
    alpacaAnimBones.earR.rotation.x -= pulse * 0.35;
    bunnyAnimBones.earL.rotation.x -= pulse * 0.3;
    bunnyAnimBones.earR.rotation.x -= pulse * 0.3;
    dogAnimBones.tail.rotation.y += Math.sin(time * 0.03) * pulse * 0.2;
    catAnimBones.tail.rotation.y += Math.sin(time * 0.03 + 1) * pulse * 0.2;
  }

  const sparkleGroup = new THREE.Group(); robot.add(sparkleGroup);
  sparkleGroup.visible = false; // only shown for the shinier color themes - see the palette click handler further down
  function createSparkleTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)'); grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.15)'); grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.moveTo(64, 8); ctx.lineTo(68, 58); ctx.lineTo(120, 64); ctx.lineTo(68, 70);
    ctx.lineTo(64, 120); ctx.lineTo(60, 70); ctx.lineTo(8, 64); ctx.lineTo(60, 58); ctx.closePath(); ctx.fill();
    return new THREE.CanvasTexture(c);
  }
  const sparkleTex = createSparkleTexture(), sparkles = [];
  for (let i = 0; i < 45; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.position.set((Math.random() - 0.5) * 4.5, (Math.random() - 0.5) * 5.2 + 1.2, (Math.random() - 0.5) * 3.8);
    const baseScale = 0.2 + Math.random() * 0.4; sprite.scale.set(baseScale, baseScale, 1);
    sparkleGroup.add(sprite); sparkles.push({ sprite: sprite, baseScale: baseScale, phase: Math.random() * Math.PI * 2, speed: 0.04 + Math.random() * 0.06 });
  }

  // ---------- SUPER SPEED FLAME TRAIL PARTICLES ----------
  function createFlameTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 240, 150, 1)'); grad.addColorStop(0.3, 'rgba(255, 120, 0, 0.9)');
    grad.addColorStop(0.7, 'rgba(220, 30, 0, 0.4)'); grad.addColorStop(1, 'rgba(100, 0, 0, 0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const flameTex = createFlameTexture();
  const flameParticles = [];
  function emitFlame() {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const backAngle = robot.rotation.y + Math.PI + (Math.random() - 0.5) * 0.4;
    const dist = 0.8 + Math.random() * 0.5;
    sprite.position.set(
      robot.position.x + Math.sin(backAngle) * dist,
      robot.position.y - 1.8 + Math.random() * 1.5,
      robot.position.z + Math.cos(backAngle) * dist
    );
    const startScale = 0.8 + Math.random() * 0.8;
    sprite.scale.set(startScale, startScale, 1);
    scene.add(sprite);
    flameParticles.push({ sprite, life: 1.0, decay: 0.035 + Math.random() * 0.02, vx: (Math.random() - 0.5) * 0.05, vy: 0.06 + Math.random() * 0.04, vz: (Math.random() - 0.5) * 0.05 });
  }

  // ---------- HOLOGRAM MATERIAL & EXTRUSION SETUP ----------
  const hologramMat = new THREE.MeshPhysicalMaterial({
    color: 0x2EE2FA, emissive: 0x0088CC, emissiveIntensity: 0.6,
    transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1, clearcoat: 0.5
  });
  const symbolExtrudeSettings = { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 };

  // ---------- 3D LANDMARK 1: KIOSK TERMINAL (9, -3) ----------
  const kioskGroup = new THREE.Group(); kioskGroup.position.set(9, -4.65, -3); kioskGroup.rotation.y = -Math.PI / 5; scene.add(kioskGroup);
  const kioskBase = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 0.6, 24), bodyMat(COLORS.grey));
  kioskBase.position.y = 0.3; kioskBase.castShadow = true; kioskBase.receiveShadow = true; addOutline(kioskBase, 0.05); kioskGroup.add(kioskBase);
  const kioskPillar = ribbedTube(3.8, 0.45, 5, COLORS.grey, COLORS.greyLt); kioskPillar.position.y = 2.5; kioskGroup.add(kioskPillar);
  const kioskConsole = new THREE.Group(); kioskConsole.position.set(0, 4.6, 0); kioskConsole.rotation.x = -Math.PI / 6; kioskGroup.add(kioskConsole);
  const consoleShell = new THREE.Mesh(roundedBoxGeometry(3.6, 2.6, 1.2, 0.25), matOrange); consoleShell.castShadow = true; consoleShell.receiveShadow = true; addOutline(consoleShell, 0.06); kioskConsole.add(consoleShell);
  const consoleBezel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.1), matOrangeDk); consoleBezel.position.z = 0.6; addOutline(consoleBezel, 0.03); kioskConsole.add(consoleBezel);

  const kioskCanvas = document.createElement('canvas'); kioskCanvas.width = 512; kioskCanvas.height = 384;
  const kioskCtx = kioskCanvas.getContext('2d'); const kioskTex = new THREE.CanvasTexture(kioskCanvas); kioskTex.encoding = THREE.sRGBEncoding;
  const kioskScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.0), new THREE.MeshStandardMaterial({ map: kioskTex, roughness: 0.3, metalness: 0.1, emissive: 0x001122, emissiveIntensity: 0.4 }));
  kioskScreen.position.z = 0.66; kioskConsole.add(kioskScreen);
  
  const beaconSphere = new THREE.Group(); beaconSphere.position.set(0, 8.8, 0); kioskGroup.add(beaconSphere);
  const qHookShape = new THREE.Shape();
  qHookShape.moveTo(-0.55, 0.25); qHookShape.bezierCurveTo(-0.55, 1.05, 0.65, 1.05, 0.65, 0.25);
  qHookShape.bezierCurveTo(0.65, -0.25, 0.12, -0.1, 0.12, -0.45); qHookShape.lineTo(-0.16, -0.45);
  qHookShape.bezierCurveTo(-0.16, -0.1, 0.37, -0.2, 0.37, 0.25); qHookShape.bezierCurveTo(0.37, 0.75, -0.27, 0.75, -0.27, 0.25); qHookShape.closePath();
  const qHookGeo = new THREE.ExtrudeGeometry(qHookShape, symbolExtrudeSettings); qHookGeo.translate(0, 0, -0.11);
  const qHookMesh = new THREE.Mesh(qHookGeo, hologramMat); addOutline(qHookMesh, 0.04); beaconSphere.add(qHookMesh);
  const qDotGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const qDotMesh = new THREE.Mesh(qDotGeo, hologramMat); qDotMesh.position.set(-0.02, -0.75, 0); addOutline(qDotMesh, 0.04); beaconSphere.add(qDotMesh);
  const qRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 12, 32), hologramMat); qRing.rotation.x = Math.PI / 2; qRing.position.y = -1.1; addOutline(qRing, 0.03); beaconSphere.add(qRing);

  // ---------- 3D LANDMARK 2: BANK EFTPOS TERMINAL (-9, -4) ----------
  const eftposGroup = new THREE.Group(); eftposGroup.position.set(-9, -4.65, -4); eftposGroup.rotation.y = Math.PI / 4; scene.add(eftposGroup);
  const eftposBase = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 0.5, 24), bodyMat(COLORS.grey));
  eftposBase.position.y = 0.25; eftposBase.castShadow = true; eftposBase.receiveShadow = true; addOutline(eftposBase, 0.05); eftposGroup.add(eftposBase);
  const eftposPillar = ribbedTube(3.4, 0.4, 4, COLORS.grey, COLORS.greyLt); eftposPillar.position.y = 2.2; eftposGroup.add(eftposPillar);
  const eftposConsole = new THREE.Group(); eftposConsole.position.set(0, 4.2, 0); eftposConsole.rotation.x = -Math.PI / 5; eftposGroup.add(eftposConsole);
  const eftposShell = new THREE.Mesh(roundedBoxGeometry(3.2, 2.8, 1.3, 0.25), matOrangeDk); eftposShell.castShadow = true; eftposShell.receiveShadow = true; addOutline(eftposShell, 0.06); eftposConsole.add(eftposShell);
  const keypadShelf = new THREE.Mesh(roundedBoxGeometry(2.6, 0.9, 0.6, 0.1), matOrange);
  keypadShelf.position.set(0, -0.8, 0.6); keypadShelf.rotation.x = Math.PI / 4; addOutline(keypadShelf, 0.04); eftposConsole.add(keypadShelf);
  const tapPad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16), new THREE.MeshBasicMaterial({ color: 0x00C853 }));
  tapPad.position.set(0.7, -0.75, 0.88); tapPad.rotation.x = Math.PI / 2 + Math.PI / 4; addOutline(tapPad, 0.02); eftposConsole.add(tapPad);

  const eftposCanvas = document.createElement('canvas'); eftposCanvas.width = 512; eftposCanvas.height = 384;
  const eftposCtx = eftposCanvas.getContext('2d'); const eftposTex = new THREE.CanvasTexture(eftposCanvas); eftposTex.encoding = THREE.sRGBEncoding;
  const eftposScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshStandardMaterial({ map: eftposTex, roughness: 0.2, metalness: 0.2, emissive: 0x001100, emissiveIntensity: 0.4 }));
  eftposScreen.position.set(0, 0.3, 0.67); eftposConsole.add(eftposScreen);
  
  const bankBeacon = new THREE.Group(); bankBeacon.position.set(0, 8.8, 0); eftposGroup.add(bankBeacon);
  const sShape = new THREE.Shape();
  sShape.moveTo(0.5, 0.55); sShape.lineTo(0.22, 0.55); sShape.bezierCurveTo(0.22, 0.8, -0.38, 0.8, -0.38, 0.45);
  sShape.bezierCurveTo(-0.38, 0.15, 0.42, 0.25, 0.42, -0.2); sShape.bezierCurveTo(0.42, -0.85, -0.55, -0.85, -0.55, -0.4);
  sShape.lineTo(-0.27, -0.4); sShape.bezierCurveTo(-0.27, -0.62, 0.15, -0.62, 0.15, -0.2);
  sShape.bezierCurveTo(0.15, 0.1, -0.65, -0.05, -0.65, 0.45); sShape.bezierCurveTo(-0.65, 1.05, 0.5, 1.05, 0.5, 0.55); sShape.closePath();
  const sGeo = new THREE.ExtrudeGeometry(sShape, symbolExtrudeSettings); sGeo.translate(0, 0, -0.11);
  const sMesh = new THREE.Mesh(sGeo, hologramMat); addOutline(sMesh, 0.04); bankBeacon.add(sMesh);
  const barGeo = new THREE.BoxGeometry(0.16, 2.1, 0.2);
  const barMesh = new THREE.Mesh(barGeo, hologramMat); barMesh.position.set(-0.06, 0.08, 0); addOutline(barMesh, 0.03); bankBeacon.add(barMesh);
  const bankRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 12, 32), hologramMat);
  bankRing.rotation.x = Math.PI / 2; bankRing.position.y = -1.15; addOutline(bankRing, 0.03); bankBeacon.add(bankRing);

  // RADAR SCAN RING FOR 30-SECOND STEALTH MODE
  const scanRing = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.1, 16, 64), new THREE.MeshBasicMaterial({ color: 0x2EE2FA, transparent: true, opacity: 0.9 }));
  scanRing.rotation.x = Math.PI / 2; scanRing.visible = false; robot.add(scanRing);

  // ---------- 3D LANDMARK 3: SNACK DISPENSER (-63, -2.5) ----------
  const snackGroup = new THREE.Group();
  snackGroup.position.set(-63, -4.65, -2.5);
  snackGroup.rotation.y = Math.PI / 3;
  scene.add(snackGroup);

  const snackBase = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.6, 1.0, 20), bodyMat(COLORS.grey));
  snackBase.position.y = 0.5; snackBase.castShadow = true; snackBase.receiveShadow = true; addOutline(snackBase, 0.05); snackGroup.add(snackBase);

  const machineBody = new THREE.Mesh(roundedBoxGeometry(5.6, 11.0, 4.0, 0.6), bodyMat(0xFF007F));
  machineBody.position.y = 6.4; machineBody.castShadow = true; machineBody.receiveShadow = true; addOutline(machineBody, 0.06); snackGroup.add(machineBody);

  const cavityBack = new THREE.Mesh(roundedBoxGeometry(4.2, 5.8, 0.2, 0.1), bodyMat(0x0B0C10));
  cavityBack.position.set(0, 7.6, 1.95); snackGroup.add(cavityBack);

  const shelfMat = bodyMat(COLORS.greyLt);
  const shelfHeights = [9.2, 8.0, 6.8, 5.6];
  shelfHeights.forEach(sy => {
    const shelf = new THREE.Mesh(roundedBoxGeometry(3.8, 0.12, 0.6, 0.03), shelfMat);
    shelf.position.set(0, sy, 2.2); addOutline(shelf, 0.02); snackGroup.add(shelf);
  });

  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.7, 16), bodyMat(0x2EE2FA));
    can.position.set(x, 9.6, 2.25); addOutline(can, 0.02); snackGroup.add(can);
  }
  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const bar = new THREE.Mesh(roundedBoxGeometry(0.6, 0.25, 0.4, 0.06), bodyMat(0x00C853));
    bar.position.set(x, 8.3, 2.25); addOutline(bar, 0.02); snackGroup.add(bar);
  }
  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const chips = new THREE.Mesh(roundedBoxGeometry(0.55, 0.65, 0.25, 0.06), bodyMat(0xFFB800));
    chips.position.set(x, 7.25, 2.25); addOutline(chips, 0.02); snackGroup.add(chips);
  }
  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 6), bodyMat(0xFF007F));
    nut.rotation.y = Math.PI / 6; nut.position.set(x, 5.95, 2.25); addOutline(nut, 0.02); snackGroup.add(nut);
  }

  function createGlassTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 384);
    const grad = ctx.createLinearGradient(0, 0, 256, 384);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.4)'); grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)'); grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 384);
    ctx.strokeStyle = 'rgba(11, 12, 16, 0.85)'; ctx.lineWidth = 14; ctx.strokeRect(0, 0, 256, 384);
    return new THREE.CanvasTexture(c);
  }
  const glassTex = createGlassTexture();
  const glassMat = new THREE.MeshPhysicalMaterial({
    map: glassTex, color: 0xffffff, roughness: 0.1, metalness: 0.1,
    transparent: true, opacity: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.05
  });
  const glassWindow = new THREE.Mesh(roundedBoxGeometry(4.2, 5.8, 0.15, 0.1), glassMat);
  glassWindow.position.set(0, 7.6, 2.55); addOutline(glassWindow, 0.03); snackGroup.add(glassWindow);

  const chuteMesh = new THREE.Mesh(roundedBoxGeometry(3.2, 1.4, 1.0, 0.16), bodyMat(COLORS.greyLt));
  chuteMesh.position.set(0, 2.6, 2.1); addOutline(chuteMesh, 0.04); snackGroup.add(chuteMesh);

  const snackBeacon = new THREE.Group();
  snackBeacon.position.set(0, 14.5, 0);
  snackBeacon.scale.set(1.5, 1.5, 1.5);
  snackGroup.add(snackBeacon);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 0.65 : 0.3;
    if (i === 0) starShape.moveTo(Math.cos(angle)*r, Math.sin(angle)*r);
    else starShape.lineTo(Math.cos(angle)*r, Math.sin(angle)*r);
  }
  starShape.closePath();
  const starGeo = new THREE.ExtrudeGeometry(starShape, symbolExtrudeSettings);
  starGeo.translate(0, 0, -0.11);
  const starMesh = new THREE.Mesh(starGeo, new THREE.MeshPhysicalMaterial({ color: 0xFF007F, emissive: 0x880044, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }));
  addOutline(starMesh, 0.04); snackBeacon.add(starMesh);
  const snackRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 12, 32), starMesh.material);
  snackRing.rotation.x = Math.PI / 2; snackRing.position.y = -1.1; addOutline(snackRing, 0.03); snackBeacon.add(snackRing);

  // ---------- 3D LANDMARK 4: GREEN NATURE DISPENSER (63, -2.5) ----------
  const natureGroup = new THREE.Group();
  natureGroup.position.set(63, -4.65, -2.5);
  natureGroup.rotation.y = -Math.PI / 3;
  scene.add(natureGroup);

  const natureBase = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.6, 1.0, 20), bodyMat(COLORS.grey));
  natureBase.position.y = 0.5; natureBase.castShadow = true; natureBase.receiveShadow = true; addOutline(natureBase, 0.05); natureGroup.add(natureBase);

  const natureBody = new THREE.Mesh(roundedBoxGeometry(5.6, 11.0, 4.0, 0.6), bodyMat(0x00C853));
  natureBody.position.y = 6.4; natureBody.castShadow = true; natureBody.receiveShadow = true; addOutline(natureBody, 0.06); natureGroup.add(natureBody);

  const natureCavity = new THREE.Mesh(roundedBoxGeometry(4.2, 5.8, 0.2, 0.1), bodyMat(0x0B0C10));
  natureCavity.position.set(0, 7.6, 1.95); natureGroup.add(natureCavity);

  shelfHeights.forEach(sy => {
    const shelf = new THREE.Mesh(roundedBoxGeometry(3.8, 0.12, 0.6, 0.03), shelfMat);
    shelf.position.set(0, sy, 2.2); addOutline(shelf, 0.02); natureGroup.add(shelf);
  });

  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const bag = new THREE.Mesh(roundedBoxGeometry(0.5, 0.65, 0.35, 0.06), bodyMat(0x00C853));
    bag.position.set(x, 9.6, 2.25); addOutline(bag, 0.02); natureGroup.add(bag);
  }
  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 12), bodyMat(0xFF007F));
    pot.position.set(x, 8.35, 2.25); addOutline(pot, 0.02); natureGroup.add(pot);
  }
  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const sapling = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.65, 8), bodyMat(0x2E7D32));
    sapling.position.set(x, 7.3, 2.25); addOutline(sapling, 0.02); natureGroup.add(sapling);
  }
  for (let x = -1.2; x <= 1.2; x += 0.8) {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.45, 12), bodyMat(0x00B0FF));
    bucket.position.set(x, 6.0, 2.25); addOutline(bucket, 0.02); natureGroup.add(bucket);
  }

  const natureGlass = new THREE.Mesh(roundedBoxGeometry(4.2, 5.8, 0.15, 0.1), glassMat);
  natureGlass.position.set(0, 7.6, 2.55); addOutline(natureGlass, 0.03); natureGroup.add(natureGlass);

  const natureChute = new THREE.Mesh(roundedBoxGeometry(3.2, 1.4, 1.0, 0.16), bodyMat(COLORS.greyLt));
  natureChute.position.set(0, 2.6, 2.1); addOutline(natureChute, 0.04); natureGroup.add(natureChute);

  const natureBeacon = new THREE.Group();
  natureBeacon.position.set(0, 14.5, 0);
  natureBeacon.scale.set(1.5, 1.5, 1.5);
  natureGroup.add(natureBeacon);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -0.6);
  leafShape.bezierCurveTo(0.8, -0.2, 0.8, 0.8, 0, 0.8);
  leafShape.bezierCurveTo(-0.8, 0.8, -0.8, -0.2, 0, -0.6);
  const leafGeo = new THREE.ExtrudeGeometry(leafShape, symbolExtrudeSettings);
  leafGeo.translate(0, 0, -0.11);
  const leafMesh = new THREE.Mesh(leafGeo, new THREE.MeshPhysicalMaterial({ color: 0x00C853, emissive: 0x005522, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }));
  addOutline(leafMesh, 0.04); natureBeacon.add(leafMesh);
  const natureRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 12, 32), leafMesh.material);
  natureRing.rotation.x = Math.PI / 2; natureRing.position.y = -1.1; addOutline(natureRing, 0.03); natureBeacon.add(natureRing);

  // ---------- 3D LANDMARK 5: BLUE BUILD DISPENSER (0, -56.25) ----------
  // Positioned so its distance from the Kiosk (9,-3) matches the Nature Dispenser's
  // distance from the Kiosk (~54 units), keeping the four landmarks in a balanced arc.
  const buildGroup = new THREE.Group();
  buildGroup.position.set(0, -4.65, -56.25);
  buildGroup.rotation.y = 0;
  scene.add(buildGroup);

  const buildBase = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.6, 1.0, 20), bodyMat(COLORS.grey));
  buildBase.position.y = 0.5; buildBase.castShadow = true; buildBase.receiveShadow = true; addOutline(buildBase, 0.05); buildGroup.add(buildBase);

  const buildBody = new THREE.Mesh(roundedBoxGeometry(5.6, 11.0, 4.0, 0.6), bodyMat(0x1E88E5));
  buildBody.position.y = 6.4; buildBody.castShadow = true; buildBody.receiveShadow = true; addOutline(buildBody, 0.06); buildGroup.add(buildBody);

  const buildCavity = new THREE.Mesh(roundedBoxGeometry(4.2, 5.8, 0.2, 0.1), bodyMat(0x0B0C10));
  buildCavity.position.set(0, 7.6, 1.95); buildGroup.add(buildCavity);

  shelfHeights.forEach(sy => {
    const shelf = new THREE.Mesh(roundedBoxGeometry(3.8, 0.12, 0.6, 0.03), shelfMat);
    shelf.position.set(0, sy, 2.2); addOutline(shelf, 0.02); buildGroup.add(shelf);
  });

  // Small cube samples of each material sitting on the shelves, in the same order as BLOCK_TYPE_ORDER
  shelfHeights.forEach((sy, shelfIdx) => {
    const blockType = BLOCK_TYPE_ORDER[shelfIdx % BLOCK_TYPE_ORDER.length];
    for (let x = -1.2; x <= 1.2; x += 0.8) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), createBlockMaterial(blockType));
      cube.position.set(x, sy + 0.35, 2.25); addOutline(cube, 0.02); buildGroup.add(cube);
    }
  });

  const buildGlass = new THREE.Mesh(roundedBoxGeometry(4.2, 5.8, 0.15, 0.1), glassMat);
  buildGlass.position.set(0, 7.6, 2.55); addOutline(buildGlass, 0.03); buildGroup.add(buildGlass);

  const buildChute = new THREE.Mesh(roundedBoxGeometry(3.2, 1.4, 1.0, 0.16), bodyMat(COLORS.greyLt));
  buildChute.position.set(0, 2.6, 2.1); addOutline(buildChute, 0.04); buildGroup.add(buildChute);

  const buildBeacon = new THREE.Group();
  buildBeacon.position.set(0, 14.5, 0);
  buildBeacon.scale.set(1.5, 1.5, 1.5);
  buildGroup.add(buildBeacon);
  const cubeIconMat = new THREE.MeshPhysicalMaterial({ color: 0x2EE2FA, emissive: 0x0055AA, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 });
  const cubeIconGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
  const cubeIconMesh = new THREE.Mesh(cubeIconGeo, cubeIconMat);
  cubeIconMesh.rotation.set(Math.PI / 5, Math.PI / 4, 0);
  addOutline(cubeIconMesh, 0.04); buildBeacon.add(cubeIconMesh);
  const buildRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 12, 32), cubeIconMat);
  buildRing.rotation.x = Math.PI / 2; buildRing.position.y = -1.1; addOutline(buildRing, 0.03); buildBeacon.add(buildRing);

  // ---------- 3D LANDMARK 6: PET ADOPTION BOX (9, 50.25) ----------
  // Sits directly south of ("below") the Kiosk (9,-3) at the same ~54-unit
  // radius as the Build Dispenser (which sits directly north of the Kiosk) -
  // together with the Snack (west) and Nature (east) Dispensers, this completes
  // a balanced 4-point compass rose of landmarks around the Kiosk/Bank hub.
  const ADOPT_X = 9, ADOPT_Z = 50.25;
  const adoptGroup = new THREE.Group();
  adoptGroup.position.set(ADOPT_X, -4.65, ADOPT_Z);
  adoptGroup.rotation.y = Math.PI; // front (sticker + opening) faces back north, toward the Kiosk/spawn
  scene.add(adoptGroup);

  const adoptBase = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, 0.6, 20), bodyMat(COLORS.grey));
  adoptBase.position.y = 0.3; adoptBase.castShadow = true; adoptBase.receiveShadow = true; addOutline(adoptBase, 0.05); adoptGroup.add(adoptBase);

  const CARDBOARD_COLOR = 0xC68642, CARDBOARD_DARK = 0x9C6B36;
  const ADOPT_BOX_HALF = 1.6, ADOPT_BOX_TOP_Y = 3.0;

  const adoptBoxBody = new THREE.Mesh(roundedBoxGeometry(ADOPT_BOX_HALF * 2, 2.4, ADOPT_BOX_HALF * 2, 0.12), bodyMat(CARDBOARD_COLOR));
  adoptBoxBody.position.y = 1.8; adoptBoxBody.castShadow = true; adoptBoxBody.receiveShadow = true; addOutline(adoptBoxBody, 0.06); adoptGroup.add(adoptBoxBody);

  // Dark "open cavity" strip, sitting just below the flaps' resting height so it's
  // hidden while closed and only reads as an opening once the flaps swing outward.
  const adoptCavity = new THREE.Mesh(new THREE.PlaneGeometry(ADOPT_BOX_HALF * 1.7, ADOPT_BOX_HALF * 1.7), bodyMat(0x0B0C10));
  adoptCavity.rotation.x = -Math.PI / 2; adoptCavity.position.y = ADOPT_BOX_TOP_Y - 0.03; adoptGroup.add(adoptCavity);

  // Packing-tape cross across the top
  const tapeMatAdopt = bodyMat(CARDBOARD_DARK);
  const tapeStripA = new THREE.Mesh(new THREE.BoxGeometry(ADOPT_BOX_HALF * 2.02, 0.05, 0.5), tapeMatAdopt);
  tapeStripA.position.y = ADOPT_BOX_TOP_Y + 0.03; adoptGroup.add(tapeStripA);
  const tapeStripB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, ADOPT_BOX_HALF * 2.02), tapeMatAdopt);
  tapeStripB.position.y = ADOPT_BOX_TOP_Y + 0.03; adoptGroup.add(tapeStripB);

  // Round animal sticker on the front face
  function createAdoptStickerTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#FFF6E9'; ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = '#0B0C10'; ctx.stroke();
    // paw print: one big pad + four toes
    ctx.fillStyle = '#FF5E13';
    ctx.beginPath(); ctx.ellipse(128, 155, 46, 38, 0, 0, Math.PI * 2); ctx.fill();
    const toe = (tx, ty, rx, ry, rot) => { ctx.beginPath(); ctx.ellipse(tx, ty, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
    toe(70, 95, 22, 28, -0.35); toe(112, 68, 24, 30, -0.08);
    toe(154, 68, 24, 30, 0.08); toe(196, 95, 22, 28, 0.35);
    ctx.fillStyle = '#0B0C10'; ctx.font = '900 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('ADOPT ME', 128, 225);
    return new THREE.CanvasTexture(c);
  }
  const adoptStickerTex = createAdoptStickerTexture();
  const adoptSticker = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 32),
    new THREE.MeshStandardMaterial({ map: adoptStickerTex, roughness: 0.6, metalness: 0.0 })
  );
  adoptSticker.position.set(0, 1.85, ADOPT_BOX_HALF + 0.02);
  addOutline(adoptSticker, 0.03);
  adoptGroup.add(adoptSticker);

  // ---- Hinged flaps: front/back/left/right, closed flat by default, swing open
  // outward when a purchase is made (driven by adoptLidOpenAmount, see animate()).
  const ADOPT_FLAP_LEN = 1.72, ADOPT_FLAP_WID = 1.5, ADOPT_FLAP_MAX_ANGLE = 2.05;
  const flapGeo = roundedBoxGeometry(ADOPT_FLAP_WID, 0.06, ADOPT_FLAP_LEN, 0.05);
  function makeAdoptFlap(hingeX, hingeZ, meshOffsetX, meshOffsetZ, axis, sign, rotateMesh) {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, ADOPT_BOX_TOP_Y, hingeZ);
    adoptGroup.add(pivot);
    const mesh = new THREE.Mesh(flapGeo, bodyMat(CARDBOARD_COLOR));
    if (rotateMesh) mesh.rotation.y = Math.PI / 2; // swap the flap's long axis onto X for the left/right flaps
    mesh.position.set(meshOffsetX, 0, meshOffsetZ);
    mesh.castShadow = true; addOutline(mesh, 0.04);
    pivot.add(mesh);
    return { pivot, axis, sign };
  }
  const adoptFlaps = [
    makeAdoptFlap(0, ADOPT_BOX_HALF, 0, -ADOPT_FLAP_LEN / 2, 'x', -1, false),  // front flap, hinges toward box center
    makeAdoptFlap(0, -ADOPT_BOX_HALF, 0, ADOPT_FLAP_LEN / 2, 'x', 1, false),   // back flap
    makeAdoptFlap(-ADOPT_BOX_HALF, 0, ADOPT_FLAP_LEN / 2, 0, 'z', -1, true),   // left flap
    makeAdoptFlap(ADOPT_BOX_HALF, 0, -ADOPT_FLAP_LEN / 2, 0, 'z', 1, true),    // right flap
  ];
  let adoptLidOpenAmount = 0;
  function applyAdoptLidOpenAmount(amount) {
    adoptLidOpenAmount = amount;
    adoptFlaps.forEach(f => {
      const angle = ADOPT_FLAP_MAX_ANGLE * amount * f.sign;
      if (f.axis === 'x') f.pivot.rotation.x = angle; else f.pivot.rotation.z = angle;
    });
  }

  // Paw-print beacon on top, matching the style of the other three dispensers
  const adoptBeacon = new THREE.Group();
  adoptBeacon.position.set(0, 9.5, 0);
  adoptBeacon.scale.set(1.5, 1.5, 1.5);
  adoptGroup.add(adoptBeacon);
  const pawShape = new THREE.Shape();
  pawShape.absellipse(0, -0.35, 0.42, 0.34, 0, Math.PI * 2, false, 0);
  const pawToeShape1 = new THREE.Shape(); pawToeShape1.absellipse(-0.42, 0.28, 0.2, 0.25, 0, Math.PI * 2, false, 0);
  const pawGeo = new THREE.ExtrudeGeometry(pawShape, symbolExtrudeSettings);
  pawGeo.translate(0, 0, -0.11);
  const pawMat = new THREE.MeshPhysicalMaterial({ color: 0xFF4D8D, emissive: 0x99164F, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 });
  const pawMesh = new THREE.Mesh(pawGeo, pawMat);
  addOutline(pawMesh, 0.04); adoptBeacon.add(pawMesh);
  [[-0.42, 0.32], [-0.15, 0.46], [0.15, 0.46], [0.42, 0.32]].forEach(([tx, ty]) => {
    const toeShape = new THREE.Shape(); toeShape.absellipse(tx, ty, 0.16, 0.2, 0, Math.PI * 2, false, 0);
    const toeGeo = new THREE.ExtrudeGeometry(toeShape, symbolExtrudeSettings);
    toeGeo.translate(0, 0, -0.11);
    const toeMesh = new THREE.Mesh(toeGeo, pawMat);
    addOutline(toeMesh, 0.03); adoptBeacon.add(toeMesh);
  });
  const adoptRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 12, 32), pawMat);
  adoptRing.rotation.x = Math.PI / 2; adoptRing.position.y = -1.1; addOutline(adoptRing, 0.03); adoptBeacon.add(adoptRing);

  // ---- Sparkle burst effect (spawned when a purchase opens the box) ----
  const adoptSparkles = [];
  function spawnAdoptSparkles(originWorld, count = 32) {
    for (let i = 0; i < count; i++) {
      const tint = new THREE.Color().setHSL(Math.random(), 0.75, 0.72);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: tint }));
      sprite.position.copy(originWorld);
      const scale = 0.35 + Math.random() * 0.35;
      sprite.scale.set(scale, scale, 1);
      scene.add(sprite);
      adoptSparkles.push({
        sprite, life: 1.0, decay: 0.012 + Math.random() * 0.014,
        vx: (Math.random() - 0.5) * 0.09, vy: 0.08 + Math.random() * 0.09, vz: (Math.random() - 0.5) * 0.09
      });
    }
  }

  // ---- Pet reveal + walk-to-AURA animation state machine ----
  // (petAdoptionAnim itself is declared earlier, alongside the Pet Menu code,
  // so applyPetVisibility can reference it safely.)
  const ADOPT_ANIM_OPEN_DUR = 500, ADOPT_ANIM_HOLD_DUR = 1300, ADOPT_ANIM_CLOSE_DUR = 500;
  const ADOPT_ANIM_REVEAL_START = 250, ADOPT_ANIM_REVEAL_DUR = 500;
  const ADOPT_ANIM_WALK_START = 800, ADOPT_ANIM_WALK_DUR = 1500;
  const ADOPT_ANIM_TOTAL = ADOPT_ANIM_WALK_START + ADOPT_ANIM_WALK_DUR + 200;

  function triggerPetAdoption() {
    if (petAdoptionAnim) return; // a purchase is already mid-animation
    const unowned = ALL_PET_IDS.filter(id => !petOwned[id]);
    if (unowned.length === 0) {
      logTransaction('ALL PETS ALREADY ADOPTED!', 'credit');
      return;
    }
    if (bankBalance < 5) {
      logTransaction('ERR: INSUFFICIENT FUNDS', 'debit');
      const btn = document.getElementById('btnAdoptPet');
      btn.style.background = '#FF5A5F'; btn.style.color = '#fff';
      setTimeout(() => { btn.style.background = ''; btn.style.color = ''; }, 600);
      return;
    }
    bankBalance -= 5; updateBankUI();
    logTransaction('PET ADOPTION: -$5.00', 'debit');

    const id = unowned[Math.floor(Math.random() * unowned.length)];
    const pet = petTypes[id];
    const spawnWorld = new THREE.Vector3(ADOPT_X, -4.65 + ADOPT_BOX_TOP_Y + 0.25, ADOPT_Z);

    // Remember this pet's normal resting ground height (set once at creation
    // time and never touched by its own update function) so the walk-in
    // animation can ease back down to the correct height for its species.
    const restY = pet.group.position.y;

    pet.group.visible = true;
    pet.group.scale.set(0.001, 0.001, 0.001);
    pet.group.position.copy(spawnWorld);

    petAdoptionAnim = { id, startTime: performance.now(), spawnWorld, restY };

    spawnAdoptSparkles(new THREE.Vector3(ADOPT_X, -4.65 + ADOPT_BOX_TOP_Y + 0.4, ADOPT_Z));
  }
  document.getElementById('btnAdoptPet').addEventListener('click', triggerPetAdoption);

  let isQuizActive = false, currentQIndex = 0, quizScore = 0;
  let activeQuizQuestions = [];
  let activeQuizTitle = "";

  function startQuiz(questions, title) {
    isQuizActive = true; currentQIndex = 0; quizScore = 0;
    activeQuizQuestions = questions;
    activeQuizTitle = title;
    document.getElementById('telemetryContainer').style.display = 'none';
    document.getElementById('quizContainer').style.display = 'block';
    renderQuestion();
  }

  function renderQuestion() {
    if (currentQIndex >= activeQuizQuestions.length) { endQuiz(true); return; }
    const qData = activeQuizQuestions[currentQIndex];
    document.getElementById('quizProgressText').textContent = `${activeQuizTitle} · Question ${currentQIndex + 1} of ${activeQuizQuestions.length}`;
    document.getElementById('quizQuestionText').textContent = qData.q;
    document.getElementById('quizScoreText').textContent = `Score: ${quizScore}/${currentQIndex}`;
    
    const grid = document.getElementById('quizOptionsGrid'); grid.innerHTML = '';

    // Shuffle the on-screen order of the options (Fisher-Yates) so the correct
    // answer's position varies each time - qData.o/qData.a themselves are left
    // untouched, we just decide a random display order for this render.
    const order = qData.o.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach(origIdx => {
      const btn = document.createElement('button'); btn.textContent = qData.o[origIdx];
      btn.dataset.origIdx = origIdx;
      btn.addEventListener('click', () => handleAnswer(origIdx, btn, qData.a));
      grid.appendChild(btn);
    });
  }

  function handleAnswer(selectedIndex, buttonEl, correctIndex) {
    const allBtns = document.getElementById('quizOptionsGrid').querySelectorAll('button');
    allBtns.forEach(btn => { btn.classList.add('disabled'); btn.style.pointerEvents = 'none'; });
    
    if (selectedIndex === correctIndex) {
      buttonEl.classList.add('correct'); 
      quizScore++;
      bankBalance += 1.00;
      updateBankUI();
      logTransaction('QUIZ REWARD: +$1.00', 'credit');
    } else {
      buttonEl.classList.add('wrong');
      // Options are shuffled on-screen, so find the correct button by its
      // original option index rather than assuming a fixed grid position.
      const correctBtn = Array.from(allBtns).find(btn => parseInt(btn.dataset.origIdx, 10) === correctIndex);
      if (correctBtn) correctBtn.classList.add('correct');
    }
    document.getElementById('quizScoreText').textContent = `Score: ${quizScore}/${currentQIndex + 1}`;
    setTimeout(() => { currentQIndex++; renderQuestion(); }, 1200);
  }

  function endQuiz(completed = false) {
    if (completed) {
      document.getElementById('quizProgressText').textContent = "🎉 Quiz Completed!";
      document.getElementById('quizQuestionText').textContent = `Final Score: ${quizScore} / ${activeQuizQuestions.length} Correct!`;
      document.getElementById('quizOptionsGrid').innerHTML = '<button id="btnQuizPlayAgain" style="background:#2EE2FA; text-align:center;">🔄 Play Again</button>';
      document.getElementById('quizScoreText').textContent = `Accuracy: ${Math.round((quizScore/activeQuizQuestions.length)*100)}%`;
      document.getElementById('btnQuizPlayAgain').addEventListener('click', () => startQuiz(activeQuizQuestions, activeQuizTitle));
    } else {
      isQuizActive = false;
      document.getElementById('telemetryContainer').style.display = 'block';
      document.getElementById('quizContainer').style.display = 'none';
    }
  }

  document.getElementById('btnQuizLandmark').addEventListener('click', () => startQuiz(LANDMARK_QUESTIONS, "🌍 Landmark"));
  document.getElementById('btnQuizWords').addEventListener('click', () => startQuiz(WORDS_QUESTIONS, "📚 Great Words"));
  document.getElementById('btnQuizPeople').addEventListener('click', () => startQuiz(FAMOUS_PEOPLE_QUESTIONS, "🌟 Famous People"));
  document.getElementById('btnQuizArt').addEventListener('click', () => startQuiz(ART_QUESTIONS, "🎨 Famous Art"));
  document.getElementById('btnCloseQuiz').addEventListener('click', () => endQuiz(false));

  // ---------- BANK EFTPOS & DISPENSER PURCHASING ----------
  let bankBalance = 0.00;
  const balanceEl = document.getElementById('bankBalanceText');
  const snackBalanceEl = document.getElementById('snackBalanceText');
  const natureBalanceEl = document.getElementById('natureBalanceText');
  const buildBalanceEl = document.getElementById('buildBalanceText');
  const receiptLogEl = document.getElementById('receiptLog');

  function logTransaction(text, type) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span>${text}</span><span>${timeStr}</span>`;
    receiptLogEl.prepend(entry);
    if (receiptLogEl.children.length > 6) receiptLogEl.removeChild(receiptLogEl.lastChild);
  }

  function updateBankUI() {
    const formatted = `$${bankBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    balanceEl.textContent = formatted;
    snackBalanceEl.textContent = formatted;
    natureBalanceEl.textContent = formatted;
    buildBalanceEl.textContent = formatted;
    const adoptionBalanceText = document.getElementById('adoptionBalanceText');
    if (adoptionBalanceText) adoptionBalanceText.textContent = formatted;
  }

  document.getElementById('btnBalance').addEventListener('click', () => {
    const formatted = `$${bankBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    logTransaction(`BALANCE INQUIRY: ${formatted}`, 'credit');
  });

  document.getElementById('btnTransfer').addEventListener('click', () => {
    if (bankBalance >= 1) { 
      bankBalance -= 1; 
      updateBankUI(); 
      logTransaction('TRANSFER TO VAULT -$1.00', 'debit'); 
    } else { 
      logTransaction('ERR: INSUFFICIENT FUNDS', 'debit'); 
    }
  });

  const inventory = {};
  const activeSnacks = [];

  let isDancing = false, danceEndTime = 0, danceStyle = 0;
  let isTurbo = false, turboEndTime = 0;
  let isScanning = false, scanEndTime = 0, robotOpacity = 1.0;

  // ---------- NATURE GRID & PLACEMENT MODE SYSTEM ----------
  const worldGrid = {}; 
  let placementMode = { active: false, item: null, gx: 0, gz: 0 };

  // ---------- BUILD MODE (mouse-driven stacking placement) STATE ----------
  const buildGrid = {}; // key "gx,gz" -> array of { type, mesh } bottom-to-top
  const buildBlockMeshes = []; // flat list of every placed block mesh, used for raycasting
  const buildMode = { active: false, selectedType: null, hoverGX: 0, hoverGZ: 0, hoverLevel: null };
  const buildRaycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2(0, 0);
  const MAX_STACK_HEIGHT = 8;
  window.addEventListener('mousemove', e => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  const gridOverlayGroup = new THREE.Group();
  gridOverlayGroup.position.y = -4.61;
  gridOverlayGroup.visible = false;
  scene.add(gridOverlayGroup);

  const gridLines = new THREE.GridHelper(120, 20, 0x000000, 0x000000);
  gridLines.material.opacity = 0.25; gridLines.material.transparent = true;
  gridOverlayGroup.add(gridLines);

  const cursorGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
  cursorGeo.rotateX(-Math.PI / 2);
  const cursorMat = new THREE.MeshBasicMaterial({ color: 0x00C853, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
  cursorMesh.position.y = 0.02;
  gridOverlayGroup.add(cursorMesh);

  // Ghost preview cube for Build Mode - follows the mouse, colored to match the selected material
  const buildPreviewMat = new THREE.MeshBasicMaterial({ color: 0x2EE2FA, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const buildPreviewMesh = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE * 0.96, GRID_SIZE * 0.96, GRID_SIZE * 0.96), buildPreviewMat);
  buildPreviewMesh.visible = false;
  scene.add(buildPreviewMesh);

  // Face highlight - a flat glowing patch laid right on top of whichever face the mouse
  // is currently over, so it's immediately obvious whether the next block will drop onto
  // the ground, stack on top of the hovered block, or attach beside it.
  const FACE_HIGHLIGHT_COLORS = { ground: 0x00C853, top: 0x2EE2FA, side: 0xFF9800 };
  const faceHighlightMat = new THREE.MeshBasicMaterial({ color: 0x2EE2FA, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
  const faceHighlightMesh = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE * 0.92, GRID_SIZE * 0.92), faceHighlightMat);
  faceHighlightMesh.visible = false;
  faceHighlightMesh.renderOrder = 10;
  scene.add(faceHighlightMesh);

  // Positions/orients the face highlight flush against whatever the raycast just hit.
  //  - 'ground': laid flat on the ground plane
  //  - 'top':    laid flat on top of the hovered block
  //  - 'side':   stood upright, flush against the hovered block's side, facing outward
  function positionFaceHighlight(target) {
    faceHighlightMat.color.setHex(FACE_HIGHLIGHT_COLORS[target.kind]);
    const EPS = 0.04; // tiny offset off the surface so it doesn't z-fight with the block/ground
    if (target.kind === 'side') {
      const { faceCell, faceNormal } = target;
      faceHighlightMesh.rotation.set(0, Math.atan2(faceNormal.x, faceNormal.z), 0);
      const cx = faceCell.gx * GRID_SIZE + faceNormal.x * (GRID_SIZE / 2 + EPS);
      const cz = faceCell.gz * GRID_SIZE + faceNormal.z * (GRID_SIZE / 2 + EPS);
      const cy = -4.65 + GRID_SIZE * (faceCell.level + 0.5);
      faceHighlightMesh.position.set(cx, cy, cz);
    } else if (target.kind === 'top') {
      faceHighlightMesh.rotation.set(-Math.PI / 2, 0, 0);
      const topY = -4.65 + GRID_SIZE * (target.faceCell.level + 1) + EPS;
      faceHighlightMesh.position.set(target.faceCell.gx * GRID_SIZE, topY, target.faceCell.gz * GRID_SIZE);
    } else { // ground
      faceHighlightMesh.rotation.set(-Math.PI / 2, 0, 0);
      faceHighlightMesh.position.set(target.gx * GRID_SIZE, -4.65 + EPS, target.gz * GRID_SIZE);
    }
  }

  function enterPlacementMode(itemName) {
    placementMode.active = true;
    placementMode.item = itemName;
    placementMode.gx = Math.round(robot.position.x / GRID_SIZE);
    placementMode.gz = Math.round(robot.position.z / GRID_SIZE);
    
    gridOverlayGroup.visible = true;
    updateCursorPosition();

    document.getElementById('inventoryPanel').classList.add('hidden');
    document.getElementById('petPanel').classList.add('hidden');
    const hint = document.getElementById('hint');
    hint.textContent = `[WASD] MOVE CURSOR · [E] PLACE ${itemName.toUpperCase()} · [ESC/Q] EXIT PLACEMENT`;
    hint.classList.add('placement-active');
  }

  function exitPlacementMode() {
    placementMode.active = false;
    gridOverlayGroup.visible = false;
    const hint = document.getElementById('hint');
    hint.textContent = "ARROW KEYS move · drag orbit · scroll zoom · press [Q] for inventory";
    hint.classList.remove('placement-active');
  }

  function updateCursorPosition() {
    const wx = placementMode.gx * GRID_SIZE;
    const wz = placementMode.gz * GRID_SIZE;
    cursorMesh.position.set(wx, 0.02, wz);
    gridLines.position.set(wx, 0, wz);
  }

  function animateScaleDownAndRemove(mesh, parentGroup) {
    let progress = 1.0;
    function shrink() {
      progress -= 0.08;
      if (progress <= 0) {
        parentGroup.remove(mesh);
      } else {
        mesh.scale.set(progress, progress, progress);
        requestAnimationFrame(shrink);
      }
    }
    shrink();
  }

  // --- ANIMATED WHITE RIPPLE WATER SHADER ---
  const waterShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x00B0FF) },
      uRippleColor: { value: new THREE.Color(0xffffff) }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uRippleColor;
      varying vec3 vWorldPos;
      void main() {
        float wave1 = sin(vWorldPos.x * 1.5 + uTime * 2.5) * cos(vWorldPos.z * 1.5 + uTime * 2.0);
        float wave2 = sin(vWorldPos.x * 2.8 - uTime * 3.5 + vWorldPos.z * 2.2);
        float wave3 = cos(vWorldPos.x * 4.0 + uTime * 4.0 - vWorldPos.z * 3.5);
        float combined = (wave1 + wave2 * 0.7 + wave3 * 0.4) / 2.1;
        
        float lines = smoothstep(0.55, 0.65, combined) - smoothstep(0.70, 0.80, combined);
        float foam = smoothstep(0.75, 0.90, combined);
        
        float rippleIntensity = max(lines, foam * 0.8);
        vec3 finalColor = mix(uColor, uRippleColor, rippleIntensity);
        
        gl_FragColor = vec4(finalColor, 0.82 + rippleIntensity * 0.18);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });

  // --- ORGANIC ROUNDED WATER BOUNDARY GENERATION ---
  function buildWaterGeometry(gx, gz) {
    const key = `${gx},${gz}`;
    const n = worldGrid[`${gx},${gz-1}`] && worldGrid[`${gx},${gz-1}`].waterMesh;
    const s = worldGrid[`${gx},${gz+1}`] && worldGrid[`${gx},${gz+1}`].waterMesh;
    const e = worldGrid[`${gx+1},${gz}`] && worldGrid[`${gx+1},${gz}`].waterMesh;
    const w = worldGrid[`${gx-1},${gz}`] && worldGrid[`${gx-1},${gz}`].waterMesh;

    const S = GRID_SIZE / 2; // 3.0
    const shape = new THREE.Shape();

    // Top edge (North boundary)
    if (n && w) shape.moveTo(-S, S);
    else if (n && !w) shape.moveTo(-S + 0.8, S);
    else if (!n && w) shape.moveTo(-S, S - 0.8);
    else shape.moveTo(-S + 1.2, S - 0.6);

    if (n) {
      shape.lineTo(e ? S : S - 0.8, S);
    } else {
      shape.bezierCurveTo(-S * 0.3, S - 0.2, S * 0.3, S - 0.8, e ? S : S - 1.2, S - 0.6);
    }

    // Right edge (East boundary)
    if (e) {
      shape.lineTo(S, s ? -S : -S + 0.8);
    } else {
      shape.bezierCurveTo(S - 0.2, S * 0.3, S - 0.8, -S * 0.3, S - 0.6, s ? -S : -S + 1.2);
    }

    // Bottom edge (South boundary)
    if (s) {
      shape.lineTo(w ? -S : -S + 0.8, -S);
    } else {
      shape.bezierCurveTo(S * 0.3, -S + 0.2, -S * 0.3, -S + 0.8, w ? -S : -S + 1.2, -S + 0.6);
    }

    // Left edge (West boundary)
    if (w) {
      shape.lineTo(-S, n ? S : S - 0.8);
    } else {
      shape.bezierCurveTo(-S + 0.2, -S * 0.3, -S + 0.8, S * 0.3, -S + 0.6, n ? S : S - 1.2);
    }

    const geo = new THREE.ShapeGeometry(shape, 12);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  function updateWaterMeshAt(gx, gz) {
    const key = `${gx},${gz}`;
    const tile = worldGrid[key];
    if (!tile || !tile.waterMesh) return;

    scene.remove(tile.waterMesh);
    if (tile.waterMesh.geometry) tile.waterMesh.geometry.dispose();

    const newGeo = buildWaterGeometry(gx, gz);
    const newMesh = new THREE.Mesh(newGeo, waterShaderMat);
    newMesh.position.set(gx * GRID_SIZE, -4.50, gz * GRID_SIZE);
    newMesh.receiveShadow = true;
    scene.add(newMesh);
    tile.waterMesh = newMesh;
  }

  // Creates/updates the actual meshes for a nature tile. Returns false if blocked by a
  // conflict (and logs the error), true otherwise. Pulled out of placeGridItem() so the
  // exact same logic can replay saved tiles when loading a saved game.
  function createTileVisual(itemType, gx, gz, flowerOverride = null) {
    const key = `${gx},${gz}`;
    if (!worldGrid[key]) worldGrid[key] = { base: null, object: null, baseMesh: null, objMesh: null, flowers: [], waterMesh: null };
    const tile = worldGrid[key];
    const wx = gx * GRID_SIZE;
    const wz = gz * GRID_SIZE;

    if (itemType.includes("Grass")) {
      if (tile.base === 'water' || tile.waterMesh) {
        logTransaction("ERR: CANNOT PLACE GRASS ON WATER", "debit");
        return false;
      }
      if (!tile.baseMesh) {
        if (gridRocks[key]) {
          gridRocks[key].forEach(rockMesh => animateScaleDownAndRemove(rockMesh, rocksGroup));
          delete gridRocks[key];
        }

        const grassGroup = new THREE.Group();
        const tileGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, 4, 4).rotateX(-Math.PI / 2);
        const tPos = tileGeo.attributes.position;
        for (let i = 0; i < tPos.count; i++) {
          tPos.setY(i, -4.63 + (Math.random() - 0.5) * 0.12);
        }
        tileGeo.computeVertexNormals();
        const grassBase = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color: 0x4CAF50, roughness: 0.9, flatShading: true }));
        grassBase.receiveShadow = true;
        grassGroup.add(grassBase);

        const bladeMat = new THREE.MeshStandardMaterial({ color: 0x388E3C, roughness: 0.8, flatShading: true });
        for (let c = 0; c < 12; c++) {
          const cluster = new THREE.Group();
          cluster.position.set((Math.random() - 0.5) * (GRID_SIZE - 1.2), -4.63, (Math.random() - 0.5) * (GRID_SIZE - 1.2));
          for (let b = 0; b < 3; b++) {
            const bladeGeo = new THREE.ConeGeometry(0.18, 0.7, 3);
            bladeGeo.translate(0, 0.35, 0);
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
            blade.castShadow = true;
            cluster.add(blade);
          }
          grassGroup.add(cluster);
        }

        grassGroup.position.set(wx, 0, wz);
        scene.add(grassGroup);
        tile.base = 'grass';
        tile.baseMesh = grassGroup;
        animateScaleUp(grassGroup);
      }
    } 
    else if (itemType.includes("Water")) {
      if (tile.object || tile.flowers.length > 0) {
        logTransaction("ERR: CLEAR TREES/FLOWERS BEFORE WATER", "debit");
        return false;
      }
      if (!tile.waterMesh) {
        if (gridRocks[key]) {
          gridRocks[key].forEach(rockMesh => animateScaleDownAndRemove(rockMesh, rocksGroup));
          delete gridRocks[key];
        }

        tile.base = 'water';
        tile.waterMesh = true; // Placeholder so neighbor updates recognize this tile immediately
        updateWaterMeshAt(gx, gz);

        // Update all 4 adjacent tiles so joined edges immediately snap square while outer edges stay rounded
        updateWaterMeshAt(gx + 1, gz);
        updateWaterMeshAt(gx - 1, gz);
        updateWaterMeshAt(gx, gz + 1);
        updateWaterMeshAt(gx, gz - 1);

        logTransaction("POND CREATED / CONNECTED", "credit");
      }
    } 
    else if (itemType.includes("Flower")) {
      if (tile.base === 'water' || tile.waterMesh || tile.object === 'tree') {
        logTransaction("ERR: FLOWER BLOCKED BY TREE/WATER", "debit");
        return false;
      }
      if (tile.flowers && tile.flowers.length >= 3) {
        logTransaction("ERR: MAX 3 FLOWERS PER TILE", "debit");
        return false;
      }

      let dx, dz, color;
      if (flowerOverride) {
        dx = flowerOverride.x; dz = flowerOverride.z; color = flowerOverride.color;
      } else {
        // Random placement within cell with minimum distance check against existing flowers
        dx = 0; dz = 0;
        let valid = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          dx = (Math.random() - 0.5) * (GRID_SIZE - 1.6);
          dz = (Math.random() - 0.5) * (GRID_SIZE - 1.6);
          valid = true;
          for (const existing of tile.flowers) {
            const dist = Math.hypot(dx - existing.x, dz - existing.z);
            if (dist < 1.1) { valid = false; break; }
          }
          if (valid) break;
        }
        const petalColors = [0xFF007F, 0xFFB800, 0x2EE2FA, 0x9c27b0, 0xFF3300, 0x00E5FF, 0xAA00FF];
        color = petalColors[Math.floor(Math.random() * petalColors.length)];
      }

      const flowerGroup = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), bodyMat(0x2E7D32));
      stem.position.y = 0.6; addOutline(stem, 0.02); flowerGroup.add(stem);

      const center = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), bodyMat(color));
      center.position.y = 1.3; addOutline(center, 0.03); flowerGroup.add(center);
      
      flowerGroup.position.set(wx + dx, -4.65, wz + dz);
      flowerGroup.scale.set(0.01, 0.01, 0.01);
      scene.add(flowerGroup);
      
      tile.flowers.push({ mesh: flowerGroup, x: dx, z: dz, color: color });
      tile.object = 'flower_cluster';
      animateScaleUp(flowerGroup);
    } 
    else if (itemType.includes("Tree")) {
      if (tile.base === 'water' || tile.waterMesh || (tile.flowers && tile.flowers.length > 0)) {
        logTransaction("ERR: TREE BLOCKED BY FLOWER/WATER", "debit");
        return false;
      }
      if (!tile.object) {
        const treeGroup = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 6.0, 10), bodyMat(0x795548));
        trunk.position.y = 3.0; trunk.castShadow = true; addOutline(trunk, 0.05); treeGroup.add(trunk);
        
        const leaves1 = new THREE.Mesh(new THREE.ConeGeometry(4.2, 5.5, 7), bodyMat(0x2E7D32));
        leaves1.position.y = 7.0; leaves1.castShadow = true; addOutline(leaves1, 0.06); treeGroup.add(leaves1);
        
        const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(3.3, 4.8, 7), bodyMat(0x388E3C));
        leaves2.position.y = 10.8; leaves2.castShadow = true; addOutline(leaves2, 0.05); treeGroup.add(leaves2);

        const leaves3 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.0, 7), bodyMat(0x43A047));
        leaves3.position.y = 14.2; leaves3.castShadow = true; addOutline(leaves3, 0.04); treeGroup.add(leaves3);

        const leaves4 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 7), bodyMat(0x4CAF50));
        leaves4.position.y = 17.2; leaves4.castShadow = true; addOutline(leaves4, 0.03); treeGroup.add(leaves4);

        treeGroup.position.set(wx, -4.65, wz);
        treeGroup.scale.set(0.01, 0.01, 0.01);
        scene.add(treeGroup);
        tile.object = 'tree';
        tile.objMesh = treeGroup;
        animateScaleUp(treeGroup);
      }
    }

    return true;
  }

  function placeGridItem() {
    if (!placementMode.active || !placementMode.item) return;
    const ok = createTileVisual(placementMode.item, placementMode.gx, placementMode.gz);
    if (!ok) return;

    inventory[placementMode.item]--;
    if (inventory[placementMode.item] <= 0) {
      delete inventory[placementMode.item];
      exitPlacementMode();
    }
    updateInventoryUI();
  }

  function animateScaleUp(meshGroup) {
    let progress = 0;
    function grow() {
      progress += 0.06;
      const s = Math.min(1.0, progress);
      const bounce = s < 1.0 ? s + Math.sin(progress * Math.PI) * 0.2 : 1.0;
      meshGroup.scale.set(bounce, bounce, bounce);
      if (progress < 1.0) requestAnimationFrame(grow);
    }
    grow();
  }

  // ---------- BUILD MODE: mouse-driven grid + stacking placement ----------
  // Creates one building-block cube mesh at grid cell (gx,gz), stack level `level`
  // (0 = sitting on the ground, 1 = on top of the block at level 0, etc). Used both
  // for live placement and for rebuilding a saved game, so the two always stay in sync.
  function createBuildBlockMesh(type, gx, gz, level, animateIn = true) {
    const key = `${gx},${gz}`;
    if (!buildGrid[key]) buildGrid[key] = [];

    if (level === 0 && gridRocks[key]) {
      gridRocks[key].forEach(rockMesh => animateScaleDownAndRemove(rockMesh, rocksGroup));
      delete gridRocks[key];
    }

    const mat = createBlockMaterial(type);
    const size = GRID_SIZE * 0.96;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    mesh.position.set(gx * GRID_SIZE, -4.65 + GRID_SIZE * (level + 0.5), gz * GRID_SIZE);
    mesh.castShadow = true; mesh.receiveShadow = true;
    addOutline(mesh, 0.04);
    mesh.userData.buildCell = { gx, gz, level };
    scene.add(mesh);

    if (animateIn) {
      mesh.scale.set(0.01, 0.01, 0.01);
      animateScaleUp(mesh);
    }

    buildGrid[key].push({ type, mesh });
    buildBlockMeshes.push(mesh);
    return mesh;
  }

  function firstAvailableBlockType() {
    return BLOCK_TYPE_ORDER.find(t => inventory[t] > 0) || null;
  }

  function updateBuildHint() {
    const hint = document.getElementById('hint');
    const qty = inventory[buildMode.selectedType] || 0;
    hint.textContent = `[CLICK] PLACE ${buildMode.selectedType.toUpperCase()} (x${qty}) · [◄/►] SWITCH MATERIAL · [ESC/Q] EXIT BUILD`;
    hint.classList.add('placement-active');
  }

  function enterBuildMode(startType) {
    if (placementMode.active) exitPlacementMode();
    buildMode.active = true;
    buildMode.selectedType = (inventory[startType] > 0) ? startType : firstAvailableBlockType();
    if (!buildMode.selectedType) { buildMode.active = false; return; }
    document.getElementById('inventoryPanel').classList.add('hidden');
    document.getElementById('petPanel').classList.add('hidden');
    updateBuildHint();
  }

  function exitBuildMode() {
    buildMode.active = false;
    buildMode.hoverLevel = null;
    buildPreviewMesh.visible = false;
    faceHighlightMesh.visible = false;
    const hint = document.getElementById('hint');
    hint.textContent = "ARROW KEYS move · drag orbit · scroll zoom · press [Q] for inventory";
    hint.classList.remove('placement-active');
  }

  function cycleBuildType(direction) {
    const available = BLOCK_TYPE_ORDER.filter(t => inventory[t] > 0);
    if (available.length === 0) { exitBuildMode(); return; }
    if (available.length === 1) { buildMode.selectedType = available[0]; updateBuildHint(); return; }

    let idx = BLOCK_TYPE_ORDER.indexOf(buildMode.selectedType);
    for (let step = 0; step < BLOCK_TYPE_ORDER.length; step++) {
      idx = (idx + direction + BLOCK_TYPE_ORDER.length) % BLOCK_TYPE_ORDER.length;
      const candidate = BLOCK_TYPE_ORDER[idx];
      if (inventory[candidate] > 0) { buildMode.selectedType = candidate; break; }
    }
    updateBuildHint();
  }

  // Casts a ray from the current mouse position into the scene, against the ground and
  // every placed block. Which face was hit decides what happens next:
  //  - the ground              -> place at level 0 in that cell
  //  - the TOP face of a block -> stack directly on top of it (same column, next level up)
  //  - a SIDE face of a block  -> place beside it in the neighboring cell, at that
  //                               neighbor's own current height (so a flush row/wall of
  //                               blocks always stays perfectly stackable/saveable)
  function raycastBuildTarget() {
    buildRaycaster.setFromCamera(mouseNDC, camera);
    const hits = buildRaycaster.intersectObjects([ground, ...buildBlockMeshes], false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    if (hit.object === ground) {
      return { gx: Math.round(hit.point.x / GRID_SIZE), gz: Math.round(hit.point.z / GRID_SIZE), level: 0, kind: 'ground' };
    }

    const cell = hit.object.userData.buildCell;
    // Faces of an axis-aligned cube always have a normal pointing straight along
    // one world axis - transform it out of local space, then round away any tiny
    // floating-point noise so it's cleanly -1/0/1.
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const nx = Math.round(n.x), ny = Math.round(n.y), nz = Math.round(n.z);

    if (ny > 0) {
      // Top face - stack straight up.
      return { gx: cell.gx, gz: cell.gz, level: cell.level + 1, kind: 'top', faceCell: cell };
    }
    if (ny < 0) {
      // Underside of a block - there's no support for placing below, so this
      // falls back to the same "stack on top" behavior as a top-face hit.
      return { gx: cell.gx, gz: cell.gz, level: cell.level + 1, kind: 'top', faceCell: cell };
    }
    // A side face - place in the neighboring column, at whatever height that
    // column has already reached (keeps every column's stack gap-free).
    const adjGX = cell.gx + nx, adjGZ = cell.gz + nz;
    const adjKey = `${adjGX},${adjGZ}`;
    const adjLevel = buildGrid[adjKey] ? buildGrid[adjKey].length : 0;
    return { gx: adjGX, gz: adjGZ, level: adjLevel, kind: 'side', faceCell: cell, faceNormal: { x: nx, z: nz } };
  }

  function updateBuildPreview() {
    const target = raycastBuildTarget();
    if (!target) { buildPreviewMesh.visible = false; faceHighlightMesh.visible = false; buildMode.hoverLevel = null; return; }
    buildMode.hoverGX = target.gx; buildMode.hoverGZ = target.gz; buildMode.hoverLevel = target.level;
    buildPreviewMesh.visible = true;
    buildPreviewMesh.position.set(target.gx * GRID_SIZE, -4.65 + GRID_SIZE * (target.level + 0.5), target.gz * GRID_SIZE);
    const info = BLOCK_TYPES[buildMode.selectedType];
    buildPreviewMat.color.setHex(info ? info.color : 0x2EE2FA);

    faceHighlightMesh.visible = true;
    positionFaceHighlight(target);
  }

  function placeBuildBlockAtHover() {
    const type = buildMode.selectedType;
    if (!type || !inventory[type] || inventory[type] <= 0) return;
    if (buildMode.hoverLevel === null) return;
    if (buildMode.hoverLevel >= MAX_STACK_HEIGHT) {
      logTransaction("ERR: MAX STACK HEIGHT REACHED", "debit");
      return;
    }

    createBuildBlockMesh(type, buildMode.hoverGX, buildMode.hoverGZ, buildMode.hoverLevel, true);

    inventory[type]--;
    if (inventory[type] <= 0) {
      delete inventory[type];
      const next = firstAvailableBlockType();
      if (next) { buildMode.selectedType = next; updateBuildHint(); }
      else exitBuildMode();
    } else {
      updateBuildHint();
    }
    updateInventoryUI();
    logTransaction(`PLACED: ${type}`, 'debit');
  }

  function clearAllBuilds() {
    buildBlockMeshes.forEach(mesh => {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    buildBlockMeshes.length = 0;
    Object.keys(buildGrid).forEach(k => delete buildGrid[k]);
  }

  function clearAllNature() {
    Object.keys(worldGrid).forEach(key => {
      const tile = worldGrid[key];
      if (tile.baseMesh) scene.remove(tile.baseMesh);
      if (tile.objMesh) scene.remove(tile.objMesh);
      if (tile.flowers) tile.flowers.forEach(fl => scene.remove(fl.mesh));
      if (tile.waterMesh && tile.waterMesh.isObject3D) scene.remove(tile.waterMesh);
      delete worldGrid[key];
    });
  }

  function consumeItem(name) {
    if (!inventory[name] || inventory[name] <= 0) return;

    if (name.includes("Block")) {
      enterBuildMode(name);
      return;
    }

    if (name.includes("Seed") || name.includes("Water")) {
      enterPlacementMode(name);
      return;
    }

    inventory[name]--;
    if (inventory[name] === 0) delete inventory[name];
    updateInventoryUI();

    if (name.includes("Cola")) {
      isTurbo = true;
      turboEndTime = performance.now() + 30000;
      logTransaction('CONSUMED COLA: FLAME BOOST 30S', 'credit');
    } else if (name.includes("Energy Bar")) {
      isDancing = true;
      danceEndTime = performance.now() + 10000;
      danceStyle = Math.floor(Math.random() * 4);
      logTransaction('CONSUMED BAR: DANCE 10S', 'credit');
    } else if (name.includes("Cyber Chips")) {
      isScanning = true;
      scanEndTime = performance.now() + 30000;
      scanRing.visible = true;
      logTransaction('CONSUMED CHIPS: STEALTH SCAN 30S', 'credit');
    } else if (name.includes("Golden Nut")) {
      robot.position.set(0, 0.1, 0);
      robot.rotation.y = 0;
      logTransaction('CONSUMED NUT: RECALLED', 'credit');
    }
  }

  function updateInventoryUI() {
    const listEl = document.getElementById('inventoryList');
    const items = Object.keys(inventory);
    if (items.length === 0) {
      listEl.innerHTML = '<div class="inv-empty">No items stored. Visit a Dispenser!</div>';
      return;
    }
    listEl.innerHTML = '';
    items.forEach(name => {
      const row = document.createElement('div'); row.className = 'inv-item';
      const infoSpan = document.createElement('span'); infoSpan.className = 'inv-item-info';
      infoSpan.innerHTML = `${name} <span class="inv-count">x${inventory[name]}</span>`;
      const consumeBtn = document.createElement('button'); consumeBtn.className = 'btn-consume';
      consumeBtn.textContent = 'USE';
      consumeBtn.addEventListener('click', () => consumeItem(name));
      row.appendChild(infoSpan); row.appendChild(consumeBtn); listEl.appendChild(row);
    });
  }

  function dispenseSnack3D(colorHex, name, kind = 'snack') {
    const boxGeo = roundedBoxGeometry(0.6, 0.4, 0.8, 0.1);
    const snackMesh = new THREE.Mesh(boxGeo, bodyMat(parseInt(colorHex)));
    addOutline(snackMesh, 0.03);

    let startPos;
    if (kind === 'nature') startPos = new THREE.Vector3(61.5, -2.0, -1.6);
    else if (kind === 'build') startPos = new THREE.Vector3(0, -2.0, -54.0);
    else startPos = new THREE.Vector3(-61.5, -2.0, -1.6);
    snackMesh.position.copy(startPos);
    scene.add(snackMesh);

    activeSnacks.push({
      mesh: snackMesh, start: startPos.clone(), progress: 0, name: name
    });
  }

  document.querySelectorAll('.btn-snack').forEach(btn => {
    btn.addEventListener('click', () => {
      const price = parseFloat(btn.dataset.price);
      const name = btn.dataset.name;
      const color = btn.dataset.color;
      if (bankBalance >= price) {
        bankBalance -= price; updateBankUI();
        logTransaction(`SNACK PURCHASE: -$${price}.00`, 'debit');
        dispenseSnack3D(color, name, 'snack');
      } else {
        logTransaction(`ERR: INSUFFICIENT FUNDS`, 'debit');
        btn.style.background = '#FF5A5F'; btn.style.color = '#fff';
        setTimeout(() => { btn.style.background = ''; btn.style.color = ''; }, 600);
      }
    });
  });

  document.querySelectorAll('.btn-nature').forEach(btn => {
    btn.addEventListener('click', () => {
      const price = parseFloat(btn.dataset.price);
      const name = btn.dataset.name;
      const color = btn.dataset.color;
      if (bankBalance >= price) {
        bankBalance -= price; updateBankUI();
        logTransaction(`NATURE SEED: -$${price}.00`, 'debit');
        dispenseSnack3D(color, name, 'nature');
      } else {
        logTransaction(`ERR: INSUFFICIENT FUNDS`, 'debit');
        btn.style.background = '#FF5A5F'; btn.style.color = '#fff';
        setTimeout(() => { btn.style.background = ''; btn.style.color = ''; }, 600);
      }
    });
  });

  document.querySelectorAll('.btn-build').forEach(btn => {
    btn.addEventListener('click', () => {
      const price = parseFloat(btn.dataset.price);
      const name = btn.dataset.name;
      const color = btn.dataset.color;
      if (bankBalance >= price) {
        bankBalance -= price; updateBankUI();
        logTransaction(`BUILD MATERIAL: -$${price}.00`, 'debit');
        dispenseSnack3D(color, name, 'build');
      } else {
        logTransaction(`ERR: INSUFFICIENT FUNDS`, 'debit');
        btn.style.background = '#FF5A5F'; btn.style.color = '#fff';
        setTimeout(() => { btn.style.background = ''; btn.style.color = ''; }, 600);
      }
    });
  });

  function updateKioskCanvas(time, isLinked) {
    kioskCtx.fillStyle = '#0B0C10'; kioskCtx.fillRect(0, 0, 512, 384);
    kioskCtx.lineWidth = 12;
    kioskCtx.strokeStyle = !isLinked ? '#FF5E13' : (isQuizActive ? '#2EE2FA' : '#00C853');
    kioskCtx.strokeRect(6, 6, 500, 372);

    if (isQuizActive && isLinked) {
      kioskCtx.fillStyle = '#2EE2FA'; kioskCtx.font = '900 32px sans-serif'; kioskCtx.textAlign = 'center';
      kioskCtx.fillText(`${activeQuizTitle.toUpperCase()} TRIVIA`, 256, 60);
      kioskCtx.fillStyle = '#fff'; kioskCtx.font = '800 24px sans-serif';
      if (currentQIndex < activeQuizQuestions.length) {
        kioskCtx.fillText(`QUESTION ${currentQIndex + 1} OF ${activeQuizQuestions.length}`, 256, 140);
        kioskCtx.fillStyle = '#FF5E13'; kioskCtx.font = '900 48px sans-serif';
        kioskCtx.fillText(`SCORE: ${quizScore}`, 256, 230);
      } else {
        kioskCtx.fillText('QUIZ COMPLETED!', 256, 140);
        kioskCtx.fillStyle = '#00C853'; kioskCtx.font = '900 48px sans-serif';
        kioskCtx.fillText(`${quizScore} / ${activeQuizQuestions.length} CORRECT`, 256, 230);
      }
      kioskCtx.fillStyle = '#2EE2FA'; kioskCtx.font = '800 22px sans-serif';
      kioskCtx.fillText('SEE HUD TO ANSWER', 256, 320);
    } else {
      kioskCtx.fillStyle = isLinked ? '#00C853' : '#FF5E13'; kioskCtx.font = '900 36px sans-serif'; kioskCtx.textAlign = 'center';
      kioskCtx.fillText('🏛️ AURA KIOSK TERMINAL', 256, 60);
      kioskCtx.fillStyle = '#fff'; kioskCtx.font = '800 24px sans-serif';
      kioskCtx.fillText(`UNIT: ${userText.toUpperCase()}`, 256, 130);
      kioskCtx.fillText(`THEME: ${currentTheme.toUpperCase()}`, 256, 180);
      kioskCtx.fillText(`POS X:${robot.position.x.toFixed(1)} | Z:${robot.position.z.toFixed(1)}`, 256, 230);
      kioskCtx.fillStyle = isLinked ? '#00C853' : '#DF3C00'; kioskCtx.font = '900 32px sans-serif';
      kioskCtx.fillText(isLinked ? '⚡ LINK ESTABLISHED' : '🔒 STANDBY - APPROACH', 256, 310);
    }
    kioskTex.needsUpdate = true;
  }

  function updateEftposCanvas(time, isLinked) {
    eftposCtx.fillStyle = '#0B0C10'; eftposCtx.fillRect(0, 0, 512, 384);
    eftposCtx.lineWidth = 12;
    eftposCtx.strokeStyle = isLinked ? '#FFB800' : '#4A4D57';
    eftposCtx.strokeRect(6, 6, 500, 372);

    eftposCtx.fillStyle = isLinked ? '#FFB800' : '#4A4D57'; eftposCtx.font = '900 34px sans-serif'; eftposCtx.textAlign = 'center';
    eftposCtx.fillText('💳 AURA BANK EFTPOS', 256, 65);
    eftposCtx.fillStyle = '#fff'; eftposCtx.font = '800 24px sans-serif';
    eftposCtx.fillText(`CLIENT: ${userText.toUpperCase()}`, 256, 135);
    eftposCtx.fillStyle = '#00C853'; eftposCtx.font = '900 44px sans-serif';
    eftposCtx.fillText(`$${bankBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 256, 215);
    eftposCtx.fillStyle = isLinked ? '#FFB800' : '#FF5A5F'; eftposCtx.font = '900 28px sans-serif';
    eftposCtx.fillText(isLinked ? '⚡ TAP TO TRANSACT' : '🔒 INSERT CARD OR APPROACH', 256, 305);
    eftposTex.needsUpdate = true;
  }

  // --- UNIFIED TACTICAL RADAR MAP RENDERER ---
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas.getContext('2d');
  const largeMapModalEl = document.getElementById('largeMapModal');
  const largeMapCanvas = document.getElementById('largeMapCanvas');
  const largeMapCtx = largeMapCanvas.getContext('2d');
  let isLargeMapOpen = false;

  // Base view center for the full-area map (chosen to nicely frame the landmarks) plus a
  // user-draggable pan offset on top of it, so the whole playing area can be explored.
  const LARGE_MAP_BASE_X = -25, LARGE_MAP_BASE_Z = -2;
  const LARGE_MAP_PAN_LIMIT = 700; // keeps panning from scrolling off into the empty void at the world's edge
  let largeMapPanX = 0, largeMapPanZ = 0;
  let isPanningMap = false;
  let panMouseX = 0, panMouseY = 0;

  document.getElementById('minimapContainer').addEventListener('click', () => {
    isLargeMapOpen = true;
    largeMapModalEl.classList.add('show');
    largeMapCanvas.width = largeMapCanvas.clientWidth;
    largeMapCanvas.height = largeMapCanvas.clientHeight;
    largeMapPanX = 0; largeMapPanZ = 0; // re-center on the landmarks each time it's opened
  });

  function closeLargeMap() {
    isLargeMapOpen = false;
    isPanningMap = false;
    largeMapCanvas.classList.remove('panning');
    largeMapModalEl.classList.remove('show');
  }
  document.getElementById('closeLargeMap').addEventListener('click', closeLargeMap);
  largeMapModalEl.addEventListener('click', (e) => { if (e.target === largeMapModalEl) closeLargeMap(); });

  // ---- Click-and-drag panning on the full-area map ----
  function largeMapScale() { return Math.min(largeMapCanvas.width, largeMapCanvas.height) / 190; }
  largeMapCanvas.addEventListener('mousedown', e => {
    isPanningMap = true;
    panMouseX = e.clientX; panMouseY = e.clientY;
    largeMapCanvas.classList.add('panning');
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!isPanningMap) return;
    const dx = e.clientX - panMouseX, dy = e.clientY - panMouseY;
    panMouseX = e.clientX; panMouseY = e.clientY;
    const scale = largeMapScale();
    largeMapPanX = THREE.MathUtils.clamp(largeMapPanX - dx / scale, -LARGE_MAP_PAN_LIMIT, LARGE_MAP_PAN_LIMIT);
    largeMapPanZ = THREE.MathUtils.clamp(largeMapPanZ - dy / scale, -LARGE_MAP_PAN_LIMIT, LARGE_MAP_PAN_LIMIT);
  });
  window.addEventListener('mouseup', () => {
    if (!isPanningMap) return;
    isPanningMap = false;
    largeMapCanvas.classList.remove('panning');
  });

  function drawTacticalMap(ctx, time, centerOnRobot = true, customScale = 1.8) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const cx = w / 2, cy = h / 2;
    const scale = customScale;
    const originX = centerOnRobot ? robot.position.x : LARGE_MAP_BASE_X + largeMapPanX;
    const originZ = centerOnRobot ? robot.position.z : LARGE_MAP_BASE_Z + largeMapPanZ;

    ctx.clearRect(0, 0, w, h);
    
    if (!centerOnRobot) {
      ctx.strokeStyle = 'rgba(46, 226, 250, 0.12)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -200; x <= 200; x += 20) {
        const sx = cx + (x - originX) * scale;
        if (sx >= 0 && sx <= w) { ctx.moveTo(sx, 0); ctx.lineTo(sx, h); }
      }
      for (let z = -200; z <= 200; z += 20) {
        const sy = cy + (z - originZ) * scale;
        if (sy >= 0 && sy <= h) { ctx.moveTo(0, sy); ctx.lineTo(w, sy); }
      }
      ctx.stroke();
    }

    if (centerOnRobot) {
      ctx.strokeStyle = 'rgba(46, 226, 250, 0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2);
      ctx.arc(cx, cy, 64, 0, Math.PI * 2); ctx.stroke();

      const sweepAngle = (time * 0.002) % (Math.PI * 2);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(sweepAngle);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 75, 0, -0.4, true); ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 75);
      sweepGrad.addColorStop(0, 'rgba(46, 226, 250, 0.35)'); sweepGrad.addColorStop(1, 'rgba(46, 226, 250, 0)');
      ctx.fillStyle = sweepGrad; ctx.fill(); ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(46, 226, 250, 0.25)'; ctx.lineWidth = 1.5;
      const worldCx = cx + (0 - originX) * scale, worldCy = cy + (0 - originZ) * scale;
      ctx.beginPath(); ctx.arc(worldCx, worldCy, 40 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(worldCx, worldCy, 80 * scale, 0, Math.PI * 2); ctx.stroke();
    }

    Object.keys(worldGrid).forEach(key => {
      const tile = worldGrid[key];
      const [gx, gz] = key.split(',').map(Number);
      const wx = gx * GRID_SIZE, wz = gz * GRID_SIZE;
      const rx = cx + (wx - originX) * scale, ry = cy + (wz - originZ) * scale;
      const tSize = Math.max(2, GRID_SIZE * scale);

      if (tile.base === 'grass') {
        ctx.fillStyle = 'rgba(76, 175, 80, 0.5)'; ctx.fillRect(rx - tSize/2, ry - tSize/2, tSize, tSize);
      } 
      if (tile.base === 'water' || tile.waterMesh) {
        ctx.fillStyle = 'rgba(0, 176, 255, 0.7)'; ctx.fillRect(rx - tSize/2, ry - tSize/2, tSize, tSize);
      }
      if (tile.object === 'tree') {
        ctx.fillStyle = '#2E7D32'; ctx.beginPath(); ctx.arc(rx, ry, Math.max(2, tSize*0.35), 0, Math.PI*2); ctx.fill();
      } else if (tile.flowers && tile.flowers.length > 0) {
        ctx.fillStyle = '#FF007F';
        tile.flowers.forEach(fl => {
          const flX = cx + (wx + fl.x - originX) * scale;
          const flY = cy + (wz + fl.z - originZ) * scale;
          ctx.beginPath(); ctx.arc(flX, flY, Math.max(1.5, tSize*0.2), 0, Math.PI*2); ctx.fill();
        });
      }
    });

    Object.keys(buildGrid).forEach(key => {
      const stack = buildGrid[key];
      if (!stack || stack.length === 0) return;
      const [gx, gz] = key.split(',').map(Number);
      const wx = gx * GRID_SIZE, wz = gz * GRID_SIZE;
      const rx = cx + (wx - originX) * scale, ry = cy + (wz - originZ) * scale;
      const tSize = Math.max(2, GRID_SIZE * scale);
      const topType = stack[stack.length - 1].type;
      const info = BLOCK_TYPES[topType];
      ctx.fillStyle = info ? hexCss(info.color) : '#1E88E5';
      ctx.fillRect(rx - tSize/2, ry - tSize/2, tSize, tSize);
      if (stack.length > 1) {
        ctx.fillStyle = '#fff'; ctx.font = '800 9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`x${stack.length}`, rx, ry + 3);
      }
    });

    const landmarks = [
      { name: "KIOSK", x: 9, z: -3, color: "#2EE2FA", size: 5 },
      { name: "BANK", x: -9, z: -4, color: "#FFB800", size: 5 },
      { name: "SNACKS", x: -63, z: -2.5, color: "#FF007F", size: 6 },
      { name: "NATURE", x: 63, z: -2.5, color: "#00C853", size: 6 },
      { name: "BUILD", x: 0, z: -56.25, color: "#1E88E5", size: 6 },
      { name: "PET ADOPT", x: 9, z: 50.25, color: "#FF4D8D", size: 6 }
    ];

    landmarks.forEach(lm => {
      const lx = cx + (lm.x - originX) * scale;
      const ly = cy + (lm.z - originZ) * scale;
      if (lx > -20 && lx < w + 20 && ly > -20 && ly < h + 20) {
        ctx.fillStyle = lm.color; ctx.shadowColor = lm.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(lx, ly, lm.size, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (!centerOnRobot || (Math.abs(lx - cx) < 65 && Math.abs(ly - cy) < 65)) {
          ctx.fillStyle = '#fff'; ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(lm.name, lx, ly - 8);
        }
      }
    });

    const rx = cx + (robot.position.x - originX) * scale;
    const ry = cy + (robot.position.z - originZ) * scale;
    ctx.save(); ctx.translate(rx, ry);
    ctx.rotate(Math.PI - robot.rotation.y);
    ctx.fillStyle = '#FF5E13'; ctx.shadowColor = '#FF5E13'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-5, 6); ctx.lineTo(0, 3); ctx.lineTo(5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // --- CONTROLS & CAMERA MOVEMENT ---
  const keys = { w: false, a: false, s: false, d: false };
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (e.target.tagName === 'INPUT') return;
    
    if (k === 'q' && !placementMode.active && !buildMode.active) {
      document.getElementById('inventoryPanel').classList.toggle('hidden');
      return;
    }

    if (k === 'p' && !placementMode.active && !buildMode.active) {
      document.getElementById('petPanel').classList.toggle('hidden');
      return;
    }

    if (buildMode.active) {
      if (e.key === 'ArrowLeft') { cycleBuildType(-1); }
      if (e.key === 'ArrowRight') { cycleBuildType(1); }
      if (k === 'escape' || k === 'q') { exitBuildMode(); }
      return;
    }

    if (placementMode.active) {
      if (k === 'w' || e.key === 'ArrowUp') { placementMode.gz -= 1; updateCursorPosition(); }
      if (k === 's' || e.key === 'ArrowDown') { placementMode.gz += 1; updateCursorPosition(); }
      if (k === 'a' || e.key === 'ArrowLeft') { placementMode.gx -= 1; updateCursorPosition(); }
      if (k === 'd' || e.key === 'ArrowRight') { placementMode.gx += 1; updateCursorPosition(); }
      if (k === 'e') { placeGridItem(); }
      if (k === 'escape' || k === 'q') { exitPlacementMode(); }
      return;
    }

    if (k in keys) keys[k] = true;
    if (e.key === 'ArrowUp') keys.w = true;
    if (e.key === 'ArrowDown') keys.s = true;
    if (e.key === 'ArrowLeft') keys.a = true;
    if (e.key === 'ArrowRight') keys.d = true;
  });

  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
    if (e.key === 'ArrowUp') keys.w = false;
    if (e.key === 'ArrowDown') keys.s = false;
    if (e.key === 'ArrowLeft') keys.a = false;
    if (e.key === 'ArrowRight') keys.d = false;
  });

  let camDist = 64, camAngleX = 0, camAngleY = 0.45;
  let isDragging = false, prevMouseX = 0, prevMouseY = 0;
  let dragStartX = 0, dragStartY = 0;
  
  const smoothFocus = new THREE.Vector3(0, 2.1, 0);

  window.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && !e.target.closest('#minimapContainer') && !e.target.closest('.hud-panel') && !e.target.closest('#inventoryPanel') && !e.target.closest('#petPanel')) { isDragging = true; prevMouseX = e.clientX; prevMouseY = e.clientY; dragStartX = e.clientX; dragStartY = e.clientY; }});
  window.addEventListener('mousemove', e => { if (!isDragging) return; const dx = e.clientX - prevMouseX; const dy = e.clientY - prevMouseY; camAngleX -= dx * 0.008; camAngleY = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, camAngleY + dy * 0.008)); prevMouseX = e.clientX; prevMouseY = e.clientY; });
  window.addEventListener('mouseup', e => {
    if (isDragging && buildMode.active) {
      const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
      if (dist < 6) placeBuildBlockAtHover();
    }
    isDragging = false;
  });
  
  window.addEventListener('wheel', e => { camDist = Math.max(8, Math.min(120, camDist + e.deltaY * 0.02)); });

  let moveSpeed = 0, turnSpeed = 0, walkPhase = 0;
  const maxSpeed = 0.22, maxTurn = 0.05, accel = 0.019, friction = 0.88;
  let currentTheme = "original";

  document.querySelectorAll('#palette button[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#palette button[data-theme]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const theme = btn.dataset.theme;
      let cMain = COLORS.orange, cDk = COLORS.orangeDk;
      if (theme === 'blue') { cMain = 0x1E88E5; cDk = 0x0D47A1; }
      else if (theme === 'silver') { cMain = 0xD0D5DD; cDk = 0x64748B; }
      else if (theme === 'gold') { cMain = 0xFFD700; cDk = 0xB8860B; }
      else if (theme === 'prismatic') { cMain = 0xFF80BF; cDk = 0x9c27b0; }
      else if (theme === 'blackChrome') { cMain = 0x22222A; cDk = 0x08080C; }
      
      matOrange.color.setHex(cMain); matOrangeDk.color.setHex(cDk);
      currentTheme = theme;
      sparkleGroup.visible = (theme === 'silver' || theme === 'gold' || theme === 'prismatic' || theme === 'blackChrome');
    });
  });

  const kioskPanel = document.getElementById('kioskPanel');
  const eftposPanel = document.getElementById('eftposPanel');
  const snackPanel = document.getElementById('snackPanel');
  const naturePanel = document.getElementById('naturePanel');
  const buildPanel = document.getElementById('buildPanel');
  const adoptionPanel = document.getElementById('adoptionPanel');
  const adoptionBalanceEl = document.getElementById('adoptionBalanceText');
  const adoptionCountEl = document.getElementById('adoptionCountText');
  const adoptionStatusEl = document.getElementById('adoptionStatusText');

  // ---------- SAVE / LOAD / RESET SYSTEM ----------
  // Persists to localStorage in this browser, so returning to this same file/page
  // automatically restores the map (nature + builds) and money without extra steps.
  const SAVE_KEY = 'aura_robot_save_v1';

  function serializeWorldGrid() {
    const out = [];
    Object.keys(worldGrid).forEach(key => {
      const tile = worldGrid[key];
      const [gx, gz] = key.split(',').map(Number);
      out.push({
        gx, gz,
        base: tile.base,     // null | 'grass' | 'water'
        object: tile.object, // null | 'tree' | 'flower_cluster'
        flowers: (tile.flowers || []).map(fl => ({ x: fl.x, z: fl.z, color: fl.color }))
      });
    });
    return out;
  }

  function serializeBuildGrid() {
    const out = [];
    Object.keys(buildGrid).forEach(key => {
      const [gx, gz] = key.split(',').map(Number);
      buildGrid[key].forEach((entry, level) => { out.push({ gx, gz, level, type: entry.type }); });
    });
    return out;
  }

  function saveState() {
    try {
      const data = {
        version: 1,
        bankBalance,
        inventory,
        userText,
        currentTheme,
        worldGrid: serializeWorldGrid(),
        buildGrid: serializeBuildGrid()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('AURA save failed:', err);
      return false;
    }
  }

  function applyTheme(theme) {
    const btn = document.querySelector(`#palette button[data-theme="${theme}"]`);
    if (btn) btn.click();
  }

  function loadState() {
    let raw;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (err) { return false; }
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch (err) { return false; }
    if (!data || typeof data !== 'object') return false;

    bankBalance = typeof data.bankBalance === 'number' ? data.bankBalance : 0;
    Object.keys(inventory).forEach(k => delete inventory[k]);
    if (data.inventory) Object.keys(data.inventory).forEach(k => { inventory[k] = data.inventory[k]; });
    updateBankUI();
    updateInventoryUI();

    if (data.userText) {
      userText = data.userText;
      document.getElementById('nameInput').value = data.userText;
    }
    if (data.currentTheme) applyTheme(data.currentTheme);

    if (Array.isArray(data.worldGrid)) {
      data.worldGrid.forEach(t => {
        if (t.base === 'grass') createTileVisual('🌱 Grass Seed', t.gx, t.gz);
        if (t.base === 'water') createTileVisual('💧 Water Bucket', t.gx, t.gz);
        if (t.object === 'tree') createTileVisual('🌲 Tree Seed', t.gx, t.gz);
        if (Array.isArray(t.flowers)) {
          t.flowers.forEach(fl => createTileVisual('🌸 Flower Seed', t.gx, t.gz, fl));
        }
      });
    }

    if (Array.isArray(data.buildGrid)) {
      data.buildGrid.slice().sort((a, b) => a.level - b.level)
        .forEach(b => createBuildBlockMesh(b.type, b.gx, b.gz, b.level, false));
    }

    logTransaction('SAVED GAME LOADED', 'credit');
    return true;
  }

  document.getElementById('btnSaveGame').addEventListener('click', () => {
    if (saveState()) logTransaction('GAME SAVED', 'credit');
    else logTransaction('ERR: SAVE FAILED', 'debit');
  });

  const resetModalEl = document.getElementById('resetModal');
  document.getElementById('btnResetGame').addEventListener('click', () => {
    if (buildMode.active) exitBuildMode();
    if (placementMode.active) exitPlacementMode();
    resetModalEl.classList.add('show');
  });
  function closeResetModal() { resetModalEl.classList.remove('show'); }
  document.getElementById('btnResetCancel').addEventListener('click', closeResetModal);
  resetModalEl.addEventListener('click', e => { if (e.target === resetModalEl) closeResetModal(); });

  document.getElementById('btnResetBuildsOnly').addEventListener('click', () => {
    clearAllNature();
    clearAllBuilds();
    saveState();
    logTransaction('RESET: BUILDS CLEARED', 'debit');
    closeResetModal();
  });

  document.getElementById('btnResetAll').addEventListener('click', () => {
    clearAllNature();
    clearAllBuilds();
    bankBalance = 0;
    Object.keys(inventory).forEach(k => delete inventory[k]);
    updateBankUI();
    updateInventoryUI();

    // Send every pet back to "unadopted" too, so a full reset really does put
    // AURA back to having zero pets - matching a fresh install.
    petAdoptionAnim = null;
    ALL_PET_IDS.forEach(id => { petOwned[id] = false; });
    petActiveOrder = [];
    petInactiveOrder = [];
    applyPetVisibility();
    renderPetLists();
    savePetSettings();

    saveState();
    logTransaction('RESET: EVERYTHING CLEARED', 'debit');
    closeResetModal();
  });

  // ---------- SETTINGS: persistence + modal wiring ----------
  // Kept as its own localStorage key (separate from the map/money save) since these are
  // user preferences rather than game state. New settings can follow the same pattern:
  // add a field to `settings`, a .settings-row in index.html, load/apply it below, and
  // save it whenever its control changes.
  const SETTINGS_KEY = 'aura_settings_v1';

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (err) { console.error('AURA settings save failed:', err); }
  }

  function loadSettingsFromStorage() {
    let raw;
    try { raw = localStorage.getItem(SETTINGS_KEY); } catch (err) { return; }
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch (err) { return; }
    if (typeof data.dayNightEnabled === 'boolean') settings.dayNightEnabled = data.dayNightEnabled;
    if (typeof data.dayNightSpeed === 'number' && data.dayNightSpeed > 0) settings.dayNightSpeed = data.dayNightSpeed;
    if (typeof data.fogFar === 'number' && data.fogFar > 0) settings.fogFar = data.fogFar;
    ['petGapDog', 'petGapCat', 'petGapBird', 'petGapAlpaca', 'petGapBunny', 'petGapFrog', 'petGapMonkey', 'petGapPanda', 'petGapOwl', 'petGapDragon', 'petGapLamb'].forEach(key => {
      if (typeof data[key] === 'number' && data[key] > 0) settings[key] = data[key];
    });
  }
  loadSettingsFromStorage();
  // Apply the loaded (or default) gaps to the pets' actual follow distances right away.
  DOG_FOLLOW_DIST = settings.petGapDog;
  CAT_FOLLOW_DIST = settings.petGapCat;
  BIRD_FOLLOW_DIST = settings.petGapBird;
  ALPACA_FOLLOW_DIST = settings.petGapAlpaca;
  BUNNY_FOLLOW_DIST = settings.petGapBunny;
  FROG_FOLLOW_DIST = settings.petGapFrog;
  MONKEY_FOLLOW_DIST = settings.petGapMonkey;
  PANDA_FOLLOW_DIST = settings.petGapPanda;
  OWL_FOLLOW_DIST = settings.petGapOwl;
  DRAGON_FOLLOW_DIST = settings.petGapDragon;
  LAMB_FOLLOW_DIST = settings.petGapLamb;
  scene.fog.far = settings.fogFar;
  scene.fog.near = Math.max(5, settings.fogFar - 85);

  const settingsModalEl = document.getElementById('settingsModal');
  document.getElementById('btnSettings').addEventListener('click', () => { settingsModalEl.classList.add('show'); });
  function closeSettingsModal() { settingsModalEl.classList.remove('show'); }
  document.getElementById('closeSettingsModal').addEventListener('click', closeSettingsModal);
  settingsModalEl.addEventListener('click', e => { if (e.target === settingsModalEl) closeSettingsModal(); });

  const toggleDayNightEl = document.getElementById('toggleDayNight');
  const dayNightSpeedSliderEl = document.getElementById('dayNightSpeedSlider');
  const dayNightSpeedValueEl = document.getElementById('dayNightSpeedValue');

  toggleDayNightEl.checked = settings.dayNightEnabled;
  dayNightSpeedSliderEl.value = settings.dayNightSpeed;
  dayNightSpeedValueEl.textContent = settings.dayNightSpeed.toFixed(2) + 'x';

  toggleDayNightEl.addEventListener('change', () => {
    settings.dayNightEnabled = toggleDayNightEl.checked;
    saveSettings();
  });
  dayNightSpeedSliderEl.addEventListener('input', () => {
    settings.dayNightSpeed = parseFloat(dayNightSpeedSliderEl.value);
    dayNightSpeedValueEl.textContent = settings.dayNightSpeed.toFixed(2) + 'x';
    saveSettings();
  });

  const fogFarSliderEl = document.getElementById('fogFarSlider');
  const fogFarValueEl = document.getElementById('fogFarValue');
  fogFarSliderEl.value = settings.fogFar;
  fogFarValueEl.textContent = Math.round(settings.fogFar);
  fogFarSliderEl.addEventListener('input', () => {
    const v = parseFloat(fogFarSliderEl.value);
    settings.fogFar = v;
    fogFarValueEl.textContent = Math.round(v);
    scene.fog.far = v;
    scene.fog.near = Math.max(5, v - 85);
    saveSettings();
  });

  // ---- Pet Gaps: one slider per pet, each wired to its own settings key + live follow-distance variable ----
  const PET_GAP_SLIDERS = [
    { key: 'petGapDog',    slider: 'petGapDogSlider',    value: 'petGapDogValue',    apply: v => { DOG_FOLLOW_DIST = v; } },
    { key: 'petGapCat',    slider: 'petGapCatSlider',    value: 'petGapCatValue',    apply: v => { CAT_FOLLOW_DIST = v; } },
    { key: 'petGapBird',   slider: 'petGapBirdSlider',   value: 'petGapBirdValue',   apply: v => { BIRD_FOLLOW_DIST = v; } },
    { key: 'petGapAlpaca', slider: 'petGapAlpacaSlider', value: 'petGapAlpacaValue', apply: v => { ALPACA_FOLLOW_DIST = v; } },
    { key: 'petGapBunny',  slider: 'petGapBunnySlider',  value: 'petGapBunnyValue',  apply: v => { BUNNY_FOLLOW_DIST = v; } },
    { key: 'petGapFrog',   slider: 'petGapFrogSlider',   value: 'petGapFrogValue',   apply: v => { FROG_FOLLOW_DIST = v; } },
    { key: 'petGapMonkey', slider: 'petGapMonkeySlider', value: 'petGapMonkeyValue', apply: v => { MONKEY_FOLLOW_DIST = v; } },
    { key: 'petGapPanda',  slider: 'petGapPandaSlider',  value: 'petGapPandaValue',  apply: v => { PANDA_FOLLOW_DIST = v; } },
    { key: 'petGapOwl',    slider: 'petGapOwlSlider',    value: 'petGapOwlValue',    apply: v => { OWL_FOLLOW_DIST = v; } },
    { key: 'petGapDragon', slider: 'petGapDragonSlider', value: 'petGapDragonValue', apply: v => { DRAGON_FOLLOW_DIST = v; } },
    { key: 'petGapLamb',   slider: 'petGapLambSlider',   value: 'petGapLambValue',   apply: v => { LAMB_FOLLOW_DIST = v; } },
  ];
  PET_GAP_SLIDERS.forEach(({ key, slider, value, apply }) => {
    const sliderEl = document.getElementById(slider);
    const valueEl = document.getElementById(value);
    sliderEl.value = settings[key];
    valueEl.textContent = settings[key].toFixed(1);
    sliderEl.addEventListener('input', () => {
      const v = parseFloat(sliderEl.value);
      settings[key] = v;
      valueEl.textContent = v.toFixed(1);
      apply(v);
      saveSettings();
    });
  });

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const dt = clock.getDelta();

    // Update water shader time for animating white ripple lines
    waterShaderMat.uniforms.uTime.value = time * 0.001;

    updateDayNightCycle(dt);

    // --- NIGHT SKY: stars fade in/out with nightFactor ---
    const skyVisible = nightFactor > 0.01;
    stars.visible = skyVisible;
    if (skyVisible) starMat.opacity = nightFactor * 0.9;

    updateChestCanvas(time);

    // --- TIMED STATUS BUFFS ---
    if (isTurbo) {
      if (time > turboEndTime) isTurbo = false;
      else if (Math.random() < 0.6) emitFlame();
    }
    if (isDancing && time > danceEndTime) isDancing = false;
    if (isScanning) {
      if (time > scanEndTime) {
        isScanning = false;
        scanRing.visible = false;
        robotOpacity = 1.0;
        robot.traverse(c => { if (c.isMesh && c.material) c.material.opacity = 1.0; });
      } else {
        scanRing.scale.set(1 + Math.sin(time * 0.01) * 0.3, 1 + Math.sin(time * 0.01) * 0.3, 1);
        robotOpacity = 0.4 + Math.sin(time * 0.008) * 0.2;
        robot.traverse(c => { if (c.isMesh && c.material && !c.isOutlineMesh) { c.material.transparent = true; c.material.opacity = robotOpacity; }});
      }
    }

    // --- FLAME TRAIL LIFETIME ---
    for (let i = flameParticles.length - 1; i >= 0; i--) {
      const p = flameParticles[i];
      p.life -= p.decay;
      p.sprite.position.x += p.vx; p.sprite.position.y += p.vy; p.sprite.position.z += p.vz;
      p.sprite.scale.set(p.life * 1.5, p.life * 1.5, 1);
      p.sprite.material.opacity = p.life;
      if (p.life <= 0) { scene.remove(p.sprite); flameParticles.splice(i, 1); }
    }

    // --- SPARKLE FLOATING ---
    sparkles.forEach(s => {
      s.sprite.position.y += Math.sin(time * 0.002 + s.phase) * 0.008;
      const sc = s.baseScale * (0.8 + Math.sin(time * s.speed + s.phase) * 0.4);
      s.sprite.scale.set(sc, sc, 1);
    });

    // --- BEACON ROTATION ---
    jupiter.rotation.y += dt * 0.025;
    beaconSphere.rotation.y = time * 0.002;
    bankBeacon.rotation.y = time * 0.002;
    snackBeacon.rotation.y = time * 0.0025;
    natureBeacon.rotation.y = time * 0.0025;
    buildBeacon.rotation.y = time * 0.0025;
    adoptBeacon.rotation.y = time * 0.0025;

    // --- PET ADOPTION BOX: sparkle burst lifetime ---
    for (let i = adoptSparkles.length - 1; i >= 0; i--) {
      const p = adoptSparkles[i];
      p.life -= p.decay;
      p.sprite.position.x += p.vx; p.sprite.position.y += p.vy; p.sprite.position.z += p.vz;
      p.vy -= 0.0025; // gentle gravity so the burst arcs back down
      p.sprite.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) { scene.remove(p.sprite); adoptSparkles.splice(i, 1); }
    }

    // --- PET ADOPTION BOX: lid open/close + pet reveal + walk-to-AURA handoff ---
    if (petAdoptionAnim) {
      const elapsed = performance.now() - petAdoptionAnim.startTime;

      // Lid: opens, holds, then closes again over the course of the sequence.
      let lidAmount;
      if (elapsed < ADOPT_ANIM_OPEN_DUR) lidAmount = elapsed / ADOPT_ANIM_OPEN_DUR;
      else if (elapsed < ADOPT_ANIM_OPEN_DUR + ADOPT_ANIM_HOLD_DUR) lidAmount = 1;
      else if (elapsed < ADOPT_ANIM_OPEN_DUR + ADOPT_ANIM_HOLD_DUR + ADOPT_ANIM_CLOSE_DUR) {
        lidAmount = 1 - (elapsed - ADOPT_ANIM_OPEN_DUR - ADOPT_ANIM_HOLD_DUR) / ADOPT_ANIM_CLOSE_DUR;
      } else lidAmount = 0;
      applyAdoptLidOpenAmount(Math.max(0, Math.min(1, lidAmount)));

      const pet = petTypes[petAdoptionAnim.id];

      // Reveal: pop up out of the box with a little bounce.
      const revealProgress = Math.max(0, Math.min(1, (elapsed - ADOPT_ANIM_REVEAL_START) / ADOPT_ANIM_REVEAL_DUR));
      const revealEase = 1 - Math.pow(1 - revealProgress, 3);
      pet.group.scale.setScalar(Math.max(0.001, revealEase));

      if (elapsed < ADOPT_ANIM_WALK_START) {
        // Still rising out of the box - a small bob for extra bounce.
        pet.group.position.copy(petAdoptionAnim.spawnWorld);
        pet.group.position.y += Math.sin(revealProgress * Math.PI) * 0.35;
      } else {
        // Walking over to join AURA - glide from the box to just behind wherever
        // AURA currently is, easing down to this species' normal ground height.
        const walkProgress = Math.max(0, Math.min(1, (elapsed - ADOPT_ANIM_WALK_START) / ADOPT_ANIM_WALK_DUR));
        const walkEase = walkProgress * walkProgress * (3 - 2 * walkProgress); // smoothstep
        const backX = -Math.sin(robot.rotation.y) * 3.0, backZ = -Math.cos(robot.rotation.y) * 3.0;
        const targetX = robot.position.x + backX, targetZ = robot.position.z + backZ;
        pet.group.position.x = THREE.MathUtils.lerp(petAdoptionAnim.spawnWorld.x, targetX, walkEase);
        pet.group.position.z = THREE.MathUtils.lerp(petAdoptionAnim.spawnWorld.z, targetZ, walkEase);
        pet.group.position.y = THREE.MathUtils.lerp(petAdoptionAnim.spawnWorld.y, petAdoptionAnim.restY, walkEase)
          + Math.sin(walkProgress * Math.PI) * 0.5; // little hop while trotting over
        pet.group.rotation.y = Math.atan2(targetX - petAdoptionAnim.spawnWorld.x, targetZ - petAdoptionAnim.spawnWorld.z);
      }

      if (elapsed >= ADOPT_ANIM_TOTAL) {
        const finishedId = petAdoptionAnim.id;
        pet.group.scale.set(1, 1, 1);
        pet.group.position.y = petAdoptionAnim.restY;
        petAdoptionAnim = null;
        acquirePet(finishedId);
        logTransaction(`ADOPTED: ${petTypes[finishedId].icon} ${petNames[finishedId]}!`, 'credit');
      }
    }

    // --- MOVEMENT & ROBOT ANIMATION ---
    if (!placementMode.active && !buildMode.active) {
      const currentMaxSpeed = isTurbo ? maxSpeed * 1.65 : maxSpeed;
      if (keys.w) moveSpeed = Math.min(currentMaxSpeed, moveSpeed + accel);
      else if (keys.s) moveSpeed = Math.max(-currentMaxSpeed * 0.6, moveSpeed - accel);
      else moveSpeed *= friction;

      if (keys.a) turnSpeed = Math.min(maxTurn, turnSpeed + 0.008);
      else if (keys.d) turnSpeed = Math.max(-maxTurn, turnSpeed - 0.008);
      else turnSpeed *= friction;

      robot.rotation.y += turnSpeed;
      robot.position.x += Math.sin(robot.rotation.y) * moveSpeed;
      robot.position.z += Math.cos(robot.rotation.y) * moveSpeed;

      robot.position.x = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, robot.position.x));
      robot.position.z = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, robot.position.z));
    } else {
      moveSpeed = 0; turnSpeed = 0;
    }

    // --- ROBOT DANCE OR WALKING KINEMATICS ---
    if (isDancing) {
      const dSpeed = time * 0.012;
      robot.position.y = 0.1 + Math.abs(Math.sin(dSpeed * 2)) * 0.6;
      animBones.torso.rotation.z = Math.sin(dSpeed) * 0.3;
      animBones.armL.shoulder.rotation.z = Math.sin(dSpeed) * 1.2 - 0.5;
      animBones.armR.shoulder.rotation.z = -Math.sin(dSpeed) * 1.2 + 0.5;
      animBones.legL.hip.rotation.x = Math.sin(dSpeed * 2) * 0.6;
      animBones.legR.hip.rotation.x = -Math.sin(dSpeed * 2) * 0.6;
    } else if (Math.abs(moveSpeed) > 0.005 || Math.abs(turnSpeed) > 0.005) {
      // Leg cadence and bounce height track the robot's ACTUAL current speed every frame
      // (rather than a fixed rate), so accelerating/braking smoothly speeds up or relaxes
      // the stride, and the feet never appear to slide relative to how fast it's moving.
      const speedRatio = Math.max(Math.abs(moveSpeed), Math.abs(turnSpeed) * 2.5) / maxSpeed;
      const cadence = 14 * speedRatio; // radians/sec of leg-cycle, scales with speed
      walkPhase += dt * cadence;
      const stride = Math.sin(walkPhase) * (moveSpeed / maxSpeed);
      robot.position.y = 0.1 + Math.abs(Math.sin(walkPhase * 2)) * (0.10 + 0.10 * Math.min(speedRatio, 1.7));
      animBones.legL.hip.rotation.x = stride * 0.9;
      animBones.legR.hip.rotation.x = -stride * 0.9;
      animBones.armL.shoulder.rotation.x = -stride * 0.7;
      animBones.armR.shoulder.rotation.x = stride * 0.7;
      animBones.torso.rotation.z = 0;
      animBones.armL.shoulder.rotation.z = 0; animBones.armR.shoulder.rotation.z = 0;
    } else {
      robot.position.y = 0.1 + Math.sin(time * 0.003) * 0.05;
      animBones.legL.hip.rotation.x *= 0.85; animBones.legR.hip.rotation.x *= 0.85;
      animBones.armL.shoulder.rotation.x *= 0.85; animBones.armR.shoulder.rotation.x *= 0.85;
      animBones.torso.rotation.z *= 0.85;
      animBones.armL.shoulder.rotation.z *= 0.85; animBones.armR.shoulder.rotation.z *= 0.85;
    }

    // --- PETS: FOLLOW AURA IN THE USER-DEFINED ORDER (set via the Pet Menu - press P) ---
    const auraIsStillForPets = Math.abs(moveSpeed) < 0.012 && Math.abs(turnSpeed) < 0.012;
    updateAllPets(dt, time, auraIsStillForPets);

    // --- GROUP CHEER: EVERYONE SHARES A QUICK HAPPY BEAT ONCE FULLY SETTLED ---
    updateGroupCheer(time);

    // --- PROXIMITY CHECKING & HUD PANEL UPDATES ---
    const distToKiosk = Math.hypot(robot.position.x - 9, robot.position.z - (-3));
    const isKioskLinked = distToKiosk < 14;
    updateKioskCanvas(time, isKioskLinked);
    if (isKioskLinked) {
      kioskPanel.classList.remove('hidden');
      document.getElementById('kioskUnitName').textContent = userText.toUpperCase();
      document.getElementById('kioskCoords').textContent = `X: ${robot.position.x.toFixed(1)} | Z: ${robot.position.z.toFixed(1)}`;
      document.getElementById('kioskDist').textContent = `${distToKiosk.toFixed(1)}m`;
    } else {
      kioskPanel.classList.add('hidden');
      if (isQuizActive) endQuiz(false);
    }

    const distToBank = Math.hypot(robot.position.x - (-9), robot.position.z - (-4));
    const isBankLinked = distToBank < 14;
    updateEftposCanvas(time, isBankLinked);
    if (isBankLinked) {
      eftposPanel.classList.remove('hidden');
      document.getElementById('bankAccountName').textContent = userText.toUpperCase();
    } else {
      eftposPanel.classList.add('hidden');
    }

    const distToSnack = Math.hypot(robot.position.x - (-63), robot.position.z - (-2.5));
    if (distToSnack < 16) snackPanel.classList.remove('hidden');
    else snackPanel.classList.add('hidden');

    const distToNature = Math.hypot(robot.position.x - 63, robot.position.z - (-2.5));
    if (distToNature < 16) naturePanel.classList.remove('hidden');
    else naturePanel.classList.add('hidden');

    const distToBuild = Math.hypot(robot.position.x - 0, robot.position.z - (-56.25));
    if (distToBuild < 16) buildPanel.classList.remove('hidden');
    else buildPanel.classList.add('hidden');

    const distToAdopt = Math.hypot(robot.position.x - ADOPT_X, robot.position.z - ADOPT_Z);
    if (distToAdopt < 16) {
      adoptionPanel.classList.remove('hidden');
      const ownedCount = ALL_PET_IDS.filter(id => petOwned[id]).length;
      adoptionCountEl.textContent = `${ownedCount} / ${ALL_PET_IDS.length}`;
      const btnAdopt = document.getElementById('btnAdoptPet');
      if (ownedCount >= ALL_PET_IDS.length) {
        adoptionStatusEl.textContent = 'ALL PETS ADOPTED!'; adoptionStatusEl.style.color = '#00C853';
        btnAdopt.disabled = true;
      } else if (petAdoptionAnim) {
        adoptionStatusEl.textContent = 'OPENING BOX...'; adoptionStatusEl.style.color = '#FF007F';
        btnAdopt.disabled = true;
      } else {
        adoptionStatusEl.textContent = 'TAP TO ADOPT'; adoptionStatusEl.style.color = '#FF007F';
        btnAdopt.disabled = false;
      }
    } else {
      adoptionPanel.classList.add('hidden');
    }

    // --- BUILD MODE GHOST PREVIEW ---
    if (buildMode.active) updateBuildPreview();

    // --- DISPENSED SNACK & SEED ANIMATION ---
    for (let i = activeSnacks.length - 1; i >= 0; i--) {
      const snack = activeSnacks[i];
      snack.progress += dt * 0.8;
      const targetPos = robot.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      snack.mesh.position.lerpVectors(snack.start, targetPos, snack.progress);
      snack.mesh.position.y += Math.sin(snack.progress * Math.PI) * 4.0;
      snack.mesh.rotation.y += 0.15; snack.mesh.rotation.x += 0.1;
      
      if (snack.progress >= 1.0) {
        scene.remove(snack.mesh);
        activeSnacks.splice(i, 1);
        
        // 1 Purchase gives 3 items for Grass, Flowers, and Water; 2 items for Build Materials!
        let countToAdd = 1;
        if (snack.name.includes("Grass") || snack.name.includes("Flower") || snack.name.includes("Water")) {
          countToAdd = 3;
        } else if (snack.name.includes("Block")) {
          countToAdd = 2;
        }

        if (!inventory[snack.name]) inventory[snack.name] = 0;
        inventory[snack.name] += countToAdd;
        updateInventoryUI();
        logTransaction(`RECEIVED: ${snack.name} (x${countToAdd})`, 'credit');
      }
    }

    // --- CAMERA SMOOTH ORBIT TRACKING ---
    smoothFocus.lerp(new THREE.Vector3(robot.position.x, robot.position.y + 2.1, robot.position.z), 0.12);
    const camX = smoothFocus.x + camDist * Math.sin(camAngleX) * Math.cos(camAngleY);
    const camY = smoothFocus.y + camDist * Math.sin(camAngleY);
    const camZ = smoothFocus.z + camDist * Math.cos(camAngleX) * Math.cos(camAngleY);
    camera.position.set(camX, camY, camZ);
    camera.lookAt(smoothFocus);

    renderer.render(scene, camera);

    // --- UPDATE MAP RADARS ---
    drawTacticalMap(minimapCtx, time, true, 1.8);
    if (isLargeMapOpen) {
      drawTacticalMap(largeMapCtx, time, false, Math.min(largeMapCanvas.width, largeMapCanvas.height) / 190);
    }
  }

  loadState();
  animate();
})();
