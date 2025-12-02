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
        if(!this.input) return

        // --- MOVEMENT LOGIC ---
        
        // 1. Setup Input Vector
        // WE FLIPPED THESE SIGNS compared to previous code
        let inputX = 0
        let inputZ = 0

        // Forward (W) needs to be +1 to align with atan2(0, 1) = 0 degrees
        if(this.input.keys.forward) inputZ += 1 
        if(this.input.keys.backward) inputZ -= 1 
        
        // Left (A) needs to be +1 to align with atan2(1, 0) = 90 degrees
        if(this.input.keys.left) inputX += 1     
        if(this.input.keys.right) inputX -= 1    

        // 2. Only move if keys are pressed
        if(inputX !== 0 || inputZ !== 0) {
            
            // A. Calculate Input Angle (0 = Forward, PI = Backward)
            const inputAngle = Math.atan2(inputX, inputZ)

            // B. Get Camera Angle
            const camera = this.experience.camera.instance
            const cameraDirection = new THREE.Vector3()
            camera.getWorldDirection(cameraDirection)
            const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z)

            // C. Combine (Camera Rotation + Input Offset)
            const targetRotation = cameraAngle + inputAngle

            // D. Rotate Player
            const targetQuaternion = new THREE.Quaternion()
            targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation)
            this.mesh.quaternion.slerp(targetQuaternion, 0.2)

            // E. Apply Force
            const speed = this.input.keys.shift ? 10 : 5
            
            // Calculate direction based on the new rotation
            const forceX = Math.sin(targetRotation) * speed
            const forceZ = Math.cos(targetRotation) * speed

            this.body.applyForce(new CANNON.Vec3(forceX, 0, forceZ), this.body.position)
        }

        // 3. Sync Physics to Visuals
        this.mesh.position.copy(this.body.position)
        this.mesh.position.y += 0.5
    }
}