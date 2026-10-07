import * as THREE from 'three';
import { getSlotMedia } from '../storage/db.js';

const DEFAULT_MEDIA = ['/media/photo1.jpg', '/media/photo1.jpg', '/media/photo1.jpg'];

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function addWall(group, collisions, mesh) {
  group.add(mesh);
  collisions.push(mesh);
  return mesh;
}

function makeLabel(text, width = 3.4, height = 0.62, fontSize = 62) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 220;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5f1e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#161616';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

function buildSegmentedSideWall(group, collisions, x, side, zMin, zMax, roomOpenings, roomH, thickness, wallMat) {
  const openings = [...roomOpenings]
    .sort((a, b) => a.z - b.z)
    .map((r) => ({ start: r.z - r.doorWidth / 2, end: r.z + r.doorWidth / 2 }));
  let cursor = zMin;

  for (const opening of openings) {
    if (opening.start > cursor) {
      const depth = opening.start - cursor;
      const wall = box(thickness, roomH, depth, wallMat);
      wall.position.set(x, roomH / 2, cursor + depth / 2);
      addWall(group, collisions, wall);
    }
    cursor = Math.max(cursor, opening.end);
  }

  if (cursor < zMax) {
    const depth = zMax - cursor;
    const wall = box(thickness, roomH, depth, wallMat);
    wall.position.set(x, roomH / 2, cursor + depth / 2);
    addWall(group, collisions, wall);
  }
}

function addSideRoom({ group, collisions, room, side, corridorHalfW, roomH, thickness, wallMat, floorMat, ceilingMat }) {
  const roomW = 10;
  const roomD = 8;
  const centerX = side === 'left' ? -(corridorHalfW + roomW / 2) : corridorHalfW + roomW / 2;

  const floor = box(roomW, 0.12, roomD, floorMat);
  floor.position.set(centerX, -0.06, room.z);
  group.add(floor);

  const ceiling = box(roomW, 0.08, roomD, ceilingMat);
  ceiling.position.set(centerX, roomH, room.z);
  group.add(ceiling);

  const outerX = side === 'left' ? -(corridorHalfW + roomW) : corridorHalfW + roomW;
  const outer = box(thickness, roomH, roomD, wallMat);
  outer.position.set(outerX, roomH / 2, room.z);
  addWall(group, collisions, outer);

  const north = box(roomW, roomH, thickness, wallMat);
  north.position.set(centerX, roomH / 2, room.z - roomD / 2);
  addWall(group, collisions, north);

  const south = box(roomW, roomH, thickness, wallMat);
  south.position.set(centerX, roomH / 2, room.z + roomD / 2);
  addWall(group, collisions, south);

  // Architectural doorway header so the room entrance reads as a portal,
  // not as a floating label over an open hole.
  const portalX = side === 'left' ? -corridorHalfW : corridorHalfW;
  const lintel = box(thickness + 0.04, 0.78, room.doorWidth, wallMat);
  lintel.position.set(portalX, roomH - 0.39, room.z);
  group.add(lintel);

  const title = makeLabel(room.title.toUpperCase(), 2.75, 0.48, 48);
  title.position.set(
    side === 'left' ? -corridorHalfW + 0.025 : corridorHalfW - 0.025,
    roomH - 0.85,
    room.z
  );
  title.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  group.add(title);

  return { centerX, roomW, roomD, outerX };
}

