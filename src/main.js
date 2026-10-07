import * as THREE from 'three';
import { PlayerController } from './controls/player.js';
import { createCollisionChecker } from './controls/collision.js';
import { buildGallery, applyMedia, updateFit, defaultMediaFor } from './scene/gallery.js';
import { saveSlotMedia, deleteSlotMedia } from './storage/db.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe4e1da);
scene.fog = new THREE.Fog(0xe4e1da, 18, 38);

const camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0,1.65,22.2);
const player = new PlayerController(camera, canvas);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 7;

let gallery, collisionCheck, selectedFrame = null, cinematic = false, cinematicStart = 0;

const start = document.getElementById('start');
const editor = document.getElementById('editor');
const editorTitle = document.getElementById('editorTitle');
const mediaInput = document.getElementById('mediaInput');
const fit = document.getElementById('fit');
const badge = document.getElementById('cinematicBadge');

async function init() {
  gallery = await buildGallery(renderer);
  scene.add(gallery.group);
  collisionCheck = createCollisionChecker(gallery.collisionMeshes);
  animate();
}

document.getElementById('enter').addEventListener('click', () => { start.classList.add('hidden'); player.lock(); });
document.getElementById('resume').addEventListener('click', closeEditorAndResume);
document.getElementById('closeEditor').addEventListener('click', closeEditorAndResume);

document.getElementById('resetFrame').addEventListener('click', async () => {
  if (!selectedFrame) return;
  await deleteSlotMedia(selectedFrame.slot.id);
  selectedFrame.fit = 'cover';
  await applyMedia(selectedFrame, { url:defaultMediaFor(selectedFrame.slot), type:'image', fit:'cover' }, renderer, gallery.videoElements);
  fit.value = 'cover';
  document.getElementById('editorStatus').textContent = 'Frame reset to its default photograph.';
});

fit.addEventListener('change', async () => {
  if (!selectedFrame) return;
  selectedFrame.fit = fit.value;
  updateFit(selectedFrame);
  const file = mediaInput.files?.[0];
  if (file) await saveSlotMedia({ slotId:selectedFrame.slot.id, blob:file, type:file.type, fit:fit.value, name:file.name });
});

mediaInput.addEventListener('change', async () => {
  const file = mediaInput.files?.[0];
  if (!file || !selectedFrame) return;
  const url = URL.createObjectURL(file);
  gallery.transientUrls.push(url);
  await applyMedia(selectedFrame, { url, type:file.type, fit:fit.value, persistent:true }, renderer, gallery.videoElements);
  await saveSlotMedia({ slotId:selectedFrame.slot.id, blob:file, type:file.type, fit:fit.value, name:file.name });
  document.getElementById('editorStatus').textContent = `${file.name} saved locally to this frame.`;
  mediaInput.value = '';
});

canvas.addEventListener('click', () => {
  if (!player.locked || cinematic) return;
  const frame = aimedFrame();
  if (frame) openEditor(frame);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC' && !editorIsOpen()) toggleCinematic();
});

function aimedFrame() {
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const screens = gallery.frames.map(f => f.screen);
  const hit = raycaster.intersectObjects(screens, false)[0];
  return hit ? gallery.frames.find(f => f.screen === hit.object) : null;
}

function openEditor(frame) {
  selectedFrame = frame;
  player.unlock();
  editorTitle.textContent = `Edit ${frame.slot.id}`;
  fit.value = frame.fit || 'cover';
  document.getElementById('editorStatus').textContent = 'Choose an image or video. It stays in this browser.';
  editor.style.display = 'block';
}

function closeEditorAndResume() {
  editor.style.display = 'none'; selectedFrame = null; player.lock();
}
function editorIsOpen() { return editor.style.display === 'block'; }

function toggleCinematic() {
  cinematic = !cinematic;
  player.enabled = !cinematic;
  badge.style.display = cinematic ? 'block' : 'none';
  if (cinematic) { player.unlock(); cinematicStart = performance.now(); }
  else player.lock();
}

function updateCinematic() {
  if (!cinematic) return;

  // A slow forward journey through the chronological corridor.
  // The camera stays inside the central spine and gently looks into side rooms
  // when it reaches them, rather than orbiting through walls.
  const duration = 42;
  const elapsed = ((performance.now() - cinematicStart) / 1000) % duration;
  const p = elapsed / duration;
  const z = THREE.MathUtils.lerp(22.0, -22.0, p);
  const sway = Math.sin(p * Math.PI * 6) * 0.22;
  camera.position.set(sway, 1.78 + Math.sin(p * Math.PI * 4) * 0.05, z);

  let lookX = 0;
  const roomLooks = [
    { z: 14, x: 3.8 },
    { z: 5, x: -3.8 },
    { z: -5, x: 3.8 },
    { z: -14, x: -3.8 },
  ];
  for (const stop of roomLooks) {
    const distance = Math.abs(z - stop.z);
    if (distance < 2.8) {
      lookX = stop.x * (1 - distance / 2.8);
      break;
    }
  }

  camera.lookAt(new THREE.Vector3(lookX, 2.05, z - 5.0));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt, collisionCheck);
  updateCinematic();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

init();