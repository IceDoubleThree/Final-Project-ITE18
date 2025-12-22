import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../Experience.js'
import Weapon from './Weapon.js'

export default class Player {
    constructor(physicsWorld, materialsManager) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.physicsWorld = physicsWorld
        this.time = this.experience.time
        this.materials = materialsManager.materials
        this.input = this.experience.input
        this.resources = this.experience.resources

        this.canJump = false // State
        this._feetLocalY = 0
        this._groundedThisStep = false
        this._lastGroundedTime = 0
        this.mesh = null
        this.animations = [] // Store animations from GLTF loader
        this.debug = this.experience.debug
        this.body = null
        this.mixer = null
        this.actions = {}
        this.currentAction = null

        // --- WEAPON SYSTEM ---
        this.weapons = {
            pistol: new Weapon('Pistol', { damage: 20, range: 50, fireRate: 0.5 })
        }
        this.currentWeapon = null
        this.isAiming = false
        this.pistolMesh = null

        // Shooting / animation state
        this._wasShooting = false
        this._oneShotGunAimActive = false

        // One-shot gun_aim timing (left click)
        this._gunAimHoldUntilMs = 0
        this._gunAimOneShotTimeScale = 2
        this._gunAimOneShotHoldMs = 1000

        // --- GAME STATS (for future mechanics) ---
        this.baseHp = 100
        this.baseAttack = 1
        this.baseDefense = 0
        this.hp = this.baseHp
        this.attack = this.baseAttack
        this.defense = this.baseDefense

        // Physics configuration (capsule)
        this.physicsConfig = {
            radius: 0.3,
            height: 2.0,
            offsetX: 0,
            offsetY: -1.1,
            offsetZ: 0
        }

        this.debugVisuals = {
            physicsMesh: null,
            boundingBox: null,
            showPhysics: false,
            showBoundingBox: false
        }

        // Wait for resources to load before setting up mesh
        this.resources.on('ready', () => {
            this.setMesh()
            this.setPhysics()
            this.setupDebug()
        })

        this.input.on('jump', () => {
            console.log('Player: Jump requested. canJump:', this.canJump)
            this.jump()
        })

