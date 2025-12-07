import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../../Experience.js'
import NPC from '../NPC.js'

export default class TestWorld {
    constructor(physicsWorld, materialsManager) {
        console.log('✅ TestWorld Constructed')

        this.experience = new Experience()
        this.scene = this.experience.scene
        this.physicsWorld = physicsWorld
        this.materials = materialsManager.materials

        // 1. Environment Settings
        this.scene.background = new THREE.Color('#ffffff')
        this.scene.fog = new THREE.Fog('#ffffff', 10, 50)

        // 2. Container Group (Essential for clean unloading)
        this.group = new THREE.Group()
        this.scene.add(this.group)

        // 3. Setup Objects
        this.setFloor()
        this.setCube()

        const gridHelper = new THREE.GridHelper(100, 100)
        this.group.add(gridHelper)

        // Note: We DO NOT create a new Player here anymore.
        // The World.js handles the player.
        
        // 4. Setup NPCs
        this.npcs = []
        this.setupNPCs()

        this.experience.dialogue.read('tutorial_start')
    }

    setupNPCs() {
        // NPC 1
        const npc1 = new NPC(
            this.experience.world, // Pass World so they can find the global player
            new THREE.Vector3(2, 0, 2), 
            '#ff69b4', 
            'NPC1', 
            'npc_sakura_intro'
        )
        // Add NPC mesh to our local group for easy cleanup
        this.group.add(npc1.mesh) 
        this.npcs.push(npc1)

        // NPC 2
        const npc2 = new NPC(
            this.experience.world,
            new THREE.Vector3(-3, 0, 5),
            '#4169e1',
            'NPC2',
            'npc_kaito_intro'
        )
        this.group.add(npc2.mesh)
        this.npcs.push(npc2)
    }

    setFloor() {
        const geometry = new THREE.PlaneGeometry(100, 100)
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        
        this.floorMesh = new THREE.Mesh(geometry, material)
        this.floorMesh.rotation.x = -Math.PI * 0.5
        this.floorMesh.receiveShadow = true
        this.group.add(this.floorMesh)

        const shape = new CANNON.Plane()
        this.floorBody = new CANNON.Body({
            mass: 0,
            shape: shape,
            material: this.materials.floor
        })
        this.floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5)
        this.physicsWorld.addBody(this.floorBody)
    }

    setCube() {
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshStandardMaterial({ color: 'red' })
        
        this.cubeMesh = new THREE.Mesh(geometry, material)
        this.cubeMesh.castShadow = true
        this.group.add(this.cubeMesh)

        const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5))
        this.cubeBody = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(0, 5, 0),
            shape: shape,
            material: this.materials.bouncy
        })
        this.cubeBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 1, 0), Math.PI * 0.1)
        this.physicsWorld.addBody(this.cubeBody)
    }

    update() {
        if(this.cubeMesh && this.cubeBody) {
            this.cubeMesh.position.copy(this.cubeBody.position)
            this.cubeMesh.quaternion.copy(this.cubeBody.quaternion)
        }

        if(this.npcs) {
            this.npcs.forEach(npc => npc.update())
        }
    }

    destroy() {
        // 1. Remove Visuals
        this.scene.remove(this.group)
        
        // 2. Dipose Geometries/Materials manually to be safe
        this.floorMesh.geometry.dispose()
        this.floorMesh.material.dispose()
        this.cubeMesh.geometry.dispose()
        this.cubeMesh.material.dispose()

        // 3. Remove Physics Bodies
        this.physicsWorld.removeBody(this.floorBody)
        this.physicsWorld.removeBody(this.cubeBody)
        
        // 4. Cleanup NPCs
        this.npcs.forEach(npc => {
            // Add specific NPC cleanup if needed (e.g. removing event listeners)
             this.physicsWorld.removeBody(npc.body)
        })

        this.scene.background = null 
        this.scene.fog = null
    }
}