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

        this.canJump = false 
        this._feetLocalY = 0
        this._groundedThisStep = false
        this._lastGroundedTime = 0
        this.mesh = null
        this.animations = [] 
        this.debug = this.experience.debug
        this.body = null
        this.mixer = null
        this.actions = {}
        
        this.baseAction = null
        this.overlayAction = null
        this.overlaySupportAction = null
        
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
                damageMultiplier: 1,
                damage: 1,
                range: 50,
                cooldown: 0.5,
                bufferWindowMs: 0,
                ammo_size: 20,
                reloading_time: 3
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
        this._weaponWasReloading = false
        this._oneShotGunAimActive = false

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

        this.baseHp = 100
        this.baseAttack = 5
        this.baseDefense = 0
        this.hp = this.baseHp
        this.attack = this.baseAttack
        this.defense = this.baseDefense

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

        this.resources.on('ready', () => {
            this.setMesh()
            this.setPhysics()
            this.setupDebug()
        })

        this.input.on('jump', () => {
            this.jump()
        })

        this.input.on('reload', () => {
            this.reload()
        })

        // --- NEW: Interaction Input (For Level 3 Scavenger Hunt) ---
        this.input.on('interact', () => {
            console.log('Player: Interact key pressed')
            this.interact()
        })

        // Weapon Inputs
        this.input.on('slot1', () => this.equipWeapon('pistol'))
        this.input.on('slot2', () => this.equipWeapon(null)) 
        this.input.on('slot3', () => this.equipWeapon(null)) 
    }

    equipWeapon(weaponKey) {
        if (weaponKey === 'pistol') {
            this.currentWeapon = this.weapons.pistol
            this._weaponWasReloading = Boolean(this.currentWeapon?.isReloading)
            if (this.pistolMesh) this.pistolMesh.visible = true
            this.experience.camera?.setWeaponActive?.(true)
            console.log('Equipped Pistol')
            document.querySelector('.hud-weapon-slot.slot-1').classList.add('active')
        } else {
            this.currentWeapon = null
            this._weaponWasReloading = false
            if (this.pistolMesh) this.pistolMesh.visible = false
            this.setAiming(false)
            this.experience.camera?.setWeaponActive?.(false)
            console.log('Unequipped Weapon')
            document.querySelector('.hud-weapon-slot.slot-1').classList.remove('active')
        }
    }

    _playSfx(name, opts) {
        this.experience?.soundHandler?.playSfx?.(name, opts)
    }

    setAiming(isAiming) {
        if (this.isAiming === isAiming) return

        this.isAiming = isAiming
        this.experience.camera.setAimMode(isAiming)

        if (isAiming) {
            this.playOverlayAnimation('gun_aim', { timeScale: 1 })
        } else {
            this.stopOverlayAnimation()
            this.updateBaseAnimation(false, false, false)
        }
    }

    shoot() {
        if (!this.currentWeapon) return false

        const nowMs = this.time?.elapsed ?? 0
        const fired = this.currentWeapon.requestFire(nowMs)
        if (fired) {
            this._fireCameraRay(nowMs)
            if (this.currentWeapon === this.weapons?.pistol) this._playSfx('pistol_shot')
        }
        return fired
    }

    reload() {
        if (!this.currentWeapon) return

        const nowMs = this.time?.elapsed ?? 0

        if (typeof this.currentWeapon.startReload === 'function') {
            this.currentWeapon.startReload(nowMs)
        } else if (typeof this.currentWeapon.reload === 'function') {
            this.currentWeapon.reload(nowMs)
        } else {
            console.warn('Player: Current weapon does not have a reload() method.')
        }
    }

    // --- NEW: Interaction Method ---
    // Used to pick up items for Level 3
    interact() {
        // Raycast forward a short distance (e.g., 3 units)
        const ray = this._getCameraShootRay(3)
        if (!ray) return

        this._shootRaycaster.set(ray.origin, ray.direction)
        const hits = this._shootRaycaster.intersectObjects(this.scene.children, true)

        for (const hit of hits) {
            const obj = hit.object
            if (this._isDescendantOfPlayerMesh(obj)) continue
            
            // Walk up to find the root object with userData
            let target = obj
            while(target) {
                if (target.userData && target.userData.isCollectible) {
                    // Found a collectible!
                    console.log('✨ Collectible found:', target.name)
                    
                    // Hide it / "Destroy" it
                    target.visible = false
                    // Ideally you would remove the physics body here too if it exists

                    // Notify Level Manager
                    this.experience.levelManager?.onItemCollected?.()
                    return // Stop after picking up one item
                }
                target = target.parent
            }
        }
        console.log('Interaction: Nothing found.')
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

            // Legacy game manager
            this.experience?.game?.addKill?.(1)

            // --- NEW: Notify Level Manager of Kill ---
            // If the enemy has userData.isBoss = true, we pass true.
            const isBoss = !!ud.isBoss
            this.experience?.levelManager?.onEnemyKilled?.(isBoss)
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

        const hits = this._shootRaycaster.intersectObjects(this.scene.children, true)

        let firstValidHit = null
        for (const hit of hits) {
            const obj = hit?.object
            if (!obj) continue
            if (this._isDescendantOfPlayerMesh(obj)) continue

            if (obj.isLine || obj.isLineSegments || obj.type === 'Line' || obj.type === 'LineSegments') continue

            const nameLower = (obj.name || '').toLowerCase()
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

            const damageable = this._findDamageableObject(obj)
            if (damageable) {
                const baseAtk = Number.isFinite(this.attack) ? this.attack : (Number.isFinite(this.baseAttack) ? this.baseAttack : 1)
                const weaponMultiplier =
                    (Number.isFinite(this.currentWeapon?.damageMultiplier) ? this.currentWeapon.damageMultiplier : null) ??
                    (Number.isFinite(this.currentWeapon?.multiplier) ? this.currentWeapon.multiplier : null) ??
                    (Number.isFinite(this.currentWeapon?.damage) ? this.currentWeapon.damage : 1)

                const dmg = Math.max(0, baseAtk * weaponMultiplier)
                this._applyDamageToObject(damageable, dmg)
            }
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
            console.log('💥 Player took damage:', {
                dmg,
                source,
                hp: this.hp,
                def
            })
        }

        if (this.hp <= 0 && this.experience?.game?.active) {
            this.experience.game.game_end('dead')
        }

        return dmg
    }

    setupDebug() {
        if (!this.debug.active) return

        const debugFolder = this.debug.ui.addFolder('Player')

        debugFolder.add(this.physicsConfig, 'radius').min(0.1).max(1).step(0.1).name('Physics Radius')
        debugFolder.add(this.physicsConfig, 'height').min(0.5).max(3).step(0.1).name('Physics Height')
        debugFolder.add(this.physicsConfig, 'offsetX').min(-1).max(1).step(0.1).name('Offset X')
        debugFolder.add(this.physicsConfig, 'offsetY').min(-1).max(1).step(0.1).name('Offset Y')
        debugFolder.add(this.physicsConfig, 'offsetZ').min(-1).max(1).step(0.1).name('Offset Z')

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
        const geometry = new THREE.CapsuleGeometry(this.physicsConfig.radius, this.physicsConfig.height, 4, 8)
        const material = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8
        })
        this.debugVisuals.physicsMesh = new THREE.Mesh(geometry, material)
        this.scene.add(this.debugVisuals.physicsMesh)
    }

    createBoundingBoxVisualization() {
        if (!this.mesh) return

        const bbox = new THREE.Box3().setFromObject(this.mesh)
        const size = bbox.getSize(new THREE.Vector3())
        const center = bbox.getCenter(new THREE.Vector3())

        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: 0x0000ff,
            transparent: true,
            opacity: 0.8
        })
        this.debugVisuals.boundingBox = new THREE.Mesh(geometry, material)
        this.debugVisuals.boundingBox.position.copy(center)
        this.debugVisuals.boundingBox.scale.set(size.x, size.y, size.z)
        this.scene.add(this.debugVisuals.boundingBox)
    }

    setMesh() {
        const model = this.resources.items.mainCharacter
        if (!model) {
            console.error('❌ Main character model not found in resources')
            return
        }

        this.mesh = model.scene
        this.animations = model.animations 

        this.mesh.traverse((child) => {
            if (child.name.toLowerCase() === 'pistol') {
                this.pistolMesh = child
                child.visible = false 
            }

            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true 

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

        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
        this.mesh.frustumCulled = false

        this.mesh.position.y = 5
        this.mesh.scale.set(1, 1, 1)
        this.scene.add(this.mesh)

        const bbox = new THREE.Box3().setFromObject(this.mesh)
        this.modelCenterOffset = bbox.getCenter(new THREE.Vector3()).sub(this.mesh.position)
        
        this.setupAnimations()
    }

    setupAnimations() {
        if (!this.mesh) return

        this.mixer = new THREE.AnimationMixer(this.mesh)

        this.mixer.addEventListener('finished', (event) => {
            const clipName = event?.action?.getClip?.()?.name?.toLowerCase?.() ?? ''
            if (clipName.includes('gun_aim') || clipName.includes('aim_gun')) {
                this._oneShotGunAimActive = false
                this._gunAimHoldUntilMs = (this.time?.elapsed ?? 0) + this._gunAimOneShotHoldMs
            }
        })

        if (this.animations && this.animations.length > 0) {
            
            // Helper: filter a clip's tracks by bone name.
            const getBoneNameFromTrack = (trackName = '') => {
                const beforeProp = trackName.split('.')[0] || ''
                const afterPipe = beforeProp.split('|').pop() || beforeProp
                return afterPipe
            }

            const isArmBone = (boneName = '') => {
                return /clavicle|shoulder|upperarm|forearm|hand|arm|finger|wrist/i.test(boneName)
            }

            const isTorsoBone = (boneName = '') => {
                return /spine|chest|neck|head/i.test(boneName)
            }

            const isLowerBodyBone = (boneName = '') => {
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

            this.animations.forEach(clip => {
                const key = clip.name.toLowerCase()
                let clipForAction = clip
                if (key === 'gun_aim' || key === 'aim_gun') {
                    const filtered = makeFilteredClip(
                        clip,
                        (boneName) => isArmBone(boneName) && !/pelvis|hip/i.test(boneName),
                        '__arms'
                    )
                    if (filtered) clipForAction = filtered
                }

                if (key === 'idle_upper') {
                    const filtered = makeFilteredClip(
                        clip,
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

                if (key === 'gun_aim') {
                    action.loop = THREE.LoopOnce
                    action.clampWhenFinished = true
                } else {
                    action.loop = THREE.LoopRepeat
                }

                this.actions[key] = action
            })

            if (this.actions.idle) {
                this.baseAction = this.actions.idle
                this.baseAction.enabled = true
                this.baseAction.setEffectiveWeight?.(1)
                this.baseAction.play()
            } else if (Object.keys(this.actions).length > 0) {
                const firstKey = Object.keys(this.actions)[0]
                const firstAction = this.actions[firstKey]
                this.baseAction = firstAction
                this.baseAction.enabled = true
                this.baseAction.setEffectiveWeight?.(1)
                this.baseAction.play()
            }
        }
    }

    _resolveActionKey(requestedName) {
        if (!requestedName) return null
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
    }

    _updateAnimationLayerWeights(isGunOverlayActive, isMoving, shouldSupportOverlay) {
        this._overlayWeightTarget = isGunOverlayActive ? 1 : 0
        this._overlaySupportWeightTarget = shouldSupportOverlay ? 1 : 0
        this._baseWeightTarget = isGunOverlayActive ? (isMoving ? 1 : 0.15) : 1

        const dt = (this.time?.delta ?? 16) / 1000
        const lerp = (a, b, t) => a + (b - a) * t
        const smoothing = 12 
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

        if (!isGunOverlayActive && this.overlayAction && this._overlayWeight <= 0.01) {
            this.overlayAction.stop()
            this.overlayAction.enabled = false
            this.overlayAction.timeScale = 1
            this.overlayAction = null
        }

        if (!isGunOverlayActive && this.overlaySupportAction && this._overlaySupportWeight <= 0.01) {
            this.overlaySupportAction.stop()
            this.overlaySupportAction.enabled = false
            this.overlaySupportAction.timeScale = 1
            this.overlaySupportAction = null
        }
    }

    playBaseAnimation(animationName) {
        if (!this.mixer || Object.keys(this.actions).length === 0) return

        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction) return

        if (newAction === this.baseAction) return

        if (this.baseAction) {
            this.baseAction.fadeOut(0.2)
        }

        newAction.enabled = true
        newAction.reset()
        newAction.fadeIn(0.2)
        newAction.play()

        this.baseAction = newAction
    }

    playOverlayAnimation(animationName, { timeScale = 1 } = {}) {
        if (!this.mixer || Object.keys(this.actions).length === 0) return

        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction) return

        if (this.overlayAction && this.overlayAction !== newAction) {
            this.overlayAction.fadeOut(0.15)
        }

        newAction.enabled = true
        newAction.setEffectiveWeight?.(1)
        newAction.timeScale = timeScale

        newAction.reset()
        newAction.fadeIn(0.2)
        newAction.play()

        this.overlayAction = newAction
        this._overlayWeightTarget = 1
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
    }

    stopOverlayAnimation() {
        if (!this.overlayAction) return
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
        const sphereShape = new CANNON.Sphere(this.physicsConfig.radius)

        this.body = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(0, 5, 0),
            material: this.materials.player,
            linearDamping: 0.1,
            angularDamping: 0.1
        })

        const halfHeight = this.physicsConfig.height / 2 - this.physicsConfig.radius
        this.body.addShape(sphereShape, new CANNON.Vec3(this.physicsConfig.offsetX, halfHeight + this.physicsConfig.offsetY, this.physicsConfig.offsetZ))
        this.body.addShape(sphereShape, new CANNON.Vec3(this.physicsConfig.offsetX, -halfHeight + this.physicsConfig.offsetY, this.physicsConfig.offsetZ))

        this._feetLocalY = (-halfHeight + this.physicsConfig.offsetY) - this.physicsConfig.radius

        this.body.fixedRotation = true
        this.body.updateMassProperties()

        this.physicsWorld.addBody(this.body)
    }

    jump() {
        if (this.canJump) {
            console.log('Player: Jumping!')
            if (this.body.velocity.y < 8) {
                this.body.velocity.y = 8
            }
            this.canJump = false
        }
    }

    update() {
        if (!this.input || !this.mesh) return

        const nowMs = this.time?.elapsed ?? 0

        // --- WEAPON INPUT ---
        if (this.currentWeapon) {
            const wasReloading = Boolean(this._weaponWasReloading)

            const firedFromBuffer = this.currentWeapon.update(nowMs)
            if (firedFromBuffer) {
                this._fireCameraRay(nowMs)
                if (this.currentWeapon === this.weapons?.pistol) this._playSfx('pistol_shot')
            }

            if (this.input.keys.aim !== this.isAiming) {
                this.setAiming(this.input.keys.aim)
            }

            const isShooting = !!this.input.keys.shoot
            const shootStarted = isShooting && !this._wasShooting
            this._isShootingHeld = isShooting

            if (isShooting && !this.isAiming) {
                const overlayClipLower = this.overlayAction?.getClip?.()?.name?.toLowerCase?.() ?? ''
                const overlayIsGunAim = overlayClipLower.includes('gun_aim') || overlayClipLower.includes('aim_gun')
                if (!overlayIsGunAim) {
                    this.playOverlayAnimation('gun_aim', { timeScale: 1 })
                } else if (this.overlayAction) {
                    this.overlayAction.timeScale = 1
                }
            }

            if (shootStarted && !this.isAiming) {
                this._oneShotGunAimActive = true
                this._gunAimHoldUntilMs = 0

                this.playOverlayAnimation('gun_aim', {
                    timeScale: this._gunAimOneShotTimeScale
                })
            }

            if (shootStarted) {
                this.shoot() 
            } else if (isShooting) {
                const firedHeld = this.currentWeapon.tryFireHeld(nowMs)
                if (firedHeld) {
                    this._fireCameraRay(nowMs)
                    if (this.currentWeapon === this.weapons?.pistol) this._playSfx('pistol_shot')
                }
            }

            const isReloadingNow = Boolean(this.currentWeapon?.isReloading)
            if (!wasReloading && isReloadingNow) {
                if (this.currentWeapon === this.weapons?.pistol) this._playSfx('pistol_reload')
            }
            this._weaponWasReloading = isReloadingNow

            this._wasShooting = isShooting
        } else {
            this._wasShooting = false
            this._isShootingHeld = false
            this._weaponWasReloading = false
            this._oneShotGunAimActive = false
            this._gunAimHoldUntilMs = 0
            if (this.isAiming) this.setAiming(false)
            this.stopOverlayAnimation()
            this.stopOverlaySupportAnimation()
        }

        this.updateWeaponHud()

        if (this.debug?.active) {
            this._ensureShootDebugLine()
            const dist = Math.max(
                1,
                Number.isFinite(this.currentWeapon?.range) ?
                this.currentWeapon.range :
                (Number.isFinite(this._shootDebug.maxDistance) ? this._shootDebug.maxDistance : 60)
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

        if (this.experience.dialogue.isActive()) {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
            this.updateBaseAnimation(false, false, false)
            return 
        }

        if (Math.abs(this.body.velocity.y) < 0.1) {
            this.canJump = true
        } else {
            this.canJump = false
        }

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
                const speed = 2 

                this.body.velocity.x = Math.sin(targetRotation) * speed
                this.body.velocity.z = Math.cos(targetRotation) * speed
            } else {
                this.body.velocity.x = 0
                this.body.velocity.z = 0
            }
        } else if (shouldFaceCameraWhileShooting) {
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

        const isHoldingGunAimPose = nowMs < (this._gunAimHoldUntilMs || 0)
        const isGunOverlayActive = this.isAiming || this._isShootingHeld || this._oneShotGunAimActive || isHoldingGunAimPose

        const shouldSupportOverlay = isGunOverlayActive || (this.overlayAction && this._overlayWeight > 0.01)

        if (shouldSupportOverlay) {
            this.playOverlaySupportAnimation('idle_upper')
        } else {
            this.stopOverlaySupportAnimation()
        }
        this.updateBaseAnimation(isMoving, isRunning, isGunOverlayActive)

        this._updateAnimationLayerWeights(isGunOverlayActive, isMoving, shouldSupportOverlay)

        if (!isGunOverlayActive) {
            this.stopOverlayAnimation()
        }

        if (this.mixer) {
            this.mixer.update(this.time.delta / 1000)
        }

        this.mesh.position.copy(this.body.position)
        if (this.modelCenterOffset) {
            this.mesh.position.sub(this.modelCenterOffset)
        }

        if (this.debugVisuals.showPhysics && this.debugVisuals.physicsMesh) {
            this.debugVisuals.physicsMesh.position.copy(this.body.position)
            this.debugVisuals.physicsMesh.position.add(new THREE.Vector3(this.physicsConfig.offsetX, this.physicsConfig.offsetY, this.physicsConfig.offsetZ))
        }
        if (this.debugVisuals.showBoundingBox && this.debugVisuals.boundingBox) {
            const bbox = new THREE.Box3().setFromObject(this.mesh)
            const size = bbox.getSize(new THREE.Vector3())
            const center = bbox.getCenter(new THREE.Vector3())

            this.debugVisuals.boundingBox.position.copy(center)
            this.debugVisuals.boundingBox.scale.set(size.x, size.y, size.z)
        }
    }
}