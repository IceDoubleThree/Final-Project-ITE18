import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildBlankStage(state) {
  const floorGeometry = new THREE.PlaneGeometry(state.size.width, state.size.depth);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.rotation.x = -Math.PI * 0.5;
  floorMesh.receiveShadow = true;
  floorMesh.position.copy(state.origin);
  state.group.add(floorMesh);

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
      "Portal",
      0xff0000,
      {
        size: new THREE.Vector3(2, 2.5, 2),
        interactionRadius: 1,
        options: [{ label: "Go to Stage Area", destinationKey: "StageDesign" }],
      }
    )
  );

  state.disposables.push(floorGeometry, floorMaterial);
  return { update: () => state.portals.forEach((p) => p.update()) };
}
