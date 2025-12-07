import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../../Experience.js'
import PhysicsMaterials from '../PhysicsMaterials.js'

export default class TestWorld {
    constructor(physicsWorld, materialsManager) {
        console.log('✅ TestWorld is being constructed...')

        this.experience = new Experience()
        this.scene = this.experience.scene
        this.physicsWorld = physicsWorld
        this.materials = materialsManager.materials

        // 1. Set the background to White
        this.scene.background = new THREE.Color('#ffffff')

        // Optional: Add Fog to blend the floor into the sky seamlessly
        // (Color, StartDistance, EndDistance)
        this.scene.fog = new THREE.Fog('#ffffff', 10, 50)

        // Create a group container for easy cleanup
        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.setFloor()
        this.setCube() // <--- NEW: Create the cube

        const gridHelper = new THREE.GridHelper(100, 100)
        this.group.add(gridHelper)

        // Trigger tutorial dialogue when world loads
        this.experience.dialogue.read('tutorial_start')
    }

    setFloor() {
        // --- Visual Mesh ---
        const geometry = new THREE.PlaneGeometry(100, 100)
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            side: THREE.DoubleSide 
        })
        
        this.floorMesh = new THREE.Mesh(geometry, material) // Renamed to floorMesh for clarity
        this.floorMesh.rotation.x = -Math.PI * 0.5
        this.floorMesh.receiveShadow = true
        this.group.add(this.floorMesh)

        // --- Physics Body ---
        const shape = new CANNON.Plane()
        this.floorBody = new CANNON.Body({
            mass: 0, // Static
            shape: shape,
            material: this.materials.floor
        })
        
        this.floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5)
        this.physicsWorld.addBody(this.floorBody)
    }

    setCube() {
        // --- Visual Mesh ---
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshStandardMaterial({ color: 'red' })
        
        this.cubeMesh = new THREE.Mesh(geometry, material)
        this.cubeMesh.castShadow = true
        this.cubeMesh.position.y = 5 // Start high to fall
        this.group.add(this.cubeMesh)

        // --- Physics Body ---
        // IMPORTANT: Cannon shapes are defined from the center to the edge (half-extents).
        // A 1x1x1 Three.js box is 0.5, 0.5, 0.5 in Cannon.js.
        const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5))
        
        this.cubeBody = new CANNON.Body({
            mass: 1, // Mass > 0 makes it dynamic (affected by gravity)
            position: new CANNON.Vec3(0, 5, 0),
            shape: shape,
            material: this.materials.bouncy
        })
        
        // Add rotation so it bounces interestingly
        this.cubeBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 1, 0), Math.PI * 0.1)

        this.physicsWorld.addBody(this.cubeBody)
    }

    update() {
        // --- Sync Physics to Visuals ---
        // We copy the calculated physics position to the visual mesh every frame
        if(this.cubeMesh && this.cubeBody) {
            this.cubeMesh.position.copy(this.cubeBody.position)
            this.cubeMesh.quaternion.copy(this.cubeBody.quaternion)
        }
    }

    destroy() {
        // 1. Remove Visuals
        this.scene.remove(this.group)
        
        // Dispose Floor
        this.floorMesh.geometry.dispose()
        this.floorMesh.material.dispose()

        // Dispose Cube
        this.cubeMesh.geometry.dispose()
        this.cubeMesh.material.dispose()

        // 2. Remove Physics
        this.physicsWorld.removeBody(this.floorBody)
        this.physicsWorld.removeBody(this.cubeBody)

        this.scene.background = null 
        this.scene.fog = null
    }
}