export async function buildGallery(renderer) {
  const group = new THREE.Group();
  const collisionMeshes = [];
  const frames = [];
  const videoElements = [];
  const transientUrls = [];

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.84, metalness: 0.01 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd7d3ca, roughness: 0.28, metalness: 0.03 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf8f7f3, roughness: 0.96 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x243147, roughness: 0.58, metalness: 0.05 });

  const corridorW = 7;
  const corridorHalfW = corridorW / 2;
  const corridorD = 48;
  const zMin = -corridorD / 2;
  const zMax = corridorD / 2;
  const roomH = 5.4;
  const thickness = 0.22;

  // Main chronological spine.
  const floor = box(corridorW, 0.12, corridorD, floorMat);
  floor.position.y = -0.06;
  group.add(floor);

  const ceiling = box(corridorW, 0.08, corridorD, ceilingMat);
  ceiling.position.y = roomH;
  group.add(ceiling);

  const back = box(corridorW, roomH, thickness, wallMat);
  back.position.set(0, roomH / 2, zMin);
  addWall(group, collisionMeshes, back);

  const entryLeft = box(2.2, roomH, thickness, wallMat);
  entryLeft.position.set(-2.4, roomH / 2, zMax);
  addWall(group, collisionMeshes, entryLeft);
  const entryRight = box(2.2, roomH, thickness, wallMat);
  entryRight.position.set(2.4, roomH / 2, zMax);
  addWall(group, collisionMeshes, entryRight);

  // Side rooms branch off the timeline for tournaments / special events.
  const rooms = [
    { id: 'tournament-1', side: 'left',  z: -14, doorWidth: 3.1, title: 'Tournament Room' },
    { id: 'event-1',      side: 'right', z: -5,  doorWidth: 3.1, title: 'Team Events' },
    { id: 'tournament-2', side: 'left',  z: 5,   doorWidth: 3.1, title: 'Cup Runs' },
    { id: 'highlights',   side: 'right', z: 14,  doorWidth: 3.1, title: 'Highlights' },
  ];

  buildSegmentedSideWall(
    group, collisionMeshes, -corridorHalfW, 'left', zMin, zMax,
    rooms.filter((r) => r.side === 'left'), roomH, thickness, wallMat
  );
  buildSegmentedSideWall(
    group, collisionMeshes, corridorHalfW, 'right', zMin, zMax,
    rooms.filter((r) => r.side === 'right'), roomH, thickness, wallMat
  );

  const roomGeometry = {};
  for (const room of rooms) {
    roomGeometry[room.id] = addSideRoom({
      group, collisions: collisionMeshes, room, side: room.side,
      corridorHalfW, roomH, thickness, wallMat, floorMat, ceilingMat,
    });
  }

  // Dark band running down the center makes the chronological direction obvious.
  const timelineStrip = box(0.12, 0.014, corridorD - 2, accentMat);
  timelineStrip.position.set(0, 0.012, 0);
  group.add(timelineStrip);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x918a7e, 2.0);
  group.add(ambient);

  const fill = new THREE.DirectionalLight(0xffffff, 1.15);
  fill.position.set(4, 8, 10);
  group.add(fill);

  for (let z = -21; z <= 21; z += 6) {
    const light = new THREE.PointLight(0xfff3dc, 9, 9, 2);
    light.position.set(0, 4.8, z);
    group.add(light);
  }

  // Chronological seasons run from the entrance toward the back wall.
  const timelineStations = [
    { z: 20, label: '2019' },
    { z: 15, label: '2020' },
    { z: 10, label: '2021' },
    { z: 4,  label: '2022' },
    { z: -2, label: '2023' },
    { z: -8, label: '2024' },
    { z: -14,label: '2025' },
    { z: -20,label: '2026' },
  ];

  const slots = [];

  // Corridor frames must not sit in front of room doorways. A small extra
  // clearance keeps frame edges, captions and spotlights away from portals.
  const doorwayClearance = 1.05;
  const doorwayAt = (side, z) => rooms.some((room) =>
    room.side === side &&
    Math.abs(z - room.z) < room.doorWidth / 2 + doorwayClearance
  );

  timelineStations.forEach((station, i) => {
    const placard = makeLabel(station.label, 1.55, 0.46, 68);
    placard.position.set(0, 0.035, station.z);
    placard.rotation.x = -Math.PI / 2;
    group.add(placard);

    if (!doorwayAt('left', station.z)) {
      slots.push({
        id: `timeline-${station.label}-left`,
        pos: new THREE.Vector3(-corridorHalfW + 0.15, 2.45, station.z),
        rotY: Math.PI / 2,
        def: i % 3,
        label: `${station.label} · Timeline`,
        size: 'timeline',
      });
    }

    if (!doorwayAt('right', station.z)) {
      slots.push({
        id: `timeline-${station.label}-right`,
        pos: new THREE.Vector3(corridorHalfW - 0.15, 2.45, station.z),
        rotY: -Math.PI / 2,
        def: (i + 1) % 3,
        label: `${station.label} · Timeline`,
        size: 'timeline',
      });
    }
  });

  // Dedicated event/tournament rooms hold the extra story branches.
  rooms.forEach((room, roomIndex) => {
    const g = roomGeometry[room.id];
    const roomSlots = [];

    // Three frames on the outer wall.
    [-2.8, 0, 2.8].forEach((offset, i) => {
      roomSlots.push({
        id: `${room.id}-outer-${i + 1}`,
        pos: new THREE.Vector3(
          room.side === 'left' ? g.outerX + 0.14 : g.outerX - 0.14,
          2.42,
          room.z + offset
        ),
        rotY: room.side === 'left' ? Math.PI / 2 : -Math.PI / 2,
        def: (roomIndex + i) % 3,
        label: room.title,
        size: i === 1 ? 'feature' : 'room',
      });
    });

    // One feature frame on each end wall.
    const roomCenterX = g.centerX;
    const innerShift = room.side === 'left' ? -0.8 : 0.8;
    roomSlots.push({
      id: `${room.id}-north`,
      pos: new THREE.Vector3(roomCenterX + innerShift, 2.42, room.z - g.roomD / 2 + 0.14),
      rotY: 0,
      def: (roomIndex + 1) % 3,
      label: room.title,
      size: 'room',
    });
    roomSlots.push({
      id: `${room.id}-south`,
      pos: new THREE.Vector3(roomCenterX - innerShift, 2.42, room.z + g.roomD / 2 - 0.14),
      rotY: Math.PI,
      def: (roomIndex + 2) % 3,
      label: room.title,
      size: 'room',
    });

    slots.push(...roomSlots);
  });

  // Final hero frame at the end of the journey.
  slots.push({
    id: 'timeline-finale',
    pos: new THREE.Vector3(0, 2.55, zMin + 0.14),
    rotY: 0,
    def: 0,
    label: 'The Team Today',
    size: 'hero',
  });

  const finaleLabel = makeLabel('THE TEAM TODAY', 4.3, 0.7, 54);
  finaleLabel.position.set(0, 4.35, zMin + 0.13);
  group.add(finaleLabel);

  for (const slot of slots) {
    const frame = await createMediaFrame(slot, renderer, videoElements, transientUrls);
    frames.push(frame);
    group.add(frame.group);

    const spot = new THREE.SpotLight(0xfff1d8, slot.size === 'hero' ? 48 : 30, 7.5, Math.PI / 5.7, 0.48, 1.7);
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), slot.rotY);
    spot.position.copy(slot.pos).add(normal.clone().multiplyScalar(1.45)).add(new THREE.Vector3(0, 1.45, 0));
    spot.target.position.copy(slot.pos);
    group.add(spot, spot.target);
  }

  return { group, frames, collisionMeshes, videoElements, transientUrls };
}

