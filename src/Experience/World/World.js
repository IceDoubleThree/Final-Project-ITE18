import * as THREE from "three";
import * as CANNON from "cannon-es";
import Experience from "../Experience.js";
import Environment from "./Environment.js";
import PhysicsMaterials from "./PhysicsMaterials.js";
import Player from "./player.js";
import NPC from "./NPC.js";
import Portal from "./Portal.js";

export default class World {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.resources = this.experience.resources;
    this.debug = this.experience.debug;
    this.playerDebugElement = null;

    // 1. Setup Physics
    this.physicsWorld = new CANNON.World();
    this.physicsWorld.gravity.set(0, -9.82, 0);
    this.materials = new PhysicsMaterials(this.physicsWorld);
    this.isPhysicsActive = false; // Start paused

    // 2. Setup Player Globally (Pass physics info)
    this.player = new Player(this.physicsWorld, this.materials);

    this.currentLocation = null;
    this.locationConfigs = this.createLocationConfigs();

    this.experience.input.on("cameraToggle", () => {
      this.experience.camera.modes.follow =
        !this.experience.camera.modes.follow;
    });

    this.resources.on("ready", () => {
      this.environment = new Environment();
      this.setupDevMenu();

      // Debug overlay for player coordinates (only in #debug mode)
      if (this.debug?.active) {
        this.initPlayerDebugOverlay();
      }

      // --- Default Start Location: Room ---
      if (this.debugState) {
        this.debugState.location = "Room";
        this.loadLocation("Room");
      } else {
        this.loadLocation("Room");
      }
    });
  }

  initPlayerDebugOverlay() {
    if (this.playerDebugElement) return;

    const el = document.createElement("div");
    el.id = "player-debug-coords";
    el.style.position = "fixed";
    el.style.left = "10px";
    el.style.bottom = "10px";
    el.style.padding = "6px 10px";
    el.style.background = "rgba(0, 0, 0, 0.7)";
    el.style.color = "#0f0";
    el.style.fontFamily = "monospace";
    el.style.fontSize = "12px";
    el.style.zIndex = "9999";
    el.style.pointerEvents = "none";
    el.textContent = "Player: x=0.00 y=0.00 z=0.00";

    document.body.appendChild(el);
    this.playerDebugElement = el;
  }

  setupDevMenu() {
    const keys = Object.keys(this.locationConfigs);

    // Prefer debug UI when available
    if (this.debug?.active && this.debug.ui) {
      this.debugFolder = this.debug.ui.addFolder("world");
      this.debugState = { location: keys[0] || null };

      this.debugFolder
        .add(this.debugState, "location", keys)
        .name("location")
        .onChange((key) => {
          if (key) this.loadLocation(key);
        });

      this.debugFolder
        .add(
          { reload: () => this.loadLocation(this.debugState.location) },
          "reload"
        )
        .name("reload");

      return;
    }
  }

  createLocationConfigs() {
    return {
      Room: {
        key: "Room",
        origin: new THREE.Vector3(0, 0, 0),
        size: { width: 50, depth: 50 },
        background: "#000000", // Dark sky for Room
        build: (state) => this.buildRoom(state),
      },
      StageDesign: {
        key: "StageDesign",
        origin: new THREE.Vector3(0, 0, 0),
        size: { width: 30, depth: 30 },
        background: "#222222",
        build: (state) => this.buildStageDesign(state),
      },
      BlankStage: {
        key: "BlankStage",
        origin: new THREE.Vector3(0, 0, 0),
        size: { width: 50, depth: 50 },
        background: "#ffffff",
        build: (state) => this.buildBlankStage(state),
      },
      Store: {
        key: "Store",
        origin: new THREE.Vector3(0, 0, 0),
        size: { width: 50, depth: 50 },
        background: "skyblue",
        backgroundTextureKey: "storeSky",
        build: (state) => this.buildStore(state),
      },
    };
  }

  loadLocation(locationKey) {
    console.log(`🗺️ Loading: ${locationKey}`);

    const config = this.locationConfigs[locationKey];
    if (!config) {
      console.warn(`⚠️ Unknown location: ${locationKey}`);
      return;
    }

    // 1. Cleanup Old Location
    this.destroyCurrentLocation();

    // 2. Reset Player Position (Move to Origin)
    this.resetPlayer(config.origin);

    // 3. Instantiate New Location
    this.currentLocation = this.buildLocation(config);

    // 4. Activate Physics
    this.isPhysicsActive = true;

    // 5. Update Environment (if texture exists)
    if (this.environment && this.environment.environmentMap) {
      this.environment.environmentMap.updateMaterials();
    }

    // Update debug selection if needed
    if (this.debugState) this.debugState.location = locationKey;
  }

  resetPlayer(origin) {
    if (!this.player || !this.player.body) return;

    console.log("📍 Resetting Player to Location Origin");
    this.player.body.velocity.set(0, 0, 0);
    this.player.body.angularVelocity.set(0, 0, 0);

    const target = new CANNON.Vec3(origin.x, origin.y + 2, origin.z);
    this.player.body.position.copy(target);
    this.player.mesh.position.copy(target);
  }

  buildLocation(config) {
    const group = new THREE.Group();
    this.scene.add(group);

    // Apply environment per location
    if (config.backgroundTextureKey) {
      const tex = this.resources.items[config.backgroundTextureKey];
      if (tex) {
        // Ensure correct color space for skies
        if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
        else tex.encoding = THREE.sRGBEncoding;
        this.scene.background = tex;
      } else if (config.background) {
        this.scene.background = new THREE.Color(config.background);
      } else {
        this.scene.background = null;
      }
    } else {
      this.scene.background = config.background
        ? new THREE.Color(config.background)
        : null;
    }
    this.scene.fog = config.fog
      ? new THREE.Fog(config.fog.color, config.fog.near, config.fog.far)
      : null;

    const state = {
      key: config.key,
      origin: config.origin.clone(),
      size: config.size,
      group,
      physicsBodies: [],
      disposables: [],
      npcs: [],
      portals: [],
      updates: [],
    };

    // Debug perimeter helper
    if (this.debug?.active) {
      const perimeter = this.createPerimeterHelper(config.size);
      perimeter.position.copy(config.origin);
      group.add(perimeter);
      state.disposables.push(perimeter.geometry, perimeter.material);
    }

    const buildResult = config.build(state);
    if (buildResult?.update) state.updates.push(buildResult.update);
    if (buildResult?.cleanup) state.customCleanup = buildResult.cleanup;

    return state;
  }

  createPerimeterHelper(size) {
    const boxGeometry = new THREE.BoxGeometry(size.width, 0.05, size.depth);
    const geometry = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();
    const material = new THREE.LineBasicMaterial({ color: 0x00ff88 });
    const helper = new THREE.LineSegments(geometry, material);
    helper.position.set(0, 0.025, 0);
    return helper;
  }

  destroyCurrentLocation() {
    if (!this.currentLocation) return;

    console.log("🧹 Destroying old location...");
    const loc = this.currentLocation;

    if (loc.customCleanup) loc.customCleanup();

    // Cleanup NPCs
    if (loc.npcs) {
      loc.npcs.forEach((npc) => {
        if (npc.prompt && npc.prompt.remove) npc.prompt.remove();
        if (npc.mesh && npc.mesh.parent) npc.mesh.parent.remove(npc.mesh);
        if (npc.mesh?.geometry) npc.mesh.geometry.dispose();
        if (npc.mesh?.material) npc.mesh.material.dispose();
        if (npc.body) this.physicsWorld.removeBody(npc.body);
      });
    }

    // Cleanup Portals
    if (loc.portals) {
      loc.portals.forEach((portal) => {
        portal.destroy();
      });
    }

    loc.physicsBodies.forEach((body) => this.physicsWorld.removeBody(body));

    loc.disposables.forEach((item) => {
      if (item?.dispose) item.dispose();
    });

    if (loc.group) this.scene.remove(loc.group);

    this.scene.background = null;
    this.scene.fog = null;

    this.currentLocation = null;
  }

  // ==========================================
  // BUILDER: Room (Starting Area)
  // ==========================================
  buildRoom(state) {
    console.log("🏗️ Building Room (Start)");
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
    }

    // Floor Physics
    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: floorShape,
      material: this.materials.materials.floor,
    });
    floorBody.position.set(state.origin.x, state.origin.y, state.origin.z);
    floorBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI * 0.5
    );
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    // --- Room boundary values (used for camera limits only) ---
    const wallDistance = 4;  
    const wallOffsetX = 0.2; 
    const wallOffsetZ = -0.1; 


    // --- Portal ---
    const portalPos = new THREE.Vector3(
      state.origin.x - 4.4, 
      state.origin.y,
      state.origin.z - 2
    );

    const portal = new Portal(
      this,
      portalPos,
      "StageDesign",
      "Stage Area",
    );
    portal.mesh.rotation.y = Math.PI * 0.5;
    state.group.add(portal.mesh);
    state.portals.push(portal);

    // --- CAMERA BOUNDARY CALCULATIONS ---
    const minX = state.origin.x + wallOffsetX - wallDistance;
    const maxX = state.origin.x + wallOffsetX + wallDistance;
    const minZ = state.origin.z + wallOffsetZ - wallDistance;
    const maxZ = state.origin.z + wallOffsetZ + wallDistance;
    const buffer = 0.2; 

    return {
      update: () => {
        state.portals.forEach((p) => p.update());

        // --- DYNAMIC CAMERA COLLISION SYSTEM ---
        const controls = this.experience.camera.controls;
        const playerPos = this.player.mesh.position;
        const cameraPos = this.experience.camera.instance.position;

        // 1. Calculate direction vector from Player to Camera
        const dir = new THREE.Vector3().subVectors(cameraPos, playerPos).normalize();
        
        // 2. Find distance to the closest wall in that direction
        // --- CHANGED: Target distance is now 15 ---
        let maxAllowedDistance = 15; 

        // Check X Intersections
        if (dir.x > 0) {
            const distToWall = (maxX - buffer - playerPos.x) / dir.x;
            if (distToWall > 0) maxAllowedDistance = Math.min(maxAllowedDistance, distToWall);
        } else if (dir.x < 0) {
            const distToWall = (minX + buffer - playerPos.x) / dir.x;
            if (distToWall > 0) maxAllowedDistance = Math.min(maxAllowedDistance, distToWall);
        }

        // Check Z Intersections
        if (dir.z > 0) {
            const distToWall = (maxZ - buffer - playerPos.z) / dir.z;
            if (distToWall > 0) maxAllowedDistance = Math.min(maxAllowedDistance, distToWall);
        } else if (dir.z < 0) {
            const distToWall = (minZ + buffer - playerPos.z) / dir.z;
            if (distToWall > 0) maxAllowedDistance = Math.min(maxAllowedDistance, distToWall);
        }

        // 3. Apply Limit to Controls
        controls.maxDistance = Math.max(0.5, maxAllowedDistance);
      },
      cleanup: () => {
          // Reset default when leaving
          this.experience.camera.controls.maxDistance = 15; 
      },
    };
  }

  // ==========================================
  // BUILDER: Stage Design
  // ==========================================
  buildStageDesign(state) {
    console.log("🏗️ STARTING BUILD: Stage Design");

    // 1. Load the GLB Model
    const resource = this.resources.items.stageModel;
    if (resource && resource.scene) {
      const model = resource.scene;
      model.position.copy(state.origin);
      state.group.add(model);

      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }

    // 2. Physics Floor
    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: floorShape,
      material: this.materials.materials.floor,
    });
    floorBody.position.set(state.origin.x, state.origin.y, state.origin.z);
    floorBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI * 0.5
    );
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    // 3. Portal (Fixed Position)
    const portalPos = new THREE.Vector3(
      state.origin.x + 5,
      state.origin.y,
      state.origin.z - 5
    );
    const portal = new Portal(
      this,
      portalPos,
      "BlankStage",
      "Empty Stage",
      0xffff00
    );
    state.group.add(portal.mesh);
    state.portals.push(portal);

    const portalLight = new THREE.PointLight(0xffff00, 1, 10);
    portalLight.position.copy(portalPos);
    portalLight.position.y += 2;
    state.group.add(portalLight);

    return {
      update: () => {
        state.portals.forEach((p) => p.update());
      },
      cleanup: () => {},
    };
  }

  // ==========================================
  // BUILDER: Blank Stage
  // ==========================================
  buildBlankStage(state) {
    console.log("🏗️ Building Blank Stage...");
    const floorGeometry = new THREE.PlaneGeometry(
      state.size.width,
      state.size.depth
    );
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.receiveShadow = true;
    floorMesh.position.copy(state.origin);
    state.group.add(floorMesh);

    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: floorShape,
      material: this.materials.materials.floor,
    });
    floorBody.position.set(state.origin.x, state.origin.y, state.origin.z);
    floorBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI * 0.5
    );
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    const backPortalPos = new THREE.Vector3(
      state.origin.x,
      state.origin.y,
      state.origin.z + 5
    );
    const backPortal = new Portal(
      this,
      backPortalPos,
      "StageDesign",
      "Main Room",
      0xff0000
    );
    state.group.add(backPortal.mesh);
    state.portals.push(backPortal);

    state.disposables.push(floorGeometry, floorMaterial);

    return {
      update: () => {
        state.portals.forEach((p) => p.update());
      },
    };
  }

  // ==========================================
  // BUILDER: Store
  // ==========================================
  buildStore(state) {
    const resource = this.resources.items.storeModel;
    let model = null;
    if (resource?.scene) {
      model = resource.scene;
      model.scale.set(1, 1, 1);
      model.position.copy(state.origin);
      state.group.add(model);
    }

    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: floorShape,
      material: this.materials.materials.floor,
    });
    floorBody.position.set(state.origin.x, state.origin.y, state.origin.z);
    floorBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(1, 0, 0),
      -Math.PI * 0.5
    );
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    return {
      update: () => {},
      cleanup: () => {},
    };
  }

  update() {
    if (this.physicsWorld && this.isPhysicsActive) {
      this.physicsWorld.step(1 / 60, this.experience.time.delta / 1000, 3);
    }

    if (this.currentLocation) {
      this.currentLocation.updates?.forEach((fn) => fn());
    }

    if (this.player) {
      this.player.update();
    }

    if (this.debug?.active && this.playerDebugElement && this.player?.mesh) {
      const p = this.player.mesh.position;
      this.playerDebugElement.textContent = `Player: x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`;
    }
  }
}