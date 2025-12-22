import * as THREE from "three";
import * as CANNON from "cannon-es";

export default function buildAcademy(state) {
  // Sky inside Academy (use existing store sky texture)
  const skyTex = this.resources.items.storeSky;
  if (skyTex) {
    if ("colorSpace" in skyTex) skyTex.colorSpace = THREE.SRGBColorSpace;
    else skyTex.encoding = THREE.sRGBEncoding;

    const skyGeo = new THREE.SphereGeometry(120, 48, 24);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.name = "academy-sky-dome";
    skyDome.position.copy(state.origin);
    skyDome.position.y += 20;
    state.group.add(skyDome);
    state.disposables.push(skyGeo, skyMat);
  }

  const resource = this.resources.items.academyModel;
  if (resource?.scene) {
    const model = resource.scene.clone();
    model.position.copy(state.origin);
    state.group.add(model);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const physicsMeshes = this.createPhysicsBodiesFromPhysicsMeshes(model, state, {
      material: this.materials.materials.floor,
    });

    // Fallback: support older *_collider naming if no physics_* primitives exist
    if (!physicsMeshes || physicsMeshes.length === 0) {
      this.createPhysicsBodiesFromColliders(model, state, {
        material: this.materials.materials.floor,
      });
    }
  }

  const floorBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    material: this.materials.materials.floor,
  });
  floorBody.position.copy(state.origin);
  floorBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(1, 0, 0),
    -Math.PI * 0.5
  );
  this.physicsWorld.addBody(floorBody);
  state.physicsBodies.push(floorBody);

  return { update: () => state.portals.forEach((p) => p.update()) };
}
