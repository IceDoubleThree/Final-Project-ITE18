import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../Experience.js'
import { ENVIRONMENTS } from '../Utils/AppState.js'
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

        // --- INVENTORY SYSTEM ---
        // Player starts with ALL weapons immediately
        this.inventory = ['pistol', 'rifle', 'shotgun']

        // --- WEAPON SYSTEM ---
        this.weapons = {
            pistol: new Weapon('Pistol', {
                damageMultiplier: 1,
                damage: 25,
                range: 50,
                cooldown: 0.4,
                bufferWindowMs: 0,
                ammo_size: 12,
                reloading_time: 2,
                isAutomatic: false,
                spread: 0.01,
                pelletCount: 1
            }),
            rifle: new Weapon('Assault Rifle', {
                damageMultiplier: 1,
                damage: 2, // Low damage, high fire rate
                range: 100,
                cooldown: 0.1,
                ammo_size: 30,
                reloading_time: 2.5,
                isAutomatic: true,
                spread: 0.03,
                pelletCount: 1
            }),
            shotgun: new Weapon('Shotgun', {
                damageMultiplier: 1,
                damage: 1, // 1 damage per pellet
                range: 25,
                cooldown: 0.9,
                ammo_size: 6,
                reloading_time: 3,
                isAutomatic: false,
                spread: 0.12,
                pelletCount: 10 // 10 pellets
            })
        }

        this.currentWeapon = null
        this.isAiming = false

        // Store mesh references
        this.weaponMeshes = {
            pistol: null,
            rifle: null,
            shotgun: null
        }

        this.tracers = []
        this.muzzleFlashes = []

        this.hudAmmoEl = document.getElementById('hud-ammo')
        this.hudReloadingEl = document.getElementById('hud-reloading')

        this._wasShooting = false
        this._isShootingHeld = false
        this._weaponWasReloading = false
        this._oneShotGunAimActive = false
        this._gunAimHoldUntilMs = 0
        this._gunAimOneShotTimeScale = 2
        this._gunAimOneShotHoldMs = 1000
        this._pistolWalkingHoldUntilMs = 0
        this._pistolWalkingHoldMs = 250 // ms to hold pistol_walking to avoid flicker

        this._shootRaycaster = new THREE.Raycaster()
        this._shootDebug = { line: null, maxDistance: 60 }

        this.baseHp = 100
        this.baseAttack = 1
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
            // Equip pistol by default on load
            this.equipWeapon('pistol')
        })

        this.input.on('jump', () => this.jump())
        this.input.on('reload', () => this.reload())
        this.input.on('interact', () => this.interact())

        // Inventory Switching
        this.input.on('slot1', () => this.equipWeapon('pistol'))
        this.input.on('slot2', () => this.equipWeapon('rifle'))
        this.input.on('slot3', () => this.equipWeapon('shotgun'))
    }

    equipWeapon(weaponKey) {
        // Disable weapon switching when not in GAME environment
        if (this.experience?.appState && this.experience.appState.current_env !== ENVIRONMENTS.GAME) {
            console.log('🔒 Weapons disabled outside GAME environment')
            return
        }

        // Check if player owns this weapon
        if (!this.inventory.includes(weaponKey)) {
            return
        }

        // Hide all weapon meshes
        Object.values(this.weaponMeshes).forEach(m => { if (m) m.visible = false })

        // Update UI Classes
        const slots = document.querySelectorAll('.hud-weapon-slot')
        if (slots) slots.forEach(el => el.classList.remove('active'))

        if (weaponKey && this.weapons[weaponKey]) {
            this.currentWeapon = this.weapons[weaponKey]
            this._weaponWasReloading = Boolean(this.currentWeapon?.isReloading)

            if (this.weaponMeshes[weaponKey]) {
                this.weaponMeshes[weaponKey].visible = true
            }

            if (this.experience.camera && this.experience.camera.setWeaponActive) {
                this.experience.camera.setWeaponActive(true)
            }

            // Highlight specific HUD slot
            const slotMap = { 'pistol': 1, 'rifle': 2, 'shotgun': 3 }
            const slotIndex = slotMap[weaponKey]
            const slotEl = document.querySelector(`.hud-weapon-slot.slot-${slotIndex}`)
            if (slotEl) slotEl.classList.add('active')

            console.log(`🔫 Equipped: ${weaponKey} (Slot ${slotIndex})`)

        } else {
            this.currentWeapon = null
            this._weaponWasReloading = false
            this.setAiming(false)
            if (this.experience.camera && this.experience.camera.setWeaponActive) {
                this.experience.camera.setWeaponActive(false)
            }
        }
    }

    _playSfx(name, opts) {
        this.experience?.soundHandler?.playSfx?.(name, opts)
    }

    setAiming(isAiming) {
        // Prevent aiming outside of GAME env
        if (this.experience?.appState && this.experience.appState.current_env !== ENVIRONMENTS.GAME) return
        if (this.isAiming === isAiming) return
        this.isAiming = isAiming
        // Pass `true` to indicate right-click aiming should use widened FOV
        this.experience.camera.setAimMode(isAiming, true)

        if (isAiming) {
            this.playOverlayAnimation('pistol_aim', { timeScale: 1 })
            const nowMs = this.time?.elapsed ?? 0
            this._pistolWalkingHoldUntilMs = nowMs + this._pistolWalkingHoldMs
        } else {
            this.stopOverlayAnimation()
            this.updateBaseAnimation(false, false, false)
        }
    }

    createMuzzleFlash(barrelPos) {
        if (!barrelPos) return
        const map = this.resources.items.muzzleFlash
        if (!map) return

        const material = new THREE.SpriteMaterial({
            map: map,
            color: 0xffaa00,
            transparent: true,
            blending: THREE.AdditiveBlending
        })
        const sprite = new THREE.Sprite(material)
        sprite.position.copy(barrelPos)

        const scale = (Math.random() * 0.3 + 0.3)
        sprite.scale.set(scale, scale, 1)
        sprite.material.rotation = Math.random() * Math.PI

        this.scene.add(sprite)
        this.muzzleFlashes.push({ mesh: sprite, age: 0, life: 0.06 })
    }

    createBulletTracer(startPos, endPos) {
        const points = [startPos, endPos]
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        const material = new THREE.LineBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.8 })
        const line = new THREE.Line(geometry, material)

        this.scene.add(line)
        this.tracers.push({ mesh: line, age: 0, life: 0.15 })
    }

    getBarrelPosition() {
        let weaponMesh = Object.values(this.weaponMeshes).find(m => m && m.visible)
        const barrelPos = new THREE.Vector3()

        if (weaponMesh) {
            // Use the model's barrel position directly (check for barrel bone/helper first)
            let barrelHelper = null
            weaponMesh.traverse((child) => {
                const name = child.name.toLowerCase()
                if (name.includes('barrel') || name.includes('muzzle')) {
                    barrelHelper = child
                }
            })

            if (barrelHelper) {
                barrelHelper.getWorldPosition(barrelPos)
            } else {
                // Fallback to weapon mesh position if no barrel helper found
                weaponMesh.getWorldPosition(barrelPos)
            }
        } else {
            this.experience.camera.instance.getWorldPosition(barrelPos)
            const dir = new THREE.Vector3()
            this.experience.camera.instance.getWorldDirection(dir)
            barrelPos.add(dir.multiplyScalar(0.5))
        }
        return barrelPos
    }

    shoot() {
        // Disallow shooting outside of GAME env
        if (this.experience?.appState && this.experience.appState.current_env !== ENVIRONMENTS.GAME) return false
        if (!this.currentWeapon) return false

        const nowMs = this.time?.elapsed ?? 0
        const fired = this.currentWeapon.requestFire(nowMs)

        if (fired) {
            const barrelPos = this.getBarrelPosition()
            this.createMuzzleFlash(barrelPos)

            // --- PISTOL SHOOTING ANIMATION LOGIC (from old player.js) ---
            if (this.currentWeapon === this.weapons.pistol) {
                this._playSfx('pistol_shot')
                // Play snappy one-shot pistol_aim overlay animation
                this._gunAimHoldUntilMs = nowMs + this._gunAimOneShotHoldMs
                this._oneShotGunAimActive = true
                this.playOverlayAnimation('pistol_aim', { timeScale: this._gunAimOneShotTimeScale })
                // Hold pistol_walking briefly to avoid rapid switching
                this._pistolWalkingHoldUntilMs = nowMs + this._pistolWalkingHoldMs
            } else if (this.currentWeapon === this.weapons.rifle) {
                this._playSfx('pistol_shot', { playbackRate: 1.2, volume: 0.8 })
            } else if (this.currentWeapon === this.weapons.shotgun) {
                this._playSfx('pistol_shot', { playbackRate: 0.7, volume: 1.2 })
            }

            const count = this.currentWeapon.pelletCount || 1
            for (let i = 0; i < count; i++) {
                this._fireOneShot(barrelPos)
            }

            // Immediately update base animation to switch from walking to walking_legs if shooting while moving
            const isMoving = this.input.keys.forward || this.input.keys.backward || this.input.keys.left || this.input.keys.right
            const isRunning = isMoving && this.input.keys.shift
            this.updateBaseAnimation(isMoving, isRunning, true)  // gun overlay active
        }
        return fired
    }

    _fireOneShot(barrelPos) {
        const weaponRange = Number.isFinite(this.currentWeapon?.range) ? this.currentWeapon.range : 50
        const spread = this.currentWeapon.spread || 0

        const camera = this.experience.camera.instance
        const rayOrigin = new THREE.Vector3()
        const rayDir = new THREE.Vector3()
        camera.getWorldPosition(rayOrigin)
        camera.getWorldDirection(rayDir)

        if (spread > 0) {
            const spreadVector = new THREE.Vector3(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread
            )
            rayDir.add(spreadVector).normalize()
        }

        this._shootRaycaster.near = 0.01
        this._shootRaycaster.far = weaponRange
        this._shootRaycaster.set(rayOrigin, rayDir)

        const hits = this._shootRaycaster.intersectObjects(this.scene.children, true)

        let firstValidHit = null
        for (const hit of hits) {
            const obj = hit?.object
            if (!obj) continue
            if (this._isDescendantOfPlayerMesh(obj)) continue

            if (obj.isLine || obj.isLineSegments || obj.type === 'Line' || obj.type === 'LineSegments') continue
            if (obj.isSprite || obj.type === 'Sprite') continue

            const nameLower = (obj.name || '').toLowerCase()
            if (nameLower.endsWith('_collider')) continue
            if (nameLower.startsWith('physics_cube') || nameLower.startsWith('physics_cylinder')) continue
            if (nameLower === 'player-shoot-ray-debug') continue

            firstValidHit = hit
            break
        }

        const endPos = new THREE.Vector3().copy(rayOrigin).add(rayDir.multiplyScalar(weaponRange))

        if (firstValidHit) {
            endPos.copy(firstValidHit.point)
            const damageable = this._findDamageableObject(firstValidHit.object)
            if (damageable) {
                const baseAtk = Number.isFinite(this.attack) ? this.attack : 1
                const weaponMultiplier = this.currentWeapon.damageMultiplier ?? 1
                const weaponBaseDmg = this.currentWeapon.damage ?? 10

                const dmg = Math.max(0, weaponBaseDmg * baseAtk)
                this._applyDamageToObject(damageable, dmg)
            }
        }

        this.createBulletTracer(barrelPos, endPos)
        return firstValidHit
    }

    reload() {
        // Disallow reloading outside of GAME env
        if (this.experience?.appState && this.experience.appState.current_env !== ENVIRONMENTS.GAME) return
        if (!this.currentWeapon) return
        const nowMs = this.time?.elapsed ?? 0
        if (typeof this.currentWeapon.startReload === 'function') {
            this.currentWeapon.startReload(nowMs)

            if (this.currentWeapon === this.weapons.pistol) this._playSfx('pistol_reload')
            else this._playSfx('pistol_reload', { playbackRate: 0.8 })
        }
    }

    interact() {
        const ray = this._getCameraShootRay(3)
        if (!ray) return

        this._shootRaycaster.set(ray.origin, ray.direction)
        const hits = this._shootRaycaster.intersectObjects(this.scene.children, true)

        for (const hit of hits) {
            const obj = hit.object
            if (this._isDescendantOfPlayerMesh(obj)) continue

            let target = obj
            while (target) {
                if (target.userData && target.userData.isCollectible) {
                    target.visible = false
                    if (this.experience.game?.levelManager) {
                        this.experience.game.levelManager.onItemCollected()
                    }
                    return
                }
                target = target.parent
            }
        }
    }

    _getCameraShootRay(maxDistance) {
        const camera = this.experience?.camera?.instance
        if (!camera) return null

        const rayOrigin = new THREE.Vector3()
        const rayDirection = new THREE.Vector3()
        const rayEnd = new THREE.Vector3()
        const tmp = new THREE.Vector3()

        camera.getWorldPosition(rayOrigin)
        camera.getWorldDirection(rayDirection)
        rayDirection.normalize()

        const dist = Number.isFinite(maxDistance) ? maxDistance : 50
        rayEnd.copy(rayOrigin).add(tmp.copy(rayDirection).multiplyScalar(dist))

        return { origin: rayOrigin, direction: rayDirection, end: rayEnd, maxDistance: dist }
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
            // Log hit event before applying damage
            const enemyType = ud.enemyType || 'unknown'
            const enemyName = targetObject.name || 'Enemy'
            console.log(`🔫 Player Hit: ${enemyName} (${enemyType}) | Damage: ${damageAmount} | Weapon: ${this.currentWeapon?.name || 'unknown'}`)

            // Check if enemy is already dead before applying damage
            const wasDead = enemy.dead || ud.dead

            // Apply damage to enemy
            enemy.takeDamage(damageAmount, this.time?.elapsed ?? 0)

            // Check if enemy just died (was alive before, is dead now)
            if (!wasDead && enemy.dead) {
                // Enemy was just killed - notify LevelManager
                const isBoss = !!ud.isBoss
                console.log(`🎯 Player Kill: ${enemyName} (${enemyType})${isBoss ? ' [BOSS]' : ''} | Position: (${targetObject.position.x.toFixed(2)}, ${targetObject.position.y.toFixed(2)}, ${targetObject.position.z.toFixed(2)})`)

                // Notify LevelManager of kill
                if (this.experience.game?.levelManager) {
                    this.experience.game.levelManager.onEnemyKilled(isBoss)
                }
            }

            return true
        }

        // Legacy code path: handle objects without enemy reference (for backward compatibility)
        if (!Number.isFinite(ud.hp)) return false
        const dmg = Number.isFinite(damageAmount) ? damageAmount : 0
        if (dmg <= 0) return false

        ud.hp = Math.max(0, ud.hp - dmg)

        // Check for Death
        if (ud.hp <= 0 && !ud.dead) {
            ud.dead = true
            targetObject.visible = false

            // Log kill event
            const enemyType = ud.enemyType || 'unknown'
            const enemyName = targetObject.name || 'Enemy'
            const isBoss = !!ud.isBoss
            console.log(`🎯 Player Kill: ${enemyName} (${enemyType})${isBoss ? ' [BOSS]' : ''} | Position: (${targetObject.position.x.toFixed(2)}, ${targetObject.position.y.toFixed(2)}, ${targetObject.position.z.toFixed(2)})`)

            // Notify LevelManager of kill
            if (this.experience.game?.levelManager) {
                this.experience.game.levelManager.onEnemyKilled(isBoss)
            }
        }
        return true
    }

    updateWeaponHud() {
        // Hide weapon HUD when not in GAME environment
        if (this.experience?.appState && this.experience.appState.current_env !== ENVIRONMENTS.GAME) {
            if (this.hudAmmoEl) this.hudAmmoEl.style.display = 'none'
            if (this.hudReloadingEl) this.hudReloadingEl.style.display = 'none'
            return
        }

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
        // Reset Inventory logic removed since we want persistent full loadout for now
        this.equipWeapon('pistol');
    }

    takeDamage(amount, { source = null } = {}) {
        const dmgIn = Number.isFinite(amount) ? amount : 0
        if (dmgIn <= 0) return 0

        const def = Number.isFinite(this.defense) ? this.defense : 0
        const dmg = Math.max(0, dmgIn - def)
        if (dmg <= 0) return 0

        this.hp = Math.max(0, (Number.isFinite(this.hp) ? this.hp : 0) - dmg)

        if (this.hp <= 0 && this.experience?.game?.active) {
            this.experience.game.game_end('dead')
        }
        return dmg
    }

    setupDebug() {
        if (!this.debug.active) return
        const debugFolder = this.debug.ui.addFolder('Player')
        debugFolder.add(this.physicsConfig, 'radius').min(0.1).max(1).step(0.1)
        debugFolder.add(this.debugVisuals, 'showPhysics').onChange((value) => {
            if (value) this.createPhysicsVisualization()
            else if (this.debugVisuals.physicsMesh) {
                this.scene.remove(this.debugVisuals.physicsMesh)
                this.debugVisuals.physicsMesh = null
            }
        })
    }

    createPhysicsVisualization() {
        const geometry = new THREE.CapsuleGeometry(this.physicsConfig.radius, this.physicsConfig.height, 4, 8)
        const material = new THREE.MeshBasicMaterial({ wireframe: true, color: 0x00ff00 })
        this.debugVisuals.physicsMesh = new THREE.Mesh(geometry, material)
        this.scene.add(this.debugVisuals.physicsMesh)
    }

    setMesh() {
        const model = this.resources.items.mainCharacter
        if (!model) return

        this.mesh = model.scene
        this.animations = model.animations
        console.log('Main Character Animations:', this.animations)

        this.mesh.traverse((child) => {
            const name = child.name.toLowerCase()
            if (name.includes('pistol') || name.includes('gun')) {
                this.weaponMeshes.pistol = child
                child.visible = false
            }
            if (name.includes('rifle') || name.includes('ak47') || name.includes('m4')) {
                this.weaponMeshes.rifle = child
                child.visible = false
            }
            if (name.includes('shotgun')) {
                this.weaponMeshes.shotgun = child
                child.visible = false
            }
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
                child.frustumCulled = false
                const mat = child.material
                if (mat) {
                    mat.side = THREE.DoubleSide
                    mat.needsUpdate = true
                }
            }
        })

        this.mesh.visible = true
        this._createPlaceholderWeaponMeshes()

        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
        this.mesh.position.y = 5
        this.scene.add(this.mesh)

        const bbox = new THREE.Box3().setFromObject(this.mesh)
        this.modelCenterOffset = bbox.getCenter(new THREE.Vector3()).sub(this.mesh.position)

        this.setupAnimations()
    }

    _createPlaceholderWeaponMeshes() {
        let handBone = null
        this.mesh.traverse(c => {
            if (c.isBone) {
                const n = c.name.toLowerCase()
                if ((n.includes('hand') && n.includes('r')) || n.includes('righthand') || n.includes('hand_r')) {
                    handBone = c
                }
            }
        })

        if (!handBone) return

        if (!this.weaponMeshes.rifle) {
            const geom = new THREE.BoxGeometry(0.1, 0.15, 0.8)
            const mat = new THREE.MeshStandardMaterial({ color: 0x444444 })
            const mesh = new THREE.Mesh(geom, mat)
            mesh.position.set(0, -0.05, 0.2)
            mesh.rotation.x = Math.PI / 2
            mesh.name = "Rifle_Placeholder"
            handBone.add(mesh)
            this.weaponMeshes.rifle = mesh
            mesh.visible = false
        }

        if (!this.weaponMeshes.shotgun) {
            const geom = new THREE.BoxGeometry(0.12, 0.12, 0.6)
            const mat = new THREE.MeshStandardMaterial({ color: 0x880000 })
            const mesh = new THREE.Mesh(geom, mat)
            mesh.position.set(0, -0.05, 0.2)
            mesh.rotation.x = Math.PI / 2
            mesh.name = "Shotgun_Placeholder"
            handBone.add(mesh)
            this.weaponMeshes.shotgun = mesh
            mesh.visible = false
        }

        if (!this.weaponMeshes.pistol) {
            const geom = new THREE.BoxGeometry(0.05, 0.1, 0.3)
            const mat = new THREE.MeshStandardMaterial({ color: 0x222222 })
            const mesh = new THREE.Mesh(geom, mat)
            mesh.position.set(0, -0.05, 0.1)
            mesh.rotation.x = Math.PI / 2
            mesh.name = "Pistol_Placeholder"
            handBone.add(mesh)
            this.weaponMeshes.pistol = mesh
            mesh.visible = false
        }
    }

    setupAnimations() {
        if (!this.mesh) return
        this.mixer = new THREE.AnimationMixer(this.mesh)
        this.mixer.addEventListener('finished', (event) => {
            const clipName = event?.action?.getClip?.()?.name?.toLowerCase?.() ?? ''
            if (clipName.includes('pistol_aim')) {
                this._oneShotGunAimActive = false
                this._gunAimHoldUntilMs = (this.time?.elapsed ?? 0) + this._gunAimOneShotHoldMs
            }
        })

        if (this.animations && this.animations.length > 0) {
            this.animations.forEach(clip => {
                const key = clip.name.toLowerCase()
                const action = this.mixer.clipAction(clip)
                if (key === 'pistol_aim') {
                    action.loop = THREE.LoopOnce
                    action.clampWhenFinished = true
                } else {
                    action.loop = THREE.LoopRepeat
                }
                this.actions[key] = action
            })

            console.log('Animation Actions:', this.actions)

            if (this.actions.idle) {
                this.baseAction = this.actions.idle
                this.baseAction.play()
            }
        }
    }

    _resolveActionKey(requestedName) {
        if (!requestedName) return null
        if (this.actions[requestedName]) return requestedName
        const targetLower = requestedName.toLowerCase()
        return Object.keys(this.actions).find((key) => key.includes(targetLower)) || null
    }

    _updateAnimationLayerWeights(isGunOverlayActive, isMoving, shouldSupportOverlay) {
        this._overlayWeightTarget = isGunOverlayActive ? 1 : 0
        this._overlaySupportWeightTarget = shouldSupportOverlay ? 1 : 0
        this._baseWeightTarget = isGunOverlayActive ? (isMoving ? 1 : 0.15) : 1

        const dt = (this.time?.delta ?? 16) / 1000
        const lerp = (a, b, t) => a + (b - a) * t
        const smoothing = 20  // Increased for smoother transitions to reduce stiffness
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
        // If pistol_aim overlay is active, ensure we do NOT let a full-body `walking`
        // clip influence the upper body. If the current baseAction is a full-body
        // walking animation (name includes 'walk' but not 'legs' and is not
        // `pistol_walking`), suppress its weight and rely on `pistol_walking` or
        // the support layer instead.
        const baseClipName = this.baseAction?.getClip?.()?.name?.toLowerCase?.() || ''
        const overlayClipName = this.overlayAction?.getClip?.()?.name?.toLowerCase?.() || ''
        const gunAimActive = overlayClipName.includes('pistol_aim') && this._overlayWeight > 0.01

        if (this.baseAction) {
            this.baseAction.enabled = true
            // Suppress full-body walking while pistol_aim is active (unless the
            // base clip is the dedicated `pistol_walking` clip).
            if (gunAimActive && baseClipName.includes('walk') && !baseClipName.includes('legs') && !baseClipName.includes('pistol_walking')) {
                this.baseAction.setEffectiveWeight?.(0)
                // Also ensure support layer provides legs if available
                if (this.overlaySupportAction) this.overlaySupportAction.setEffectiveWeight?.(this._overlaySupportWeight)
                console.log('Animation: suppressed full-body walking while pistol_aim active ->', baseClipName)
            } else {
                this.baseAction.setEffectiveWeight?.(this._baseWeight)
            }
        }

        if (!isGunOverlayActive && this.overlayAction && this._overlayWeight <= 0.01) {
            this.overlayAction.stop()
            this.overlayAction = null
        }
        if (!isGunOverlayActive && this.overlaySupportAction && this._overlaySupportWeight <= 0.01) {
            this.overlaySupportAction.stop()
            this.overlaySupportAction = null
        }
    }

    playBaseAnimation(animationName) {
        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction || newAction === this.baseAction) return
        if (this.baseAction) this.baseAction.fadeOut(0.2)
        // Do not use Three.js fadeIn here; weight blending is handled manually
        // in _updateAnimationLayerWeights via _baseWeight/_baseWeightTarget.
        newAction.enabled = true
        newAction.reset()
        newAction.play()
        this.baseAction = newAction
    }

    playOverlayAnimation(animationName, { timeScale = 1 } = {}) {
        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction) return
        // If the requested overlay is already active and still playing (for
        // LoopOnce one-shot clips like `pistol_aim`), don't reset it on rapid
        // repeated clicks — allow it to finish. If it's finished, allow replay.
        if (this.overlayAction === newAction) {
            const actionTime = this.overlayAction.time || 0
            const clipDur = this.overlayAction.getClip?.()?.duration || 0
            const isOneShot = this.overlayAction.loop === THREE.LoopOnce
            if (!isOneShot || actionTime >= clipDur - 0.001) {
                // replay allowed: fall through to reset/play
            } else {
                // still playing — ignore repeated request
                return
            }
        }

        if (this.overlayAction && this.overlayAction !== newAction) this.overlayAction.fadeOut(0.15)
        newAction.setEffectiveWeight(1)
        newAction.timeScale = timeScale
        newAction.reset().fadeIn(0.2).play()
        this.overlayAction = newAction
        this._overlayWeightTarget = 1
    }

    playOverlaySupportAnimation(animationName) {
        const resolvedKey = this._resolveActionKey(animationName)
        const newAction = resolvedKey ? this.actions[resolvedKey] : null
        if (!newAction || this.overlaySupportAction === newAction) return
        if (this.overlaySupportAction) this.overlaySupportAction.fadeOut(0.2)
        newAction.setEffectiveWeight(1)
        newAction.reset().fadeIn(0.25).play()
        this.overlaySupportAction = newAction
        this._overlaySupportWeightTarget = 1
    }

    stopOverlayAnimation() {
        if (this.overlayAction) this._overlayWeightTarget = 0
    }
    stopOverlaySupportAnimation() {
        if (this.overlaySupportAction) this._overlaySupportWeightTarget = 0
    }

    updateBaseAnimation(isMoving, isRunning, isGunOverlayActive) {
        const nowMs = this.time?.elapsed ?? 0
        if (isGunOverlayActive) {
            if (isMoving) {
                // Use the dedicated pistol walking animation when aiming and moving
                this.playBaseAnimation('pistol_walking')
                // While overlay is active we also keep a short hold to avoid
                // immediate toggles back to `walking` when overlay briefly ends.
                this._pistolWalkingHoldUntilMs = Math.max(this._pistolWalkingHoldUntilMs || 0, nowMs + this._pistolWalkingHoldMs)
            } else {
                this.playBaseAnimation('idle_upper')
            }
            return
        }
        if (!isMoving) this.playBaseAnimation('idle')
        else if (isRunning) this.playBaseAnimation('running')
        else {
            // If we recently entered pistol walking, hold it for a short buffer
            if (nowMs < (this._pistolWalkingHoldUntilMs || 0)) {
                this.playBaseAnimation('pistol_walking')
            } else {
                this.playBaseAnimation('walking')
            }
        }
    }

    setPhysics() {
        const sphereShape = new CANNON.Sphere(this.physicsConfig.radius)
        this.body = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(0, 5, 0),
            material: this.materials.player,
            linearDamping: 0.1,
            angularDamping: 0.1,
            fixedRotation: true
        })
        const halfHeight = this.physicsConfig.height / 2 - this.physicsConfig.radius
        this.body.addShape(sphereShape, new CANNON.Vec3(0, halfHeight + this.physicsConfig.offsetY, 0))
        this.body.addShape(sphereShape, new CANNON.Vec3(0, -halfHeight + this.physicsConfig.offsetY, 0))
        this.physicsWorld.addBody(this.body)
    }

    jump() {
        if (this.canJump) {
            if (this.body.velocity.y < 8) this.body.velocity.y = 8
            this.canJump = false
        }
    }

    update() {
        if (!this.input || !this.mesh) return
        const nowMs = this.time?.elapsed ?? 0

        // --- WEAPON UPDATE ---
        if (this.currentWeapon) {
            const wasReloading = Boolean(this._weaponWasReloading)

            if (this.currentWeapon.isAutomatic && this.input.keys.shoot) {
                this.shoot()
            }
            else {
                const firedFromBuffer = this.currentWeapon.update(nowMs)
                if (firedFromBuffer) this.shoot()
            }

            if (this.input.keys.aim !== this.isAiming) this.setAiming(this.input.keys.aim)

            const isShooting = !!this.input.keys.shoot
            const shootStarted = isShooting && !this._wasShooting
            this._isShootingHeld = isShooting

            if (isShooting && !this.isAiming) {
                // Only play the pistol overlay if the weapon can fire now or
                // there's a buffered shot queued. This prevents rapid clicking
                // from repeatedly resetting the one-shot overlay.
                const canOrBuffered = this.currentWeapon?.canFire?.(nowMs) || this.currentWeapon?.bufferedShot
                if (canOrBuffered) {
                    const overlayClipLower = this.overlayAction?.getClip?.()?.name?.toLowerCase?.() ?? ''
                    if (!overlayClipLower.includes('pistol_aim')) {
                        this.playOverlayAnimation('pistol_aim', { timeScale: 1 })
                    }
                }
            }
            if (shootStarted && !this.isAiming) {
                const willFireOrBuffered = this.currentWeapon?.canFire?.(nowMs) || this.currentWeapon?.bufferedShot
                if (willFireOrBuffered) {
                    this._oneShotGunAimActive = true
                    this._gunAimHoldUntilMs = 0
                    this.playOverlayAnimation('pistol_aim', { timeScale: this._gunAimOneShotTimeScale })
                }
            }

            if (shootStarted && !this.currentWeapon.isAutomatic) {
                this.shoot()
            }

            const isReloadingNow = Boolean(this.currentWeapon?.isReloading)
            this._weaponWasReloading = isReloadingNow
            this._wasShooting = isShooting

            // Weapon mesh transformations are handled by the model's animations
            // No manual rotation needed since model is already set up correctly

        } else {
            this._wasShooting = false
            this._isShootingHeld = false
            this._weaponWasReloading = false
            this._oneShotGunAimActive = false
            if (this.isAiming) this.setAiming(false)
            this.stopOverlayAnimation()
            this.stopOverlaySupportAnimation()
        }

        this.updateWeaponHud()

        // --- VFX UPDATES ---
        const dt = this.time.delta / 1000

        for (let i = this.tracers.length - 1; i >= 0; i--) {
            const t = this.tracers[i]
            t.age += dt
            t.mesh.material.opacity = 1 - (t.age / t.life)
            if (t.age >= t.life) {
                this.scene.remove(t.mesh)
                t.mesh.geometry.dispose()
                t.mesh.material.dispose()
                this.tracers.splice(i, 1)
            }
        }

        for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
            const f = this.muzzleFlashes[i]
            f.age += dt
            const lifeRatio = f.age / f.life
            f.mesh.scale.setScalar(0.5 * (1 - lifeRatio))
            if (f.age >= f.life) {
                this.scene.remove(f.mesh)
                f.mesh.material.dispose()
                this.muzzleFlashes.splice(i, 1)
            }
        }

        // --- MOVEMENT ---
        if (this.experience.dialogue.isActive()) {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
            this.updateBaseAnimation(false, false, false)
            return
        }

        if (Math.abs(this.body.velocity.y) < 0.1) this.canJump = true
        else this.canJump = false

        let inputX = 0, inputZ = 0
        if (this.input.keys.forward) inputZ += 1
        if (this.input.keys.backward) inputZ -= 1
        if (this.input.keys.left) inputX += 1
        if (this.input.keys.right) inputX -= 1

        const isMoving = inputX !== 0 || inputZ !== 0
        const isRunning = isMoving && this.input.keys.shift

        // --- Animation overlay logic for pistol shooting (from old player.js) ---
        const isHoldingGunAimPose = nowMs < (this._gunAimHoldUntilMs || 0)
        // Keep overlay active while timer is running
        if (this._oneShotGunAimActive && !isHoldingGunAimPose) {
            this._oneShotGunAimActive = false
        }
        const isGunOverlayActive = this.isAiming || this._isShootingHeld || this._oneShotGunAimActive || isHoldingGunAimPose
        const shouldSupportOverlay = isGunOverlayActive || (this.overlayAction && this._overlayWeight > 0.01)

        if (this.isAiming || (this.currentWeapon && this._isShootingHeld)) {
            const camera = this.experience.camera.instance
            const dir = new THREE.Vector3()
            camera.getWorldDirection(dir)
            const angle = Math.atan2(dir.x, dir.z)
            const targetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
            this.mesh.quaternion.slerp(targetQ, 0.2)

            if (isMoving) {
                const inputAngle = Math.atan2(inputX, inputZ)
                const moveAngle = angle + inputAngle
                const speed = isRunning ? 6 : 2
                this.body.velocity.x = Math.sin(moveAngle) * speed
                this.body.velocity.z = Math.cos(moveAngle) * speed
            } else {
                this.body.velocity.x = 0
                this.body.velocity.z = 0
            }
        } else if (isMoving) {
            const camera = this.experience.camera.instance
            const dir = new THREE.Vector3()
            camera.getWorldDirection(dir)
            const camAngle = Math.atan2(dir.x, dir.z)
            const inputAngle = Math.atan2(inputX, inputZ)
            const targetRot = camAngle + inputAngle
            const targetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRot)
            this.mesh.quaternion.slerp(targetQ, 0.2)

            const speed = isRunning ? 10 : 3
            this.body.velocity.x = Math.sin(targetRot) * speed
            this.body.velocity.z = Math.cos(targetRot) * speed
        } else {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
        }

        if (isGunOverlayActive && isMoving) {
            // When pistol overlay is active and moving, use `pistol_walking` as
            // the base action; we don't need the legacy walking_legs support.
            this.stopOverlaySupportAnimation()
        } else if (shouldSupportOverlay && !isGunOverlayActive) this.playOverlaySupportAnimation('idle_upper')
        else this.stopOverlaySupportAnimation()

        this.updateBaseAnimation(isMoving, isRunning, isGunOverlayActive)
        this._updateAnimationLayerWeights(isGunOverlayActive, isMoving, shouldSupportOverlay)

        if (this.mixer) this.mixer.update(dt)

        this.mesh.position.copy(this.body.position)
        if (this.modelCenterOffset) this.mesh.position.sub(this.modelCenterOffset)

        if (this.debugVisuals.showPhysics && this.debugVisuals.physicsMesh) {
            this.debugVisuals.physicsMesh.position.copy(this.body.position)
            this.debugVisuals.physicsMesh.position.y += this.physicsConfig.offsetY
        }
    }
}