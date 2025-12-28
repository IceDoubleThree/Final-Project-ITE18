import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as CANNON from 'cannon-es'

export const EnemyTypes = Object.freeze({
    WALKER: 'walker',
    RUNNER: 'runner',
})

// Collision filtering (cannon-es)
// Enemies should pass through other enemies, but collide with everything else.
const ENEMY_COLLISION_GROUP = 1 << 2

export default class Enemy {
    constructor(world, options = {}) {
        this.world = world
        this.experience = world?.experience
        this.scene = world?.scene
        this.physicsWorld = world?.physicsWorld
        this.materials = world?.materials?.materials
        this.time = this.experience?.time

        this.type = (options.type || EnemyTypes.WALKER).toLowerCase()
        this.name = options.name || (this.type === EnemyTypes.RUNNER ? 'runner' : 'walker')

        // Common stats (future difficulty scaling can modify these)
        this.baseDamage = this.type === EnemyTypes.RUNNER ? 2 : 1
        // Walkers: 10 HP (per design), Runners: lower HP but higher mobility.
        this.maxHp = this.type === EnemyTypes.RUNNER ? 5 : 10
        this.hp = this.maxHp

        // Movement tuning
        this._spawnTimeMs = this.time?.elapsed ?? 0
        this._hitAggroUntilMs = 0

        this.speeds = {
            walkerWalk: 3.0,
            walkerAggro: 4.0,
            runnerRun: 9.0,
            runnerWalk: 3.2,
        }

        this.aggroRadius = 5
        this.runnerSprintMs = 8000

        // Combat (placeholder, future difficulty mods can adjust these)
        this.attack = {
            radius: 1.6,
            cooldownMs: 900,
            nextHitTimeMs: 0,
        }

        // Jump behavior: hop when close to player (helps pressure/close distance).
        this.jumpNearPlayer = {
            enabled: true,
            // Start jumping when within this horizontal distance
            distance: 2.75,
            // Prevent spam
            cooldownMs: 1400,
            // Vertical speed to set when jumping
            jumpVelocity: this.type === EnemyTypes.RUNNER ? 6.75 : 5.25,
            // Small forward boost to help clear edges while jumping
            forwardBoost: 1.25,
        }
        this._nextJumpTimeMs = 0

        this.mesh = null
        this.body = null
        this.dead = false
        this.mixer = null
        this.actions = {}
        this.animations = []

        // Step assist: helps enemies climb short ledges/steps.
        this.stepAssist = {
            enabled: true,
            // Max ledge height the enemy can climb (world units)
            maxStepHeight: 5,
            // Sample ground a bit ahead of the body
            forwardDistance: 0.7,
            // Raycast settings
            rayStartAboveBody: 1.6,
            rayLengthDown: 5.0,
            // Consider grounded if feet are within this distance to ground
            groundedEpsilon: 0.18,
        }

        // Approx body half-height for ground checks (matches cylinder height below: 1.9)
        this._bodyHalfHeight = 1.9 * 0.5

        // Raycast scratch
        this._rayFrom = new CANNON.Vec3()
        this._rayTo = new CANNON.Vec3()
        this._rayResult = new CANNON.RaycastResult()

        this._tmpDir = new THREE.Vector3()
        this._tmpForward = new THREE.Vector3()
        this._tmpTargetQuat = new THREE.Quaternion()

        const position = options.position instanceof THREE.Vector3
            ? options.position.clone()
            : new THREE.Vector3(options.x ?? 0, options.y ?? 0, options.z ?? 0)

        this._createMesh(position)
        this._createPhysics(position)
    }

    static createWalker(world, position) {
        return new Enemy(world, { type: EnemyTypes.WALKER, position })
    }

    static createRunner(world, position) {
        return new Enemy(world, { type: EnemyTypes.RUNNER, position })
    }

