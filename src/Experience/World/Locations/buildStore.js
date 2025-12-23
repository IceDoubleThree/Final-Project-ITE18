import * as THREE from "three";
import * as CANNON from "cannon-es";
import Portal from "../Portal.js";

export default function buildStore(state) {
  const input = this.experience?.input;
  const player = this.experience?.world?.player;
  const dialogue = this.experience?.dialogue;

  const resource = this.resources.items.storeModel;
  if (resource?.scene) {
    const model = resource.scene;
    model.scale.set(1, 1, 1);
    model.position.copy(state.origin);
    state.group.add(model);
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
    },
  };
}
