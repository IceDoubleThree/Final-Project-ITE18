import * as THREE from "three"
import * as CANNON from "cannon-es"
import Experience from "../Experience.js"
import Environment from "./Environment.js"
import TestWorld from "./Locations/TestWorld.js"
import Store from "./Locations/Store.js"
import PhysicsMaterials from './PhysicsMaterials.js'
import Player from './player.js' // Import Player here

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        
        // 1. Setup Physics
        this.physicsWorld = new CANNON.World()
        this.physicsWorld.gravity.set(0, -9.82, 0)
        this.materials = new PhysicsMaterials(this.physicsWorld)
        this.isPhysicsActive = false // Start paused

        // 2. Setup Player Globally (Pass physics info)
        // We create the player immediately, but they float until physics starts
        this.player = new Player(this.physicsWorld, this.materials)

        this.currentLocation = null

        this.experience.input.on('cameraToggle', () => { 
            this.experience.camera.modes.follow = !this.experience.camera.modes.follow
        })

        this.resources.on('ready', () => {
            this.environment = new Environment()
            this.setupDevMenu()
        })
    }

    setupDevMenu() {
        const btn = document.getElementById('load-location-btn')
        const select = document.getElementById('location-select')

        if(btn && select) {
            btn.addEventListener('click', () => {
                const locationKey = select.value
                if(locationKey) this.loadLocation(locationKey)
            })
        }
    }

    loadLocation(locationKey) {
        console.log(`🗺️ Loading: ${locationKey}`)

        // 1. Cleanup Old Location
        if(this.currentLocation) {
            console.log("🧹 Destroying old location...")
            if(typeof this.currentLocation.destroy === 'function') {
                this.currentLocation.destroy()
            }
            this.currentLocation = null
        }

        // 2. Reset Player Position (Move to Origin)
        if(this.player && this.player.body) {
            console.log("📍 Resetting Player to Origin")
            // Reset Velocity
            this.player.body.velocity.set(0, 0, 0)
            this.player.body.angularVelocity.set(0, 0, 0)
            
            // Reset Position (Lift slightly so they don't clip floor)
            this.player.body.position.set(0, 2, 0)
            
            // Update Mesh immediately to prevent visual flicker
            this.player.mesh.position.copy(this.player.body.position)
        }

        // 3. Instantiate New Location
        switch(locationKey) {
            case 'TestWorld':
                this.currentLocation = new TestWorld(this.physicsWorld, this.materials)
                break
            case 'Store':
                this.currentLocation = new Store(this.physicsWorld, this.materials) 
                break
        }

        // 4. Activate Physics
        this.isPhysicsActive = true

        // 5. Update Environment (if texture exists)
        if(this.environment && this.environment.environmentMap) {
            this.environment.environmentMap.updateMaterials()
        }
    }
    
    update() {
        // Only step physics if a location is actually loaded
        if(this.physicsWorld && this.isPhysicsActive) {
            this.physicsWorld.step(1 / 60, this.experience.time.delta / 1000, 3)
        }

        if(this.currentLocation && typeof this.currentLocation.update === 'function') {
            this.currentLocation.update()
        }

        // Always update player (animations, input) even if physics is paused
        // (Optional: You can wrap this in isPhysicsActive if you want to freeze animations too)
        if(this.player) {
            this.player.update()
        }
    }
}