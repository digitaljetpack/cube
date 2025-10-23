import * as THREE from "/vendor/three/build/three.module.js";
import { OrbitControls } from "/vendor/OrbitControls.js";

const canvas = document.getElementById("viewport");

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0c0f14, 1);

// ---------- Scene & Camera ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0c0f14, 20, 80);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
scene.add(camera);

// ---------- Lights ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(6, 10, 6);
dir.castShadow = true;
scene.add(dir);

// ---------- Grid ----------
const grid = new THREE.GridHelper(200, 200, 0x293241, 0x1a1f29);
grid.material.opacity = 0.25;
grid.material.transparent = true;
scene.add(grid);

// ---------- Transparent cube (resizable) ----------
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

// Invisible ground plane (y = 0)
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ visible: false })
);
scene.add(groundPlane);

// ---------- Axis arrows ----------
const arrowLen = 3.5, headLen = 0.9, headWidth = 0.6;
const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(), arrowLen, 0xff6b6b, headLen, headWidth);
const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(), arrowLen, 0x51cf66, headLen, headWidth);
const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), new THREE.Vector3(), arrowLen, 0x4dabf7, headLen, headWidth);
scene.add(xArrow, yArrow, zArrow);

// ---------- Axis label sprites (cosmetic only) ----------
const labelX = makeLabelSprite("X", "#ff6b6b");
const labelY = makeLabelSprite("Y", "#51cf66");
const labelZ = makeLabelSprite("Z", "#4dabf7");
scene.add(labelX, labelY, labelZ);

function makeLabelSprite(text, color="#fff") {
  const size = 128;
  const cvs = document.createElement("canvas");
  cvs.width = size; cvs.height = size;
  const ctx = cvs.getContext("2d");
  ctx.clearRect(0,0,size,size);
  ctx.font = "bold 80px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.strokeStyle = "#000"; ctx.lineWidth = 10; ctx.strokeText(text, size/2, size/2);
  ctx.lineWidth = 4; ctx.strokeText(text, size/2, size/2);
  ctx.fillStyle = color; ctx.fillText(text, size/2, size/2);
  const texture = new THREE.CanvasTexture(cvs);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.9,0.9,0.9);
  sprite.userData = { cvs, ctx, texture, color };
  return sprite;
}

function setLabel(sprite, text, color) {
  const { cvs, ctx, texture } = sprite.userData;
  const size = cvs.width;
  ctx.clearRect(0,0,size,size);
  ctx.font = "bold 80px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
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

// ---------- Vector + Projections + Angle Arcs ----------
let vectorArrow = null;
let vectorTip = null;

// persisted last valid vector
const lastVector = new THREE.Vector3(2, 1, 1.5);

// plane projection lines
let projXY = null; // onto z=0
let projXZ = null; // onto y=0
let projYZ = null; // onto x=0
let showProjections = true;

// angle arcs
let azArc = null; // azimuth arc on XY plane (from +X to XY-projection dir)
let elArc = null; // elevation arc between XZ-projection and vector

const matXY = new THREE.LineBasicMaterial({ color: 0xffd166 });
const matXZ = new THREE.LineBasicMaterial({ color: 0x74c0fc });
const matYZ = new THREE.LineBasicMaterial({ color: 0x69db7c });

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
  const geom = new THREE.BufferGeometry(); // will set points dynamically
  const line = new THREE.Line(geom, material);
  line.visible = true;
  scene.add(line);
  return line;
}

function updateProjections(x, y, z) {
  if (!showProjections) {
    clearProjectionsOnly();
    return;
  }

  // XY projection: (x, y, 0)
  const pXY = new THREE.Vector3(x, y, 0);
  projXY = ensureLine(projXY, matXY);
  projXY.geometry.setFromPoints([new THREE.Vector3(0,0,0), pXY]);
  projXY.visible = true;

  // XZ projection: (x, 0, z)
  const pXZ = new THREE.Vector3(x, 0, z);
  projXZ = ensureLine(projXZ, matXZ);
  projXZ.geometry.setFromPoints([new THREE.Vector3(0,0,0), pXZ]);
  projXZ.visible = true;

  // YZ projection: (0, y, z)
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

// Spherical linear interpolation for unit vectors
function slerpUnit(u, v, t) {
  const dot = THREE.MathUtils.clamp(u.dot(v), -1, 1);
  const omega = Math.acos(dot);
  if (omega < 1e-6) return v.clone(); // almost identical
  const sinO = Math.sin(omega);
  const s1 = Math.sin((1 - t) * omega) / sinO;
  const s2 = Math.sin(t * omega) / sinO;
  return u.clone().multiplyScalar(s1).add(v.clone().multiplyScalar(s2));
}

// Build an arc line between two unit vectors, centered at origin, with radius R
function buildArc(u, v, R, segments = 48) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dir = slerpUnit(u, v, t);
    pts.push(dir.multiplyScalar(R));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  return geom;
}

function updateAzimuthArc(x, y, z, R) {
  // Azimuth defined around +Y from +X to projection onto XY
  const vXY = new THREE.Vector3(x, y, 0);
  const lenXY = vXY.length();
  if (lenXY < 1e-9) { if (azArc) azArc.visible = false; return; }

  const u = new THREE.Vector3(1, 0, 0);       // +X
  const v = vXY.normalize();                   // unit projection dir (XY)
  azArc = ensureArc(azArc, matAz);
  azArc.geometry.dispose();
  azArc.geometry = buildArc(u, v, R, 64);
  azArc.visible = true;
}

