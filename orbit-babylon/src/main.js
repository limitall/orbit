import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import '@babylonjs/core/Culling/ray.js'; // side-effect: enables scene.pick / picking
import { BrickProceduralTexture } from '@babylonjs/procedural-textures/brick/brickProceduralTexture.js';
import { PBRMetallicRoughnessMaterial } from '@babylonjs/core/Materials/PBR/pbrMetallicRoughnessMaterial.js';
import '@babylonjs/core/Materials/standardMaterial.js';
// PBR materials reference these shaders; bundle them so Babylon doesn't fetch
// them at runtime (Vite serves index.html for those requests -> shader fails).
import '@babylonjs/core/Shaders/rgbdDecode.fragment.js';
import '@babylonjs/core/Shaders/rgbdEncode.fragment.js';

const canvas = document.getElementById('renderCanvas');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.051, 0.063, 1);

// Camera
const camera = new ArcRotateCamera('cam', -Math.PI / 4, 1.28, 120, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.inertia = 0.5; // settle quickly so edit-mode clicks are precise
camera.wheelDeltaPercentage = 0.01;
camera.lowerRadiusLimit = 10;
camera.upperRadiusLimit = 600;
camera.minZ = 0.1;
camera.maxZ = 5000;

// Lights
const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
hemi.intensity = 0.55;
hemi.groundColor = new Color3(0.25, 0.27, 0.3);

const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, -0.45), scene);
sun.position = new Vector3(80, 160, 60);
sun.intensity = 2.4;

// Concrete-ish material per Blender material name
const matCache = new Map();
function getMaterial(name, color) {
  if (matCache.has(name)) return matCache.get(name);
  const m = new PBRMetallicRoughnessMaterial(name || 'mat', scene);
  m.baseColor = new Color3(color[0], color[1], color[2]);
  m.metallic = 0.0;
  m.roughness = 0.92;
  m.backFaceCulling = false; // axis swap can flip winding; supplied normals keep lighting correct
  matCache.set(name, m);
  return m;
}

function setStatus(text) {
  const el = document.getElementById('stats');
  if (el) el.innerHTML = text;
}

// Plan-view (top-down orthographic) support
let buildingSpan = 100;
let buildingCenter = new Vector3(0, 0, 0);
let buildingMin = new Vector3(0, 0, 0);
let buildingMax = new Vector3(0, 0, 0);
let planView = false;

// --- Interactive 3D facades ---
// Each polygonized face of an elevation is its own pickable tile. A tile is either
// WALL (solid, shown) or OPENING (hidden -> a real cut hole). In Edit mode every
// tile is shown (openings tinted red) and clicking a tile toggles wall/opening.
const FACES = ['front', 'left', 'right'];
const facadeTiles = {};                 // kind -> [{ mesh, open }]
const elevationLines = {};              // kind -> LineSystem (blue DXF guide)
const facadeOn = { front: false, left: false, right: false };
let editMode = false;
let showLines = true;
let openMat = null;

function refreshLines() {
  for (const kind of FACES) {
    const ls = elevationLines[kind];
    if (ls) ls.setEnabled(facadeOn[kind] && showLines);
  }
}

function wallMaterial() { return getMaterial('Facade', [0.82, 0.80, 0.76]); }
let frontMat = null;
function frontMaterial() {
  if (!frontMat) {
    const brick = new BrickProceduralTexture('brickTex', 1024, scene);
    brick.numberOfBricksHeight = 13;   // bricks per ~1 m of UV
    brick.numberOfBricksWidth = 4;
    brick.brickColor = new Color3(0.55, 0.21, 0.16);  // red brick
    brick.jointColor = new Color3(0.80, 0.76, 0.71);  // mortar
    brick.wrapU = 1; brick.wrapV = 1;                  // WRAP (UVs are in metres)
    frontMat = new PBRMetallicRoughnessMaterial('FrontBrick', scene);
    frontMat.baseTexture = brick;
    frontMat.metallic = 0; frontMat.roughness = 0.95;
    frontMat.backFaceCulling = false;
  }
  return frontMat;
}
function wallMaterialFor(kind) { return kind === 'front' ? frontMaterial() : wallMaterial(); }
function openMaterial() {
  if (!openMat) {
    openMat = new PBRMetallicRoughnessMaterial('openMat', scene);
    openMat.baseColor = new Color3(0.95, 0.32, 0.22);
    openMat.metallic = 0; openMat.roughness = 0.9; openMat.backFaceCulling = false;
  }
  return openMat;
}