async function createMediaFrame(slot, renderer, videoElements, transientUrls) {
  const group = new THREE.Group();
  group.position.copy(slot.pos);
  group.rotation.y = slot.rotY;

  const wood = new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 0.38, metalness: 0.08 });
  const mat = new THREE.MeshStandardMaterial({ color: 0xf7f4ed, roughness: 0.92 });

  let W = 2.8;
  let H = 1.85;
  if (slot.size === 'room') { W = 2.35; H = 1.72; }
  if (slot.size === 'feature') { W = 3.25; H = 2.08; }
  if (slot.size === 'hero') { W = 4.7; H = 2.85; }

  const b = 0.11;
  const d = 0.12;
  const top = box(W + b * 2, b, d, wood);
  top.position.y = H / 2 + b / 2;
  const bottom = top.clone();
  bottom.position.y = -H / 2 - b / 2;
  const side = box(b, H, d, wood);
  side.position.x = W / 2 + b / 2;
  const side2 = side.clone();
  side2.position.x = -W / 2 - b / 2;
  const backing = box(W, H, 0.035, mat);
  backing.position.z = 0.045;
  group.add(top, bottom, side, side2, backing);

  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.93, H * 0.90), screenMat);
  screen.position.z = 0.071;
  screen.userData.isMediaScreen = true;
  screen.userData.slotId = slot.id;
  group.add(screen);

  if (slot.label) {
    const caption = makeLabel(slot.label, Math.min(W, 2.9), 0.28, 34);
    caption.position.set(0, -H / 2 - 0.29, 0.075);
    group.add(caption);
  }

  const frame = { group, screen, slot, fit: 'cover', current: null };
  const saved = await getSlotMedia(slot.id);
  if (saved?.blob) {
    const url = URL.createObjectURL(saved.blob);
    transientUrls.push(url);
    await applyMedia(frame, { url, type: saved.type, fit: saved.fit || 'cover', persistent: true }, renderer, videoElements);
  } else {
    await applyMedia(frame, { url: DEFAULT_MEDIA[slot.def], type: 'image', fit: 'cover', persistent: false }, renderer, videoElements);
  }
  return frame;
}

export async function applyMedia(frame, media, renderer, videoElements) {
  const old = frame.current;
  if (old?.texture) old.texture.dispose();
  if (old?.video) {
    old.video.pause();
    old.video.removeAttribute('src');
    old.video.load();
  }

  let texture;
  let video = null;

  if (media.type?.startsWith('video')) {
    video = document.createElement('video');
    video.src = media.url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
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
  frame.current = { texture, video, type: media.type, url: media.url };
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
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);

  if (frame.fit === 'contain') {
    if (imageAspect > screenAspect) tex.repeat.y = screenAspect / imageAspect;
    else tex.repeat.x = imageAspect / screenAspect;
  } else {
    if (imageAspect > screenAspect) tex.repeat.x = screenAspect / imageAspect;
    else tex.repeat.y = imageAspect / screenAspect;
  }

  tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
  tex.needsUpdate = true;
}

export const defaultMediaFor = (slot) => DEFAULT_MEDIA[slot.def];
