import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../Experience.js'

export default class Player {
    constructor(physicsWorld) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.physicsWorld = physicsWorld
        this.time = this.experience.time
        
        // --- THIS LINE WAS MISSING ---
        this.input = this.experience.input 
        // -----------------------------

        // Setup
        this.setMesh()
        this.setPhysics()

        // Now this will work because this.input exists
        this.input.on('jump', () => {
            this.jump()
        })
    }

    setMesh() {
        const geometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8) 
        const material = new THREE.MeshStandardMaterial({ 
            color: '#00ff00', 
            roughness: 0.1,
            metalness: 0
        })
        
        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.castShadow = true
        this.mesh.position.y = 5 
        this.scene.add(this.mesh)
    }

    setPhysics() {
        const shape = new CANNON.Sphere(0.3) 
        
        this.body = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(0, 5, 0),
            shape: shape,
        })
        
        this.body.fixedRotation = true 
        this.body.updateMassProperties()

        this.physicsWorld.addBody(this.body)
    }

    jump() {
        if(this.body.position.y < 2) {
            this.body.applyImpulse(new CANNON.Vec3(0, 5, 0), this.body.position)
        }
    }

    update() {
        // Safety check to ensure input exists
        if(!this.input) return

        const speed = this.input.keys.shift ? 10 : 5

        if(this.input.keys.forward) {
            this.body.applyForce(new CANNON.Vec3(0, 0, -speed), this.body.position)
        }
        if(this.input.keys.backward) {
            this.body.applyForce(new CANNON.Vec3(0, 0, speed), this.body.position)
        }
        if(this.input.keys.left) {
            this.body.applyForce(new CANNON.Vec3(-speed, 0, 0), this.body.position)
        }
        if(this.input.keys.right) {
            this.body.applyForce(new CANNON.Vec3(speed, 0, 0), this.body.position)
        }
        
        this.mesh.position.copy(this.body.position)
        this.mesh.position.y -= -0.5  // Offset to match sphere center to capsule bottom
    }
}