function buildFacadeTiles(data) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('orbitCuts') || '{}'); } catch (e) { /* ignore */ }
  loadXform();
  for (const kind of FACES) {
    facadeRoot[kind] = new TransformNode('facadeRoot_' + kind, scene);
    const savedKind = saved[kind];
    const openSet = savedKind ? new Set(savedKind) : null;
    facadeTiles[kind] = (data[kind] || []).map((t, idx) => {
      const mesh = new Mesh(`tile_${kind}_${idx}`, scene);
      const vd = new VertexData();
      vd.positions = t.p; vd.indices = t.i; vd.normals = t.n;
      if (kind === 'front') {
        // planar UVs in metres (front face lies in the XY plane) for brick tiling
        const uvs = [];
        for (let i = 0; i < t.p.length; i += 3) uvs.push(t.p[i], t.p[i + 1]);
        vd.uvs = uvs;
      }
      vd.applyToMesh(mesh);
      mesh.material = wallMaterialFor(kind);
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isPickable = true;
      mesh.parent = facadeRoot[kind];
      mesh.setEnabled(false);
      const tile = { mesh, kind, open: openSet ? openSet.has(idx) : !!t.open };
      mesh.metadata = { tile };
      return tile;
    });
    applyFacadeTransform(kind);
  }
}

// Current cut selection -> { front:[indices], left:[...], right:[...] }
function getCuts() {
  const out = {};
  for (const kind of FACES) {
    out[kind] = (facadeTiles[kind] || []).map((t, i) => (t.open ? i : -1)).filter((i) => i >= 0);
  }
  return out;
}
function saveCuts() {
  try { localStorage.setItem('orbitCuts', JSON.stringify(getCuts())); } catch (e) { /* ignore */ }
}
window.__getCuts = getCuts; // so the selection can be read/exported

// --- live façade placement (move + scale), saved in localStorage ---
const facadeRoot = {};   // kind -> TransformNode (parents that face's tiles + guide lines)
const facadeXform = {};  // kind -> { ox, oy, oz, sw, sh }
// baked-in default placement (from the user's aligned values) — used on fresh load
const DEFAULT_XFORM = {
  front: { along: 3.5, up: -1, depth: 0.2, sw: 1.015, sh: 1 },
  left: { along: 0, up: 0, depth: 0, sw: 1, sh: 1 },
  right: { along: 0, up: 0, depth: 0, sw: 1, sh: 1 },
};
function loadXform() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('orbitFacadeXform') || '{}'); } catch (e) { /* ignore */ }
  // semantic fields: along=sideways, up=vertical, depth=in/out, sw=width, sh=height
  for (const k of FACES) {
    facadeXform[k] = Object.assign({ along: 0, up: 0, depth: 0, sw: 1, sh: 1 }, DEFAULT_XFORM[k], s[k] || {});
  }
}
function saveXform() {
  try { localStorage.setItem('orbitFacadeXform', JSON.stringify(facadeXform)); } catch (e) { /* ignore */ }
}
function applyFacadeTransform(kind) {
  const n = facadeRoot[kind];
  if (!n) return;
  const t = facadeXform[kind];
  const px = buildingCenter.x, py = buildingMin.y, pz = buildingCenter.z;
  if (kind === 'front' || kind === 'back') {
    // width along X about centre, height along Y about ground, depth = Z, along = X
    n.scaling.set(t.sw, t.sh, 1);
    n.position.set(t.along + (1 - t.sw) * px, t.up + (1 - t.sh) * py, t.depth);
  } else { // left / right: width along Z, depth = X, along = Z
    n.scaling.set(1, t.sh, t.sw);
    n.position.set(t.depth, t.up + (1 - t.sh) * py, t.along + (1 - t.sw) * pz);
  }
}
window.__getXform = () => facadeXform;