    _createMesh(position) {
        if (!this.scene) return

        const isRunner = this.type === EnemyTypes.RUNNER
        // If runner model is available in resources, use it (cloned), otherwise fallback to capsule placeholder
        const resources = this.experience?.resources
        const runnerGltf = isRunner ? resources?.items?.runnerModel : null

        if (isRunner && runnerGltf) {
            const modelScene = SkeletonUtils.clone(runnerGltf.scene)
            modelScene.name = this.name
            modelScene.position.copy(position)
            modelScene.position.y += 0.1
            // Scale down runner model for performance and visual tuning
            modelScene.scale.set(0.5, 0.5, 0.5)

            // Compute bounding box and align model so its feet sit on the physics body's feet
            modelScene.updateMatrixWorld(true)
            const bbox = new THREE.Box3().setFromObject(modelScene)
            const modelMinY = bbox.min.y
            const bodyPosY = position.y + 1.0
            const feetY = bodyPosY - this._bodyHalfHeight
            const deltaY = feetY - modelMinY
            modelScene.position.y += deltaY
            // store Y offset between mesh origin and body position for use in update()
            this._meshBodyYOffset = modelScene.position.y - bodyPosY

            modelScene.userData = modelScene.userData || {}
            modelScene.userData.type = 'enemy'
            modelScene.userData.enemyType = this.type
            modelScene.userData.enemy = this
            modelScene.userData.hp = this.hp
            modelScene.userData.maxHp = this.maxHp
            modelScene.userData.baseDamage = this.baseDamage

            // Ensure clones are safe for animation but avoid expensive glossy/envMap shading and
            // avoid casting shadows from every skinned mesh (reduces GPU cost).
            modelScene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    // Reduce shadow casters for performance (runners don't need to cast heavy shadows)
                    child.castShadow = false
                    child.receiveShadow = true

                    const mat = child.material
                    if (mat) {
                        // Make materials less glossy and remove environment reflections
                        if (typeof mat.metalness !== 'undefined') mat.metalness = 0
                        if (typeof mat.roughness !== 'undefined') mat.roughness = 1
                        if (mat.envMap) mat.envMap = null
                        mat.side = THREE.DoubleSide
                        mat.needsUpdate = true
                    }
                }
            })

            this.scene.add(modelScene)
            this.mesh = modelScene

            // Setup animations (play walking clip if present)
            this.animations = runnerGltf.animations || []
            if (this.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.mesh)
                this.animations.forEach((clip) => {
                    const key = clip.name.toLowerCase()
                    const action = this.mixer.clipAction(clip)
                    action.loop = THREE.LoopRepeat
                    this.actions[key] = action
                })
                const walkKey = Object.keys(this.actions).find(k => k.includes('walk') || k.includes('walking'))
                if (walkKey) {
                    const a = this.actions[walkKey]
                    a.enabled = true
                    if (typeof a.reset === 'function') a.reset()
                    a.setEffectiveWeight?.(1)
                    a.play()
                }
            }

            return
        }

        // If walker model is available, use it for walker enemies (clone safely)
        const walkerGltf = !isRunner ? resources?.items?.walkerModel : null
        if (!isRunner && walkerGltf) {
            const modelScene = SkeletonUtils.clone(walkerGltf.scene)
            modelScene.name = this.name
            modelScene.position.copy(position)
            modelScene.position.y += 0.1
            // Slightly larger than runner placeholder, tuned visually
            modelScene.scale.set(0.8, 0.8, 0.8)

            modelScene.updateMatrixWorld(true)
            const bbox = new THREE.Box3().setFromObject(modelScene)
            const modelMinY = bbox.min.y
            const bodyPosY = position.y + 1.0
            const feetY = bodyPosY - this._bodyHalfHeight
            const deltaY = feetY - modelMinY
            modelScene.position.y += deltaY
            this._meshBodyYOffset = modelScene.position.y - bodyPosY

            modelScene.userData = modelScene.userData || {}
            modelScene.userData.type = 'enemy'
            modelScene.userData.enemyType = this.type
            modelScene.userData.enemy = this
            modelScene.userData.hp = this.hp
            modelScene.userData.maxHp = this.maxHp
            modelScene.userData.baseDamage = this.baseDamage

            modelScene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    // Walkers can cast shadows but keep materials cheap
                    child.castShadow = true
                    child.receiveShadow = true

                    const mat = child.material
                    if (mat) {
                        if (typeof mat.metalness !== 'undefined') mat.metalness = 0
                        if (typeof mat.roughness !== 'undefined') mat.roughness = 1
                        if (mat.envMap) mat.envMap = null
                        mat.side = THREE.DoubleSide
                        mat.needsUpdate = true
                    }
                }
            })

            this.scene.add(modelScene)
            this.mesh = modelScene

            // Setup animations for walker
            this.animations = walkerGltf.animations || []
            if (this.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.mesh)
                this.animations.forEach((clip) => {
                    const key = clip.name.toLowerCase()
                    const action = this.mixer.clipAction(clip)
                    action.loop = THREE.LoopRepeat
                    this.actions[key] = action
                })
                const walkKey = Object.keys(this.actions).find(k => k.includes('walk') || k.includes('walking'))
                if (walkKey) this.actions[walkKey].play()
            }

            return
        }

        const geometry = new THREE.CapsuleGeometry(0.35, 1.0, 4, 8)
        const material = new THREE.MeshStandardMaterial({
            color: isRunner ? 0xff0000 : 0x0000ff,
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = this.name
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.position.copy(position)
        mesh.position.y += 1.0

        mesh.userData = mesh.userData || {}
        mesh.userData.type = 'enemy'
        mesh.userData.enemyType = this.type
        mesh.userData.enemy = this
        mesh.userData.hp = this.hp
        mesh.userData.maxHp = this.maxHp
        mesh.userData.baseDamage = this.baseDamage

        this.scene.add(mesh)
        this.mesh = mesh
    }

    _createPhysics(position) {
        if (!this.physicsWorld) return

        const shape = new CANNON.Cylinder(0.35, 0.35, 1.9, 8)

        const body = new CANNON.Body({
            mass: 1,
            material: this.materials?.enemy || this.materials?.default,
            // Lower damping so velocity-based movement doesn't feel "sticky"
            linearDamping: 0.05,
            angularDamping: 0.9,
        })

        // Allow enemy bodies to overlap each other while still colliding with
        // player/world/default colliders.
        body.collisionFilterGroup = ENEMY_COLLISION_GROUP
        body.collisionFilterMask = ~ENEMY_COLLISION_GROUP

        body.addShape(shape)
        body.position.set(position.x, position.y + 1.0, position.z)
        body.fixedRotation = true
        body.updateMassProperties()

        this.physicsWorld.addBody(body)
        this.body = body
    }

    _raycastGroundHeightAt(x, z) {
        const w = this.physicsWorld
        if (!w) return null

        const startY = (this.body?.position?.y ?? 0) + this.stepAssist.rayStartAboveBody
        const endY = startY - this.stepAssist.rayLengthDown

        this._rayFrom.set(x, startY, z)
        this._rayTo.set(x, endY, z)

        // Prefer world.raycastClosest if available.
        this._rayResult.reset()
        if (typeof w.raycastClosest === 'function') {
            w.raycastClosest(
                this._rayFrom,
                this._rayTo,
                { skipBackfaces: true },
                this._rayResult
            )

            if (this._rayResult.hasHit) return this._rayResult.hitPointWorld.y
            return null
        }

        // Fallback: try Ray API (if present)
        const Ray = CANNON.Ray
        if (typeof Ray === 'function' || typeof Ray === 'object') {
            try {
                const ray = new CANNON.Ray(this._rayFrom, this._rayTo)
                ray.intersectWorld(w, { skipBackfaces: true, result: this._rayResult })
                if (this._rayResult.hasHit) return this._rayResult.hitPointWorld.y
            } catch (_) {
                // ignore
            }
        }
        return null
    }

    _applyStepAssist(moveDir, nowMs) {
        if (!this.stepAssist.enabled) return
        if (!this.body || !this.mesh || !this.physicsWorld) return
        if (!moveDir) return

        // Only help when roughly grounded (prevents mid-air boosting)
        const groundY = this._raycastGroundHeightAt(this.body.position.x, this.body.position.z)
        if (!Number.isFinite(groundY)) return

        const feetY = this.body.position.y - this._bodyHalfHeight
        const grounded = (feetY - groundY) <= this.stepAssist.groundedEpsilon && this.body.velocity.y <= 2
        if (!grounded) return

        const aheadX = this.body.position.x + (moveDir.x * this.stepAssist.forwardDistance)
        const aheadZ = this.body.position.z + (moveDir.z * this.stepAssist.forwardDistance)
        const aheadGroundY = this._raycastGroundHeightAt(aheadX, aheadZ)
        if (!Number.isFinite(aheadGroundY)) return

        const stepUp = aheadGroundY - groundY
        if (stepUp <= 0.05) return
        if (stepUp > this.stepAssist.maxStepHeight) return

        // Nudge up + give a small upward boost so we can clear the ledge.
        const targetBodyY = aheadGroundY + this._bodyHalfHeight + 0.02
        if (this.body.position.y < targetBodyY) {
            this.body.position.y = targetBodyY
        }

        const boost = 3.5 * (stepUp / this.stepAssist.maxStepHeight)
        if (this.body.velocity.y < boost) {
            this.body.velocity.y = boost
        }
    }

    _isGrounded() {
        if (!this.body) return false
        const groundY = this._raycastGroundHeightAt(this.body.position.x, this.body.position.z)
        if (!Number.isFinite(groundY)) return false

        const feetY = this.body.position.y - this._bodyHalfHeight
        return (feetY - groundY) <= this.stepAssist.groundedEpsilon
    }

    takeDamage(amount, nowMs = null) {
        if (this.dead) return
        const dmg = Number.isFinite(amount) ? amount : 0
        if (dmg <= 0) return

        const previousHp = this.hp
        this.hp = Math.max(0, this.hp - dmg)

        // Log hit event
        console.log(`💥 Enemy Hit: ${this.name} (${this.type}) | Damage: ${dmg} | HP: ${previousHp} → ${this.hp}/${this.maxHp}`)

        // Walker behavior: speed up slightly when hit.
        const t = Number.isFinite(nowMs) ? nowMs : (this.time?.elapsed ?? 0)
        this._hitAggroUntilMs = t + 3000

        if (this.mesh?.userData) {
            this.mesh.userData.hp = this.hp
            this.mesh.userData.maxHp = this.maxHp
        }

        if (this.hp <= 0) {
            this.dead = true
            console.log(`💀 Enemy Killed: ${this.name} (${this.type}) | Total Damage Taken: ${this.maxHp}`)
            
            if (this.mesh) {
                this.mesh.userData.dead = true
                this.mesh.visible = false
            }

            // Notify LevelManager of kill (handled via player's onEnemyKilled, but keeping for compatibility)
            // The actual kill tracking happens in LevelManager.onEnemyKilled() called from player

            if (this.physicsWorld && this.body) {
                this.physicsWorld.removeBody(this.body)
                this.body = null
            }
        }
    }

    _getMoveSpeed(nowMs) {
        if (this.type === EnemyTypes.RUNNER) {
            const elapsed = nowMs - this._spawnTimeMs
            return elapsed <= this.runnerSprintMs ? this.speeds.runnerRun : this.speeds.runnerWalk
        }

        // Walker
        const playerMesh = this.world?.player?.mesh
        if (!playerMesh || !this.mesh) return this.speeds.walkerWalk

        const dx = playerMesh.position.x - this.mesh.position.x
        const dz = playerMesh.position.z - this.mesh.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        const isNear = dist <= this.aggroRadius
        const isHitAggro = nowMs <= (this._hitAggroUntilMs || 0)

        return (isNear || isHitAggro) ? this.speeds.walkerAggro : this.speeds.walkerWalk
    }

    update() {
        if (this.dead) return
        if (!this.mesh || !this.body) return

        const playerMesh = this.world?.player?.mesh
        if (!playerMesh) return

        // Only attack/jump during an active run
        const gameActive = !!this.experience?.game?.active

        const nowMs = this.time?.elapsed ?? 0
        const speed = this._getMoveSpeed(nowMs)

        this._tmpDir.set(
            playerMesh.position.x - this.body.position.x,
            0,
            playerMesh.position.z - this.body.position.z
        )

        const lenSq = this._tmpDir.lengthSq()
        if (lenSq > 0.0001) {
            this._tmpDir.normalize()

            // Move towards player (keep vertical velocity from physics)
            const vy = this.body.velocity.y
            this.body.velocity.x = this._tmpDir.x * speed
            this.body.velocity.z = this._tmpDir.z * speed
            this.body.velocity.y = vy

            // Step assist (short ledge climbing)
            this._applyStepAssist(this._tmpDir, nowMs)

            // Jump when near player (active runs only)
            if (
                gameActive &&
                this.jumpNearPlayer.enabled &&
                nowMs >= (this._nextJumpTimeMs || 0)
            ) {
                const dx = playerMesh.position.x - this.body.position.x
                const dz = playerMesh.position.z - this.body.position.z
                const dist = Math.sqrt(dx * dx + dz * dz)

                if (dist <= this.jumpNearPlayer.distance && this._isGrounded() && this.body.velocity.y <= 2) {
                    this._nextJumpTimeMs = nowMs + this.jumpNearPlayer.cooldownMs
                    this.body.velocity.y = Math.max(this.body.velocity.y, this.jumpNearPlayer.jumpVelocity)

                    // Keep it subtle: a little extra forward speed can help close gaps/steps.
                    this.body.velocity.x += this._tmpDir.x * this.jumpNearPlayer.forwardBoost
                    this.body.velocity.z += this._tmpDir.z * this.jumpNearPlayer.forwardBoost
                }
            }

            // Face movement direction
            const angle = Math.atan2(this._tmpDir.x, this._tmpDir.z)
            this._tmpTargetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
            this.mesh.quaternion.slerp(this._tmpTargetQuat, 0.15)
        } else {
            this.body.velocity.x = 0
            this.body.velocity.z = 0
        }

        // Sync mesh to physics body (respect stored mesh->body Y offset if available)
        if (typeof this._meshBodyYOffset === 'number') {
            this.mesh.position.set(this.body.position.x, this.body.position.y + this._meshBodyYOffset, this.body.position.z)
        } else {
            this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z)
        }

        // Update animations (only when near camera to save CPU/GPU)
        const dt = (this.time?.delta ?? 16) / 1000
        if (this.mixer) {
            const camPos = this.experience?.camera?.instance?.position
            let doUpdate = true
            if (camPos && this.mesh && this.mesh.position) {
                const dist = camPos.distanceTo(this.mesh.position)
                doUpdate = dist <= 40 // only animate when within 40 units
            }
            if (doUpdate) this.mixer.update(dt)
        }

        // --- Combat: contact damage ---
        if (!gameActive) return

        const player = this.world?.player
        if (!player) return

        const dx = (player.mesh?.position?.x ?? 0) - this.mesh.position.x
        const dz = (player.mesh?.position?.z ?? 0) - this.mesh.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist <= this.attack.radius && nowMs >= (this.attack.nextHitTimeMs || 0)) {
            this.attack.nextHitTimeMs = nowMs + this.attack.cooldownMs
            player.takeDamage?.(this.baseDamage, { source: this.type })
        }
    }

    destroy() {
        if (this.mesh) {
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh)
            if (this.mesh.geometry) this.mesh.geometry.dispose()
            if (this.mesh.material) this.mesh.material.dispose()
            this.mesh = null
        }
        if (this.physicsWorld && this.body) {
            this.physicsWorld.removeBody(this.body)
            this.body = null
        }
        this.dead = true
    }
}
