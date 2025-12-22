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

    model.traverse((child) => {
      const name = child.name.toLowerCase();
      if (child.isMesh && name.startsWith("road_")) {
        const geometry = child.geometry;
        const vertices = geometry.attributes.position.array;
        let indices;

        if (geometry.index) {
          indices = geometry.index.array;
        } else {
          indices = [];
          for (let i = 0; i < geometry.attributes.position.count; i++) {
            indices.push(i);
          }
        }

        const trimesh = new CANNON.Trimesh(vertices, indices);

        const scale = new THREE.Vector3();
        child.getWorldScale(scale);
        trimesh.setScale(new CANNON.Vec3(scale.x, scale.y, scale.z));

        const body = new CANNON.Body({
          mass: 0,
          material: this.materials.materials.floor,
        });
        body.addShape(trimesh);

        const pos = new THREE.Vector3();
        child.getWorldPosition(pos);
        body.position.set(pos.x, pos.y, pos.z);

        const quat = new THREE.Quaternion();
        child.getWorldQuaternion(quat);
        body.quaternion.set(quat.x, quat.y, quat.z, quat.w);

        this.physicsWorld.addBody(body);
        state.physicsBodies.push(body);
      }

      if (child.isMesh && (name.includes("crate") || name.includes("table") || name.includes("barrel"))) {
        const geometry = child.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const worldScale = new THREE.Vector3();
        child.getWorldScale(worldScale);

        // Transform center to world space
        child.localToWorld(center);

        const halfExtents = new CANNON.Vec3(
          (size.x * worldScale.x) * 0.5,
          (size.y * worldScale.y) * 0.5,
          (size.z * worldScale.z) * 0.5
        );

        const body = new CANNON.Body({
          mass: 0,
          material: this.materials.materials.default,
        });
        body.addShape(new CANNON.Box(halfExtents));

        body.position.set(center.x, center.y, center.z);

        const quat = new THREE.Quaternion();
        child.getWorldQuaternion(quat);
        body.quaternion.set(quat.x, quat.y, quat.z, quat.w);

        this.physicsWorld.addBody(body);
        state.physicsBodies.push(body);
      }
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