function updateElevationArc(x, y, z, R) {
  // Elevation = angle above XZ plane.
  // Arc between unit(XZ-projection) and unit(full vector).
  const vXZ = new THREE.Vector3(x, 0, z);
  const lenXZ = vXZ.length();
  if (lenXZ < 1e-9) { if (elArc) elArc.visible = false; return; }

  const u = vXZ.normalize();                   // unit projection on XZ
  const v = new THREE.Vector3(x, y, z).normalize(); // unit full vector
  elArc = ensureArc(elArc, matEl);
  elArc.geometry.dispose();
  elArc.geometry = buildArc(u, v, R, 64);
  elArc.visible = true;
}

function computeAnglesDeg(x, y, z) {
  const az = Math.atan2(z, x) * 180 / Math.PI;             // yaw around +Y from +X
  const el = Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI; // pitch above XZ plane
  return { az, el };
}

function drawVectorTo(x, y, z) {
  // Guard: NaN/invalid inputs → keep previous vector
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
    showError("Vector inputs must be finite numbers. Keeping previous vector.");
    applyVector(lastVector.x, lastVector.y, lastVector.z);
    return;
  }
  const len = Math.hypot(x, y, z);
  if (!(len > 1e-9)) {
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
  if (vectorTip) scene.remove(vectorTip);

  const dir = new THREE.Vector3(x, y, z).normalize();
  const len = Math.hypot(x, y, z);

  const color = 0xffe066;
  const head = Math.min(0.6, Math.max(0.2, 0.2 * len));
  const headW = head * 0.7;

  vectorArrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), len, color, head, headW);
  scene.add(vectorArrow);

  const tipGeom = new THREE.SphereGeometry(0.06, 24, 24);
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  vectorTip = new THREE.Mesh(tipGeom, tipMat);
  vectorTip.position.set(x, y, z);
  scene.add(vectorTip);

  // projections + arcs
  clearProjectionsOnly();
  updateProjections(x, y, z);

  clearArcs();
  const R = Math.min(arrowLen * 0.9, Math.max(0.6, len * 0.6)); // nice sized arc radius
  updateAzimuthArc(x, y, z, R);
  updateElevationArc(x, y, z, R);

  // update numeric readout
  if (vectorReadout) {
    const u = unitsInput?.value ?? "";
    const { az, el } = computeAnglesDeg(x, y, z);
    vectorReadout.textContent =
      `Vector → (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) ${u} | ` +
      `Azimuth: ${az.toFixed(1)}°  Elevation: ${el.toFixed(1)}°`;
  }
}

function deg2rad(d) { return d * Math.PI / 180; }

// ---------- Controls (CAD-style) ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; // simplified local OrbitControls
controls.mouseButtons = {
  LEFT:   THREE.MOUSE.DOLLY,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT:  THREE.MOUSE.ROTATE
};
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

// Reset view
function resetView() {
  camera.position.set(6, 5, 8);
  controls.target.set(0, 0, 0);
  controls.update();
}
resetView();
document.getElementById("reset-view")?.addEventListener("click", resetView);

// ---------- Animate ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---------- Resize ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- UI wiring ----------
const $ = (sel) => document.querySelector(sel);

// Axis labels (cosmetic only)
$("#label-x")?.addEventListener("change", (e) => {
  setLabel(labelX, e.target.value, "#ff6b6b");
  applyVector(lastVector.x, lastVector.y, lastVector.z);
});
$("#label-y")?.addEventListener("change", (e) => {
  setLabel(labelY, e.target.value, "#51cf66");
  applyVector(lastVector.x, lastVector.y, lastVector.z);
});
$("#label-z")?.addEventListener("change", (e) => {
  setLabel(labelZ, e.target.value, "#4dabf7");
  applyVector(lastVector.x, lastVector.y, lastVector.z);
});

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
  if (Math.abs(v) > 1e6) return { ok: false, value: fallback }; // clamp absurd
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

    if (!px.ok || !py.ok || !pz.ok) {
      showError("Please enter valid numeric X, Y, Z values.");
      applyVector(lastVector.x, lastVector.y, lastVector.z);
      return;
    }

    x = px.value; y = py.value; z = pz.value;

  } else {
    const pr = safeNumber(ar?.value);
    const paz = safeNumber(aaz?.value);
    const pel = safeNumber(ael?.value);

    if (!pr.ok || !paz.ok || !pel.ok) {
      showError("Please enter valid numeric Range/Azimuth/Elevation.");
      applyVector(lastVector.x, lastVector.y, lastVector.z);
      return;
    }

    const r  = Math.max(0, pr.value);
    const az = deg2rad(paz.value);
    const el = deg2rad(pel.value);

    x = r * Math.cos(el) * Math.cos(az);
    y = r * Math.sin(el);
    z = r * Math.cos(el) * Math.sin(az);
  }

  drawVectorTo(x, y, z);
});

$("#clear-vector")?.addEventListener("click", () => {
  if (vectorArrow) { scene.remove(vectorArrow); vectorArrow = null; }
  if (vectorTip)   { scene.remove(vectorTip);   vectorTip   = null; }
  clearProjectionsOnly();
  clearArcs();
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

// draw initial vector & arcs
applyVector(lastVector.x, lastVector.y, lastVector.z);
