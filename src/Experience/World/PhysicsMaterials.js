import * as CANNON from 'cannon-es'

export default class PhysicsMaterials {
    constructor(physicsWorld) {
        this.physicsWorld = physicsWorld
        
        this.materials = {}
        
        this.createMaterials()
        this.createContactMaterials()
    }

    createMaterials() {
        // 1. Define distinct types of surfaces
        this.materials.default = new CANNON.Material('default')
        this.materials.player = new CANNON.Material('player')
        this.materials.floor = new CANNON.Material('floor')
        this.materials.ice = new CANNON.Material('ice')
        this.materials.bouncy = new CANNON.Material('bouncy')
    }

    createContactMaterials() {
        // 2. Define how they interact
        
        // --- Player vs Floor (Normal walking) ---
        const playerFloor = new CANNON.ContactMaterial(
            this.materials.player,
            this.materials.floor,
            {
                friction: 0.01,    // Low friction so player doesn't stick to walls
                restitution: 0.0  // No bounce
            }
        )

        // --- Player vs Ice (Slippery) ---
        const playerIce = new CANNON.ContactMaterial(
            this.materials.player,
            this.materials.ice,
            {
                friction: 0.0,    // Zero friction (slide forever)
                restitution: 0.0
            }
        )

        // --- Player vs Bouncy (Trampoline) ---
        const playerBouncy = new CANNON.ContactMaterial(
            this.materials.player,
            this.materials.bouncy,
            {
                friction: 0.1,
                restitution: 1.5  // High bounce (energy gained)
            }
        )

        // --- Default Fallback ---
        // What happens if two unmapped materials touch?
        const defaultContact = new CANNON.ContactMaterial(
            this.materials.default,
            this.materials.default,
            {
                friction: 0.1,
                restitution: 0.3
            }
        )

        // Add rules to the world
        this.physicsWorld.addContactMaterial(playerFloor)
        this.physicsWorld.addContactMaterial(playerIce)
        this.physicsWorld.addContactMaterial(playerBouncy)
        this.physicsWorld.addContactMaterial(defaultContact)
    }
}