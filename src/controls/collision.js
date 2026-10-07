import * as THREE from 'three';

export function createCollisionChecker(meshes, radius = 0.42) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = radius;
  const dirs = Array.from({ length: 8 }, (_, i) => {
    const a = i / 8 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  });
  return (position) => dirs.some((d) => {
    raycaster.set(position, d);
    return raycaster.intersectObjects(meshes, true).length > 0;
  });
}