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
        this.materials.enemy = new CANNON.Material('enemy')
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
                // Keep friction extremely low so the player slides
                // instead of "sticking" when rubbing against colliders.
                friction: 0.0,
                restitution: 0.0
            }
        )

        // --- Player vs Default (Fallback for any collider left as default) ---
        const playerDefault = new CANNON.ContactMaterial(
            this.materials.player,
            this.materials.default,
            {
                friction: 0.0,
                restitution: 0.0
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

        // --- Enemy vs Floor (responsive movement) ---
        const enemyFloor = new CANNON.ContactMaterial(
            this.materials.enemy,
            this.materials.floor,
            {
                friction: 0.0,
                restitution: 0.0
            }
        )

        // --- Enemy vs Default ---
        const enemyDefault = new CANNON.ContactMaterial(
            this.materials.enemy,
            this.materials.default,
            {
                friction: 0.0,
                restitution: 0.0
            }
        )

        // Add rules to the world
        this.physicsWorld.addContactMaterial(playerFloor)
        this.physicsWorld.addContactMaterial(playerDefault)
        this.physicsWorld.addContactMaterial(playerIce)
        this.physicsWorld.addContactMaterial(playerBouncy)
        this.physicsWorld.addContactMaterial(enemyFloor)
        this.physicsWorld.addContactMaterial(enemyDefault)
        this.physicsWorld.addContactMaterial(defaultContact)
    }
}