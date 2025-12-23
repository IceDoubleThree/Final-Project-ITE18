import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildForest(state) {
  const al = new THREE.AmbientLight("#ffffff", 0.8);
  state.group.add(al);
  state.disposables.push(al);

  const sl = new THREE.DirectionalLight("#ffffff", 2);
  sl.position.set(10, 30, 10);
  sl.castShadow = true;
  state.group.add(sl);
  state.disposables.push(sl);

  const resource = this.resources.items.forestModel;
  if (resource?.scene) {
    const model = resource.scene.clone();
    model.position.copy(state.origin);
    state.group.add(model);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Fix unsupported textures to prevent warnings/black rendering
        if (child.material) {
          child.material.metalnessMap = null;
          child.material.roughnessMap = null;
          child.material.normalMap = null;
          child.material.needsUpdate = true;
        }
      }
    });
    this.createPhysicsBodiesFromColliders(model, state, {
      material: this.materials.materials.floor,
    });
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

  state.portals.push(
    new Portal(
      this,
      new THREE.Vector3(state.origin.x, state.origin.y, state.origin.z + 5),
      null,
      "Exit Forest",
      0x228822,
      {
        size: new THREE.Vector3(2, 3, 2),
        interactionRadius: 2,
        options: [
          {
            label: "Return to Store",
            onSelect: () =>
              this.loadLocation("Store", {
                spawnOffset: new THREE.Vector3(-10, 0, 10),
              }),
          },
        ],
      }
    )
  );

  return { update: () => state.portals.forEach((p) => p.update()) };
}
