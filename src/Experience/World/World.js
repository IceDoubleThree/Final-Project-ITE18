import * as THREE from "three"
import * as CANNON from "cannon-es"
import Experience from "../Experience.js"
import Environment from "./Environment.js"
import PhysicsMaterials from './PhysicsMaterials.js'
import Player from './player.js' // Import Player here
import NPC from './NPC.js'

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug

        // 1. Setup Physics
        this.physicsWorld = new CANNON.World()
        this.physicsWorld.gravity.set(0, -9.82, 0)
        this.materials = new PhysicsMaterials(this.physicsWorld)
        this.isPhysicsActive = false // Start paused

        // 2. Setup Player Globally (Pass physics info)
        // We create the player immediately, but they float until physics starts
        this.player = new Player(this.physicsWorld, this.materials)

        this.currentLocation = null
        this.locationConfigs = this.createLocationConfigs()

        this.experience.input.on('cameraToggle', () => {
            this.experience.camera.modes.follow = !this.experience.camera.modes.follow
        })

        this.resources.on('ready', () => {
            this.environment = new Environment()
            this.setupDevMenu()
        })
    }

    setupDevMenu() {
        const keys = Object.keys(this.locationConfigs)

        // Prefer debug UI when available
        if (this.debug?.active && this.debug.ui) {
            this.debugFolder = this.debug.ui.addFolder('world')
            this.debugState = { location: keys[0] || null }

            this.debugFolder
                .add(this.debugState, 'location', keys)
                .name('location')
                .onChange((key) => {
                    if (key) this.loadLocation(key)
                })

            this.debugFolder
                .add({ reload: () => this.loadLocation(this.debugState.location) }, 'reload')
                .name('reload')

            return
        }
    }

    createLocationConfigs() {
        return {
            TestWorld: {
                key: 'TestWorld',
                origin: new THREE.Vector3(30, 0, 0), // 30 blocks east
                size: { width: 20, depth: 20 },
                background: '#ffffff',
                fog: { color: '#ffffff', near: 10, far: 50 },
                build: (state) => this.buildTestWorld(state)
            },
            Store: {
                key: 'Store',
                origin: new THREE.Vector3(-50, 0, 0), // 50 blocks west
                size: { width: 50, depth: 50 },
                background: 'skyblue',
                build: (state) => this.buildStore(state)
            }
        }
    }

    loadLocation(locationKey) {
        console.log(`🗺️ Loading: ${locationKey}`)

        const config = this.locationConfigs[locationKey]
        if (!config) {
            console.warn(`⚠️ Unknown location: ${locationKey}`)
            return
        }

        // 1. Cleanup Old Location
        this.destroyCurrentLocation()

        // 2. Reset Player Position (Move to Origin)
        this.resetPlayer(config.origin)

        // 3. Instantiate New Location
        this.currentLocation = this.buildLocation(config)

        // 4. Activate Physics
        this.isPhysicsActive = true

        // 5. Update Environment (if texture exists)
        if (this.environment && this.environment.environmentMap) {
            this.environment.environmentMap.updateMaterials()
        }
    }

    resetPlayer(origin) {
        if (!this.player || !this.player.body) return

        console.log("📍 Resetting Player to Location Origin")
        this.player.body.velocity.set(0, 0, 0)
        this.player.body.angularVelocity.set(0, 0, 0)

        const target = new CANNON.Vec3(origin.x, origin.y + 2, origin.z)
        this.player.body.position.copy(target)
        this.player.mesh.position.copy(target)
    }

    buildLocation(config) {
        const group = new THREE.Group()
        this.scene.add(group)

        // Apply environment per location
        this.scene.background = config.background ? new THREE.Color(config.background) : null
        this.scene.fog = config.fog ? new THREE.Fog(config.fog.color, config.fog.near, config.fog.far) : null

        const state = {
            key: config.key,
            origin: config.origin.clone(),
            size: config.size,
            group,
            physicsBodies: [],
            disposables: [],
            npcs: [],
            updates: []
        }

        // Debug perimeter helper
        if (this.debug?.active) {
            const perimeter = this.createPerimeterHelper(config.size)
            perimeter.position.copy(config.origin)
            group.add(perimeter)
            state.disposables.push(perimeter.geometry, perimeter.material)
        }

        const buildResult = config.build(state)
        if (buildResult?.update) state.updates.push(buildResult.update)
        if (buildResult?.cleanup) state.customCleanup = buildResult.cleanup

        return state
    }

    createPerimeterHelper(size) {
        const boxGeometry = new THREE.BoxGeometry(size.width, 0.05, size.depth)
        const geometry = new THREE.EdgesGeometry(boxGeometry)
        boxGeometry.dispose()
        const material = new THREE.LineBasicMaterial({ color: 0x00ff88 })
        const helper = new THREE.LineSegments(geometry, material)
        helper.position.set(0, 0.025, 0)
        return helper
    }

    destroyCurrentLocation() {
        if (!this.currentLocation) return

        console.log("🧹 Destroying old location...")
        const loc = this.currentLocation

        if (loc.customCleanup) loc.customCleanup()

        loc.npcs.forEach(npc => {
            if (npc.prompt && npc.prompt.remove) npc.prompt.remove()
            if (npc.mesh && npc.mesh.parent) npc.mesh.parent.remove(npc.mesh)
            if (npc.mesh?.geometry) npc.mesh.geometry.dispose()
            if (npc.mesh?.material) npc.mesh.material.dispose()
            if (npc.body) this.physicsWorld.removeBody(npc.body)
        })

        loc.physicsBodies.forEach(body => this.physicsWorld.removeBody(body))

        loc.disposables.forEach(item => {
            if (item?.dispose) item.dispose()
        })

        if (loc.group) this.scene.remove(loc.group)

        this.scene.background = null
        this.scene.fog = null

        this.currentLocation = null
    }

    buildTestWorld(state) {
        // Ground
        const floorGeometry = new THREE.PlaneGeometry(state.size.width, state.size.depth)
        const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial)
        floorMesh.rotation.x = -Math.PI * 0.5
        floorMesh.receiveShadow = true
        floorMesh.position.copy(state.origin)
        state.group.add(floorMesh)

        const floorShape = new CANNON.Plane()
        const floorBody = new CANNON.Body({
            mass: 0,
            shape: floorShape,
            material: this.materials.materials.floor
        })
        floorBody.position.set(state.origin.x, state.origin.y, state.origin.z)
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5)
        this.physicsWorld.addBody(floorBody)

        // Cube
        const cubeGeometry = new THREE.BoxGeometry(1, 1, 1)
        const cubeMaterial = new THREE.MeshStandardMaterial({ color: 'red' })
        const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial)
        cubeMesh.castShadow = true
        cubeMesh.position.set(state.origin.x, state.origin.y + 5, state.origin.z)
        state.group.add(cubeMesh)

        const cubeShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5))
        const cubeBody = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(state.origin.x, state.origin.y + 5, state.origin.z),
            shape: cubeShape,
            material: this.materials.materials.bouncy
        })
        cubeBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 1, 0), Math.PI * 0.1)
        this.physicsWorld.addBody(cubeBody)

        // Grid helper for orientation (debug-friendly)
        const gridHelper = new THREE.GridHelper(Math.max(state.size.width, state.size.depth) * 2, 20)
        gridHelper.position.copy(state.origin)
        state.group.add(gridHelper)

        // NPCs
        const npcPositions = [
            { pos: new THREE.Vector3(32, 0, 2), color: '#ff69b4', name: 'NPC1', dialogue: 'npc_sakura_intro' },
            { pos: new THREE.Vector3(27, 0, 5), color: '#4169e1', name: 'NPC2', dialogue: 'npc_kaito_intro' }
        ]

        npcPositions.forEach(def => {
            const npc = new NPC(this, def.pos, def.color, def.name, def.dialogue)
            state.group.attach(npc.mesh)
            state.npcs.push(npc)
        })

        // Track disposables and physics
        state.disposables.push(
            floorGeometry,
            floorMaterial,
            cubeGeometry,
            cubeMaterial,
            gridHelper.geometry,
            gridHelper.material
        )
        state.physicsBodies.push(floorBody, cubeBody)

        return {
            update: () => {
                // Sync cube visual to physics (global space)
                cubeMesh.position.copy(cubeBody.position)
                cubeMesh.quaternion.copy(cubeBody.quaternion)

                // Update NPCs
                state.npcs.forEach(npc => npc.update())
            },
            cleanup: () => {
                // Additional cleanup if needed in future
            }
        }
    }

    buildStore(state) {
        // Store model (global positioning)
        const resource = this.resources.items.storeModel
        let model = null
        if (resource?.scene) {
            model = resource.scene
            model.scale.set(1, 1, 1)
            model.position.copy(state.origin)
            state.group.add(model)

            model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                }
            })
        }

        // Physics Floor
        const floorShape = new CANNON.Plane()
        const floorBody = new CANNON.Body({
            mass: 0,
            shape: floorShape,
            material: this.materials.materials.floor
        })
        floorBody.position.set(state.origin.x, state.origin.y, state.origin.z)
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI * 0.5)
        this.physicsWorld.addBody(floorBody)
        state.physicsBodies.push(floorBody)

        return {
            update: () => { },
            cleanup: () => {
                if (model) {
                    model.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            if (child.geometry) child.geometry.dispose()
                            if (child.material?.map) child.material.map.dispose()
                            if (child.material?.dispose) child.material.dispose()
                        }
                    })
                }
            }
        }
    }

    update() {
        // Only step physics if a location is actually loaded
        if (this.physicsWorld && this.isPhysicsActive) {
            this.physicsWorld.step(1 / 60, this.experience.time.delta / 1000, 3)
        }

        if (this.currentLocation) {
            this.currentLocation.updates?.forEach(fn => fn())
        }

        // Always update player (animations, input) even if physics is paused
        // (Optional: You can wrap this in isPhysicsActive if you want to freeze animations too)
        if (this.player) {
            this.player.update()
        }
    }
}