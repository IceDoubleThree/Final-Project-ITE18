import * as THREE from "three"
import * as CANNON from "cannon-es" // Import Cannon for physics
import Experience from "../Experience.js"
import Environment from "./Environment.js"
import TestWorld from "./Locations/TestWorld.js" // 1. Import your TestWorld

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        
        // 1. Setup Physics
        this.physicsWorld = new CANNON.World()
        this.physicsWorld.gravity.set(0, -9.82, 0)

        // 2. Load TestWorld IMMEDIATELY
        this.testWorld = new TestWorld(this.physicsWorld)
        
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

        // 5. Update the Level
        if(this.testWorld) {
            this.testWorld.update()
        }
    }
}