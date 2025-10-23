import * as THREE from "/vendor/three/build/three.module.js";
import { OrbitControls } from "/vendor/OrbitControls.js";

const canvas = document.getElementById("viewport");

/* ==================== Renderer ==================== */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0c0f14, 1);

/* ==================== Scene & Camera ==================== */
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0c0f14, 20, 80);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
scene.add(camera);

/* ==================== Lights ==================== */
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(6, 10, 6);
dir.castShadow = true;
scene.add(dir);

/* ==================== Grid (XZ plane, y=0) ==================== */
const grid = new THREE.GridHelper(200, 200, 0x293241, 0x1a1f29);
grid.material.opacity = 0.25;
grid.material.transparent = true;
scene.add(grid);

/* ==================== Transparent Cube (resizable) ==================== */
let cube = createCube(2, 2, 2);
scene.add(cube);

function createCube(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x7fa2ff,
    metalness: 0.15,
    roughness: 0.35,
    transparent: true,
    opacity: 0.5
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ==================== Helpers ==================== */
// Invisible ground plane (y = 0)
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ visible: false })
);
scene.add(groundPlane);

// Axis arrows (X=red, Y=green, Z=blue)
const arrowLen = 3.5, headLen = 0.9, headWidth = 0.6;
const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(), arrowLen, 0xff6b6b, headLen, headWidth);
const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(), arrowLen, 0x51cf66, headLen, headWidth);
const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), new THREE.Vector3(), arrowLen, headLen, headWidth);
zArrow.setColor(new THREE.Color(0x4dabf7));
scene.add(xArrow, yArrow, zArrow);

/* ==================== Axis labels (cosmetic only) ==================== */
const labelX = makeLabelSprite("X", "#ff6b6b");
const labelY = makeLabelSprite("Y", "#51cf66");
const labelZ = makeLabelSprite("Z", "#4dabf7");
scene.add(labelX, labelY, labelZ);

function makeLabelSprite(text, color="#fff", px=80) {
  const size = 128;
  const cvs = document.createElement("canvas");
  cvs.width = size; cvs.height = size;
  const ctx = cvs.getContext("2d");
  ctx.clearRect(0,0,size,size);
  ctx.font = `bold ${px}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.strokeStyle = "#000"; ctx.lineWidth = 10; ctx.strokeText(text, size/2, size/2);
  ctx.lineWidth = 4; ctx.strokeText(text, size/2, size/2);
  ctx.fillStyle = color; ctx.fillText(text, size/2, size/2);
  const texture = new THREE.CanvasTexture(cvs);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.9,0.9,0.9);
  sprite.userData = { cvs, ctx, texture, color, px };
  return sprite;
}

function setLabel(sprite, text, color) {
  const { cvs, ctx, texture, px } = sprite.userData;
  const size = cvs.width;
  ctx.clearRect(0,0,size,size);
  ctx.font = `bold ${px}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.strokeStyle = "#000"; ctx.lineWidth = 10; ctx.strokeText(text, size/2, size/2);
  ctx.lineWidth = 4; ctx.strokeText(text, size/2, size/2);
  ctx.fillStyle = color; ctx.fillText(text, size/2, size/2);
  sprite.userData.color = color;
  texture.needsUpdate = true;
}

function updateAxisLabelPositions() {
  labelX.position.set(arrowLen + 0.5, 0, 0);
  labelY.position.set(0, arrowLen + 0.5, 0);
  labelZ.position.set(0, 0, arrowLen + 0.5);
}
updateAxisLabelPositions();

/* ==================== Vector + Projections + True Angle Arcs ==================== */
let vectorArrow = null;
let vectorTip   = null;

// persisted last valid vector
const lastVector = new THREE.Vector3(2, 1, 1.5);

// plane projections (lines from origin to projection point)
let projXY = null; // onto z=0
let projXZ = null; // onto y=0
let projYZ = null; // onto x=0
let showProjections = true;

// angle arcs (lines)
let azArc = null; // azimuth arc in XZ plane
let elArc = null; // elevation arc in plane {b̂, +Y}

// floating angle labels (sprites)
let azLabel = null;
let elLabel = null;

const matXY = new THREE.LineBasicMaterial({ color: 0xffd166 }); // yellow-ish
const matXZ = new THREE.LineBasicMaterial({ color: 0x74c0fc }); // blue-ish
const matYZ = new THREE.LineBasicMaterial({ color: 0x69db7c }); // green-ish

const matAz = new THREE.LineBasicMaterial({ color: 0xff922b }); // orange
const matEl = new THREE.LineBasicMaterial({ color: 0xb197fc }); // violet

