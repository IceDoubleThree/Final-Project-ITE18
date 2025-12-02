import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import Experience from "./Experience.js"

export default class Camera {
    constructor() {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.canvas = this.experience.canvas
        
        // --- NEW: Camera Modes ---
        this.modes = {
            follow: true, // Default: Follow the player
        }

        this.setInstance()
        this.setControls()
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            35,
            this.sizes.width / this.sizes.height,
            0.1,
            100
        )
        this.instance.position.set(6, 4, 8)
        this.scene.add(this.instance)
    }

    setControls() {
        this.controls = new OrbitControls(this.instance, this.canvas)
        this.controls.enableDamping = true
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    update() {
        // Check if player exists (to prevent crash on load)
        const playerExists = this.experience.world && this.experience.world.player

        if (this.modes.follow && playerExists) {
            // --- FOLLOW MODE ---
            
            // 1. Disable OrbitControls so they don't fight the follow logic
            this.controls.enabled = false

            // 2. Get Player Position (Mesh)
            const playerPosition = this.experience.world.player.mesh.position

            // 3. Calculate Target Position (e.g., 0 units left, 10 up, 10 back)
            // You can tweak these numbers to change the camera angle
            const offset = new THREE.Vector3(0, 10, 10)
            const targetPosition = playerPosition.clone().add(offset)

            // 4. Smoothly move camera (Lerp)
            // 0.1 = Slow/Cinematic, 1.0 = Instant/Locked
            this.instance.position.lerp(targetPosition, 0.1)

            // 5. Always look at the player
            this.instance.lookAt(playerPosition)
        } 
        else {

            // 1. Re-enable controls
            this.controls.enabled = true
            
            // 2. Update controls for damping
            this.controls.update()
        }
    }
}