import * as THREE from "three";
import * as CANNON from "cannon-es";
import Experience from "../Experience.js";
import Environment from "./Environment.js";
import PhysicsMaterials from "./PhysicsMaterials.js";
import Player from "./Player.js"; 
import NPC from "./NPC.js";
import Portal from "./Portal.js";

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
        this.initOriginDebugMarker();
        this.initPlayerDebugOverlay();
        this.initPhysicsDebug();
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
        geom.rotateZ(Math.PI * 0.5);
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

    const { group, material, meshes } = this.physicsDebug;
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

        const ox = offset?.x ?? 0;
        const oy = offset?.y ?? 0;
        const oz = offset?.z ?? 0;
        const rotatedOffset = new CANNON.Vec3(ox, oy, oz);
        body.quaternion.vmult(rotatedOffset, rotatedOffset);

        mesh.position.set(
          body.position.x + rotatedOffset.x,
          body.position.y + rotatedOffset.y,
          body.position.z + rotatedOffset.z
        );

        const qBody = body.quaternion;
        const qShape = orient || new CANNON.Quaternion(0, 0, 0, 1);
        const qWorld = qBody.mult(qShape);
        mesh.quaternion.set(qWorld.x, qWorld.y, qWorld.z, qWorld.w);
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
          { reload: () => this.loadLocation(this.debugState.location) },
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
        
        // Fallback size check
        const size = new THREE.Vector3();
        combinedBox.getSize(size);
        if (size.x < 0.01) {
            new THREE.Box3().setFromObject(model).getSize(size);
        }

        const center = new THREE.Vector3();
        combinedBox.getCenter(center);
        combinedBox.getSize(size);

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
          const body = new CANNON.Body({ mass: 0, material: this.materials.materials.floor });
          body.addShape(new CANNON.Box(halfExtents));
          body.position.copy(position);
          this.physicsWorld.addBody(body);
          state.physicsBodies.push(body);
        };

        addWallBox(new CANNON.Vec3(halfT, size.y * 0.5, size.z * 0.5), new THREE.Vector3(combinedBox.min.x - halfT, center.y, center.z));
        addWallBox(new CANNON.Vec3(halfT, size.y * 0.5, size.z * 0.5), new THREE.Vector3(combinedBox.max.x + halfT, center.y, center.z));
        addWallBox(new CANNON.Vec3(size.x * 0.5, size.y * 0.5, halfT), new THREE.Vector3(center.x, center.y, combinedBox.min.z - halfT));
        addWallBox(new CANNON.Vec3(size.x * 0.5, size.y * 0.5, halfT), new THREE.Vector3(center.x, center.y, combinedBox.max.z + halfT));
      }
    }

    const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.materials.materials.floor });
    floorBody.position.copy(state.origin);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5);
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    const portal = new Portal(this, new THREE.Vector3(state.origin.x - 4.4, state.origin.y, state.origin.z - 2), null, "Portal", 0xffff00, {
      size: new THREE.Vector3(2, 2.5, 2),
      interactionRadius: 1,
      options: [{ label: "Go to Stage Area", destinationKey: "StageDesign" }],
    });
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
          if(target) {
            target.x = Math.max(bounds.minX + m, Math.min(bounds.maxX - m, target.x));
            target.z = Math.max(bounds.minZ + m, Math.min(bounds.maxZ - m, target.z));
            target.y = Math.min(5.2, target.y);
          }
          camera.controls.maxDistance = 15;
        }
      },
      cleanup: () => { this.experience.camera.controls.maxDistance = 15; },
    };
  }

  buildStageDesign(state) {
    const resource = this.resources.items.stageModel;
    if (resource?.scene) {
      const model = resource.scene;
      model.position.copy(state.origin);
      state.group.add(model);
      model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
    }

    const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.materials.materials.floor });
    floorBody.position.copy(state.origin);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5);
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    const portalPos = new THREE.Vector3(state.origin.x + 5, state.origin.y, state.origin.z - 5);
    state.portals.push(new Portal(this, portalPos, null, "Portal", 0xffff00, {
      size: new THREE.Vector3(2, 2.5, 2),
      interactionRadius: 1,
      options: [{ label: "Go to Empty Stage", destinationKey: "BlankStage" }],
    }));
    
    const pl = new THREE.PointLight(0xffff00, 1, 10);
    pl.position.copy(portalPos).add(new THREE.Vector3(0,2,0));
    state.group.add(pl);

    return { update: () => state.portals.forEach((p) => p.update()) };
  }

  buildBlankStage(state) {
    const floorGeometry = new THREE.PlaneGeometry(state.size.width, state.size.depth);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.receiveShadow = true;
    floorMesh.position.copy(state.origin);
    state.group.add(floorMesh);

    const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.materials.materials.floor });
    floorBody.position.copy(state.origin);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5);
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    state.portals.push(new Portal(this, new THREE.Vector3(state.origin.x, state.origin.y, state.origin.z + 5), null, "Portal", 0xff0000, {
      size: new THREE.Vector3(2, 2.5, 2),
      interactionRadius: 1,
      options: [{ label: "Go to Stage Area", destinationKey: "StageDesign" }],
    }));
    state.disposables.push(floorGeometry, floorMaterial);
    return { update: () => state.portals.forEach((p) => p.update()) };
  }

  buildStore(state) {
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
      notice.position.set(state.origin.x + -12, state.origin.y + 2.5, state.origin.z + 7.2);
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

    const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.materials.materials.floor });
    floorBody.position.copy(state.origin);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5);
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    return { update: () => state.portals.forEach((p) => p.update()) };
  }

  buildForest(state) {
    const al = new THREE.AmbientLight('#ffffff', 0.8);
    state.group.add(al); state.disposables.push(al);
    const sl = new THREE.DirectionalLight('#ffffff', 2);
    sl.position.set(10, 30, 10); sl.castShadow = true;
    state.group.add(sl); state.disposables.push(sl);

    const resource = this.resources.items.forestModel;
    if (resource?.scene) {
      const model = resource.scene.clone();
      model.position.copy(state.origin);
      state.group.add(model);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true; child.receiveShadow = true;
          // Fix unsupported textures to prevent warnings/black rendering
          if(child.material) {
             child.material.metalnessMap = null;
             child.material.roughnessMap = null;
             child.material.normalMap = null;
             child.material.needsUpdate = true;
          }
        }
      });
      this.createPhysicsBodiesFromColliders(model, state, { material: this.materials.materials.floor });
    }

    const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: this.materials.materials.floor });
    floorBody.position.copy(state.origin);
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5);
    this.physicsWorld.addBody(floorBody);
    state.physicsBodies.push(floorBody);

    state.portals.push(new Portal(this, new THREE.Vector3(state.origin.x, state.origin.y, state.origin.z + 5), null, "Exit Forest", 0x228822, {
      size: new THREE.Vector3(2, 3, 2),
      interactionRadius: 2,
      options: [{ label: "Return to Store", onSelect: () => this.loadLocation("Store", { spawnOffset: new THREE.Vector3(-10, 0, 10) }) }]
    }));

    return { update: () => state.portals.forEach((p) => p.update()) };
  }

  buildAcademy(state) {
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

      this.createPhysicsBodiesFromColliders(model, state, {
        material: this.materials.materials.floor,
      });
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