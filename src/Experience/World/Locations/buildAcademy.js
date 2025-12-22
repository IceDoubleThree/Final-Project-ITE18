import * as THREE from "three";
import * as CANNON from "cannon-es";

export default function buildAcademy(state) {
  // Ground plane (Academy)
  // Academy model's plane was removed; we render a new textured ground here.
  {
    const baseColor = this.resources.items.academyGroundBaseColor;
    const normal = this.resources.items.academyGroundNormal;
    const roughness = this.resources.items.academyGroundRoughness;
    const ao = this.resources.items.academyGroundAO;

    if (baseColor) {
      const setRepeat = (tex, repeat) => {
        if (!tex) return;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat, repeat);
        tex.needsUpdate = true;
      };

      // Repeat the textures across the 200x200 plane.
      const repeat = 10;
      setRepeat(baseColor, repeat);
      setRepeat(normal, repeat);
      setRepeat(roughness, repeat);
      setRepeat(ao, repeat);

      if ("colorSpace" in baseColor) baseColor.colorSpace = THREE.SRGBColorSpace;
      else baseColor.encoding = THREE.sRGBEncoding;

      const groundGeo = new THREE.PlaneGeometry(500, 500);
      // Needed for aoMap
      groundGeo.setAttribute(
        "uv2",
        new THREE.BufferAttribute(groundGeo.attributes.uv.array, 2)
      );

      const groundMat = new THREE.MeshStandardMaterial({
        map: baseColor,
        normalMap: normal || null,
        roughnessMap: roughness || null,
        aoMap: ao || null,
        roughness: 1,
        metalness: 0,
      });

      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.name = "academy-ground";
      ground.rotation.x = -Math.PI * 0.5;
      ground.position.copy(state.origin);
      ground.position.y = state.origin.y;
      ground.receiveShadow = true;
      state.group.add(ground);
      state.disposables.push(groundGeo, groundMat);
    }
  }

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

    // --- Outside tree billboards (instanced) ---
    // Uses /models/lodbillboard_summer_trees_pack.glb which is a group of 3 billboard meshes.
    const treesResource = this.resources.items.summerTreeBillboards;
    if (treesResource?.scene) {
      const treeScene = treesResource.scene;
      treeScene.updateMatrixWorld(true);

      const billboardMeshes = [];
      treeScene.traverse((child) => {
        if (child.isMesh) billboardMeshes.push(child);
      });

      if (billboardMeshes.length > 0) {
        const groundY = state.origin.y;

        // Fixed spawn square around the location origin.
        // "70 from axial radius to edge" => half-size 70 along X/Z from center.
        const halfSize = 80;
        const minX = state.origin.x - halfSize;
        const maxX = state.origin.x + halfSize;
        const minZ = state.origin.z - halfSize;
        const maxZ = state.origin.z + halfSize;

        const pickAlong = (min, max) => min + Math.random() * (max - min);

        const clusterPositions = [];
        const totalClusters = 50;

        // Spawn on the square perimeter (random side each time)
        for (let i = 0; i < totalClusters; i++) {
          const side = Math.floor(Math.random() * 4);
          if (side === 0) {
            // West edge
            clusterPositions.push(new THREE.Vector3(minX, groundY, pickAlong(minZ, maxZ)));
          } else if (side === 1) {
            // East edge
            clusterPositions.push(new THREE.Vector3(maxX, groundY, pickAlong(minZ, maxZ)));
          } else if (side === 2) {
            // South edge
            clusterPositions.push(new THREE.Vector3(pickAlong(minX, maxX), groundY, minZ));
          } else {
            // North edge
            clusterPositions.push(new THREE.Vector3(pickAlong(minX, maxX), groundY, maxZ));
          }
        }

        const tmpPos = new THREE.Vector3();
        const tmpQuat = new THREE.Quaternion();
        const tmpScale = new THREE.Vector3();
        const tmpMatrix = new THREE.Matrix4();

        for (const billboardMesh of billboardMeshes) {
          billboardMesh.updateMatrixWorld(true);
          billboardMesh.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);

          const instanced = new THREE.InstancedMesh(
            billboardMesh.geometry,
            billboardMesh.material,
            clusterPositions.length
          );
          instanced.name = `academy-tree-billboard-${billboardMesh.name || 'mesh'}`;
          instanced.castShadow = true;
          instanced.receiveShadow = true;

          for (let i = 0; i < clusterPositions.length; i++) {
            const p = clusterPositions[i];
            tmpMatrix.compose(
              new THREE.Vector3(p.x + tmpPos.x, p.y + tmpPos.y, p.z + tmpPos.z),
              tmpQuat,
              tmpScale
            );
            instanced.setMatrixAt(i, tmpMatrix);
          }

          instanced.instanceMatrix.needsUpdate = true;
          state.group.add(instanced);
        }
      }
    }

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
