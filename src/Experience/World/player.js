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
        // Animation layering:
        // - baseAction: locomotion (idle/walking/running/walking_legs)
        // - overlayAction: weapon/aim (gun_aim)
        this.baseAction = null
        this.overlayAction = null
        this.overlaySupportAction = null
        // Smoothed blending weights
        this._baseWeight = 1
        this._overlayWeight = 0
        this._overlaySupportWeight = 0
        this._baseWeightTarget = 1
        this._overlayWeightTarget = 0
        this._overlaySupportWeightTarget = 0
        this._lastLoggedAnimationState = ''

        // --- WEAPON SYSTEM ---
        this.weapons = {
            pistol: new Weapon('Pistol', {
                // Damage = player.attack * weapon multiplier
                damageMultiplier: 1,
                // Back-compat: older code may still look at `weapon.damage`
                damage: 1,
                range: 50,
                cooldown: 0.2,
                ammo_size: 20,
                reloading_time: 5
            })
        }
        this.currentWeapon = null
        this.isAiming = false
        this.pistolMesh = null

        // HUD elements
        this.hudAmmoEl = document.getElementById('hud-ammo')
        this.hudReloadingEl = document.getElementById('hud-reloading')

        // Shooting / animation state
        this._wasShooting = false
        this._isShootingHeld = false
        this._oneShotGunAimActive = false

        // One-shot gun_aim timing (left click)
        this._gunAimHoldUntilMs = 0
        this._gunAimOneShotTimeScale = 2
        this._gunAimOneShotHoldMs = 1000

        // Shooting raycast (camera-based)
        this._shootRaycaster = new THREE.Raycaster()
        this._shootRayOrigin = new THREE.Vector3()
        this._shootRayDirection = new THREE.Vector3()
        this._shootRayEnd = new THREE.Vector3()
        this._shootRayTmp = new THREE.Vector3()

        // Debug: visualize the shooting ray
        this._shootDebug = {
            line: null,
            maxDistance: 60,
        }

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
            this.playOverlayAnimation('gun_aim', { timeScale: 1 })
        } else {
            // Exit aim: fade out overlay and resume locomotion selection.
            this.stopOverlayAnimation()
            this.updateBaseAnimation(false, false, false)
        }
    }

    shoot() {
        if (!this.currentWeapon) return false

        const nowMs = this.time?.elapsed ?? 0
        const fired = this.currentWeapon.requestFire(nowMs)
        if (fired) this._fireCameraRay(nowMs)
        return fired
    }

    _ensureShootDebugLine() {
        if (!this.debug?.active) return
        if (this._shootDebug.line) return

        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1),
        ])

        const material = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
        })

        const line = new THREE.Line(geometry, material)
        line.name = 'player-shoot-ray-debug'
        line.renderOrder = 999999
        line.visible = false
        this.scene.add(line)
        this._shootDebug.line = line
    }

    _getCameraShootRay(maxDistance) {
        const camera = this.experience?.camera?.instance
        if (!camera) return null

        camera.getWorldPosition(this._shootRayOrigin)
        camera.getWorldDirection(this._shootRayDirection)
        this._shootRayDirection.normalize()

        const dist = Number.isFinite(maxDistance) ? maxDistance : 50
        this._shootRayEnd.copy(this._shootRayOrigin).add(this._shootRayTmp.copy(this._shootRayDirection).multiplyScalar(dist))

        return {
            origin: this._shootRayOrigin,
            direction: this._shootRayDirection,
            end: this._shootRayEnd,
            maxDistance: dist,
        }
    }

    _isDescendantOfPlayerMesh(object3d) {
        if (!this.mesh || !object3d) return false
        let obj = object3d
        while (obj) {
            if (obj === this.mesh) return true
            obj = obj.parent
        }
        return false
    }

    _findDamageableObject(hitObject) {
        // Walk up parents to find an object that declares hp in userData.
        let obj = hitObject
        while (obj) {
            const ud = obj.userData
            if (ud && Number.isFinite(ud.hp)) return obj
            obj = obj.parent
        }
        return null
    }

    _applyDamageToObject(targetObject, damageAmount) {
        const ud = targetObject?.userData
        if (!ud) return false

        // Prefer delegating to Enemy instances (keeps behavior logic in Enemy.js)
        const enemy = ud.enemy
        if (enemy && typeof enemy.takeDamage === 'function') {
            enemy.takeDamage(damageAmount, this.time?.elapsed ?? 0)
            return true
        }

        if (!Number.isFinite(ud.hp)) return false

        const dmg = Number.isFinite(damageAmount) ? damageAmount : 0
        if (dmg <= 0) return false

        ud.hp = Math.max(0, ud.hp - dmg)

        if (this.debug?.active) {
            const maxHp = Number.isFinite(ud.maxHp) ? ud.maxHp : null
            const hpText = maxHp != null ? `${ud.hp}/${maxHp}` : `${ud.hp}`
            console.log(`🩸 Damage ${dmg} -> ${targetObject.name || 'target'} HP: ${hpText}`)
        }

        if (ud.hp <= 0) {
            ud.dead = true
            targetObject.visible = false

            // If the real run is active, count it as a kill.
            this.experience?.game?.addKill?.(1)
        }

        return true
    }

    _fireCameraRay(nowMs) {
        const weaponRange = Number.isFinite(this.currentWeapon?.range) ? this.currentWeapon.range : 50
        const ray = this._getCameraShootRay(weaponRange)
        if (!ray) return null

        this._shootRaycaster.near = 0.01
        this._shootRaycaster.far = ray.maxDistance
        this._shootRaycaster.set(ray.origin, ray.direction)

        // Intersect everything in the scene (recursive). We will filter out player + collider helpers.
        const hits = this._shootRaycaster.intersectObjects(this.scene.children, true)

        let firstValidHit = null
        for (const hit of hits) {
            const obj = hit?.object
            if (!obj) continue
            if (this._isDescendantOfPlayerMesh(obj)) continue

            // Ignore debug helpers / lines (these otherwise block hits in #debug mode)
            if (obj.isLine || obj.isLineSegments || obj.type === 'Line' || obj.type === 'LineSegments') continue

            const nameLower = (obj.name || '').toLowerCase()
            // Ignore authoring colliders/physics helpers (they're often hidden anyway)
            if (nameLower.endsWith('_collider')) continue
            if (nameLower.startsWith('physics_cube') || nameLower.startsWith('physics_cylinder')) continue
            if (nameLower === 'player-shoot-ray-debug') continue

            firstValidHit = hit
            break
        }

        if (firstValidHit) {
            const obj = firstValidHit.object
            const hitName = obj?.name || obj?.parent?.name || 'unnamed'
            console.log(`🎯 Hit: ${hitName} @ ${Math.round((firstValidHit.distance || 0) * 100) / 100}m`)

            // Damage hook: if hit object (or a parent) has userData.hp, apply weapon damage.
            const damageable = this._findDamageableObject(obj)
            if (damageable) {
                // Damage = player base atk * weapon multiplier
                const baseAtk = Number.isFinite(this.attack) ? this.attack : (Number.isFinite(this.baseAttack) ? this.baseAttack : 1)
                const weaponMultiplier =
                    (Number.isFinite(this.currentWeapon?.damageMultiplier) ? this.currentWeapon.damageMultiplier : null) ??
                    (Number.isFinite(this.currentWeapon?.multiplier) ? this.currentWeapon.multiplier : null) ??
                    // Back-compat: treat weapon.damage as multiplier if no dedicated multiplier exists.
                    (Number.isFinite(this.currentWeapon?.damage) ? this.currentWeapon.damage : 1)

                const dmg = Math.max(0, baseAtk * weaponMultiplier)
                this._applyDamageToObject(damageable, dmg)
            }
        } else {
            // Optional: log miss during debug
            // console.log('🎯 Miss')
        }

        return firstValidHit
    }

    updateWeaponHud() {
        if (!this.hudAmmoEl && !this.hudReloadingEl) return

        if (!this.currentWeapon) {
            if (this.hudAmmoEl) this.hudAmmoEl.style.display = 'none'
            if (this.hudReloadingEl) this.hudReloadingEl.style.display = 'none'
            return
        }

        // Ammo text
        if (this.hudAmmoEl) {
            const ammoSize = Number.isFinite(this.currentWeapon.ammoSize) ? this.currentWeapon.ammoSize : null
            const ammo = Number.isFinite(this.currentWeapon.ammo) ? this.currentWeapon.ammo : null
            if (ammoSize === null || ammoSize === Infinity) {
                this.hudAmmoEl.textContent = '∞'
            } else {
                this.hudAmmoEl.textContent = `${ammo ?? 0}/${ammoSize}`
            }
            this.hudAmmoEl.style.display = 'block'
        }

        // Reloading indicator
        if (this.hudReloadingEl) {
            this.hudReloadingEl.style.display = this.currentWeapon.isReloading ? 'block' : 'none'
        }
    }

    resetStatsForNewGame() {
        this.hp = this.baseHp
        this.attack = this.baseAttack
        this.defense = this.baseDefense
    }

    takeDamage(amount, { source = null } = {}) {
        const dmgIn = Number.isFinite(amount) ? amount : 0
        if (dmgIn <= 0) return 0

        const def = Number.isFinite(this.defense) ? this.defense : 0
        const dmg = Math.max(0, dmgIn - def)
        if (dmg <= 0) return 0

        this.hp = Math.max(0, (Number.isFinite(this.hp) ? this.hp : 0) - dmg)

        if (this.debug?.active) {
            console.log('💥 Player took damage:', { dmg, source, hp: this.hp, def })
        }

        // Only end the run if the game is active
        if (this.hp <= 0 && this.experience?.game?.active) {
            this.experience.game.game_end('dead')
        }

        return dmg
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
            // Note: filtered clips may be renamed (e.g. gun_aim__arms)
            if (clipName.includes('gun_aim') || clipName.includes('aim_gun')) {
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

            // Helper: filter a clip's tracks by bone name.
            const getBoneNameFromTrack = (trackName = '') => {
                // Common formats:
                // - "mixamorigSpine.quaternion"
                // - "Armature|mixamorigSpine.quaternion"
                const beforeProp = trackName.split('.')[0] || ''
                const afterPipe = beforeProp.split('|').pop() || beforeProp
                return afterPipe
            }

            const isUpperBodyBone = (boneName = '') => {
                // Keep broad matching to handle different rigs (Mixamo, Blender exports, etc.)
                return /spine|chest|neck|head|clavicle|shoulder|upperarm|forearm|hand|arm|finger|wrist/i.test(boneName)
            }

            const isArmBone = (boneName = '') => {
                return /clavicle|shoulder|upperarm|forearm|hand|arm|finger|wrist/i.test(boneName)
            }

            const isTorsoBone = (boneName = '') => {
                return /spine|chest|neck|head/i.test(boneName)
            }

            const isLowerBodyBone = (boneName = '') => {
                // Include common "skirt" / cloth helper bones so legs-only clips still drive them.
                return /pelvis|hip|thigh|calf|shin|knee|ankle|foot|toe|leg|skirt|dress|cloth|apron|cape/i.test(boneName)
            }

            const makeFilteredClip = (clip, trackPredicate, newNameSuffix) => {
                const tracks = (clip?.tracks || []).filter((t) => {
                    const boneName = getBoneNameFromTrack(t?.name || '')
                    return trackPredicate(boneName, t)
                })

                if (!tracks.length) return null
                return new THREE.AnimationClip(`${clip.name}${newNameSuffix}`, clip.duration, tracks)
            }

            // Create actions for available animations
            this.animations.forEach(clip => {
                const key = clip.name.toLowerCase()

                // Reduce track conflicts by filtering to logical body regions.
                // - gun_aim should affect upper body only
                // - walking_legs should affect lower body only (even if source clip accidentally contains extra tracks)
                let clipForAction = clip
                if (key === 'gun_aim' || key === 'aim_gun') {
                    const filtered = makeFilteredClip(
                        clip,
                        // Arms only: torso/head can be supported by idle_upper.
                        (boneName) => isArmBone(boneName) && !/pelvis|hip/i.test(boneName),
                        '__arms'
                    )
                    if (filtered) clipForAction = filtered
                }

                if (key === 'idle_upper') {
                    const filtered = makeFilteredClip(
                        clip,
                        // Torso only: avoid fighting arm pose with gun_aim.
                        (boneName) => isTorsoBone(boneName) && !/pelvis|hip/i.test(boneName),
                        '__torso'
                    )
                    if (filtered) clipForAction = filtered
                }

                if (key === 'walking_legs') {
                    const filtered = makeFilteredClip(
                        clip,
                        (boneName) => isLowerBodyBone(boneName),
                        '__lower'
                    )
                    if (filtered) clipForAction = filtered
                }

                const action = this.mixer.clipAction(clipForAction)

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
                this.baseAction = this.actions.idle
                this.baseAction.enabled = true
                this.baseAction.setEffectiveWeight?.(1)
                this.baseAction.play()
                console.log('✅ Started playing idle animation')
            } else if (Object.keys(this.actions).length > 0) {
                // If no idle, play the first available animation
                const firstKey = Object.keys(this.actions)[0]
                const firstAction = this.actions[firstKey]
                this.baseAction = firstAction
                this.baseAction.enabled = true
                this.baseAction.setEffectiveWeight?.(1)
                this.baseAction.play()
                console.log(`✅ Started playing first available animation: ${firstKey}`)
            }
        } else {
            console.warn('⚠️ No animations found on model')
        }
    }

    _resolveActionKey(requestedName) {
        if (!requestedName) return null
        // Exact match first
        if (this.actions[requestedName]) return requestedName
        const targetLower = requestedName.toLowerCase()
        const matchedKey = Object.keys(this.actions).find((key) => key.toLowerCase().includes(targetLower))
        return matchedKey || null
    }

    _getActionClipName(action) {
        return action?.getClip?.()?.name ?? ''
    }

    _logCurrentAnimations(reason = '') {
        const base = this._getActionClipName(this.baseAction)
        const overlay = this._getActionClipName(this.overlayAction)
        const support = this._getActionClipName(this.overlaySupportAction)
        const state = `base=${base || 'none'} | overlay=${overlay || 'none'} | support=${support || 'none'}`

        if (state === this._lastLoggedAnimationState) return
        this._lastLoggedAnimationState = state

        if (reason) {
            console.log(`🎞️ Animations (${reason}): ${state}`)
        } else {
            console.log(`🎞️ Animations: ${state}`)
        }
    }

    _updateAnimationLayerWeights(isGunOverlayActive, isMoving, shouldSupportOverlay) {
        // Targets (smoothed to avoid snapping):
        // - overlay fades in/out
        // - base dips slightly while standing still with overlay active (prevents averaging with idle)
        this._overlayWeightTarget = isGunOverlayActive ? 1 : 0
        this._overlaySupportWeightTarget = shouldSupportOverlay ? 1 : 0
        this._baseWeightTarget = isGunOverlayActive ? (isMoving ? 1 : 0.15) : 1

        const dt = (this.time?.delta ?? 16) / 1000
        const lerp = (a, b, t) => a + (b - a) * t
        const smoothing = 12 // higher = faster blend
        const t = 1 - Math.exp(-smoothing * dt)

        this._overlayWeight = lerp(this._overlayWeight, this._overlayWeightTarget, t)
        this._overlaySupportWeight = lerp(this._overlaySupportWeight, this._overlaySupportWeightTarget, t)
        this._baseWeight = lerp(this._baseWeight, this._baseWeightTarget, t)

        if (this.overlayAction) {
            this.overlayAction.enabled = true
            this.overlayAction.setEffectiveWeight?.(this._overlayWeight)
        }

        if (this.overlaySupportAction) {
            this.overlaySupportAction.enabled = true
            this.overlaySupportAction.setEffectiveWeight?.(this._overlaySupportWeight)
        }
        if (this.baseAction) {
            this.baseAction.enabled = true
            this.baseAction.setEffectiveWeight?.(this._baseWeight)
        }

        // When overlay is effectively gone, stop it (do NOT reset immediately; avoids pose pop).
        if (!isGunOverlayActive && this.overlayAction && this._overlayWeight <= 0.01) {
            this.overlayAction.stop()
            this.overlayAction.enabled = false
            this.overlayAction.timeScale = 1
            this.overlayAction = null
            this._logCurrentAnimations('overlay stop')
        }

        if (!isGunOverlayActive && this.overlaySupportAction && this._overlaySupportWeight <= 0.01) {
            this.overlaySupportAction.stop()
            this.overlaySupportAction.enabled = false
            this.overlaySupportAction.timeScale = 1
            this.overlaySupportAction = null
            this._logCurrentAnimations('support stop')
        }
    }

    playBaseAnimation(animationName) {
        if (!this.mixer || Object.keys(this.actions).length === 0) return

        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction) {
            console.warn(`⚠️ Base animation "${animationName}" not available. Available: ${Object.keys(this.actions).join(', ')}`)
            return
        }

        if (newAction === this.baseAction) return

        if (this.baseAction) {
            this.baseAction.fadeOut(0.2)
        }

        newAction.enabled = true
        newAction.reset()
        newAction.fadeIn(0.2)
        newAction.play()

        this.baseAction = newAction
        this._logCurrentAnimations('base change')
    }

    playOverlayAnimation(animationName, { timeScale = 1 } = {}) {
        if (!this.mixer || Object.keys(this.actions).length === 0) return

        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction) {
            console.warn(`⚠️ Overlay animation "${animationName}" not available. Available: ${Object.keys(this.actions).join(', ')}`)
            return
        }

        // Do not fade out the base action; overlays should stack.
        if (this.overlayAction && this.overlayAction !== newAction) {
            // Smoothly transition between overlays if needed.
            this.overlayAction.fadeOut(0.15)
        }

        newAction.enabled = true
        newAction.setEffectiveWeight?.(1)
        newAction.timeScale = timeScale

        // Ensure we can replay a LoopOnce+clamped clip reliably.
        newAction.reset()
        newAction.fadeIn(0.2)
        newAction.play()

        this.overlayAction = newAction
        // Force targets to blend in smoothly.
        this._overlayWeightTarget = 1
        this._logCurrentAnimations('overlay start')
    }

    playOverlaySupportAnimation(animationName) {
        if (!this.mixer || Object.keys(this.actions).length === 0) return

        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction) return

        if (this.overlaySupportAction === newAction) return

        if (this.overlaySupportAction && this.overlaySupportAction !== newAction) {
            this.overlaySupportAction.fadeOut(0.2)
        }

        newAction.enabled = true
        newAction.setEffectiveWeight?.(1)
        newAction.timeScale = 1
        newAction.reset()
        newAction.fadeIn(0.25)
        newAction.play()

        this.overlaySupportAction = newAction
        this._overlaySupportWeightTarget = 1
        this._logCurrentAnimations('support start')
    }

    stopOverlayAnimation() {
        if (!this.overlayAction) return
        // Weight smoothing will fade it out; fadeOut helps too.
        this._overlayWeightTarget = 0
        this.overlayAction.fadeOut(0.25)
    }

    stopOverlaySupportAnimation() {
        if (!this.overlaySupportAction) return
        this._overlaySupportWeightTarget = 0
        this.overlaySupportAction.fadeOut(0.25)
    }

    updateBaseAnimation(isMoving, isRunning, isGunOverlayActive) {
        if (!this.mixer || Object.keys(this.actions).length === 0) return

        // While gun overlay is active, prefer the legs-only walk clip when moving.
        // Fallback to normal walking if walking_legs doesn't exist.
        if (isGunOverlayActive && isMoving) {
            const hasWalkingLegs = !!this._resolveActionKey('walking_legs')
            this.playBaseAnimation(hasWalkingLegs ? 'walking_legs' : 'walking')
            return
        }

        if (!isMoving) {
            this.playBaseAnimation('idle')
        } else if (isRunning) {
            this.playBaseAnimation('running')
        } else {
            this.playBaseAnimation('walking')
        }
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
            // Process weapon timers (reload completion + buffered shots)
            const firedFromBuffer = this.currentWeapon.update(nowMs)
            if (firedFromBuffer) this._fireCameraRay(nowMs)

            // Right click ONLY: aim mode (camera zoom/offset + reduced movement speed)
            if (this.input.keys.aim !== this.isAiming) {
                this.setAiming(this.input.keys.aim)
            }

            // Left click: shoot WITHOUT entering aim mode.
            const isShooting = !!this.input.keys.shoot
            const shootStarted = isShooting && !this._wasShooting
            this._isShootingHeld = isShooting

            // While holding shoot (single-fire auto), keep gun_aim overlay active
            // so it doesn't fade out between shots or during reload/cooldown.
            if (isShooting && !this.isAiming) {
                const overlayClipLower = this.overlayAction?.getClip?.()?.name?.toLowerCase?.() ?? ''
                const overlayIsGunAim = overlayClipLower.includes('gun_aim') || overlayClipLower.includes('aim_gun')
                if (!overlayIsGunAim) {
                    this.playOverlayAnimation('gun_aim', { timeScale: 1 })
                } else if (this.overlayAction) {
                    // Normalize to steady speed while holding.
                    this.overlayAction.timeScale = 1
                }
            }

            // Play gun_aim fully once on shoot start (do not cancel early)
            if (shootStarted && !this.isAiming) {
                this._oneShotGunAimActive = true
                this._gunAimHoldUntilMs = 0

                this.playOverlayAnimation('gun_aim', { timeScale: this._gunAimOneShotTimeScale })
            }

            // Firing rules:
            // - Rapid clicking is buffered (press queues a shot during cooldown)
            // - Holding fires every cooldown WITHOUT buffering (prevents accidental extra shot on a slow click)
            if (shootStarted) {
                this.shoot() // buffered requestFire
            } else if (isShooting) {
                const firedHeld = this.currentWeapon.tryFireHeld(nowMs)
                if (firedHeld) this._fireCameraRay(nowMs)
            }

            this._wasShooting = isShooting
        } else {
            this._wasShooting = false
            this._isShootingHeld = false
            this._oneShotGunAimActive = false
            this._gunAimHoldUntilMs = 0
            if (this.isAiming) this.setAiming(false)
            this.stopOverlayAnimation()
            this.stopOverlaySupportAnimation()
        }

        this.updateWeaponHud()

        // --- DEBUG: Shooting ray visualization ---
        if (this.debug?.active) {
            this._ensureShootDebugLine()
            const dist = Math.max(
                1,
                Number.isFinite(this.currentWeapon?.range)
                    ? this.currentWeapon.range
                    : (Number.isFinite(this._shootDebug.maxDistance) ? this._shootDebug.maxDistance : 60)
            )

            const ray = this.currentWeapon ? this._getCameraShootRay(dist) : null
            if (this._shootDebug.line && ray) {
                const pts = [ray.origin.clone(), ray.end.clone()]
                this._shootDebug.line.geometry.setFromPoints(pts)
                this._shootDebug.line.visible = true
            } else if (this._shootDebug.line) {
                this._shootDebug.line.visible = false
            }
        }

        // --- NEW: Stop movement if Dialogue is open ---
        if (this.experience.dialogue.isActive()) {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
            this.updateBaseAnimation(false, false, false)
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

        const shouldFaceCameraWhileShooting = !!this.currentWeapon && this._isShootingHeld

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
        } else if (shouldFaceCameraWhileShooting) {
            // While shooting (left click hold), face where the camera looks.
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

                const speed = isRunning ? 10 : 3
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
        // - While aiming or during a one-shot gun_aim, keep gun overlay active.
        // - While gun overlay is active and the player moves, play walking_legs alongside it.
        const isHoldingGunAimPose = nowMs < (this._gunAimHoldUntilMs || 0)
        const isGunOverlayActive = this.isAiming || this._isShootingHeld || this._oneShotGunAimActive || isHoldingGunAimPose

        // Keep idle_upper running while gun overlay is active OR while the gun overlay is still blending out.
        // This helps the pose return smoothly instead of feeling "stuck".
        const shouldSupportOverlay = isGunOverlayActive || (this.overlayAction && this._overlayWeight > 0.01)

        // Keep torso/head stable while gun_aim (arms) is active.
        if (shouldSupportOverlay) {
            this.playOverlaySupportAnimation('idle_upper')
        } else {
            this.stopOverlaySupportAnimation()
        }
        this.updateBaseAnimation(isMoving, isRunning, isGunOverlayActive)

        // Apply smoothed weights after selecting the base clip (so new base action gets the right weight).
        this._updateAnimationLayerWeights(isGunOverlayActive, isMoving, shouldSupportOverlay)

        // If the gun overlay is no longer needed, fade it out and stop/reset once faded.
        if (!isGunOverlayActive) {
            this.stopOverlayAnimation()
        }

        // Always advance animations (including while aiming)
        if (this.mixer) {
            this.mixer.update(this.time.delta / 1000)
        }

        // Overlay cleanup is handled in _updateAnimationLayerWeights().

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