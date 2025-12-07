import * as THREE from "three"
import * as CANNON from "cannon-es"
import Experience from "../Experience.js"
import Environment from "./Environment.js"
import TestWorld from "./Locations/TestWorld.js"
import Player from './player.js'
import PhysicsMaterials from './PhysicsMaterials.js'
import NPC from './NPC.js'

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        
        // 1. Setup Physics
        this.physicsWorld = new CANNON.World()
        this.physicsWorld.gravity.set(0, -9.82, 0)

        this.materials = new PhysicsMaterials(this.physicsWorld)

        // 2. Setup Objects
        this.testWorld = new TestWorld(this.physicsWorld, this.materials)
        this.player = new Player(this.physicsWorld, this.materials)
        
        // 3. Setup NPCs
        this.npcs = []
        this.setupNPCs()

        this.experience.input.on('cameraToggle', () => { 
            this.experience.camera.modes.follow = !this.experience.camera.modes.follow
        })

        // 4. Load Environment
        this.resources.on('ready', () => {
            this.environment = new Environment()
            if(this.testWorld && this.environment.environmentMap) {
                this.environment.environmentMap.updateMaterials()
            }
        })
    }

    setupNPCs() {
        // NPC 1
        const npc1 = new NPC(
            this, // <--- IMPORTANT: Passing 'this' allows NPC to access world.player safely
            new THREE.Vector3(2, 0, 2), 
            '#ff69b4', 
            'NPC1', 
            'npc_sakura_intro'
        )
        this.npcs.push(npc1)

        // NPC 2
        const npc2 = new NPC(
            this,
            new THREE.Vector3(-3, 0, 5),
            '#4169e1',
            'NPC2',
            'npc_kaito_intro'
        )
        this.npcs.push(npc2)
    }
    
    update() {
        if(this.physicsWorld) {
            this.physicsWorld.step(1 / 60, this.experience.time.delta / 1000, 3)
        }

        if(this.testWorld) {
            this.testWorld.update()
        }

        if(this.player) this.player.update()

        // Update NPCs
        if(this.npcs) {
            this.npcs.forEach(npc => npc.update())
        }
    }
}