function refreshFacade(kind) {
  for (const tile of facadeTiles[kind] || []) {
    if (!facadeOn[kind]) { tile.mesh.setEnabled(false); continue; }
    if (editMode) {
      tile.mesh.setEnabled(true);
      tile.mesh.material = tile.open ? openMaterial() : wallMaterialFor(kind);
    } else {
      tile.mesh.setEnabled(!tile.open);
      tile.mesh.material = wallMaterialFor(kind);
    }
  }
}

// Blue DXF elevation line-work, sitting just proud of the facade as a guide.
async function buildElevationLines(kind) {
  const res = await fetch('/' + kind + '_elevation.json');
  if (!res.ok) return;
  const data = await res.json();
  const oy = buildingMin.y;
  const off = 0.36; // 0.06 m proud of the facade outer face
  let toPos;
  if (kind === 'front') {
    const ox = buildingCenter.x - data.width / 2;
    toPos = (h, v) => new Vector3(ox + h, oy + v, buildingMin.z - off);
  } else if (kind === 'left') {
    const oz = buildingCenter.z - data.width / 2;
    toPos = (h, v) => new Vector3(buildingMin.x - off, oy + v, oz + h);
  } else { // right
    const oz = buildingCenter.z - data.width / 2;
    toPos = (h, v) => new Vector3(buildingMax.x + off, oy + v, oz + h);
  }
  const lines = data.lines.map((pl) => pl.map(([h, v]) => toPos(h, v)));
  const ls = CreateLineSystem('elevLines_' + kind, { lines }, scene);
  ls.color = new Color3(0.25, 0.7, 1.0);
  ls.isPickable = false;
  ls.renderingGroupId = 1; // draw on top of the facade so the guide is always visible
  if (facadeRoot[kind]) ls.parent = facadeRoot[kind];
  ls.setEnabled(false);
  elevationLines[kind] = ls;
}

function setFacadeEnabled(kind, on) {
  facadeOn[kind] = on;
  refreshFacade(kind);
  refreshLines();
}

function setEditMode(on) {
  editMode = on;
  for (const kind of FACES) refreshFacade(kind);
  const hint = document.getElementById('editHint');
  if (hint) hint.style.display = on ? 'block' : 'none';
}

// click a façade region to toggle wall <-> opening while editing.
// POINTERPICK fires only on a genuine tap on a pickable mesh, with pickInfo
// computed by Babylon using the correct device coordinates.
function toggleTileFromPick(pickInfo) {
  const mesh = pickInfo && pickInfo.pickedMesh;
  const tile = mesh && mesh.metadata && mesh.metadata.tile;
  if (!tile) return;
  tile.open = !tile.open;
  tile.mesh.material = tile.open ? openMaterial() : wallMaterialFor(tile.kind);
  saveCuts();
}
scene.onPointerObservable.add((pi) => {
  if (!editMode) return;
  if (pi.type === PointerEventTypes.POINTERPICK) toggleTileFromPick(pi.pickInfo);
});

function updateOrtho() {
  const aspect = engine.getRenderWidth() / engine.getRenderHeight();
  const half = buildingSpan * 0.6;
  camera.orthoTop = half;
  camera.orthoBottom = -half;
  camera.orthoLeft = -half * aspect;
  camera.orthoRight = half * aspect;
}

// Original DXF plans per floor, overlaid as line-work aligned to each model floor.
async function buildDxfOverlays(floorGroups) {
  const res = await fetch('/floor_plans.json');
  if (!res.ok) return {};
  const data = await res.json();
  const overlays = {};
  for (const floor of FLOOR_ORDER) {
    const fd = data.floors?.[floor];
    const meshes = floorGroups[floor];
    if (!fd || !meshes) continue;
    // align to the model floor's wall bbox min-corner (exclude the slab)
    let mnX = Infinity, mnZ = Infinity, mnY = Infinity;
    for (const m of meshes) {
      if (m.metadata?.isSlab) continue;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      mnX = Math.min(mnX, bb.minimumWorld.x);
      mnZ = Math.min(mnZ, bb.minimumWorld.z);
      mnY = Math.min(mnY, bb.minimumWorld.y);
    }
    if (!isFinite(mnX)) continue;
    const lines = fd.lines.map((pl) =>
      pl.map(([x, z]) => new Vector3(mnX + x, mnY + 0.02, mnZ + z))
    );
    const ls = CreateLineSystem('dxf_' + floor, { lines }, scene);
    ls.color = new Color3(1.0, 0.28, 0.16);
    ls.isPickable = false;
    ls.renderingGroupId = 1; // draw on top so it shows through walls/slab in plan view
    ls.setEnabled(false);
    overlays[floor] = ls;
  }
  return overlays;
}

