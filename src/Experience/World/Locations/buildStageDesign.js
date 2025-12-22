import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildStageDesign(state) {
  const resource = this.resources.items.stageModel;
  if (resource?.scene) {
    const model = resource.scene;
    model.position.copy(state.origin);
    state.group.add(model);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
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

  const portalPos = new THREE.Vector3(
    state.origin.x + 5,
    state.origin.y,
    state.origin.z - 5
  );
  state.portals.push(
    new Portal(this, portalPos, null, "Portal", 0xffff00, {
      size: new THREE.Vector3(2, 2.5, 2),
      interactionRadius: 1,
      options: [{ label: "Go to Empty Stage", destinationKey: "BlankStage" }],
    })
  );

  const pl = new THREE.PointLight(0xffff00, 1, 10);
  pl.position.copy(portalPos).add(new THREE.Vector3(0, 2, 0));
  state.group.add(pl);

  return { update: () => state.portals.forEach((p) => p.update()) };
}
