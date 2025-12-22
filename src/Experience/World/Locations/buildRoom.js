import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildRoom(state) {
  const resource = this.resources.items.roomModel;
  let model = null;

  if (resource?.scene) {
    model = resource.scene;
    model.scale.set(1.3, 1.3, 1.3);
    model.position.copy(state.origin);
    model.position.y = -0.2;
    state.group.add(model);

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const colliderObjects = this.createPhysicsBodiesFromColliders(model, state, {
      material: this.materials.materials.floor,
    });

    const doorObj = this.findObjectByName(model, "Door_Default_0");
    if (doorObj) {
      const doorBox = new THREE.Box3().setFromObject(doorObj);
      doorBox.expandByVector(new THREE.Vector3(0.6, 0.6, 0.6));

      const doorPortal = new Portal(
        this,
        doorBox.getCenter(new THREE.Vector3()),
        null,
        "Door",
        0x00ffcc,
        {
          boundsBox: doorBox,
          interactionRadius: 1,
          options: [
            {
              label: "Go to Store",
              onSelect: () =>
                this.loadLocation("Store", {
                  spawnOffset: new THREE.Vector3(15, 0, 15),
                }),
            },
          ],
        }
      );
      state.portals.push(doorPortal);
    }

    if (colliderObjects.length > 0) {
      const combined = new THREE.Box3().makeEmpty();
      colliderObjects.forEach((obj) => combined.expandByObject(obj));

      const cameraMargin = 0.5;
      state.cameraBounds = {
        minX: combined.min.x + cameraMargin,
        maxX: combined.max.x - cameraMargin,
        minZ: combined.min.z + cameraMargin,
        maxZ: combined.max.z - cameraMargin,
      };
    }

    // Walls
    const targetWallNames = new Set(["wall", "wall2"]);
    const wallObjects = [];
    model.updateWorldMatrix(true, true);
    model.traverse((obj) => {
      const name = (obj.name || "").toLowerCase();
      if (targetWallNames.has(name)) wallObjects.push(obj);
    });

    if (wallObjects.length > 0) {
      const combinedBox = new THREE.Box3().makeEmpty();
      wallObjects.forEach((obj) => combinedBox.expandByObject(obj));

      // Fallback: if wall box is degenerate, use model bounds
      const size = new THREE.Vector3();
      combinedBox.getSize(size);
      if (size.lengthSq() < 1e-6) {
        combinedBox.setFromObject(model);
        combinedBox.getSize(size);
      }

      const center = new THREE.Vector3();
      combinedBox.getCenter(center);

      if (!state.cameraBounds) {
        state.cameraBounds = {
          minX: combinedBox.min.x + 0.2,
          maxX: combinedBox.max.x - 0.2,
          minZ: combinedBox.min.z + 0.2,
          maxZ: combinedBox.max.z - 0.2,
        };
      }

      const thickness = 0.2;
      const halfT = thickness * 0.5;
      const addWallBox = (halfExtents, position) => {
        const body = new CANNON.Body({
          mass: 0,
          material: this.materials.materials.floor,
        });
        body.addShape(new CANNON.Box(halfExtents));
        body.position.copy(position);
        this.physicsWorld.addBody(body);
        state.physicsBodies.push(body);
      };

      addWallBox(
        new CANNON.Vec3(halfT, size.y * 0.5, size.z * 0.5),
        new THREE.Vector3(
          combinedBox.min.x - halfT,
          center.y,
          center.z
        )
      );
      addWallBox(
        new CANNON.Vec3(halfT, size.y * 0.5, size.z * 0.5),
        new THREE.Vector3(
          combinedBox.max.x + halfT,
          center.y,
          center.z
        )
      );
      addWallBox(
        new CANNON.Vec3(size.x * 0.5, size.y * 0.5, halfT),
        new THREE.Vector3(
          center.x,
          center.y,
          combinedBox.min.z - halfT
        )
      );
      addWallBox(
        new CANNON.Vec3(size.x * 0.5, size.y * 0.5, halfT),
        new THREE.Vector3(
          center.x,
          center.y,
          combinedBox.max.z + halfT
        )
      );
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

  const portal = new Portal(
    this,
    new THREE.Vector3(state.origin.x - 4.4, state.origin.y, state.origin.z - 2),
    null,
    "Portal",
    0xffff00,
    {
      size: new THREE.Vector3(2, 2.5, 2),
      interactionRadius: 1,
      options: [{ label: "Go to Stage Area", destinationKey: "StageDesign" }],
    }
  );
  state.portals.push(portal);

  return {
    update: () => {
      state.portals.forEach((p) => p.update());
      // Camera clamping
      const bounds = state.cameraBounds;
      const camera = this.experience.camera;
      if (bounds && camera?.instance && camera.controls) {
        const pos = camera.instance.position;
        const target = camera.controls.target;
        const m = 0.05;
        pos.x = Math.max(bounds.minX + m, Math.min(bounds.maxX - m, pos.x));
        pos.z = Math.max(bounds.minZ + m, Math.min(bounds.maxZ - m, pos.z));
        pos.y = Math.min(5.2, pos.y);
        if (target) {
          target.x = Math.max(
            bounds.minX + m,
            Math.min(bounds.maxX - m, target.x)
          );
          target.z = Math.max(
            bounds.minZ + m,
            Math.min(bounds.maxZ - m, target.z)
          );
          target.y = Math.min(5.2, target.y);
        }
        camera.controls.maxDistance = 15;
      }
    },
    cleanup: () => {
      this.experience.camera.controls.maxDistance = 15;
    },
  };
}
