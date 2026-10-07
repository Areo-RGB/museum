import * as THREE from 'three';
import { getSlotMedia } from '../storage/db.js';

const DEFAULT_MEDIA = ['/media/photo1.jpg', '/media/photo1.jpg', '/media/photo1.jpg'];

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export async function buildGallery(renderer) {
  const group = new THREE.Group();
  const collisionMeshes = [];
  const frames = [];
  const videoElements = [];
  const transientUrls = [];

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.82, metalness: 0.02 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd6d2ca, roughness: 0.22, metalness: 0.04 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf8f7f3, roughness: 0.95 });

  const roomW = 16, roomD = 22, roomH = 5.2, t = 0.22;

  const floor = box(roomW, 0.12, roomD, floorMat); floor.position.y = -0.06; group.add(floor);
  const ceiling = box(roomW, 0.08, roomD, ceilingMat); ceiling.position.y = roomH; group.add(ceiling);

  const back = box(roomW, roomH, t, wallMat); back.position.set(0, roomH / 2, -roomD / 2); group.add(back); collisionMeshes.push(back);
  const frontL = box(6.6, roomH, t, wallMat); frontL.position.set(-4.7, roomH/2, roomD/2); group.add(frontL); collisionMeshes.push(frontL);
  const frontR = box(6.6, roomH, t, wallMat); frontR.position.set(4.7, roomH/2, roomD/2); group.add(frontR); collisionMeshes.push(frontR);
  const left = box(t, roomH, roomD, wallMat); left.position.set(-roomW/2, roomH/2, 0); group.add(left); collisionMeshes.push(left);
  const right = box(t, roomH, roomD, wallMat); right.position.set(roomW/2, roomH/2, 0); group.add(right); collisionMeshes.push(right);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xb9b2a6, 2.2); group.add(ambient);
  const fill = new THREE.DirectionalLight(0xffffff, 1.3); fill.position.set(4, 5, 6); group.add(fill);

  for (let z = -8; z <= 8; z += 4) {
    const light = new THREE.PointLight(0xfff5df, 10, 8, 2);
    light.position.set(0, 4.6, z); group.add(light);
  }

  const slots = [];
  const zPositions = [-7.8, -3.8, 0.2, 4.2];
  zPositions.forEach((z, i) => {
    slots.push({ id:`left-${i+1}`, pos:new THREE.Vector3(-7.86, 2.45, z), rotY:Math.PI/2, def:i%3 });
    slots.push({ id:`right-${i+1}`, pos:new THREE.Vector3(7.86, 2.45, z), rotY:-Math.PI/2, def:(i+1)%3 });
  });
  [-4.8, 0, 4.8].forEach((x, i) => slots.push({ id:`back-${i+1}`, pos:new THREE.Vector3(x, 2.45, -10.86), rotY:0, def:(i+2)%3 }));
  slots.push({ id:'hero', pos:new THREE.Vector3(0, 2.5, 10.86), rotY:Math.PI, def:0 });

  for (const slot of slots) {
    const frame = await createMediaFrame(slot, renderer, videoElements, transientUrls);
    frames.push(frame);
    group.add(frame.group);

    const spot = new THREE.SpotLight(0xfff2d8, 38, 8, Math.PI / 5.5, 0.45, 1.6);
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0,1,0), slot.rotY);
    spot.position.copy(slot.pos).add(normal.clone().multiplyScalar(1.7)).add(new THREE.Vector3(0, 1.6, 0));
    spot.target.position.copy(slot.pos);
    group.add(spot, spot.target);
  }

  return { group, frames, collisionMeshes, videoElements, transientUrls };
}

async function createMediaFrame(slot, renderer, videoElements, transientUrls) {
  const group = new THREE.Group();
  group.position.copy(slot.pos); group.rotation.y = slot.rotY;
  const wood = new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 0.38, metalness: 0.08 });
  const mat = new THREE.MeshStandardMaterial({ color: 0xf7f4ed, roughness: 0.92 });

  const W = slot.id === 'hero' ? 4.2 : 3.35;
  const H = slot.id === 'hero' ? 2.65 : 2.25;
  const b = 0.12, d = 0.12;
  const top = box(W + b*2, b, d, wood); top.position.y = H/2 + b/2;
  const bottom = top.clone(); bottom.position.y = -H/2 - b/2;
  const side = box(b, H, d, wood); side.position.x = W/2 + b/2;
  const side2 = side.clone(); side2.position.x = -W/2 - b/2;
  const backing = box(W, H, 0.035, mat); backing.position.z = 0.045;
  group.add(top,bottom,side,side2,backing);

  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W*0.93, H*0.90), screenMat);
  screen.position.z = 0.071;
  screen.userData.isMediaScreen = true;
  screen.userData.slotId = slot.id;
  group.add(screen);

  const frame = { group, screen, slot, fit:'cover', current:null };
  const saved = await getSlotMedia(slot.id);
  if (saved?.blob) {
    const url = URL.createObjectURL(saved.blob); transientUrls.push(url);
    await applyMedia(frame, { url, type:saved.type, fit:saved.fit || 'cover', persistent:true }, renderer, videoElements);
  } else {
    await applyMedia(frame, { url:DEFAULT_MEDIA[slot.def], type:'image', fit:'cover', persistent:false }, renderer, videoElements);
  }
  return frame;
}

export async function applyMedia(frame, media, renderer, videoElements) {
  const old = frame.current;
  if (old?.texture) old.texture.dispose();
  if (old?.video) { old.video.pause(); old.video.removeAttribute('src'); old.video.load(); }

  let texture, video = null;
  if (media.type?.startsWith('video')) {
    video = document.createElement('video');
    video.src = media.url; video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'auto';
    try { await video.play(); } catch {}
    texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    videoElements.push(video);
  } else {
    texture = await new THREE.TextureLoader().loadAsync(media.url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  frame.screen.material.map = texture;
  frame.screen.material.needsUpdate = true;
  frame.fit = media.fit || 'cover';
  frame.current = { texture, video, type:media.type, url:media.url };
  updateFit(frame);
}

export function updateFit(frame) {
  const tex = frame.current?.texture;
  if (!tex) return;
  const img = frame.current.video || tex.image;
  const iw = img?.videoWidth || img?.naturalWidth || img?.width || 1;
  const ih = img?.videoHeight || img?.naturalHeight || img?.height || 1;
  const imageAspect = iw / ih;
  const screenAspect = frame.screen.geometry.parameters.width / frame.screen.geometry.parameters.height;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1,1); tex.offset.set(0,0);
  if (frame.fit === 'contain') {
    if (imageAspect > screenAspect) tex.repeat.y = screenAspect / imageAspect;
    else tex.repeat.x = imageAspect / screenAspect;
  } else {
    if (imageAspect > screenAspect) tex.repeat.x = screenAspect / imageAspect;
    else tex.repeat.y = imageAspect / screenAspect;
  }
  tex.offset.set((1-tex.repeat.x)/2, (1-tex.repeat.y)/2);
  tex.needsUpdate = true;
}

export const defaultMediaFor = (slot) => DEFAULT_MEDIA[slot.def];