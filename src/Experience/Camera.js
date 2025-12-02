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

        // --- NEW: Track previous position ---
        // We need this to calculate how far the player moved in one frame
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
        this.instance.position.set(6, 4, 8)
        this.scene.add(this.instance)
    }

    setControls() {
        this.controls = new OrbitControls(this.instance, this.canvas)
        this.controls.enableDamping = true

        this.controls.maxPolarAngle = Math.PI / 2 - 0.1
        this.controls.minDistance = 3 
        this.controls.maxDistance = 15
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    update() {
        const playerExists = this.experience.world && this.experience.world.player

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
            // This drags the camera along with the player, keeping the "Zoom" distance constant
            this.instance.position.add(change)

            // 5. Move the Orbit Target to the player
            this.controls.target.copy(currentPlayerPosition)
            this.controls.target.y += 0.5 // Look slightly up

            // 6. Save current position for the next frame
            this.previousPlayerPosition.copy(currentPlayerPosition)
        }

        // Always update controls at the end
        this.controls.update()
    }
}