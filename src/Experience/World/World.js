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
    this.physicsDebug = null;

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

  isColliderObject(object3d) {
    const name = (object3d?.name || "").toLowerCase();
    return name.endsWith("_collider");
  }

  /**
   * Finds objects named with `_collider` suffix, hides them, and turns them into
   * static Cannon bodies (fast primitive Box colliders).
   *
   * Returns an array of collider objects found.
   */
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
      // Always invisible in the render, still active for physics
      obj.visible = false;

      // Prefer oriented box based on local geometry bounds (Mesh)
      if (obj instanceof THREE.Mesh && obj.geometry) {
        const geometry = obj.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;

        if (bbox) {
          bbox.getCenter(tmpCenter);
          bbox.getSize(tmpSize);

          obj.getWorldScale(worldScale);
          obj.getWorldQuaternion(worldQuat);

          // Convert local center to world
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

      // Fallback: axis-aligned world AABB box (works for Groups too)
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
      meshes: new Map(), // key: `${body.id}:${shapeIndex}`
      geometryCache: new Map(),
    };

    // Optional GUI toggle
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
        // Cannon cylinders are oriented along X; Three cylinders are along Y.
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

        // World position = body.position + body.quaternion * offset
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

        // World quaternion = body.quaternion * shapeOrientation
        const qBody = body.quaternion;
        const qShape = orient || new CANNON.Quaternion(0, 0, 0, 1);
        const qWorld = qBody.mult(qShape);
        mesh.quaternion.set(qWorld.x, qWorld.y, qWorld.z, qWorld.w);
      }
    }

    // Remove stale debug meshes (bodies/shapes removed)
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

      // If physics debug already initialized, expose toggle.
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

      return;
    }
  }

  createLocationConfigs() {
    return {
      Room: {
        key: "Room",
        origin: new THREE.Vector3(0, 0, 0),
        spawnOffset: new THREE.Vector3(6.5, 0, 2),
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

    // 2. Reset Player Position (Move to Origin + optional spawn offset)
    this.resetPlayer(config.origin, config.spawnOffset);

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
      cameraBounds: null,
      debugBoundingBoxes: [],
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

    // Debug bounding boxes for all meshes in this location
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

      // --- `_collider` meshes: invisible + physics bodies ---
      const colliderObjects = this.createPhysicsBodiesFromColliders(model, state, {
        material: this.materials.materials.floor,
      });

      // If colliders exist, use their bounds for camera limits.
      if (colliderObjects.length > 0) {
        const combined = new THREE.Box3().makeEmpty();
        colliderObjects.forEach((obj) => combined.expandByObject(obj));

        const cameraMargin = 0.2;
        state.cameraBounds = {
          minX: combined.min.x + cameraMargin,
          maxX: combined.max.x - cameraMargin,
          minZ: combined.min.z + cameraMargin,
          maxZ: combined.max.z - cameraMargin,
        };
      }

      // --- Wall-name based colliders (separate implementation) ---
      // This keeps compatibility with older Room exports that had wall nodes,
      // and can coexist with `_collider` meshes.
      const targetWallNames = new Set(["wall", "wall2"]);
      const wallObjects = [];

      model.updateWorldMatrix(true, true);
      model.traverse((obj) => {
        const name = (obj.name || "").toLowerCase();
        if (targetWallNames.has(name)) wallObjects.push(obj);
      });

      if (wallObjects.length > 0) {
        const combinedBox = new THREE.Box3().makeEmpty();
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();

        wallObjects.forEach((obj) => {
          combinedBox.expandByObject(obj);
        });

        // Fallback if bounds are degenerate (common when the named node is just a pivot)
        combinedBox.getSize(size);
        if (size.x < 0.01 || size.z < 0.01) {
          const fallback = new THREE.Box3().setFromObject(model);
          fallback.getSize(size);
          if (size.x >= 0.01 && size.z >= 0.01) {
            combinedBox.copy(fallback);
          }
        }

        combinedBox.getCenter(center);
        combinedBox.getSize(size);

        if (this.debug?.active) {
          console.log("🧱 Room wall bounds:", {
            min: combinedBox.min.clone(),
            max: combinedBox.max.clone(),
            size: size.clone(),
            center: center.clone(),
            matched: wallObjects.map((o) => o.name),
          });
        }

        // Only set camera bounds from walls if they weren't set by `_collider` meshes.
        if (!state.cameraBounds) {
          const cameraMargin = 0.2;
          state.cameraBounds = {
            minX: combinedBox.min.x + cameraMargin,
            maxX: combinedBox.max.x - cameraMargin,
            minZ: combinedBox.min.z + cameraMargin,
            maxZ: combinedBox.max.z - cameraMargin,
          };
        }

        // Thickness of the collider walls (in world units)
        const thickness = 0.2;
        const halfT = thickness * 0.5;

        const addWallBox = (halfExtents, position) => {
          const shape = new CANNON.Box(halfExtents);
          const body = new CANNON.Body({
            mass: 0,
            material: this.materials.materials.floor,
          });
          body.addShape(shape);
          body.position.set(position.x, position.y, position.z);
          this.physicsWorld.addBody(body);
          state.physicsBodies.push(body);
        };

        // Build 4 thin axis-aligned walls around the combined bounds.
        // Left / Right walls (normal +/-X)
        addWallBox(
          new CANNON.Vec3(
            halfT,
            Math.max(size.y * 0.5, 0.1),
            Math.max(size.z * 0.5, 0.1)
          ),
          new THREE.Vector3(combinedBox.min.x - halfT, center.y, center.z)
        );
        addWallBox(
          new CANNON.Vec3(
            halfT,
            Math.max(size.y * 0.5, 0.1),
            Math.max(size.z * 0.5, 0.1)
          ),
          new THREE.Vector3(combinedBox.max.x + halfT, center.y, center.z)
        );

        // Front / Back walls (normal +/-Z)
        addWallBox(
          new CANNON.Vec3(
            Math.max(size.x * 0.5, 0.1),
            Math.max(size.y * 0.5, 0.1),
            halfT
          ),
          new THREE.Vector3(center.x, center.y, combinedBox.min.z - halfT)
        );
        addWallBox(
          new CANNON.Vec3(
            Math.max(size.x * 0.5, 0.1),
            Math.max(size.y * 0.5, 0.1),
            halfT
          ),
          new THREE.Vector3(center.x, center.y, combinedBox.max.z + halfT)
        );
      } else if (this.debug?.active) {
        console.warn(
          "⚠️ Could not find 'wall' or 'wall2' in room.glb; no wall boxes were created."
        );
      }
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
      "Stage Area"
    );
    portal.mesh.rotation.y = Math.PI * 0.5;
    state.group.add(portal.mesh);
    state.portals.push(portal);

    return {
      update: () => {
        state.portals.forEach((p) => p.update());

        // --- CAMERA CLAMP INSIDE ROOM BOUNDS (Room) ---
        const bounds = state.cameraBounds;
        const camera = this.experience.camera;
        if (!bounds || !camera?.instance || !camera.controls) return;

        const controls = camera.controls;
        const cameraPos = camera.instance.position;
        const target = controls.target;
        const margin = 0.1;
        const roofY = 5.2;

        // Clamp camera position inside box defined by room bounds and roof height
        cameraPos.x = Math.min(
          bounds.maxX - margin,
          Math.max(bounds.minX + margin, cameraPos.x)
        );
        cameraPos.z = Math.min(
          bounds.maxZ - margin,
          Math.max(bounds.minZ + margin, cameraPos.z)
        );
        cameraPos.y = Math.min(roofY, cameraPos.y);

        // Clamp orbit target as well so zoom/orbit stays inside
        if (target) {
          target.x = Math.min(
            bounds.maxX - margin,
            Math.max(bounds.minX + margin, target.x)
          );
          target.z = Math.min(
            bounds.maxZ - margin,
            Math.max(bounds.minZ + margin, target.z)
          );
          target.y = Math.min(roofY, target.y);
        }

        // Keep a sensible max zoom-out distance
        controls.maxDistance = 15;
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

    if (this.debug?.active && this.physicsDebug) {
      this.updatePhysicsDebug();
    }
  }
}