import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import Experience from "./Experience.js"

export default class Camera {
    constructor() {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.canvas = this.experience.canvas
        
        this.modes = {
            follow: true, 
        }

        // --- Track previous position ---
        // We need this to calculate how far the player moved in one frame
        // so we can move the camera by the exact same amount.
        this.previousPlayerPosition = new THREE.Vector3()

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
        // Default position before player loads
        this.instance.position.set(6, 4, 8)
        this.scene.add(this.instance)
    }

    setControls() {
        this.controls = new OrbitControls(this.instance, this.canvas)
        this.controls.enableDamping = true

        // Prevent camera from going under the floor
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1
        
        // Zoom constraints
        this.controls.minDistance = 3 
        this.controls.maxDistance = 15
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    update() {
        // Check if player mesh is actually loaded to avoid errors
        const playerExists = this.experience.world && 
                             this.experience.world.player && 
                             this.experience.world.player.mesh

        if (this.modes.follow && playerExists) {
            this.controls.enabled = true

            // 1. Get Current Player Position
            const currentPlayerPosition = this.experience.world.player.mesh.position

            // 2. Initialize previous position on the very first frame to prevent camera jumps
            if (this.previousPlayerPosition.length() === 0 && currentPlayerPosition.length() !== 0) {
                this.previousPlayerPosition.copy(currentPlayerPosition)
            }

            // 3. Calculate how much the player moved since last frame (The Delta)
            const change = new THREE.Vector3()
            change.subVectors(currentPlayerPosition, this.previousPlayerPosition)

            // 4. Move the Camera by that exact same amount
            this.instance.position.add(change)

            // 5. Move the Orbit Target to the player
            this.controls.target.copy(currentPlayerPosition)
            
            // --- UPDATED: Focus Offset ---
            // Changed from 3.0 to 2.2 for a better framing
            this.controls.target.y += 2.2

            // 6. Save current position for the next frame
            this.previousPlayerPosition.copy(currentPlayerPosition)
        }

        // Always update controls at the end for damping to work
        this.controls.update()
    }
}