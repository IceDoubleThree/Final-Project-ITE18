import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildRoad2Academy(state) {
  const resource = this.resources.items.roadToAcademyModel;
  // Warp zones gathered from the model; declared in function scope so update() can see it
  const warpZones = [];
  if (resource?.scene) {
    const model = resource.scene.clone();
    // Rotate model -90 degrees in the XZ plane (around Y axis)
    model.rotation.y = Math.PI * 0.5;
    model.position.copy(state.origin);
    state.group.add(model);

    model.updateMatrixWorld(true);
    // Find spawn marker(s) and place player there, and collect warp zones
    model.traverse((child) => {
      if (child.userData && child.userData.is_spawn) {
        const wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        if (this.player && this.player.mesh) this.player.mesh.position.copy(wp);
        if (this.player && this.player.body) {
          this.player.body.position.set(wp.x, wp.y + 2, wp.z);
          this.player.body.velocity.set(0, 0, 0);
        }
      }

      if (child.userData && child.userData.is_level_warp) {
        const wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        const radius = 2;
        warpZones.push({ position: wp.clone(), radius, triggered: false, node: child });
        try {
          const portal = new Portal(this, wp.clone(), 'Academy', 'Warp', 0xffffff, {
            size: new THREE.Vector3(radius * 2, 2, radius * 2),
            interactionRadius: radius,
            options: [
              {
                label: 'Next Level',
                onSelect: () => {
                  const game = this.experience?.game;
                  const lm = game?.levelManager;
                  if (lm && Array.isArray(lm.levels)) {
                    const nextIndex = lm.currentLevelIndex + 1;
                    if (nextIndex >= 0 && nextIndex < lm.levels.length) {
                      try {
                        lm.startLevel(nextIndex);
                        return;
                      } catch (e) {
                        // fallback below
                      }
                    }
                  }
                  this.loadLocation('Academy');
                },
              },
            ],
          });
          state.portals.push(portal);
        } catch (e) {
          // ignore
        }
      }
    });

    // Prepare lists of available replacement models (from resources)
    const treeCandidates = [
      this.resources.items?.tree1Model,
      this.resources.items?.tree2Model,
      this.resources.items?.tree3Model,
      this.resources.items?.tree4Model,
    ].filter(Boolean);

    const boulderCandidates = [
      this.resources.items?.boulderLModel,
      this.resources.items?.boulderL2Model,
      this.resources.items?.boulderMModel,
      this.resources.items?.boulderM2Model,
      this.resources.items?.boulderSModel,
      this.resources.items?.boulderS2Model,
    ].filter(Boolean);

    // Replace placeholder objects whose name contains 'tree' or 'boulder'
    model.traverse((child) => {
      if (!child.name) return;
      const lname = (child.name || '').toLowerCase();
      if (lname.includes('tree') && treeCandidates.length > 0 && !child.userData._replaced) {
        const pick = treeCandidates[Math.floor(Math.random() * treeCandidates.length)];
        if (pick?.scene) {
          const inst = pick.scene.clone(true);
          const pos = new THREE.Vector3();
          const quat = new THREE.Quaternion();
          child.getWorldPosition(pos);
          child.getWorldQuaternion(quat);
          inst.position.copy(pos);
          inst.quaternion.copy(quat);
          const scaleFactor = 0.9 + Math.random() * 0.3;
          inst.scale.multiplyScalar(scaleFactor);
          inst.updateMatrixWorld(true);
          inst.traverse((n) => {
            if (n.isMesh) {
              n.castShadow = true;
              n.receiveShadow = true;
            }
          });
          state.group.add(inst);
          child.userData._replaced = true;
          child.visible = false;
        }
      }

      if (lname.includes('boulder') && boulderCandidates.length > 0 && !child.userData._replaced) {
        const pick = boulderCandidates[Math.floor(Math.random() * boulderCandidates.length)];
        if (pick?.scene) {
          const inst = pick.scene.clone(true);
          const pos = new THREE.Vector3();
          const quat = new THREE.Quaternion();
          child.getWorldPosition(pos);
          child.getWorldQuaternion(quat);
          inst.position.copy(pos);
          inst.quaternion.copy(quat);
          inst.rotation.y += (Math.random() - 0.5) * Math.PI * 2 * 0.1;
          const scaleFactor = 0.8 + Math.random() * 0.5;
          inst.scale.multiplyScalar(scaleFactor);
          inst.updateMatrixWorld(true);
          inst.traverse((n) => {
            if (n.isMesh) {
              n.castShadow = true;
              n.receiveShadow = true;
            }
          });
          state.group.add(inst);
          child.userData._replaced = true;
          child.visible = false;
        }
      }
    });

    // Create physics bodies for any 'barrier' helper nodes: treat their child meshes as static boxes
    model.traverse((node) => {
      if (!node.name) return;
      const lname = node.name.toLowerCase();
      if (!lname.includes('barrier')) return;

      node.traverse((mesh) => {
        if (!mesh.isMesh) return;
        try {
          const geometry = mesh.geometry;
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);
          mesh.localToWorld(center);
          const worldScale = new THREE.Vector3();
          mesh.getWorldScale(worldScale);

          const halfExtents = new CANNON.Vec3(
            (size.x * worldScale.x) * 0.5,
            (size.y * worldScale.y) * 0.5,
            (size.z * worldScale.z) * 0.5
          );

          const body = new CANNON.Body({ mass: 0, material: this.materials.materials.default });
          body.addShape(new CANNON.Box(halfExtents));
          body.position.set(center.x, center.y, center.z);
          const quat = new THREE.Quaternion();
          mesh.getWorldQuaternion(quat);
          body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
          this.physicsWorld.addBody(body);
          state.physicsBodies.push(body);
        } catch (e) {
          console.warn('Failed to create barrier physics body:', e);
        }
      });

      // keep helper children visible (visual meshes are real geometry)
    });

    // Create physics bodies for named meshes
    model.traverse((child) => {
      if (!child.isMesh) return;
      const name = (child.name || "").toLowerCase();

      // Road -> Trimesh
      if (name.includes("road")) {
        try {
          const geometry = child.geometry;
          const vertices = geometry.attributes.position.array;
          let indices;
          if (geometry.index) indices = geometry.index.array;
          else {
            indices = [];
            for (let i = 0; i < geometry.attributes.position.count; i++) indices.push(i);
          }
          const trimesh = new CANNON.Trimesh(vertices, indices);
          const scale = new THREE.Vector3();
          child.getWorldScale(scale);
          trimesh.setScale(new CANNON.Vec3(scale.x, scale.y, scale.z));

          const body = new CANNON.Body({ mass: 0, material: this.materials.materials.floor });
          body.addShape(trimesh);
          const pos = new THREE.Vector3();
          child.getWorldPosition(pos);
          body.position.set(pos.x, pos.y, pos.z);
          const quat = new THREE.Quaternion();
          child.getWorldQuaternion(quat);
          body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
          this.physicsWorld.addBody(body);
          state.physicsBodies.push(body);
        } catch (e) {
          console.warn("Failed to create road trimesh:", e);
        }
        return;
      }

      // Crate-like objects -> box
      if (name.includes("crate")) {
        try {
          const geometry = child.geometry;
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);
          child.localToWorld(center);
          const worldScale = new THREE.Vector3();
          child.getWorldScale(worldScale);

          const halfExtents = new CANNON.Vec3(
            (size.x * worldScale.x) * 0.5,
            (size.y * worldScale.y) * 0.5,
            (size.z * worldScale.z) * 0.5
          );
          const body = new CANNON.Body({ mass: 0, material: this.materials.materials.default });
          body.addShape(new CANNON.Box(halfExtents));
          body.position.set(center.x, center.y, center.z);
          const quat = new THREE.Quaternion();
          child.getWorldQuaternion(quat);
          body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
          this.physicsWorld.addBody(body);
          state.physicsBodies.push(body);
        } catch (e) {
          console.warn("Failed to create crate physics body:", e);
        }
        return;
      }

      // Physics primitives: let helpers pick them up
      if (name.includes("physics")) {
        return;
      }
    });

    // Let engine helpers process physics primitives and colliders
    const physicsMeshes = this.createPhysicsBodiesFromPhysicsMeshes(model, state, {
      material: this.materials.materials.floor,
    });
    if (!physicsMeshes || physicsMeshes.length === 0) {
      this.createPhysicsBodiesFromColliders(model, state, {
        material: this.materials.materials.floor,
      });
    }

    // Enable shadows on visible meshes
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  // Add a fallback floor plane so physics has a ground
  const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.materials.materials.floor });
  floorBody.position.copy(state.origin);
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5);
  this.physicsWorld.addBody(floorBody);
  state.physicsBodies.push(floorBody);

  return {
    update: () => {
      // Check warp zones each frame and trigger level objective when player enters
      const playerPos = this.player?.mesh?.position;
      if (!playerPos) return;
      const lm = this.experience?.game?.levelManager;
      for (const wz of warpZones) {
        if (wz.triggered) continue;
        const dx = playerPos.x - wz.position.x;
        const dz = playerPos.z - wz.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= wz.radius) {
          wz.triggered = true;
          // Old-style immediate warp: load the next level location now and
          // also inform LevelManager so statistics/state stay in sync.
          const game = this.experience?.game;
          const lmLocal = game?.levelManager;

          // Prefer to advance to the next configured level index
          let nextIndex = null;
          if (lmLocal && Number.isFinite(lmLocal.currentLevelIndex)) {
            nextIndex = lmLocal.currentLevelIndex + 1;
          }

          // Fallback: try to find the Academy level by key
          if (nextIndex === null || nextIndex < 0 || nextIndex >= (lmLocal?.levels?.length || 0)) {
            if (lmLocal && Array.isArray(lmLocal.levels)) {
              const idx = lmLocal.levels.findIndex((lvl) => lvl.locationKey === 'Academy');
              if (idx >= 0) nextIndex = idx;
            }
          }

          // Determine the location key to load
          let nextKey = 'Academy';
          if (lmLocal && Number.isFinite(nextIndex) && lmLocal.levels[nextIndex]) {
            nextKey = lmLocal.levels[nextIndex].locationKey || nextKey;
          }

          // Signal the LevelManager that the warp was reached so it can show
          // the objective-complete overlay. Then call victory() after a short
          // delay so the player sees the overlay before the next level loads.
          if (lmLocal) {
            lmLocal._warpReached = true;
            lmLocal.checkObjective();

            // Log for debugging and schedule a robust transition path.
            console.log('[Warp] Warp reached at Road2Academy, scheduling transition to', nextKey, 'index', nextIndex);

            try {
              setTimeout(() => {
                try {
                  // Prefer to use LevelManager.startLevel with the resolved nextIndex
                  // which cleanly initializes the next level. Mark current level
                  // as completed in statistics so run summary is accurate.
                  if (lmLocal.statistics && lmLocal.statistics.perLevel && Number.isFinite(lmLocal.currentLevelIndex)) {
                    if (!lmLocal.statistics.perLevel[lmLocal.currentLevelIndex]) lmLocal.statistics.perLevel[lmLocal.currentLevelIndex] = { kills: 0, items: 0, completed: false };
                    lmLocal.statistics.perLevel[lmLocal.currentLevelIndex].completed = true;
                  }

                  if (Number.isFinite(nextIndex) && typeof lmLocal.startLevel === 'function') {
                    lmLocal.startLevel(nextIndex);
                    return;
                  }

                  // Fallback to calling victory() if startLevel isn't available
                  if (typeof lmLocal.victory === 'function') {
                    lmLocal.victory();
                    return;
                  }

                  // Final fallback: directly load location
                  if (this.loadLocation) this.loadLocation(nextKey, { forceReload: true, _fromLevelStart: true });
                } catch (e) {
                  console.warn('[Warp] Transition failed, loading fallback location:', e);
                  if (this.loadLocation) this.loadLocation(nextKey, { forceReload: true, _fromLevelStart: true });
                }
              }, 2500);
            } catch (e) {
              // ignore scheduling errors
            }
          } else {
            // If no level manager, perform a direct load after a short delay
            console.log('[Warp] No LevelManager found, loading next location directly in 2500ms:', nextKey);
            setTimeout(() => {
              if (this.loadLocation) this.loadLocation(nextKey, { forceReload: true, _fromLevelStart: true });
            }, 2500);
          }
        }
      }
    },
    cleanup: () => {
      // nothing special yet
    }
  };
}
