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
    model.position.y += 0.5; // lift the entire location model slightly upward
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
        const radius = 10;
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

  // Schedule Road->Academy background music (loop) after a short delay
  try {
    // Clear any previous timer if location reloaded
    if (state._bgmTimeout) {
      clearTimeout(state._bgmTimeout)
      state._bgmTimeout = null
    }
    state._bgmTimeout = setTimeout(() => {
      try {
        const sh = this.experience?.soundHandler;
        if (sh && typeof sh.playAudio === 'function') {
          sh.playAudio({
            src: '/audio/bgm/library of ruina inspired sketch - AZALI.m4a',
            loop: true,
            gap: 0
          });
        }
      } catch (err) {
        console.warn('[Road2Academy] delayed bgm play failed', err);
      }
      state._bgmTimeout = null
    }, 5000);
  } catch (e) {
    console.warn('[Road2Academy] bgm schedule failed', e);
  }

  return {
    update: () => {
      // Check warp zones each frame and trigger level objective when player enters
      const playerPos = this.player?.mesh?.position;
      if (!playerPos) return;

      // Detection: when player crosses the Z plane at z = 93 (from below
      // to >=93), spawn 5 walkers once at random positions within a 5-unit
      // radius centered at (0,0,125) (relative to location origin).
      try {
        if (!state._walkerSpawned) {
          const lastZ = typeof state._lastPlayerZ === 'number' ? state._lastPlayerZ : playerPos.z;
          if (lastZ < 93 && playerPos.z >= 93) {
            state._walkerSpawned = true;
            const center = (state.origin ? state.origin.clone() : new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3(0, 0, 125));
            for (let i = 0; i < 5; i++) {
              const angle = Math.random() * Math.PI * 2;
              const radius = Math.random() * 5; // up to 5 units
              const pos = center.clone();
              pos.x += Math.cos(angle) * radius;
              pos.z += Math.sin(angle) * radius;
              // Use world spawn helper
              try {
                this.experience?.world?.spawnEnemyAt(pos, 'walker');
              } catch (e) {
                console.warn('[Road2Academy] spawn walker failed', e);
              }
            }
            // Show a short subtitle sequence informing the player
            try {
              const dialogue = this.experience?.dialogue;
              const seq = [
                { text: "We've spawned some enemies for you.", duration: 3000 },
                { text: 'Press Left Click to SHOOT, and Right Click to AIM', duration: 5000 }
              ];
              if (dialogue && typeof dialogue.displaySubtitleSequence === 'function') {
                dialogue.displaySubtitleSequence(seq, 0, { force: true });
              } else {
                const subEl = document.getElementById('subtitle');
                if (subEl) {
                  subEl.textContent = seq[0].text;
                  subEl.classList.add('visible');
                  setTimeout(() => {
                    subEl.textContent = seq[1].text;
                    setTimeout(() => subEl.classList.remove('visible'), seq[1].duration || 3000);
                  }, seq[0].duration || 3000);
                }
              }
            } catch (e) {
              console.warn('[Road2Academy] subtitle sequence failed', e);
            }
          }
          state._lastPlayerZ = playerPos.z;
        } else {
          state._lastPlayerZ = playerPos.z;
        }
      } catch (e) {
        console.warn('[Road2Academy] walker detection error', e);
      }

      // Additional Z-crossing triggers
      try {
        const lastZ = typeof state._lastPlayerZ === 'number' ? state._lastPlayerZ : playerPos.z;

        // z = 135: spawn 5 walkers at 0,0,150 with scatter
        if (!state._z135Triggered && playerPos.z >= 135) {
          state._z135Triggered = true;
          try {
            console.log('[Road2Academy] z135 trigger fired, spawning 5 walkers');
            const center = (state.origin ? state.origin.clone() : new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3(0, 0, 150));
            for (let i = 0; i < 5; i++) {
              const pos = center.clone();
              const ang = Math.random() * Math.PI * 2;
              const r = Math.random() * 5; // scatter radius up to 5
              pos.x += Math.cos(ang) * r;
              pos.z += Math.sin(ang) * r;
              try {
                this.experience?.world?.spawnEnemyAt(pos, 'walker');
              } catch (e) {
                console.warn('[Road2Academy] spawn walker (z135) failed', e);
              }
            }
          } catch (e) { console.warn('[Road2Academy] z135 spawn failed', e); }
        }

        // z = 160 subtitles
        if (!state._z160Triggered && playerPos.z >= 160) {
          state._z160Triggered = true;
          try {
            const dialogue = this.experience?.dialogue;
            const seq = [
              { text: 'The path seems to be blocked', duration: 3500 },
              { text: 'Hmm, try running towards those wooden barriers.', duration: 4500 }
            ];
            if (dialogue && typeof dialogue.displaySubtitleSequence === 'function') {
              dialogue.displaySubtitleSequence(seq, 0, { force: true });
            } else {
              const subEl = document.getElementById('subtitle');
              if (subEl) {
                subEl.textContent = seq[0].text;
                subEl.classList.add('visible');
                setTimeout(() => {
                  subEl.textContent = seq[1].text;
                  setTimeout(() => subEl.classList.remove('visible'), seq[1].duration || 3000);
                }, seq[0].duration || 3000);
              }
            }
          } catch (e) { console.warn('[Road2Academy] z160 subtitle failed', e); }
        }

        // z = 180: spawn 8 walkers at 0,0,213 with scatter
        if (!state._z180Triggered && playerPos.z >= 180) {
          state._z180Triggered = true;
          try {
            console.log('[Road2Academy] z180 trigger fired, spawning 8 walkers');
            const center = (state.origin ? state.origin.clone() : new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3(0, 0, 213));
            for (let i = 0; i < 8; i++) {
              const pos = center.clone();
              const ang = Math.random() * Math.PI * 2;
              const r = Math.random() * 6; // scatter radius up to 6
              pos.x += Math.cos(ang) * r;
              pos.z += Math.sin(ang) * r;
              try {
                this.experience?.world?.spawnEnemyAt(pos, 'walker');
              } catch (e) {
                console.warn('[Road2Academy] spawn walker (z180) failed', e);
              }
            }
          } catch (e) { console.warn('[Road2Academy] z180 spawn failed', e); }
        }

        // z = 187 subtitles
        if (!state._z187Triggered && playerPos.z >= 187) {
          state._z187Triggered = true;
          try {
            const dialogue = this.experience?.dialogue;
            const seq = [
              { text: 'Wooden barriers will launch you in the air when you run towards it', duration: 4500 },
              { text: "Why does it do that? I dunno, ask the developer.", duration: 4000 }
            ];
            if (dialogue && typeof dialogue.displaySubtitleSequence === 'function') {
              dialogue.displaySubtitleSequence(seq, 0, { force: true });
            } else {
              const subEl = document.getElementById('subtitle');
              if (subEl) {
                subEl.textContent = seq[0].text;
                subEl.classList.add('visible');
                setTimeout(() => {
                  subEl.textContent = seq[1].text;
                  setTimeout(() => subEl.classList.remove('visible'), seq[1].duration || 3000);
                }, seq[0].duration || 3000);
              }
            }
          } catch (e) { console.warn('[Road2Academy] z187 subtitle failed', e); }
        }

        // z = 228: spawn 30 runners in sequence every 1s at 0,0,330
        if (!state._z228Triggered && playerPos.z >= 228) {
          state._z228Triggered = true;
          try {
            console.log('[Road2Academy] z228 trigger fired, starting runner spawns')
            // Show subtitles about runners
            const dialogue = this.experience?.dialogue;
            const seq = [
              { text: 'Enemy type: Runners. They are fast little buggers', duration: 3500 },
              { text: 'Clear the next wave of enemies', duration: 3500 }
            ];
            if (dialogue && typeof dialogue.displaySubtitleSequence === 'function') {
              dialogue.displaySubtitleSequence(seq, 0, { force: true });
            } else {
              const subEl = document.getElementById('subtitle');
              if (subEl) {
                subEl.textContent = seq[0].text;
                subEl.classList.add('visible');
                setTimeout(() => {
                  subEl.textContent = seq[1].text;
                  setTimeout(() => subEl.classList.remove('visible'), seq[1].duration || 3000);
                }, seq[0].duration || 3000);
              }
            }

            // Start spawning 15 runners in batches of 3 every 5 seconds
            const center = (state.origin ? state.origin.clone() : new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3(0, 0, 330));
            let spawned = 0;
            state._runnerSpawnCount = 0;
            const spawnPerBatch = 3;
            const totalToSpawn = 15;

            const doSpawnBatch = () => {
              for (let b = 0; b < spawnPerBatch && spawned < totalToSpawn; b++) {
                spawned++;
                state._runnerSpawnCount = spawned;
                const pos = center.clone();
                const ang = Math.random() * Math.PI * 2;
                const r = Math.random() * 2;
                pos.x += Math.cos(ang) * r;
                // add a random negative z offset up to 10 units so spawns can be behind the center
                pos.z += Math.sin(ang) * r - (Math.random() * 10);
                try {
                  this.experience?.world?.spawnEnemyAt(pos, 'runner');
                } catch (e) {
                  console.warn('[Road2Academy] spawn runner failed', e);
                }
              }
            };

            // Immediate first batch
            doSpawnBatch();

            state._runnerInterval = setInterval(() => {
              if (spawned >= totalToSpawn) {
                clearInterval(state._runnerInterval);
                state._runnerInterval = null;
                return;
              }
              doSpawnBatch();
            }, 5000);
          } catch (e) { console.warn('[Road2Academy] z228 spawn failed', e); }
        }
      } catch (e) {
        console.warn('[Road2Academy] z-crossing checks failed', e);
      }

        // z = 271: spawn 10 walkers at 0,0,325 with scatter
        if (!state._z271Triggered && playerPos.z >= 271) {
          state._z271Triggered = true;
          try {
            console.log('[Road2Academy] z271 trigger fired, spawning 10 walkers');
            const center = (state.origin ? state.origin.clone() : new THREE.Vector3(0, 0, 0)).add(new THREE.Vector3(0, 0, 325));
            for (let i = 0; i < 10; i++) {
              const pos = center.clone();
              const ang = Math.random() * Math.PI * 2;
              const r = Math.random() * 7; // scatter radius up to 7
              pos.x += Math.cos(ang) * r;
              pos.z += Math.sin(ang) * r;
              try {
                this.experience?.world?.spawnEnemyAt(pos, 'walker');
              } catch (e) {
                console.warn('[Road2Academy] spawn walker (z271) failed', e);
              }
            }
          } catch (e) { console.warn('[Road2Academy] z271 spawn failed', e); }
        }

        // (Intro trigger removed from location file; intro is now managed by GameManager)
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
      // Clear any runner spawn interval started by z=228 trigger
      try {
        if (state._runnerInterval) {
          clearInterval(state._runnerInterval);
          state._runnerInterval = null;
        }
      } catch (e) {
        // ignore
      }
      // Clear any scheduled bgm start
      try {
        if (state._bgmTimeout) {
          clearTimeout(state._bgmTimeout);
          state._bgmTimeout = null;
        }
      } catch (e) {
        // ignore
      }
      // Fade out/stop location BGM when leaving the location
      try {
        this.experience?.soundHandler?.fadeOut?.(800);
      } catch (e) {
        // ignore
      }
    }
  };
}
