import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../Experience.js'

export default class Player {
    constructor(physicsWorld, materialsManager) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.physicsWorld = physicsWorld
        this.time = this.experience.time
        this.materials = materialsManager.materials
        this.input = this.experience.input 

        this.canJump = false // State

        this.setMesh()
        this.setPhysics()

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
            material: this.materials.player,
            linearDamping: 0.1, 
            angularDamping: 0.1
        })
        
        this.body.fixedRotation = true 
        this.body.updateMassProperties()
        
        // --- FIX 1: Add Collision Listener ---
        // This catches the exact frame we hit a bouncy object, 
        // even if the physics engine pushes us away instantly.
        this.body.addEventListener('collide', (e) => {
            // Get the contact normal (Direction of impact)
            const contactNormal = new CANNON.Vec3()
            e.contact.ni.negate(contactNormal) 

            // If contactNormal.y > 0.5, the hit came from below (The Floor)
            if(contactNormal.y > 0.5) {
                this.canJump = true
            }
        })

        this.physicsWorld.addBody(this.body)
    }

    jump() {
        if(this.canJump) {
            // --- FIX 2: Respect Bounciness ---
            // If we are already flying up (from a bounce), add to it.
            // If we are standing still, set it to 5.
            if(this.body.velocity.y < 5) {
                this.body.velocity.y = 5
            } else {
                // Optional: Super jump if bouncing?
                // this.body.velocity.y += 2
            }
            this.canJump = false 
        }
    }

    update() {
        if(!this.input) return

        // --- GROUND CHECK (Keep Raycast for walking logic) ---
        const rayOrigin = this.body.position
        const rayEnd = new CANNON.Vec3(rayOrigin.x, rayOrigin.y - 0.5, rayOrigin.z)
        const ray = new CANNON.Ray(rayOrigin, rayEnd)
        const result = new CANNON.RaycastResult()
        
        const hasHit = this.physicsWorld.raycastClosest(rayOrigin, rayEnd, {
            skipBackfaces: true
        }, result)

        // Only overwrite canJump if the Raycast hits. 
        // If Raycast misses, we might still have canJump=true from the collision event above.
        if(hasHit) {
            this.canJump = true
        }

        // --- MOVEMENT ---
        let inputX = 0
        let inputZ = 0

        if(this.input.keys.forward) inputZ += 1 
        if(this.input.keys.backward) inputZ -= 1 
        if(this.input.keys.left) inputX += 1     
        if(this.input.keys.right) inputX -= 1    

        if(inputX !== 0 || inputZ !== 0) {
            const inputAngle = Math.atan2(inputX, inputZ)
            const camera = this.experience.camera.instance
            const cameraDirection = new THREE.Vector3()
            camera.getWorldDirection(cameraDirection)
            const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z)
            const targetRotation = cameraAngle + inputAngle

            const targetQuaternion = new THREE.Quaternion()
            targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation)
            this.mesh.quaternion.slerp(targetQuaternion, 0.2)

            const speed = this.input.keys.shift ? 6 : 3 
            
            this.body.velocity.x = Math.sin(targetRotation) * speed
            this.body.velocity.z = Math.cos(targetRotation) * speed
        } else {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
        }

        this.mesh.position.copy(this.body.position)
        this.mesh.position.y += 0.5
    }
}