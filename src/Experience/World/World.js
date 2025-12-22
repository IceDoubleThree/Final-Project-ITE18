import * as THREE from "three";
import * as CANNON from "cannon-es";
import Experience from "../Experience.js";
import Environment from "./Environment.js";
import PhysicsMaterials from "./PhysicsMaterials.js";
import Player from "./Player.js"; 
import NPC from "./NPC.js";
import Portal from "./Portal.js";

import buildRoomImpl from "./Locations/buildRoom.js";
import buildStageDesignImpl from "./Locations/buildStageDesign.js";
import buildBlankStageImpl from "./Locations/buildBlankStage.js";
import buildStoreImpl from "./Locations/buildStore.js";
import buildForestImpl from "./Locations/buildForest.js";
import buildAcademyImpl from "./Locations/buildAcademy.js";

export default class World {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.resources = this.experience.resources;
    this.debug = this.experience.debug;
    this.time = this.experience.time; // Need time for physics step
    this.playerDebugElement = null;
    this.physicsDebug = null;
    this.originDebugMarker = null;

    // 1. Setup Physics
    this.physicsWorld = new CANNON.World();
    this.physicsWorld.gravity.set(0, -20, 0);
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
        this.initOriginDebugMarker();
        this.initPlayerDebugOverlay();
        this.initPhysicsDebug();
      }

      // --- Default Start Location: Room ---
      // If Experience.startGame/startRun already scheduled a location, don't auto-load here.
      const hasPendingStart =
        !!this.experience?._pendingStartGame && !!this.experience?._pendingStartLocationKey;

      if (!hasPendingStart) {
        if (this.debugState) this.debugState.location = "Room";
        this.loadLocation("Room");
      } else if (this.debugState) {
        this.debugState.location = this.experience._pendingStartLocationKey;
      }
    });
  }

  startRun() {
    // Starts the real game environment (timer/levels/kills) and loads level 1.
    this.experience.startRun("Academy");
  }

  // ... [Previous Helper Methods] ...

  initOriginDebugMarker() {
    if (this.originDebugMarker) return;

    const geometry = new THREE.SphereGeometry(0.12, 16, 12);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "world-origin-debug";
    mesh.position.set(0, 0, 0);
    mesh.renderOrder = 999999;

    this.scene.add(mesh);

    this.originDebugMarker = {
      enabled: true,
      mesh,
    };

    if (this.debug?.active && this.debug?.ui && this.debugFolder) {
      const state = { originMarker: true };
      this.debugFolder
        .add(state, "originMarker")
        .name("origin marker")
        .onChange((v) => {
          this.originDebugMarker.enabled = !!v;
          this.originDebugMarker.mesh.visible = !!v;
        });
    }
  }

  findObjectByName(root, exactName) {
    if (!root) return null;
    const target = (exactName || "").toLowerCase();
    let found = null;
    root.traverse((obj) => {
      if (found) return;
      const name = (obj.name || "").toLowerCase();
      if (name === target) found = obj;
    });
    return found;
  }

  isColliderObject(object3d) {
    const name = (object3d?.name || "").toLowerCase();
    return name.endsWith("_collider");
  }

  createPhysicsBodiesFromColliders(model, state, options = {}) {
    if (!model || !state) return [];

    const material = options.material || this.materials.materials.floor;
    const colliders = [];

    model.updateWorldMatrix(true, true);

    model.traverse((obj) => {
      if (!this.isColliderObject(obj)) return;
      colliders.push(obj);
    });

    if (colliders.length === 0) return colliders;

    const worldScale = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const tmpCenter = new THREE.Vector3();
    const tmpSize = new THREE.Vector3();

    for (const obj of colliders) {
      obj.visible = false;

      if (obj instanceof THREE.Mesh && obj.geometry) {
        const geometry = obj.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;

        if (bbox) {
          bbox.getCenter(tmpCenter);
          bbox.getSize(tmpSize);

          obj.getWorldScale(worldScale);
          obj.getWorldQuaternion(worldQuat);

          const centerWorld = tmpCenter.clone();
          obj.localToWorld(centerWorld);

          const halfExtents = new CANNON.Vec3(
            Math.max(0.001, Math.abs(tmpSize.x * worldScale.x) * 0.5),
            Math.max(0.001, Math.abs(tmpSize.y * worldScale.y) * 0.5),
            Math.max(0.001, Math.abs(tmpSize.z * worldScale.z) * 0.5)
          );

          const body = new CANNON.Body({ mass: 0, material });
          body.addShape(new CANNON.Box(halfExtents));
          body.position.set(centerWorld.x, centerWorld.y, centerWorld.z);
          body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);

          this.physicsWorld.addBody(body);
          state.physicsBodies.push(body);
          continue;
        }
      }

      const worldBox = new THREE.Box3().setFromObject(obj);
      worldBox.getCenter(tmpCenter);
      worldBox.getSize(tmpSize);
      if (tmpSize.x <= 0 || tmpSize.y <= 0 || tmpSize.z <= 0) continue;

      const halfExtents = new CANNON.Vec3(
        Math.max(0.001, tmpSize.x * 0.5),
        Math.max(0.001, tmpSize.y * 0.5),
        Math.max(0.001, tmpSize.z * 0.5)
      );

      const body = new CANNON.Body({ mass: 0, material });
      body.addShape(new CANNON.Box(halfExtents));
      body.position.set(tmpCenter.x, tmpCenter.y, tmpCenter.z);

      this.physicsWorld.addBody(body);
      state.physicsBodies.push(body);
    }

    return colliders;
  }

  isPhysicsPrimitiveObject(object3d) {
    const name = (object3d?.name || "").toLowerCase();
    return name.startsWith("physics_cube") || name.startsWith("physics_cylinder");
  }

  createPhysicsBodiesFromPhysicsMeshes(model, state, options = {}) {
    if (!model || !state) return [];

    const material = options.material || this.materials.materials.floor;
    const meshes = [];

    model.updateWorldMatrix(true, true);

    model.traverse((obj) => {
      if (!this.isPhysicsPrimitiveObject(obj)) return;
      if (obj instanceof THREE.Mesh && obj.geometry) meshes.push(obj);
    });

    if (meshes.length === 0) return meshes;

    const worldScale = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const tmpCenter = new THREE.Vector3();
    const tmpSize = new THREE.Vector3();
    const tmpCenterWorld = new THREE.Vector3();

    for (const mesh of meshes) {
      // Hide the editor-authored physics helper mesh
      mesh.visible = false;

      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      if (!bbox) continue;

      bbox.getCenter(tmpCenter);
      bbox.getSize(tmpSize);

      mesh.getWorldScale(worldScale);
      mesh.getWorldQuaternion(worldQuat);

      tmpCenterWorld.copy(tmpCenter);
      mesh.localToWorld(tmpCenterWorld);

      const name = (mesh.name || "").toLowerCase();
      const sx = Math.max(0.001, Math.abs(tmpSize.x * worldScale.x));
      const sy = Math.max(0.001, Math.abs(tmpSize.y * worldScale.y));
      const sz = Math.max(0.001, Math.abs(tmpSize.z * worldScale.z));

      if (name.startsWith("physics_cube")) {
        const halfExtents = new CANNON.Vec3(sx * 0.5, sy * 0.5, sz * 0.5);
        const body = new CANNON.Body({ mass: 0, material });
        body.addShape(new CANNON.Box(halfExtents));
        body.position.set(tmpCenterWorld.x, tmpCenterWorld.y, tmpCenterWorld.z);
        body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
        this.physicsWorld.addBody(body);
        state.physicsBodies.push(body);
        continue;
      }

      if (name.startsWith("physics_cylinder")) {
        const radius = Math.max(0.001, Math.max(sx, sz) * 0.5);
        const height = sy;
        const shape = new CANNON.Cylinder(radius, radius, height, 12);

        const body = new CANNON.Body({ mass: 0, material });
        // cannon-es Cylinder is Y-up by default
        body.addShape(shape);
        body.position.set(tmpCenterWorld.x, tmpCenterWorld.y, tmpCenterWorld.z);
        body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
        this.physicsWorld.addBody(body);
        state.physicsBodies.push(body);
        continue;
      }
    }

    return meshes;
  }

  initPhysicsDebug() {
    if (this.physicsDebug) return;

    const group = new THREE.Group();
    group.name = "cannon-debug";
    this.scene.add(group);

    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });

    const planeGeometry = new THREE.PlaneGeometry(20, 20);

    this.physicsDebug = {
      enabled: true,
      group,
      material,
      planeGeometry,
      meshes: new Map(),
      geometryCache: new Map(),
      tmpOffset: new CANNON.Vec3(0, 0, 0),
      tmpQuat: new CANNON.Quaternion(0, 0, 0, 1),
      identityQuat: new CANNON.Quaternion(0, 0, 0, 1),
    };

    if (this.debug?.active && this.debug?.ui && this.debugFolder) {
      const state = { physicsDebug: true };
      this.debugFolder
        .add(state, "physicsDebug")
        .name("physics debug")
        .onChange((v) => {
          this.physicsDebug.enabled = !!v;
          this.physicsDebug.group.visible = !!v;
        });
    }
  }

  getPhysicsDebugGeometry(shape) {
    const cache = this.physicsDebug.geometryCache;

    if (shape instanceof CANNON.Sphere) {
      const key = `sphere:${shape.radius}`;
      if (!cache.has(key)) {
        cache.set(key, new THREE.SphereGeometry(shape.radius, 16, 12));
      }
      return cache.get(key);
    }

    if (shape instanceof CANNON.Box) {
      const he = shape.halfExtents;
      const key = `box:${he.x},${he.y},${he.z}`;
      if (!cache.has(key)) {
        cache.set(key, new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2));
      }
      return cache.get(key);
    }

    if (shape instanceof CANNON.Cylinder) {
      const key = `cyl:${shape.radiusTop},${shape.radiusBottom},${shape.height},${shape.numSegments}`;
      if (!cache.has(key)) {
        const geom = new THREE.CylinderGeometry(
          shape.radiusTop,
          shape.radiusBottom,
          shape.height,
          shape.numSegments
        );
        cache.set(key, geom);
      }
      return cache.get(key);
    }

    if (shape instanceof CANNON.Plane) {
      return this.physicsDebug.planeGeometry;
    }

    return null;
  }

  updatePhysicsDebug() {
    if (!this.physicsDebug?.enabled) return;

    const { group, material, meshes, tmpOffset, tmpQuat, identityQuat } =
      this.physicsDebug;
    const seenKeys = new Set();

    for (const body of this.physicsWorld.bodies) {
      for (let i = 0; i < body.shapes.length; i++) {
        const shape = body.shapes[i];
        const key = `${body.id}:${i}`;
        seenKeys.add(key);

        let mesh = meshes.get(key);
        if (!mesh) {
          const geom = this.getPhysicsDebugGeometry(shape);
          if (!geom) continue;
          mesh = new THREE.Mesh(geom, material);
          mesh.frustumCulled = false;
          group.add(mesh);
          meshes.set(key, mesh);
        }

        const offset = body.shapeOffsets[i];
        const orient = body.shapeOrientations[i];

        tmpOffset.set(offset?.x ?? 0, offset?.y ?? 0, offset?.z ?? 0);
        body.quaternion.vmult(tmpOffset, tmpOffset);

        mesh.position.set(
          body.position.x + tmpOffset.x,
          body.position.y + tmpOffset.y,
          body.position.z + tmpOffset.z
        );

        const qBody = body.quaternion;
        const qShape = orient || identityQuat;
        qBody.mult(qShape, tmpQuat);
        mesh.quaternion.set(tmpQuat.x, tmpQuat.y, tmpQuat.z, tmpQuat.w);
      }
    }

    for (const [key, mesh] of meshes.entries()) {
      if (seenKeys.has(key)) continue;
      group.remove(mesh);
      meshes.delete(key);
    }
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
          { reload: () => this.loadLocation(this.debugState.location, { forceReload: true }) },
          "reload"
        )
        .name("reload");

      if (this.physicsDebug) {
        const state = { physicsDebug: this.physicsDebug.enabled };
        this.debugFolder
          .add(state, "physicsDebug")
          .name("physics debug")
          .onChange((v) => {
            this.physicsDebug.enabled = !!v;
            this.physicsDebug.group.visible = !!v;
          });
      }
    }
  }

  createLocationConfigs() {
    return {
      Room: {
        key: "Room",
        origin: new THREE.Vector3(0, 0, 0),
        spawnOffset: new THREE.Vector3(6.5, 0, 2),
        size: { width: 50, depth: 50 },
        background: "#000000",
        build: (state) => this.buildRoom(state),
      },
      Academy: {
        key: "Academy",
        origin: new THREE.Vector3(0, 0, 0),
        spawnOffset: new THREE.Vector3(0, 0, 5),
        size: { width: 80, depth: 80 },
        background: "#101015",
        backgroundTextureKey: "storeSky",
        build: (state) => this.buildAcademy(state),
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
      Forest: {
        key: "Forest",
        origin: new THREE.Vector3(0, 0, 0),
        size: { width: 100, depth: 100 },
        background: "#1e2f23",
        fog: { color: "#1e2f23", near: 5, far: 40 },
        build: (state) => this.buildForest(state),
      },
    };
  }

  loadLocation(locationKey, options = {}) {
    console.log(`🗺️ Loading: ${locationKey}`);

    // Avoid redundant reloads of the same location unless explicitly requested.
    // This prevents unintended player resets when multiple systems request the same load.
    if (
      !options?.forceReload &&
      this.currentLocation?.key &&
      this.currentLocation.key === locationKey
    ) {
      return;
    }

    const config = this.locationConfigs[locationKey];
    if (!config) {
      console.warn(`⚠️ Unknown location: ${locationKey}`);
      return;
    }

    this.destroyCurrentLocation();

    const spawnOffset = options?.spawnOffset ?? config.spawnOffset;
    this.resetPlayer(config.origin, spawnOffset);

    this.currentLocation = this.buildLocation(config);
    this.isPhysicsActive = true;

    if (this.experience?.game?.active) {
      this.experience.game.setLevel(locationKey);
    }

    if (this.environment && this.environment.environmentMap) {
      this.environment.environmentMap.updateMaterials();
    }

    if (this.debugState) this.debugState.location = locationKey;
  }

  resetPlayer(origin, spawnOffset) {
    if (!this.player || !this.player.body) return;

    console.log("📍 Resetting Player to Location Origin");
    this.player.body.velocity.set(0, 0, 0);
    this.player.body.angularVelocity.set(0, 0, 0);

    const ox = spawnOffset?.x ?? 0;
    const oy = spawnOffset?.y ?? 0;
    const oz = spawnOffset?.z ?? 0;

    const target = new CANNON.Vec3(origin.x + ox, origin.y + 2 + oy, origin.z + oz);
    this.player.body.position.copy(target);
    this.player.mesh.position.copy(target);
  }

  buildLocation(config) {
    const group = new THREE.Group();
    this.scene.add(group);

    if (config.backgroundTextureKey) {
      const tex = this.resources.items[config.backgroundTextureKey];
      if (tex) {
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
      cameraBounds: null,
      debugBoundingBoxes: [],
    };

    if (this.debug?.active) {
      const perimeter = this.createPerimeterHelper(config.size);
      perimeter.position.copy(config.origin);
      group.add(perimeter);
      state.disposables.push(perimeter.geometry, perimeter.material);
    }

    const buildResult = config.build(state);
    if (buildResult?.update) state.updates.push(buildResult.update);
    if (buildResult?.cleanup) state.customCleanup = buildResult.cleanup;

    if (this.debug?.active) {
      state.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const helper = new THREE.BoxHelper(obj, 0xff00ff);
          state.group.add(helper);
          state.debugBoundingBoxes.push(helper);
          if (helper.geometry) state.disposables.push(helper.geometry);
          if (helper.material) state.disposables.push(helper.material);
        }
      });

      if (state.debugBoundingBoxes.length > 0) {
        state.updates.push(() => {
          state.debugBoundingBoxes.forEach((h) => h.update());
        });
      }
    }

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

    const loc = this.currentLocation;
    if (loc.customCleanup) loc.customCleanup();

    if (loc.npcs) {
      loc.npcs.forEach((npc) => {
        if (npc.prompt && npc.prompt.remove) npc.prompt.remove();
        if (npc.mesh && npc.mesh.parent) npc.mesh.parent.remove(npc.mesh);
        if (npc.mesh?.geometry) npc.mesh.geometry.dispose();
        if (npc.mesh?.material) npc.mesh.material.dispose();
        if (npc.body) this.physicsWorld.removeBody(npc.body);
      });
    }

    if (loc.portals) {
      loc.portals.forEach((portal) => portal.destroy());
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

  // --- BUILDERS ---

  buildRoom(state) {
    return buildRoomImpl.call(this, state);
  }

  buildStageDesign(state) {
    return buildStageDesignImpl.call(this, state);
  }

  buildBlankStage(state) {
    return buildBlankStageImpl.call(this, state);
  }

  buildStore(state) {
    return buildStoreImpl.call(this, state);
  }

  buildForest(state) {
    return buildForestImpl.call(this, state);
  }

  buildAcademy(state) {
    return buildAcademyImpl.call(this, state);
  }

  // ==========================================
  //  THE UPDATE METHOD
  // ==========================================
  update() {
    // 1. Update Physics
    // Using a fixed time step of 1/60, and passing delta in seconds
    if (this.isPhysicsActive && this.physicsWorld) {
      this.physicsWorld.step(1 / 60, this.experience.time.delta * 0.001, 3);
    }

    // 2. Update Player
    if (this.player) {
      this.player.update();
    }

    // 3. Update Current Location Logic (Portals, etc)
    if (this.currentLocation && this.currentLocation.updates) {
      this.currentLocation.updates.forEach((updateFn) => updateFn());
    }

    // 4. Update NPCs
    if (this.currentLocation && this.currentLocation.npcs) {
      this.currentLocation.npcs.forEach((npc) => npc.update());
    }

    // 5. Update Physics Debugger
    if (this.physicsDebug && this.physicsDebug.enabled) {
      this.updatePhysicsDebug();
    }

    // 6. Update Player Debug Overlay
    if (this.playerDebugElement && this.player && this.player.mesh) {
      const { x, y, z } = this.player.mesh.position;
      this.playerDebugElement.textContent = `Player: x=${x.toFixed(2)} y=${y.toFixed(2)} z=${z.toFixed(2)}`;
    }
  }
}