import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../../Experience.js'

export default class Store {
    constructor(physicsWorld, materialsManager) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.physicsWorld = physicsWorld
        this.materials = materialsManager.materials

        console.log('🏪 Loading Store Location...')

        // 1. Create Container
        this.group = new THREE.Group()
        this.scene.add(this.group)

        // 2. Setup Environment
        this.scene.background = new THREE.Color('#222222') 

        // 3. Load Model
        this.resource = this.resources.items.storeModel
        if(this.resource) {
            this.model = this.resource.scene
            this.model.scale.set(1, 1, 1)
            this.group.add(this.model) // Add to group, not directly to scene
            
            this.model.traverse((child) => {
                if(child instanceof THREE.Mesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                }
            })
        }

        this.setFloor()
    }

    setFloor() {
        // Physics Floor (Invisible)
        const shape = new CANNON.Plane()
        this.floorBody = new CANNON.Body({
            mass: 0,
            shape: shape,
            material: this.materials.floor
        })
        this.floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5)
        this.physicsWorld.addBody(this.floorBody)
    }

    update() {
        // Store specific animations
    }

    destroy() {
        console.log('🗑️ Unloading Store...')
        
        // 1. Remove Visuals
        this.scene.remove(this.group)
        
        // 2. Remove Physics
        this.physicsWorld.removeBody(this.floorBody)
        
        // 3. Deep Clean Memory
        if(this.model) {
            this.model.traverse((child) => {
                if(child instanceof THREE.Mesh) {
                    child.geometry.dispose()
                    if(child.material.map) child.material.map.dispose()
                    child.material.dispose()
                }
            })
        }
    }
}