        // Weapon Inputs
        this.input.on('slot1', () => this.equipWeapon('pistol'))
        this.input.on('slot2', () => this.equipWeapon(null)) // Unequip
        this.input.on('slot3', () => this.equipWeapon(null)) // Unequip
    }

    equipWeapon(weaponKey) {
        if (weaponKey === 'pistol') {
            this.currentWeapon = this.weapons.pistol
            if (this.pistolMesh) this.pistolMesh.visible = true
            this.experience.camera?.setWeaponActive?.(true)
            console.log('Equipped Pistol')
            // Update UI
            document.querySelector('.hud-weapon-slot.slot-1').classList.add('active')
        } else {
            this.currentWeapon = null
            if (this.pistolMesh) this.pistolMesh.visible = false
            this.setAiming(false)
            this.experience.camera?.setWeaponActive?.(false)
            console.log('Unequipped Weapon')
            // Update UI
            document.querySelector('.hud-weapon-slot.slot-1').classList.remove('active')
        }
    }

    setAiming(isAiming) {
        if (this.isAiming === isAiming) return

        this.isAiming = isAiming
        this.experience.camera.setAimMode(isAiming)
        
        if (isAiming) {
            // Aim mode uses normal-speed gun_aim (left click one-shot may override timeScale).
            if (this.actions.gun_aim) this.actions.gun_aim.timeScale = 1
            this.playAnimation('gun_aim')
        } else {
            // Return to idle or run
            this.updateAnimation(false, false)
        }
    }

    shoot() {
        if (this.currentWeapon.shoot(this.time.elapsed)) {
            // Play shoot animation or sound here
            // For now just log
        }
    }

    resetStatsForNewGame() {
        this.hp = this.baseHp
        this.attack = this.baseAttack
        this.defense = this.baseDefense
    }

    setupDebug() {
        if (!this.debug.active) return

        const debugFolder = this.debug.ui.addFolder('Player')

        // Physics configuration
        debugFolder.add(this.physicsConfig, 'radius').min(0.1).max(1).step(0.1).name('Physics Radius')
        debugFolder.add(this.physicsConfig, 'height').min(0.5).max(3).step(0.1).name('Physics Height')
        debugFolder.add(this.physicsConfig, 'offsetX').min(-1).max(1).step(0.1).name('Offset X')
        debugFolder.add(this.physicsConfig, 'offsetY').min(-1).max(1).step(0.1).name('Offset Y')
        debugFolder.add(this.physicsConfig, 'offsetZ').min(-1).max(1).step(0.1).name('Offset Z')

        // Physics mesh toggle
        debugFolder.add(this.debugVisuals, 'showPhysics').onChange((value) => {
            if (value) {
                this.createPhysicsVisualization()
            } else {
                if (this.debugVisuals.physicsMesh) {
                    this.scene.remove(this.debugVisuals.physicsMesh)
                    this.debugVisuals.physicsMesh = null
                }
            }
        })

        // Bounding box toggle
        debugFolder.add(this.debugVisuals, 'showBoundingBox').onChange((value) => {
            if (value) {
                this.createBoundingBoxVisualization()
            } else {
                if (this.debugVisuals.boundingBox) {
                    this.scene.remove(this.debugVisuals.boundingBox)
                    this.debugVisuals.boundingBox = null
                }
            }
        })
    }

    createPhysicsVisualization() {
        // Create a green wireframe capsule to match the actual physics body
        const geometry = new THREE.CapsuleGeometry(this.physicsConfig.radius, this.physicsConfig.height, 4, 8)
        const material = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: 0x00ff00, // Green
            transparent: true,
            opacity: 0.8
        })
        this.debugVisuals.physicsMesh = new THREE.Mesh(geometry, material)
        this.scene.add(this.debugVisuals.physicsMesh)
    }

    createBoundingBoxVisualization() {
        // Create bounding box for the model
        if (!this.mesh) return

        const bbox = new THREE.Box3().setFromObject(this.mesh)
        const size = bbox.getSize(new THREE.Vector3())
        const center = bbox.getCenter(new THREE.Vector3())

        // Create a unit box (1x1x1) that we'll scale to fit the model
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: 0x0000ff, // Blue
            transparent: true,
            opacity: 0.8
        })
        this.debugVisuals.boundingBox = new THREE.Mesh(geometry, material)
        this.debugVisuals.boundingBox.position.copy(center)
        this.debugVisuals.boundingBox.scale.set(size.x, size.y, size.z)
        this.scene.add(this.debugVisuals.boundingBox)
    }

    setMesh() {
        // Load the character model
        const model = this.resources.items.mainCharacter
        if (!model) {
            console.error('❌ Main character model not found in resources')
            console.log('Available resources:', Object.keys(this.resources.items))
            return
        }

        this.mesh = model.scene
        this.animations = model.animations // Get animations from GLTF loader result

        // Enable shadow mapping for player - traverse all meshes
        this.mesh.traverse((child) => {
            // Check for pistol
            if (child.name.toLowerCase() === 'pistol') {
                this.pistolMesh = child
                child.visible = false // Hide initially
                console.log('Found Pistol mesh, hiding it.')
            }

            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true // Player should also receive shadows

                // Prevent the player from disappearing when the camera is close:
                // - Disable frustum culling (bounding boxes can be wrong on skinned meshes)
                // - Render both sides so backfaces don't vanish if the camera gets inside
                child.frustumCulled = false
                const mat = child.material
                if (Array.isArray(mat)) {
                    mat.forEach((m) => {
                        if (!m) return
                        m.side = THREE.DoubleSide
                        m.needsUpdate = true
                    })
                } else if (mat) {
                    mat.side = THREE.DoubleSide
                    mat.needsUpdate = true
                }
            }
        })

        // Also set on root for safety
        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
        this.mesh.frustumCulled = false

        this.mesh.position.y = 5

        // Scale the model if needed
        this.mesh.scale.set(1, 1, 1)

        // Log model details for debugging
        console.log('✅ Model loaded:', this.mesh)
        console.log('Model position:', this.mesh.position)
        console.log('Model scale:', this.mesh.scale)

        this.scene.add(this.mesh)

        // Calculate and store model center offset
        const bbox = new THREE.Box3().setFromObject(this.mesh)
        this.modelCenterOffset = bbox.getCenter(new THREE.Vector3()).sub(this.mesh.position)
        console.log('Model center offset:', this.modelCenterOffset)

        // Setup animations
        this.setupAnimations()
    }

    setupAnimations() {
        if (!this.mesh) return

        // Create AnimationMixer
        this.mixer = new THREE.AnimationMixer(this.mesh)

        // Clear one-shot flags when an animation finishes
        this.mixer.addEventListener('finished', (event) => {
            const clipName = event?.action?.getClip?.()?.name?.toLowerCase?.() ?? ''
            if (clipName === 'gun_aim') {
                this._oneShotGunAimActive = false
                // Keep the clamped end pose briefly before returning to locomotion.
                this._gunAimHoldUntilMs = (this.time?.elapsed ?? 0) + this._gunAimOneShotHoldMs
            }
        })

        // Get animations from the GLTF loader result
        if (this.animations && this.animations.length > 0) {
            console.log('✅ Available animations:')
            this.animations.forEach(clip => {
                console.log(`  - ${clip.name} (${clip.duration}s)`)
            })

            // Detailed animation metadata
            const animationTable = this.animations.map((clip) => {
                const tracks = clip.tracks || []
                const trackCount = tracks.length

                // Estimate keyframes + fps based on the first track that has time samples
                const timeTrack = tracks.find((t) => t && t.times && t.times.length)
                const keyframes = timeTrack?.times?.length ?? 0
                const duration = Number.isFinite(clip.duration) ? clip.duration : 0
                const fps = duration > 0 ? Math.round((keyframes / duration) * 10) / 10 : 0

                return {
                    name: clip.name,
                    duration_s: Math.round(duration * 1000) / 1000,
                    tracks: trackCount,
                    keyframes,
                    approx_fps: fps,
                    blendMode: clip.blendMode,
                    uuid: clip.uuid,
                }
            })

            console.groupCollapsed('🎞️ Player Animation Details')
            console.table(animationTable)
            console.groupEnd()

            // Create actions for available animations
            this.animations.forEach(clip => {
                const action = this.mixer.clipAction(clip)
                const key = clip.name.toLowerCase()

                // Aim clip should play fully once and then hold final pose while aiming
                if (key === 'gun_aim') {
                    action.loop = THREE.LoopOnce
                    action.clampWhenFinished = true
                } else {
                    action.loop = THREE.LoopRepeat
                }

                this.actions[key] = action
            })

            console.log('📋 Stored animation keys:', Object.keys(this.actions))

            // Start with idle if available
            if (this.actions.idle) {
                this.currentAction = this.actions.idle
                this.currentAction.play()
                console.log('✅ Started playing idle animation')
            } else if (Object.keys(this.actions).length > 0) {
                // If no idle, play the first available animation
                const firstKey = Object.keys(this.actions)[0]
                const firstAction = this.actions[firstKey]
                this.currentAction = firstAction
                this.currentAction.play()
                console.log(`✅ Started playing first available animation: ${firstKey}`)
            }
        } else {
            console.warn('⚠️ No animations found on model')
        }
    }

    playAnimation(animationName) {
        // Try exact match first
        let newAction = this.actions[animationName]

        // If not found, try case-insensitive and partial matching
        if (!newAction) {
            const targetLower = animationName.toLowerCase()
            const matchedKey = Object.keys(this.actions).find(key =>
                key.toLowerCase().includes(targetLower)
            )
            newAction = matchedKey ? this.actions[matchedKey] : null
        }

        if (!newAction) {
            console.warn(`⚠️ Animation "${animationName}" not available. Available: ${Object.keys(this.actions).join(', ')}`)
            return
        }

        if (newAction === this.currentAction) return

        // Smooth transition between animations
        if (this.currentAction) {
            this.currentAction.fadeOut(0.3)
        }

        newAction.reset()
        newAction.fadeIn(0.3)
        newAction.play()

        this.currentAction = newAction
        console.log(`🎬 Playing ${animationName}`)
    }

    updateAnimation(isMoving, isRunning) {
        if (!this.mixer || Object.keys(this.actions).length === 0) return

        if (!isMoving) {
            this.playAnimation('idle')
        } else if (isRunning) {
            this.playAnimation('running')
        } else {
            this.playAnimation('walking')
        }

        // Mixer update is handled once per frame in `update()` so aiming doesn't freeze.
    }

    setPhysics() {
        // Create a capsule (bean) shape using a compound body
        // We'll use a sphere body but position a capsule visualization
        // For more accurate capsule physics, we'd need to use a cylinder + spheres compound shape
        // For now, we'll create a compound body with two spheres (top and bottom) and a cylinder

        // Create a compound shape with two spheres
        const sphereShape = new CANNON.Sphere(this.physicsConfig.radius)

        this.body = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(0, 5, 0),
            material: this.materials.player,
            linearDamping: 0.1,
            angularDamping: 0.1
        })

        // Add sphere shape with offset to create capsule effect
        const halfHeight = this.physicsConfig.height / 2 - this.physicsConfig.radius
        this.body.addShape(sphereShape, new CANNON.Vec3(this.physicsConfig.offsetX, halfHeight + this.physicsConfig.offsetY, this.physicsConfig.offsetZ))
        this.body.addShape(sphereShape, new CANNON.Vec3(this.physicsConfig.offsetX, -halfHeight + this.physicsConfig.offsetY, this.physicsConfig.offsetZ))

        // Local-space feet position relative to body.position
        this._feetLocalY = (-halfHeight + this.physicsConfig.offsetY) - this.physicsConfig.radius

        this.body.fixedRotation = true
        this.body.updateMassProperties()

        this.physicsWorld.addBody(this.body)
    }

    jump() {
        if (this.canJump) {
            console.log('Player: Jumping!')
            // --- FIX 2: Respect Bounciness ---
            // If we are already flying up (from a bounce), add to it.
            // If we are standing still, set it to 8.
            if (this.body.velocity.y < 8) {
                this.body.velocity.y = 8
            } else {
                // Optional: Super jump if bouncing?
                // this.body.velocity.y += 2
            }
            this.canJump = false
        } else {
            console.log('Player: Jump failed - not grounded')
        }
    }

    update() {
        if (!this.input || !this.mesh) return

        const nowMs = this.time?.elapsed ?? 0

        // --- WEAPON INPUT ---
        if (this.currentWeapon) {
            // Right click ONLY: aim mode (camera zoom/offset + reduced movement speed)
            if (this.input.keys.aim !== this.isAiming) {
                this.setAiming(this.input.keys.aim)
            }

            // Left click: shoot WITHOUT entering aim mode.
            const isShooting = !!this.input.keys.shoot
            const shootStarted = isShooting && !this._wasShooting

            // Play gun_aim fully once on shoot start (do not cancel early)
            if (shootStarted && !this.isAiming) {
                this._oneShotGunAimActive = true
                this._gunAimHoldUntilMs = 0

                if (this.actions.gun_aim) {
                    this.actions.gun_aim.timeScale = this._gunAimOneShotTimeScale
                }
                this.playAnimation('gun_aim')
            }

            // Continuous shooting while held (Weapon.fireRate handles pacing)
            if (isShooting) {
                this.shoot()
            }

            this._wasShooting = isShooting
        } else {
            this._wasShooting = false
            this._oneShotGunAimActive = false
            this._gunAimHoldUntilMs = 0
            if (this.isAiming) this.setAiming(false)
        }

        // --- NEW: Stop movement if Dialogue is open ---
        if (this.experience.dialogue.isActive()) {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
            this.updateAnimation(false, false)
            return // Stop processing movement
        }

        // --- GROUND CHECK (Velocity-based) ---
        // If vertical velocity is close to 0, we assume we are grounded.
        if (Math.abs(this.body.velocity.y) < 0.1) {
            this.canJump = true
        } else {
            this.canJump = false
        }

        // --- MOVEMENT ---
        let inputX = 0
        let inputZ = 0

        if (this.input.keys.forward) inputZ += 1
        if (this.input.keys.backward) inputZ -= 1
        if (this.input.keys.left) inputX += 1
        if (this.input.keys.right) inputX -= 1

        const isMoving = inputX !== 0 || inputZ !== 0
        const isRunning = isMoving && this.input.keys.shift

        if (this.isAiming) {
            // Rotate player to face camera direction
            const camera = this.experience.camera.instance
            const cameraDirection = new THREE.Vector3()
            camera.getWorldDirection(cameraDirection)
            const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z)
            
            const targetQuaternion = new THREE.Quaternion()
            targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle)
            this.mesh.quaternion.slerp(targetQuaternion, 0.2)

            if (isMoving) {
                const inputAngle = Math.atan2(inputX, inputZ)
                const targetRotation = cameraAngle + inputAngle
                const speed = 2 // Reduced speed when aiming
                
                this.body.velocity.x = Math.sin(targetRotation) * speed
                this.body.velocity.z = Math.cos(targetRotation) * speed
            } else {
                this.body.velocity.x = 0
                this.body.velocity.z = 0
            }
        } else if (isMoving) {
            const inputAngle = Math.atan2(inputX, inputZ)
            const camera = this.experience.camera.instance
            const cameraDirection = new THREE.Vector3()
            camera.getWorldDirection(cameraDirection)
            const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z)
            const targetRotation = cameraAngle + inputAngle

            const targetQuaternion = new THREE.Quaternion()
            targetQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation)
            this.mesh.quaternion.slerp(targetQuaternion, 0.2)

            const speed = isRunning ? 10 : 3

            this.body.velocity.x = Math.sin(targetRotation) * speed
            this.body.velocity.z = Math.cos(targetRotation) * speed
        } else {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
        }

        // Update animations
        // - While aiming, we let gun_aim hold pose (clamped).
        // - While shooting (left click) we let the one-shot gun_aim finish before returning to locomotion.
        const isHoldingGunAimPose = nowMs < (this._gunAimHoldUntilMs || 0)
        if (!this.isAiming && !this._oneShotGunAimActive && !isHoldingGunAimPose) {
            this.updateAnimation(isMoving, isRunning)
        }

        // Always advance animations (including while aiming)
        if (this.mixer) {
            this.mixer.update(this.time.delta / 1000)
        }

        // Position mesh so its center matches the physics body
        this.mesh.position.copy(this.body.position)
        if (this.modelCenterOffset) {
            this.mesh.position.sub(this.modelCenterOffset)
        }

        // Update debug visuals
        if (this.debugVisuals.showPhysics && this.debugVisuals.physicsMesh) {
            this.debugVisuals.physicsMesh.position.copy(this.body.position)
            this.debugVisuals.physicsMesh.position.add(new THREE.Vector3(this.physicsConfig.offsetX, this.physicsConfig.offsetY, this.physicsConfig.offsetZ))
        }
        if (this.debugVisuals.showBoundingBox && this.debugVisuals.boundingBox) {
            const bbox = new THREE.Box3().setFromObject(this.mesh)
            const size = bbox.getSize(new THREE.Vector3())
            const center = bbox.getCenter(new THREE.Vector3())

            // Update position
            this.debugVisuals.boundingBox.position.copy(center)

            // Update scale to match the bounding box size
            this.debugVisuals.boundingBox.scale.set(size.x, size.y, size.z)
        }
    }
}