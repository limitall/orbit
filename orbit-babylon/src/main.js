import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { PBRMetallicRoughnessMaterial } from '@babylonjs/core/Materials/PBR/pbrMetallicRoughnessMaterial.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/core/Materials/standardMaterial.js';

const canvas = document.getElementById('renderCanvas');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.051, 0.063, 1);

// Camera
const camera = new ArcRotateCamera('cam', -Math.PI / 4, 1.28, 120, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
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

const shadow = new ShadowGenerator(2048, sun);
shadow.useBlurExponentialShadowMap = true;
shadow.blurKernel = 32;

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

// Order floors appear bottom -> top. "Columns" span all floors (single mesh).
const FLOOR_ORDER = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Terrace'];

function classifyFloor(meshName) {
  if (/column/i.test(meshName)) return 'Columns';
  const suffix = meshName.split('.')[0].split('_').pop(); // "Walls_Ground" -> "Ground"
  return FLOOR_ORDER.includes(suffix) ? suffix : 'Other';
}

function buildFloorUI(floorGroups) {
  const panel = document.getElementById('floors');
  panel.innerHTML = '';

  const state = { active: 'All', showColumns: true };
  const floors = FLOOR_ORDER.filter((f) => floorGroups[f]?.length);

  const apply = () => {
    for (const m of floorGroups.Columns || []) m.setEnabled(state.showColumns);
    for (const f of floors) {
      const visible = state.active === 'All' || state.active === f;
      for (const m of floorGroups[f]) m.setEnabled(visible);
    }
    panel.querySelectorAll('button[data-floor]').forEach((b) => {
      b.classList.toggle('active', b.dataset.floor === state.active);
    });
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

  if (floorGroups.Columns?.length) {
    const sep = document.createElement('div');
    sep.className = 'sep';
    panel.appendChild(sep);
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.onchange = () => { state.showColumns = cb.checked; apply(); };
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode('Columns'));
    panel.appendChild(lbl);
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
    mesh.receiveShadows = true;
    mesh.alwaysSelectAsActiveMesh = true; // bounds are reliable; skip frustum culling edge cases
    shadow.addShadowCaster(mesh);
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

  // Ground sits at the building base, centered under it
  const groundSize = span * 6;
  const ground = CreateGround('ground', { width: groundSize, height: groundSize }, scene);
  const gmat = new PBRMetallicRoughnessMaterial('groundMat', scene);
  gmat.baseColor = new Color3(0.12, 0.13, 0.15);
  gmat.metallic = 0.0;
  gmat.roughness = 1.0;
  ground.material = gmat;
  ground.receiveShadows = true;
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

  document.getElementById('loading').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  buildFloorUI(floorGroups);
}

loadBuilding().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = 'Error: ' + err.message;
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
