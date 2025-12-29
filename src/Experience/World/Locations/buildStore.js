import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildStore(state) {
  const input = this.experience?.input;
  const player = this.experience?.world?.player;
  const dialogue = this.experience?.dialogue;

  const resource = this.resources.items.storeModel;
  // Track bodies/objects we add so cleanup can remove them specifically
  const _addedBodies = [];
  const _addedTrees = [];
  if (resource?.scene) {
    const model = resource.scene;
    model.scale.set(1, 1, 1);
    model.position.copy(state.origin);
    // Traverse meshes to apply userData-driven behavior:
    // - userData.is_invisible -> hide mesh
    // - userData.is_physics -> create a static physics body for the mesh
    // - userData.is_tree -> spawn a tree model at that mesh's transform
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Invisible marker
        if (child.userData && child.userData.is_invisible) {
          child.visible = false;
        }

        // Physics marker: create a static body approximating the mesh
        if (child.userData && child.userData.is_physics) {
          try {
            if (child.geometry) child.geometry.computeBoundingBox();
            const bbox = child.geometry && child.geometry.boundingBox;
            if (bbox) {
              const size = new THREE.Vector3();
              bbox.getSize(size);

              const halfExtents = new CANNON.Vec3(
                Math.max(size.x, 0.001) * 0.5,
                Math.max(size.y, 0.001) * 0.5,
                Math.max(size.z, 0.001) * 0.5
              );
              const boxShape = new CANNON.Box(halfExtents);

              const body = new CANNON.Body({
                mass: 0,
                shape: boxShape,
                material:
                  (this.materials && this.materials.materials && this.materials.materials.floor) || undefined,
              });

              child.updateWorldMatrix(true, false);
              const worldPos = new THREE.Vector3();
              const worldQuat = new THREE.Quaternion();
              child.getWorldPosition(worldPos);
              child.getWorldQuaternion(worldQuat);

              body.position.set(worldPos.x, worldPos.y, worldPos.z);
              body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);

              this.physicsWorld.addBody(body);
              state.physicsBodies.push(body);
              _addedBodies.push(body);
            }
          } catch (e) {
            console.warn('Failed to create physics body for mesh', child, e);
          }
        }

        // Tree marker: spawn tree model at this mesh location (if available in resources)
        if (child.userData && child.userData.is_tree) {
          // Use the explicit `tree4Model` resource name from sources.js
          const treeRes = this.resources.items && this.resources.items.tree4Model;
          if (treeRes && treeRes.scene) {
            const tree = treeRes.scene.clone(true);
            child.updateWorldMatrix(true, false);
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            child.getWorldPosition(worldPos);
            child.getWorldQuaternion(worldQuat);
            child.getWorldScale(worldScale);

            tree.position.copy(worldPos);
            tree.quaternion.copy(worldQuat);
            tree.scale.multiply(worldScale);
            tree.traverse((n) => {
              if (n.isMesh) {
                n.castShadow = true;
                n.receiveShadow = true;
              }
            });
            state.group.add(tree);
            _addedTrees.push(tree);
          } else {
            console.warn('Tree resource (tree4.glb) not found in resources.items');
          }
        }
      }
    });

    state.group.add(model);
  }

  // --- FIRST-TIME SUBTITLE TRIGGER (shorter) ---
  if (!this._storeVisited) {
    this._storeVisited = true

    const sequence = [
      { text: 'Welcome to the store area, this is where you will get upgrades in the future!', duration: 5000 },
      { text: 'If you are done checking things out. Proceed to the simulation warp :P', duration: 5000 }
    ]

    // Prefer the new helper if available; otherwise fall back to legacy behavior.
    if (dialogue?.displaySubtitleSequence) {
      dialogue.displaySubtitleSequence(sequence, 600)
    } else {
      // Fallback: simple show with small delay between lines
      setTimeout(() => {
        dialogue?.displaySubtitle?.(sequence[0].text, sequence[0].duration)
        setTimeout(() => {
          dialogue?.displaySubtitle?.(sequence[1].text, sequence[1].duration)
        }, sequence[0].duration + 200)
      }, 600)
    }
  }

  // --- DEBUG: Spawn a simple enemy target in Store ---
  // Spec: in debug mode, add a cylinder at (22, 0, 7) with 10 health.
  let dummyEnemyMesh = null;
  let dummyPromptEl = null;
  let _wasInteractHeld = false;
  const dummyInteractionRadius = 2.5;

  if (this.debug?.active) {
    const enemyPos = new THREE.Vector3(
      state.origin.x + 22,
      state.origin.y + 0,
      state.origin.z + 7
    );

    const geometry = new THREE.CylinderGeometry(0.6, 0.6, 2.2, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const enemyMesh = new THREE.Mesh(geometry, material);
    enemyMesh.name = 'placeholder enemy - dummy';
    enemyMesh.position.copy(enemyPos);
    enemyMesh.position.y += 1.1;
    enemyMesh.castShadow = true;
    enemyMesh.receiveShadow = true;
    enemyMesh.userData = enemyMesh.userData || {};
    enemyMesh.userData.type = 'enemy';
    enemyMesh.userData.name = 'dummy';
    enemyMesh.userData.maxHp = 10;
    enemyMesh.userData.hp = 10;

    state.group.add(enemyMesh);
    dummyEnemyMesh = enemyMesh;

    // Interaction prompt UI (reuse the same CSS/class as NPC prompts)
    dummyPromptEl = document.createElement('div');
    dummyPromptEl.classList.add('interact-prompt');
    dummyPromptEl.innerHTML = `
      <span class="key-icon">F</span>
      <span>Reload dummy</span>
    `;
    document.body.appendChild(dummyPromptEl);
  }

  // Notice marker (3D exclamation mark) to locate the game starter warp
  const noticeResource = this.resources.items.noticeModel;
  if (noticeResource?.scene) {
    const notice = noticeResource.scene.clone();
    notice.position.set(
      state.origin.x + -12,
      state.origin.y + 0.5,
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
          onSelect: () => {
            // Start the run using the configured first level (so ordering is controlled by LevelManager)
            const gm = this.experience?.game;
            const lm = gm?.levelManager;
            const firstKey = (lm && lm.levels && lm.levels[0] && lm.levels[0].locationKey) || 'Academy';
            if (this.experience && typeof this.experience.startRun === 'function') {
              this.experience.startRun(firstKey);
            } else {
              // Fallback
              this.startRun();
            }
          },
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

  // --- STORE SIGN INTERACTION ---
  // Small sign located at relative position (-5, 0, -1) from origin.
  const signPosition = new THREE.Vector3(
    state.origin.x - 5,
    state.origin.y + 0,
    state.origin.z - 1
  );

  state.portals.push(
    new Portal(this, signPosition, null, "Sign", 0xffffff, {
      size: new THREE.Vector3(1.2, 1.2, 0.2),
      interactionRadius: 1.5,
      options: [
        {
          label: "Sign",
          onSelect: () => {
            // Use DialogueReader (manual play) to show a short message with an empty name
            const dlg = dialogue || (this.experience && this.experience.dialogue) || this.dialogue;
            if (dlg && typeof dlg.play === 'function') {
              dlg.play([
                { name: '', text: 'Owner is currently out. Please come again later.' },
              ]);
            } else if (dlg && typeof dlg.displaySubtitle === 'function') {
              // Fallback to subtitle if no full dialogue reader is available
              dlg.displaySubtitle('Owner is currently out. Please come again later.', 4000);
            } else {
              console.log('Owner is currently out. Please come again later.');
            }
          },
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

  return {
    update: () => {
      state.portals.forEach((p) => p.update());

      // Debug-only interaction with the dummy enemy.
      if (!this.debug?.active) return;
      if (!dummyEnemyMesh || !input?.keys || !player?.mesh) return;

      // Prompt visibility
      if (dummyPromptEl) {
        const dialogueBusy = !!dialogue?.isActive?.();
        const pPos = player.mesh.position;
        const ePos = dummyEnemyMesh.position;
        const dx = pPos.x - ePos.x;
        const dz = pPos.z - ePos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (!dialogueBusy && dist <= dummyInteractionRadius) {
          dummyPromptEl.classList.add('visible');
        } else {
          dummyPromptEl.classList.remove('visible');
        }
      }

      const isHeld = !!input.keys.interact;
      const pressed = isHeld && !_wasInteractHeld;
      _wasInteractHeld = isHeld;

      if (!pressed) return;

      const pPos = player.mesh.position;
      const ePos = dummyEnemyMesh.position;
      const dx = pPos.x - ePos.x;
      const dz = pPos.z - ePos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= dummyInteractionRadius) {
        const ud = dummyEnemyMesh.userData || {};
        console.log('🧪 Dummy enemy interacted:', {
          name: ud.name ?? 'dummy',
          type: ud.type ?? 'enemy',
          hp: ud.hp,
          maxHp: ud.maxHp,
          dead: !!ud.dead,
          position: { x: ePos.x, y: ePos.y, z: ePos.z },
        });

        // "Reload" dummy: reset HP + revive/show it.
        const maxHp = Number.isFinite(ud.maxHp) ? ud.maxHp : 10;
        ud.maxHp = maxHp;
        ud.hp = maxHp;
        ud.dead = false;
        dummyEnemyMesh.visible = true;
        console.log('🔄 Dummy reloaded:', { hp: ud.hp, maxHp: ud.maxHp });
      }
    },
    cleanup: () => {
      if (dummyPromptEl && dummyPromptEl.remove) dummyPromptEl.remove();
      dummyPromptEl = null;
      dummyEnemyMesh = null;

      // Remove trees we spawned
      _addedTrees.forEach((t) => {
        if (t && t.parent) t.parent.remove(t);
      });
      _addedTrees.length = 0;

      // Remove physics bodies we added and unregister from state.physicsBodies
      _addedBodies.forEach((b) => {
        try {
          this.physicsWorld.removeBody(b);
        } catch (e) {}
        const idx = state.physicsBodies.indexOf(b);
        if (idx !== -1) state.physicsBodies.splice(idx, 1);
      });
      _addedBodies.length = 0;
    },
  };
}
