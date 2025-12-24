import * as THREE from "three";
import Experience from "../Experience.js";

export default class WeaponDrop {
  constructor(position, weaponKey) {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.player = this.experience.world.player;
    this.time = this.experience.time;
    this.resources = this.experience.resources;

    this.weaponKey = weaponKey;
    this.isActive = true;

    // Container for the drop visual
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.position.y += 0.5;
    this.scene.add(this.group);

    this.mesh = null;
    this._setupVisuals();

    // Floating animation state
    this.yStart = this.group.position.y;
  }

  _setupVisuals() {
    // 1. Try to find the pistol model from the character asset
    let sourceMesh = null;
    const charModel = this.resources.items.mainCharacter;

    if (charModel && charModel.scene) {
      charModel.scene.traverse((child) => {
        const name = child.name.toLowerCase();
        // Look for the mesh named 'pistol' or 'gun'
        if (child.isMesh && (name.includes("pistol") || name.includes("gun"))) {
          sourceMesh = child;
        }
      });
    }

    if (sourceMesh) {
      // Clone the pistol mesh
      this.mesh = sourceMesh.clone();
      this.mesh.visible = true; // Ensure it's visible (might be hidden in player model)

      // Apply a material overlay to distinguish Rifle vs Shotgun drops?
      // Blue glow for Rifle, Red for Shotgun
      const color = this.weaponKey === "rifle" ? 0x0088ff : 0xff2200;

      // We clone the material so we don't mess up the player's actual gun
      const newMat = this.mesh.material.clone();
      newMat.emissive = new THREE.Color(color);
      newMat.emissiveIntensity = 0.5;
      this.mesh.material = newMat;

      // Scale it up a bit for visibility
      this.mesh.scale.set(1.5, 1.5, 1.5);

      // Center it
      this.mesh.position.set(0, 0, 0);

      // Fix rotation (guns usually point forward, we want it flat or spinning nicely)
      this.mesh.rotation.set(0, 0, 0);

      this.group.add(this.mesh);
    } else {
      // Fallback: Wireframe Box if model not found
      const color = this.weaponKey === "rifle" ? 0x0088ff : 0xff2200;
      const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        wireframe: true,
      });
      this.mesh = new THREE.Mesh(geo, mat);
      this.group.add(this.mesh);
    }

    // Add a point light to make it pop
    const lightColor = this.weaponKey === "rifle" ? 0x0088ff : 0xff2200;
    const light = new THREE.PointLight(lightColor, 1, 3);
    light.position.set(0, 0.2, 0);
    this.group.add(light);
  }

  update() {
    if (!this.isActive) return;

    // Animate (Spin and Float)
    const time = this.time.elapsed * 0.001;

    // Spin the group
    this.group.rotation.y = time * 2;

    // Bob up and down
    this.group.position.y = this.yStart + Math.sin(time * 3) * 0.2;

    // Check distance to player
    if (this.player && this.player.mesh) {
      const dist = this.group.position.distanceTo(this.player.mesh.position);
      if (dist < 2.0) {
        this.collect();
      }
    }
  }

  collect() {
    this.isActive = false;
    this.player.unlockWeapon(this.weaponKey);
    this.destroy();
  }

  destroy() {
    this.scene.remove(this.group);
    if (this.mesh) {
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
    }
    // Dispose children (light, etc)
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}