function ensureLine(existing, material) {
  if (existing) return existing;
  const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geom, material);
  line.visible = true;
  scene.add(line);
  return line;
}

function ensureArc(existing, material) {
  if (existing) return existing;
  const geom = new THREE.BufferGeometry();
  const line = new THREE.Line(geom, material);
  line.visible = true;
  scene.add(line);
  return line;
}

function ensureText(existing, text, color, scale=0.75) {
  if (existing) {
    // update text if changed
    const { ctx, cvs, texture, px } = existing.userData;
    const size = cvs.width;
    ctx.clearRect(0,0,size,size);
    ctx.font = `bold ${px}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 10; ctx.strokeText(text, size/2, size/2);
    ctx.lineWidth = 4; ctx.strokeText(text, size/2, size/2);
    ctx.fillStyle = color; ctx.fillText(text, size/2, size/2);
    texture.needsUpdate = true;
    return existing;
  }
  const sprite = makeLabelSprite(text, color, 72);
  sprite.scale.set(scale, scale, scale);
  // keep labels always on top
  sprite.material.depthTest = false;
  sprite.material.depthWrite = false;
  scene.add(sprite);
  return sprite;
}

function updateProjections(x, y, z) {
  if (!showProjections) {
    clearProjectionsOnly();
    return;
  }
  // XY projection: (x,y,0)
  const pXY = new THREE.Vector3(x, y, 0);
  projXY = ensureLine(projXY, matXY);
  projXY.geometry.setFromPoints([new THREE.Vector3(0,0,0), pXY]);
  projXY.visible = true;

  // XZ projection: (x,0,z)
  const pXZ = new THREE.Vector3(x, 0, z);
  projXZ = ensureLine(projXZ, matXZ);
  projXZ.geometry.setFromPoints([new THREE.Vector3(0,0,0), pXZ]);
  projXZ.visible = true;

  // YZ projection: (0,y,z)
  const pYZ = new THREE.Vector3(0, y, z);
  projYZ = ensureLine(projYZ, matYZ);
  projYZ.geometry.setFromPoints([new THREE.Vector3(0,0,0), pYZ]);
  projYZ.visible = true;
}

function clearProjectionsOnly() {
  if (projXY) projXY.visible = false;
  if (projXZ) projXZ.visible = false;
  if (projYZ) projYZ.visible = false;
}

function clearArcs() {
  if (azArc) azArc.visible = false;
  if (elArc) elArc.visible = false;
}

function clearAngleLabels() {
  if (azLabel) azLabel.visible = false;
  if (elLabel) elLabel.visible = false;
}

/* ---------- Math helpers (the “physics”) ---------- */
function cartesianToSpherical(x, y, z) {
  const r  = Math.hypot(x, y, z);
  const az = Math.atan2(z, x);                 // θ in XZ plane (yaw around +Y from +X toward +Z)
  const el = Math.atan2(y, Math.hypot(x, z));  // φ above XZ plane
  return { r, az, el };
}

function sphericalToCartesian(r, az, el) {
  const x = r * Math.cos(el) * Math.cos(az);
  const y = r * Math.sin(el);
  const z = r * Math.cos(el) * Math.sin(az);
  return { x, y, z };
}

// Build azimuth arc in XZ plane from +X to angle azimuth
function buildAzimuthArcGeometry(azimuth, R, segments = 72) {
  const pts = [];
  const start = 0;
  const end   = azimuth;
  const step  = (end - start) / segments;
  for (let i = 0; i <= segments; i++) {
    const t = start + step * i;
    pts.push(new THREE.Vector3(Math.cos(t) * R, 0, Math.sin(t) * R));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// Build elevation arc in plane spanned by b̂ and +Y
function buildElevationArcGeometry(azimuth, elevation, R, segments = 72) {
  const bHat = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)); // bearing in XZ
  const yHat = new THREE.Vector3(0, 1, 0);
  const pts = [];
  const start = 0;
  const end   = elevation;
  const step  = (end - start) / segments;
  for (let i = 0; i <= segments; i++) {
    const t = start + step * i;
    const p = bHat.clone().multiplyScalar(Math.cos(t)).add(yHat.clone().multiplyScalar(Math.sin(t))).multiplyScalar(R);
    pts.push(p);
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/* ---------- Vector rendering ---------- */
function drawVectorTo(x, y, z) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    showError("Vector inputs must be finite numbers. Keeping previous vector.");
    applyVector(lastVector.x, lastVector.y, lastVector.z);
    return;
  }
  const r = Math.hypot(x, y, z);
  if (!(r > 1e-9)) {
    showError("Vector length is zero or too small. Keeping previous vector.");
    applyVector(lastVector.x, lastVector.y, lastVector.z);
    return;
  }
  hideError();
  lastVector.set(x, y, z);
  applyVector(x, y, z);
}

function applyVector(x, y, z) {
  if (vectorArrow) scene.remove(vectorArrow);
  if (vectorTip)   scene.remove(vectorTip);

  const dir = new THREE.Vector3(x, y, z).normalize();
  const len = Math.hypot(x, y, z);

  // main arrow + tip
  const color = 0xffe066;
  const head  = Math.min(0.6, Math.max(0.2, 0.2 * len));
  const headW = head * 0.7;

  vectorArrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), len, color, head, headW);
  scene.add(vectorArrow);

  const tipGeom = new THREE.SphereGeometry(0.06, 24, 24);
  const tipMat  = new THREE.MeshBasicMaterial({ color: 0xffffff });
  vectorTip = new THREE.Mesh(tipGeom, tipMat);
  vectorTip.position.set(x, y, z);
  scene.add(vectorTip);

  // projections
  clearProjectionsOnly();
  updateProjections(x, y, z);

  // precise arcs
  clearArcs();
  clearAngleLabels();

  const { az, el, r } = cartesianToSpherical(x, y, z);
  const R = Math.min(arrowLen * 0.9, Math.max(0.6, r * 0.6)); // readable radius

  // --- Azimuth arc (in XZ) ---
  azArc = ensureArc(azArc, matAz);
  azArc.geometry.dispose();
  azArc.geometry = buildAzimuthArcGeometry(az, R, 96);
  azArc.visible = true;

  // Midpoint label for azimuth at t = az/2, slightly lifted to avoid grid z-fight
  const tAz = az / 2;
  const azPos = new THREE.Vector3(Math.cos(tAz) * (R + 0.1), 0, Math.sin(tAz) * (R + 0.1));
  azPos.y += 0.02 * R; // tiny vertical lift
  const azDeg = (az * 180 / Math.PI).toFixed(1) + "°";
  azLabel = ensureText(azLabel, `θ ${azDeg}`, "#ff922b", 0.8);
  azLabel.position.copy(azPos);
  azLabel.visible = true;

  // --- Elevation arc (in plane {b̂, +Y}) ---
  elArc = ensureArc(elArc, matEl);
  elArc.geometry.dispose();
  elArc.geometry = buildElevationArcGeometry(az, el, R, 96);
  elArc.visible = true;

  // Midpoint label for elevation at t = el/2, offset along normal to that plane
  const bHat = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const yHat = new THREE.Vector3(0, 1, 0);
  const tEl = el / 2;
  const elPoint = bHat.clone().multiplyScalar(Math.cos(tEl)).add(yHat.clone().multiplyScalar(Math.sin(tEl))).multiplyScalar(R + 0.08);
  // normal to plane (b̂ × ŷ) — lives in XZ; offset a touch so text doesn't overlap line
  const n = bHat.clone().cross(yHat).normalize().multiplyScalar(0.04 * R);
  const elPos = elPoint.add(n);
  const elDeg = (el * 180 / Math.PI).toFixed(1) + "°";
  elLabel = ensureText(elLabel, `φ ${elDeg}`, "#b197fc", 0.8);
  elLabel.position.copy(elPos);
  elLabel.visible = true;

  // Numeric readout
  if (vectorReadout) {
    const u = unitsInput?.value ?? "";
    vectorReadout.textContent =
      `Vector → (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) ${u} | ` +
      `Azimuth θ: ${azDeg}  Elevation φ: ${elDeg}  Range r: ${r.toFixed(3)} ${u}`;
  }
}

/* ==================== Controls (CAD-style) ==================== */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.mouseButtons = {
  LEFT:   THREE.MOUSE.DOLLY,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT:  THREE.MOUSE.ROTATE
};
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

function resetView() {
  camera.position.set(6, 5, 8);
  controls.target.set(0, 0, 0);
  controls.update();
}
resetView();
document.getElementById("reset-view")?.addEventListener("click", resetView);

/* ==================== Animate & Resize ==================== */
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ==================== UI wiring ==================== */
const $ = (sel) => document.querySelector(sel);

// Axis labels (cosmetic only)
$("#label-x")?.addEventListener("change", (e) => { setLabel(labelX, e.target.value, "#ff6b6b"); applyVector(lastVector.x, lastVector.y, lastVector.z); });
$("#label-y")?.addEventListener("change", (e) => { setLabel(labelY, e.target.value, "#51cf66"); applyVector(lastVector.x, lastVector.y, lastVector.z); });
$("#label-z")?.addEventListener("change", (e) => { setLabel(labelZ, e.target.value, "#4dabf7"); applyVector(lastVector.x, lastVector.y, lastVector.z); });

// Vector input mode toggles
const cartesianBox = $("#cartesian");
const anglesBox = $("#angles");
document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener("change", () => {
    const mode = getMode();
    if (cartesianBox) cartesianBox.style.display = (mode === "cartesian") ? "" : "none";
    if (anglesBox)   anglesBox.style.display   = (mode === "angles") ? "" : "none";
  });
});
function getMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "cartesian";
}

function safeNumber(str, fallback = 0) {
  const v = typeof str === "string" || typeof str === "number" ? Number(str) : NaN;
  if (!isFinite(v)) return { ok: false, value: fallback };
  if (Math.abs(v) > 1e6) return { ok: false, value: fallback };
  return { ok: true, value: v };
}

// Vector inputs & buttons
const cx = $("#cx"), cy = $("#cy"), cz = $("#cz");
const ar = $("#ar"), aaz = $("#aaz"), ael = $("#ael");
const unitsInput = $("#units");
const vectorReadout = $("#vector-readout");
const showProjChk = $("#show-projections");

function showError(msg) {
  if (!vectorReadout) return;
  vectorReadout.textContent = `⚠ ${msg}`;
  vectorReadout.style.color = "#ffb4b4";
}
function hideError() {
  if (!vectorReadout) return;
  vectorReadout.style.color = "#b8c1d1";
}

showProjChk?.addEventListener("change", () => {
  showProjections = !!showProjChk.checked;
  if (!showProjections) clearProjectionsOnly();
  applyVector(lastVector.x, lastVector.y, lastVector.z);
});

$("#update-vector")?.addEventListener("click", () => {
  let x, y, z;

  if (getMode() === "cartesian") {
    const px = safeNumber(cx?.value);
    const py = safeNumber(cy?.value);
    const pz = safeNumber(cz?.value);
    if (!px.ok || !py.ok || !pz.ok) { showError("Enter numeric X, Y, Z."); applyVector(lastVector.x, lastVector.y, lastVector.z); return; }
    x = px.value; y = py.value; z = pz.value;

  } else {
    // physics: x = r cosφ cosθ; y = r sinφ; z = r cosφ sinθ
    const pr  = safeNumber(ar?.value);
    const paz = safeNumber(aaz?.value);
    const pel = safeNumber(ael?.value);
    if (!pr.ok || !paz.ok || !pel.ok) { showError("Enter numeric Range/Azimuth/Elevation."); applyVector(lastVector.x, lastVector.y, lastVector.z); return; }
    const r  = Math.max(0, pr.value);
    const az = paz.value * Math.PI / 180;
    const el = pel.value * Math.PI / 180;
    const c = sphericalToCartesian(r, az, el);
    x = c.x; y = c.y; z = c.z;
  }

  drawVectorTo(x, y, z);
});

$("#clear-vector")?.addEventListener("click", () => {
  if (vectorArrow) { scene.remove(vectorArrow); vectorArrow = null; }
  if (vectorTip)   { scene.remove(vectorTip);   vectorTip   = null; }
  clearProjectionsOnly();
  clearArcs();
  clearAngleLabels();
  if (vectorReadout) vectorReadout.textContent = "";
});

// Cube dimensions
const bw = $("#bw"), bh = $("#bh"), bd = $("#bd");
$("#apply-box")?.addEventListener("click", () => {
  const pw = safeNumber(bw?.value, 2);
  const ph = safeNumber(bh?.value, 2);
  const pd = safeNumber(bd?.value, 2);

  if (!pw.ok || !ph.ok || !pd.ok || pw.value <= 0 || ph.value <= 0 || pd.value <= 0) {
    showError("Cube dimensions must be positive numbers.");
    return;
  }

  const w = Math.max(0.01, pw.value);
  const h = Math.max(0.01, ph.value);
  const d = Math.max(0.01, pd.value);

  const parent = cube.parent;
  parent.remove(cube);
  cube.geometry.dispose();
  cube.material.dispose();
  cube = createCube(w, h, d);
  parent.add(cube);

  hideError();
});

// steady label placement
(function steady(){
  updateAxisLabelPositions();
  requestAnimationFrame(steady);
})();

// initial vector
applyVector(lastVector.x, lastVector.y, lastVector.z);
