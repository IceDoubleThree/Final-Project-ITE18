import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildStore(state) {
  const resource = this.resources.items.storeModel;
  if (resource?.scene) {
    const model = resource.scene;
    model.scale.set(1, 1, 1);
    model.position.copy(state.origin);
    state.group.add(model);
  }

  // Notice marker (3D exclamation mark) to locate the game starter warp
  const noticeResource = this.resources.items.noticeModel;
  if (noticeResource?.scene) {
    const notice = noticeResource.scene.clone();
    notice.position.set(
      state.origin.x + -12,
      state.origin.y + 2.5,
      state.origin.z + 7.2
    );
    notice.rotation.y = Math.PI * 0.5;
    notice.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    state.group.add(notice);
  }

  // --- GAME STARTER GATE ---
  // This gate starts the real game run (Academy level 1).
  // Location: x=-12, z=7.25
  const gameGatePosition = new THREE.Vector3(
    state.origin.x - 12,
    state.origin.y,
    state.origin.z + 7.25
  );

  state.portals.push(
    new Portal(this, gameGatePosition, null, "Warp Gate", 0xffffff, {
      size: new THREE.Vector3(2, 2.5, 2),
      interactionRadius: 2,
      options: [
        {
          label: "Start Game",
          onSelect: () => this.startRun(),
        },
      ],
    })
  );

  // --- STORE -> LOBBY WARP ---
  // Moved previous travel options here.
  // Location: x=15, z=16
  const lobbyWarpPosition = new THREE.Vector3(
    state.origin.x + 15,
    state.origin.y,
    state.origin.z + 16
  );

  state.portals.push(
    new Portal(this, lobbyWarpPosition, null, "Travel Gate", 0xffffff, {
      size: new THREE.Vector3(2, 2.5, 2),
      interactionRadius: 2,
      options: [
        {
          label: "Go to Room",
          onSelect: () =>
            this.loadLocation("Room", {
              spawnOffset: new THREE.Vector3(2.5, 0, 2.5),
            }),
        },
      ],
    })
  );

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
