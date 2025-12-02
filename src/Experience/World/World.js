import * as THREE from "three"
import * as CANNON from "cannon-es" // Import Cannon for physics
import Experience from "../Experience.js"
import Environment from "./Environment.js"
import TestWorld from "./Locations/TestWorld.js"
import Player from './player.js'
import PhysicsMaterials from './PhysicsMaterials.js'

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        
        // 1. Setup Physics
        this.physicsWorld = new CANNON.World()
        this.physicsWorld.gravity.set(0, -9.82, 0)

        this.materials = new PhysicsMaterials(this.physicsWorld)

        this.testWorld = new TestWorld(this.physicsWorld, this.materials)
        this.player = new Player(this.physicsWorld, this.materials)
        
        this.experience.input.on('cameraToggle', () => { // Assuming you add 'cameraToggle' to Input.js
            this.experience.camera.modes.follow = !this.experience.camera.modes.follow
        })

        // 3. Load Environment when resources are ready
        this.resources.on('ready', () => {
            this.environment = new Environment()
            
            // Apply reflections to the TestWorld objects
            if(this.testWorld && this.environment.environmentMap) {
                this.environment.environmentMap.updateMaterials()
            }
        })
    }
    
    update() {
        if(this.physicsWorld) {
            this.physicsWorld.step(1 / 60, this.experience.time.delta / 1000, 3)
        }

        if(this.testWorld) {
            this.testWorld.update()
        }

        if(this.player) this.player.update()
    }
}