function setPlanView(on) {
  planView = on;
  if (on) {
    camera.setTarget(buildingCenter.clone());
    camera.alpha = -Math.PI / 2; // north up
    camera.beta = 0.0001;        // straight down
    updateOrtho();
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  } else {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.alpha = -Math.PI / 4;
    camera.beta = 1.28;
    camera.radius = buildingSpan * 1.7;
  }
}

// Order floors appear bottom -> top. "Columns" span all floors (single mesh).
const FLOOR_ORDER = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Terrace'];

function classifyFloor(meshName) {
  if (/column/i.test(meshName)) return 'Columns';
  const suffix = meshName.split('.')[0].split('_').pop(); // "Walls_Ground" -> "Ground"
  return FLOOR_ORDER.includes(suffix) ? suffix : 'Other';
}

function buildFloorUI(floorGroups, dxfOverlays = {}, elevations = {}, hasFacades = false) {
  const panel = document.getElementById('floors');
  panel.innerHTML = '';

  const state = { active: 'All', showColumns: true, showSlabs: true, dxfOn: false };
  const floors = FLOOR_ORDER.filter((f) => floorGroups[f]?.length);

  const apply = () => {
    for (const m of floorGroups.Columns || []) m.setEnabled(state.showColumns);
    for (const f of floors) {
      const floorVisible = state.active === 'All' || state.active === f;
      for (const m of floorGroups[f]) {
        const isSlab = m.metadata?.isSlab;
        m.setEnabled(floorVisible && (!isSlab || state.showSlabs));
      }
    }
    // DXF overlay follows the active floor (only shown when one floor is isolated)
    for (const [f, ls] of Object.entries(dxfOverlays)) {
      ls.setEnabled(state.dxfOn && state.active === f);
    }
    panel.querySelectorAll('button[data-floor]').forEach((b) => {
      b.classList.toggle('active', b.dataset.floor === state.active);
    });
  };

  const mkToggle = (labelText, key) => {
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state[key];
    cb.onchange = () => { state[key] = cb.checked; apply(); };
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(labelText));
    panel.appendChild(lbl);
  };

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'Floors';
  panel.appendChild(title);

  const mkBtn = (label, floor) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.floor = floor;
    b.onclick = () => { state.active = floor; apply(); };
    panel.appendChild(b);
  };

  mkBtn('All floors', 'All');
  // top floor first in the list so the panel reads like the building elevation
  for (const f of [...floors].reverse()) mkBtn(f, f);

  const sep = document.createElement('div');
  sep.className = 'sep';
  panel.appendChild(sep);
  if (floorGroups.Columns?.length) mkToggle('Columns', 'showColumns');
  mkToggle('Slabs', 'showSlabs');

  const sep2 = document.createElement('div');
  sep2.className = 'sep';
  panel.appendChild(sep2);
  const planBtn = document.createElement('button');
  planBtn.textContent = 'Plan view (top)';
  planBtn.onclick = () => {
    const on = !planBtn.classList.contains('active');
    planBtn.classList.toggle('active', on);
    setPlanView(on);
  };
  panel.appendChild(planBtn);

  if (Object.keys(dxfOverlays).length) {
    const dxfBtn = document.createElement('button');
    dxfBtn.textContent = 'DXF plan overlay';
    dxfBtn.title = 'Overlays the original DXF plan of the selected floor';
    dxfBtn.onclick = () => {
      state.dxfOn = !state.dxfOn;
      dxfBtn.classList.toggle('active', state.dxfOn);
      if (state.dxfOn && state.active === 'All') { // need a single floor to overlay
        state.active = 'Ground';
      }
      apply();
    };
    panel.appendChild(dxfBtn);
  }

  for (const [name, mesh] of Object.entries(elevations)) {
    if (!mesh) continue;
    const elevBtn = document.createElement('button');
    elevBtn.textContent = name + ' elevation';
    elevBtn.title = 'Show the DXF ' + name + ' elevation as a standing facade panel';
    elevBtn.onclick = () => {
      const on = !elevBtn.classList.contains('active');
      elevBtn.classList.toggle('active', on);
      mesh.setEnabled(on);
    };
    panel.appendChild(elevBtn);
  }

  if (hasFacades) {
    const sepF = document.createElement('div');
    sepF.className = 'sep';
    panel.appendChild(sepF);

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit windows';
    editBtn.title = 'Click a façade region to toggle wall ↔ cut opening';
    editBtn.onclick = () => {
      const on = !editBtn.classList.contains('active');
      editBtn.classList.toggle('active', on);
      setEditMode(on);
    };
    panel.appendChild(editBtn);

    const linesBtn = document.createElement('button');
    linesBtn.textContent = 'Blue guide lines';
    linesBtn.classList.toggle('active', showLines);
    linesBtn.title = 'Show / hide the DXF elevation guide lines';
    linesBtn.onclick = () => {
      showLines = !showLines;
      linesBtn.classList.toggle('active', showLines);
      refreshLines();
    };
    panel.appendChild(linesBtn);

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Copy cuts + placement to the clipboard';
    exportBtn.onclick = () => {
      const json = JSON.stringify({ cuts: getCuts(), placement: facadeXform });
      if (navigator.clipboard) navigator.clipboard.writeText(json);
      console.log('[export] ' + json);
      const prev = exportBtn.textContent;
      exportBtn.textContent = 'Copied!';
      setTimeout(() => { exportBtn.textContent = prev; }, 1200);
    };
    panel.appendChild(exportBtn);

    // --- façade alignment: pick a face, then adjust ---
    const sepA = document.createElement('div');
    sepA.className = 'sep';
    panel.appendChild(sepA);
    const hd = document.createElement('div');
    hd.className = 'title';
    hd.textContent = 'Adjust façade';
    panel.appendChild(hd);

    let adjustFace = 'front';
    const sliders = {};
    const faceBtns = {};
    const syncSliders = () => {
      for (const k in sliders) sliders[k].value = facadeXform[adjustFace][k];
    };
    const faceRow = document.createElement('div');
    faceRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;';
    for (const f of FACES) {
      const fb = document.createElement('button');
      fb.textContent = f[0].toUpperCase() + f.slice(1);
      fb.style.cssText = 'flex:1;margin:0;padding:5px 2px;text-align:center;';
      fb.classList.toggle('active', f === adjustFace);
      fb.onclick = () => {
        adjustFace = f;
        for (const k in faceBtns) faceBtns[k].classList.toggle('active', k === f);
        syncSliders();
      };
      faceBtns[f] = fb;
      faceRow.appendChild(fb);
    }
    panel.appendChild(faceRow);

    const mkSlider = (label, key, min, max, step) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
      const lab = document.createElement('span');
      lab.textContent = label;
      lab.style.cssText = 'width:46px;font-size:11px;color:#9aa1ab;';
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
      inp.value = facadeXform[adjustFace][key];
      inp.style.flex = '1';
      inp.oninput = () => {
        facadeXform[adjustFace][key] = parseFloat(inp.value);
        applyFacadeTransform(adjustFace);
        saveXform();
      };
      wrap.appendChild(lab); wrap.appendChild(inp);
      panel.appendChild(wrap);
      sliders[key] = inp;
    };
    mkSlider('Width', 'sw', 0.6, 1.6, 0.005);
    mkSlider('Height', 'sh', 0.6, 1.6, 0.005);
    mkSlider('← →', 'along', -10, 10, 0.1);
    mkSlider('↑ ↓', 'up', -6, 6, 0.1);
    mkSlider('In/Out', 'depth', -5, 5, 0.1);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset face';
    resetBtn.onclick = () => {
      facadeXform[adjustFace] = { along: 0, up: 0, depth: 0, sw: 1, sh: 1 };
      applyFacadeTransform(adjustFace); saveXform(); syncSliders();
    };
    panel.appendChild(resetBtn);
  }

  apply();
  panel.style.display = 'block';
}

async function loadBuilding() {
  const res = await fetch('/building.json');
  if (!res.ok) throw new Error('Failed to load building.json: ' + res.status);
  const data = await res.json();

  const root = new TransformNode('buildingRoot', scene);
  let totalTris = 0;
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  const floorGroups = {}; // floorName -> [meshes]

  for (const m of data.meshes) {
    const mesh = new Mesh(m.name, scene);
    const vd = new VertexData();
    vd.positions = m.positions;
    vd.indices = m.indices;
    vd.normals = m.normals;
    vd.applyToMesh(mesh);
    mesh.material = getMaterial(m.material, m.color);
    mesh.parent = root;
    mesh.alwaysSelectAsActiveMesh = true; // bounds are reliable; skip frustum culling edge cases
    mesh.metadata = { isSlab: /^Slab/i.test(m.name) };
    totalTris += m.indices.length / 3;

    const floor = classifyFloor(m.name);
    (floorGroups[floor] ||= []).push(mesh);

    // accumulate bounds from positions
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i]   < min.x) min.x = p[i];
      if (p[i+1] < min.y) min.y = p[i+1];
      if (p[i+2] < min.z) min.z = p[i+2];
      if (p[i]   > max.x) max.x = p[i];
      if (p[i+1] > max.y) max.y = p[i+1];
      if (p[i+2] > max.z) max.z = p[i+2];
    }
  }

  const center = new Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const size = max.subtract(min);
  const span = Math.max(size.x, size.z);
  const height = size.y;
  buildingSpan = span;
  buildingCenter = center.clone();
  buildingMin = min.clone();
  buildingMax = max.clone();

  // Ground sits at the building base, centered under it
  const groundSize = span * 6;
  const ground = CreateGround('ground', { width: groundSize, height: groundSize }, scene);
  const gmat = new PBRMetallicRoughnessMaterial('groundMat', scene);
  gmat.baseColor = new Color3(0.12, 0.13, 0.15);
  gmat.metallic = 0.0;
  gmat.roughness = 1.0;
  ground.material = gmat;
  ground.position = new Vector3(center.x, min.y, center.z);

  // Frame camera on the true building center
  camera.setTarget(center.clone());
  camera.radius = span * 1.7;
  camera.lowerRadiusLimit = span * 0.3;
  camera.upperRadiusLimit = span * 8;

  // Sun positioned relative to the building
  sun.position = new Vector3(center.x + span, max.y + height, center.z + span * 0.8);

  setStatus(
    `${data.meshes.length} meshes · ${totalTris.toLocaleString()} tris<br/>` +
    `footprint ${size.x.toFixed(1)} × ${size.z.toFixed(1)} m · height ${height.toFixed(1)} m`
  );

  const dxfOverlays = await buildDxfOverlays(floorGroups);
  let hasFacades = false;
  try {
    const r = await fetch('/facade_tiles.json');
    if (r.ok) { buildFacadeTiles(await r.json()); hasFacades = true; }
  } catch (e) { /* optional */ }
  if (hasFacades) {
    for (const kind of FACES) await buildElevationLines(kind);
  }
  const elevations = hasFacades ? {
    Front: { setEnabled: (on) => setFacadeEnabled('front', on) },
    Left: { setEnabled: (on) => setFacadeEnabled('left', on) },
    Right: { setEnabled: (on) => setFacadeEnabled('right', on) },
  } : {};

  document.getElementById('loading').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  buildFloorUI(floorGroups, dxfOverlays, elevations, hasFacades);
}

loadBuilding().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = 'Error: ' + err.message;
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => {
  engine.resize();
  if (planView) updateOrtho();
});
