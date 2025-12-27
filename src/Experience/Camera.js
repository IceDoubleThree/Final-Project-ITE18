import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import Experience from "./Experience.js"

export default class Camera {
    constructor() {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.canvas = this.experience.canvas
        this._onMouseMove = null
        this._onPointerLockChange = null
        this._onCanvasClick = null
        this._onWheel = null
        
        this.modes = {
            follow: true, 
        }

        // Mouse look state (third-person orbit around the player)
        this.look = {
            yaw: Math.PI,
            pitch: 0.25,
            minPitch: -0.25,
            maxPitch: 1.15,
            sensitivity: 0.002,
            initializedFromPlayer: false,
        }

        // Orbit distance (used by our own zoom logic)
        this.distance = 8

        // User zoom (applies to both normal + aim base distances)
        this.zoom = {
            multiplier: 1,
        }

        // Camera collision (prevents camera clipping through meshes/models)
        this.collision = {
            enabled: true,
            padding: 0.25,
            // Minimum camera distance when collision forces the camera inward.
            // This is dynamically increased based on the player's size to avoid the
            // camera entering the player mesh (which makes it look like the player disappears).
            minDistance: 1.8,
        }

        this._playerSafeDistance = null

        this._raycaster = new THREE.Raycaster()
        this._collisionMeshes = []
        this._lastCollisionLocationKey = null

        // Pointer lock state
        this.pointer = {
            isLocked: false,
        }

        // Aiming state
        this.aim = {
            active: false,
            offset: 0, // Current offset value
            targetOffset: 0, // Target offset value (0 or 1)
            defaultDistance: 8,
            // Aim should not pan the camera; it should only zoom.
            // Keep distance the same and use FOV to zoom toward the crosshair.
            aimDistance: 8,

            defaultFov: 35,
            // Less zoom-in while aiming
            aimFov: 30,
            // Optional wide-FOV aim mode (used for right-click widen)
            aimWideFov: 50,
            fov: 35,
            targetFov: 35,

            // Smoothly blend from shoulder cam -> centered cam when aiming
            blend: 0,
            targetBlend: 0,

            // First-person aim
            firstPerson: true,
            headHeight: 2.2,
            forwardNudge: 0.05,

            // Smooth approach into first-person
            approachLerp: 0.18,
            hideWhenCloserThan: 0.9,
        }

        // Weapon state (used to enable/disable over-the-shoulder offsets)
        this.weapon = {
            active: false,
            offset: 0,
            targetOffset: 0,
        }

        this.setInstance()
        this.setControls()
        this.setPointerLock()
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            this.aim.defaultFov,
            this.sizes.width / this.sizes.height,
            // Smaller near plane reduces close-up clipping (prevents player vanishing when camera is forced close)
            0.005,
            300
        )
        // Default position before player loads
        this.instance.position.set(6, 4, 8)
        this.scene.add(this.instance)
    }

    setControls() {
        this.controls = new OrbitControls(this.instance, this.canvas)
        // We keep OrbitControls mainly for its `target` and distance constraints,
        // but camera rotation is driven by pointer-lock mouse look.
        this.controls.enableDamping = false
        this.controls.enableRotate = false
        this.controls.enablePan = false
        this.controls.enableZoom = false
        this.controls.enabled = false

        // Distance constraints (used by our custom zoom)
        this.controls.minDistance = 3
        this.controls.maxDistance = 15

        // Target exists for other systems (e.g. camera clamping in World)
        this.controls.target.set(0, 2.2, 0)
    }

    setPointerLock() {
        // Only lock on user intent. Default: click on the canvas.
        this._onCanvasClick = () => {
            this.requestPointerLock()
        }
        this.canvas.addEventListener('click', this._onCanvasClick)

        this._onPointerLockChange = () => {
            const locked = document.pointerLockElement === this.canvas
            this.pointer.isLocked = locked
            this.canvas.style.cursor = locked ? 'none' : 'default'
        }
        document.addEventListener('pointerlockchange', this._onPointerLockChange)

        this._onMouseMove = (event) => {
            if (!this.pointer.isLocked) return
            // movementX/Y are in pixels; multiply by sensitivity.
            this.look.yaw -= (event.movementX || 0) * this.look.sensitivity
            // Invert vertical look: moving mouse up looks up
            this.look.pitch += (event.movementY || 0) * this.look.sensitivity
            this.look.pitch = Math.max(this.look.minPitch, Math.min(this.look.maxPitch, this.look.pitch))
        }
        document.addEventListener('mousemove', this._onMouseMove)

        this._onWheel = (event) => {
            // Allow zoom even when locked.
            // Positive deltaY: zoom out. Negative deltaY: zoom in.
            const zoomSpeed = 0.002
            const factor = 1 + (event.deltaY * zoomSpeed)
            if (!Number.isFinite(factor) || factor <= 0) return

            const minD = this.controls?.minDistance ?? 3
            const maxD = this.controls?.maxDistance ?? 15

            const baseDist = this.aim.active ? this.aim.aimDistance : this.aim.defaultDistance
            if (!Number.isFinite(baseDist) || baseDist <= 0) return

            const nextMultiplier = this.zoom.multiplier * factor
            const nextTarget = baseDist * nextMultiplier
            const clampedTarget = Math.max(minD, Math.min(maxD, nextTarget))
            this.zoom.multiplier = clampedTarget / baseDist
        }
        window.addEventListener('wheel', this._onWheel, { passive: true })
    }

    requestPointerLock() {
        if (!this.canvas || !this.canvas.requestPointerLock) return
        if (document.pointerLockElement === this.canvas) return
        this.canvas.requestPointerLock()
    }

    exitPointerLock() {
        if (document.pointerLockElement === this.canvas) {
            document.exitPointerLock?.()
        }
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    setAimMode(isActive, widen = false) {
        this.aim.active = isActive
        // Do NOT pan the camera when aiming. Keep offsets neutral.
        this.aim.targetOffset = 0

        // If caller requests a widened FOV for this aim (right-click), use
        // the configured wide FOV. Otherwise use the normal aimFov.
        if (isActive) {
            this.aim.targetFov = widen ? this.aim.aimWideFov : this.aim.aimFov
        } else {
            this.aim.targetFov = this.aim.defaultFov
        }

        // Smoothly blend offsets out/in.
        this.aim.targetBlend = isActive ? 1 : 0
    }

    setWeaponActive(isActive) {
        this.weapon.active = !!isActive

        // Smooth shoulder transition on equip/unequip
        this.weapon.targetOffset = this.weapon.active ? 1 : 0

        // If no weapon is active, ensure we are not aiming/offsetting.
        if (!this.weapon.active) {
            this.aim.active = false
            this.aim.targetOffset = 0
            this.aim.targetFov = this.aim.defaultFov
            this.aim.targetBlend = 0
        }
    }

    update() {
        const playerMesh = this.experience.world?.player?.mesh
        if (!this.modes.follow || !playerMesh) return

        // Only apply over-the-shoulder offset when a gun/weapon is active.
        const weaponActive = !!this.weapon?.active

        // Lerp weapon shoulder offset (prevents snapping between camera setups)
        this.weapon.offset += (this.weapon.targetOffset - this.weapon.offset) * 0.12

        // Lerp aim blend (prevents snapping to centered view)
        this.aim.blend += (this.aim.targetBlend - this.aim.blend) * 0.12

        // Blend shoulder offset out while aiming (no sudden crosshair shift).
        const baseShoulderOffset = (1.25 * this.weapon.offset) * (1 - this.aim.blend)

        // Lerp aim offset
        this.aim.offset += (this.aim.targetOffset - this.aim.offset) * 0.1

        // Smooth FOV zoom (aiming zooms toward crosshair)
        this.aim.fov += (this.aim.targetFov - this.aim.fov) * 0.12
        if (Number.isFinite(this.aim.fov) && this.instance.fov !== this.aim.fov) {
            this.instance.fov = this.aim.fov
            this.instance.updateProjectionMatrix()
        }
        
        // Lerp distance (base distance * user zoom multiplier)
        const baseDist = this.aim.active ? this.aim.aimDistance : this.aim.defaultDistance
        const minD = this.controls?.minDistance ?? 3
        const maxD = this.controls?.maxDistance ?? 15
        const targetDist = Math.max(minD, Math.min(maxD, baseDist * this.zoom.multiplier))
        this.distance += (targetDist - this.distance) * 0.1

        // Compute a safe minimum camera distance from the player's current model size.
        // (If the camera gets inside the player mesh, backfaces get culled and the player appears to vanish.)
        if (this._playerSafeDistance == null) {
            const bbox = new THREE.Box3().setFromObject(playerMesh)
            const size = new THREE.Vector3()
            bbox.getSize(size)

            // Bounding sphere radius approximation (diagonal / 2)
            const approxRadius = 0.5 * size.length()
            // Keep a small buffer so the camera stays outside the mesh
            this._playerSafeDistance = Math.max(0.75, approxRadius * 0.55)
        }

        // Follow target: player position + head offset
        const target = this.controls.target
        target.copy(playerMesh.position)
        target.y += this.aim.headHeight

        // First-person aim: hide the player and move the camera to the player's head.
        // Camera view:
        // [ [player Here] === crosshair ]
        if (this.aim.active && this.aim.firstPerson) {
            const cosPitch = Math.cos(this.look.pitch)
            // Note: in this camera system, the orbit offset uses (sin(yaw), cos(yaw)).
            // The forward/look direction is the inverse of that offset.
            const forward = new THREE.Vector3(
                -Math.sin(this.look.yaw) * cosPitch,
                -Math.sin(this.look.pitch),
                -Math.cos(this.look.yaw) * cosPitch
            ).normalize()

            const targetPos = new THREE.Vector3().copy(target).addScaledVector(forward, this.aim.forwardNudge)

            // Move camera toward the player first (smooth), then hide the model when close.
            const t = this.aim.approachLerp
            this.instance.position.lerp(targetPos, t)

            const distToTarget = this.instance.position.distanceTo(targetPos)
            playerMesh.visible = distToTarget > this.aim.hideWhenCloserThan

            this.instance.lookAt(new THREE.Vector3().copy(this.instance.position).add(forward))
            return
        }

        // Third-person: ensure player is visible
        playerMesh.visible = true

        // Shift the look target slightly to the right as well (over-the-shoulder).
        // This moves the player a bit off-center so the crosshair has a clear view.
        const cosYaw = Math.cos(this.look.yaw)
        const sinYaw = Math.sin(this.look.yaw)
        // Blend look target offset out while aiming (keeps player aligned with crosshair).
        const targetRightOffset = ((2 * this.weapon.offset) + (this.aim.offset * 0.45)) * (1 - this.aim.blend)
        target.x += cosYaw * targetRightOffset
        target.z += -sinYaw * targetRightOffset

        // Initialize yaw/pitch/distance from current camera placement once the player exists
        if (!this.look.initializedFromPlayer) {
            const offset = new THREE.Vector3().subVectors(this.instance.position, target)
            const d = Math.max(0.001, offset.length())
            const minD = this.controls?.minDistance ?? 3
            const maxD = this.controls?.maxDistance ?? 15
            this.distance = Math.max(minD, Math.min(maxD, d))

            // Sync zoom multiplier to current distance so wheel zoom doesn't snap.
            const baseDist = this.aim.active ? this.aim.aimDistance : this.aim.defaultDistance
            if (Number.isFinite(baseDist) && baseDist > 0) {
                this.zoom.multiplier = this.distance / baseDist
            }

            // yaw around Y axis, pitch up/down
            this.look.yaw = Math.atan2(offset.x, offset.z)
            this.look.pitch = Math.asin(THREE.MathUtils.clamp(offset.y / d, -1, 1))
            this.look.pitch = Math.max(this.look.minPitch, Math.min(this.look.maxPitch, this.look.pitch))
            this.look.initializedFromPlayer = true
        }

        const cosPitch = Math.cos(this.look.pitch)

        // Rebuild collision list when location changes
        const locKey = this.experience.world?.currentLocation?.key ?? null
        if (this._lastCollisionLocationKey !== locKey) {
            this._rebuildCollisionMeshes()
            this._lastCollisionLocationKey = locKey
        }

        // Desired camera position based on yaw/pitch/distance
        const desiredOffsetX = Math.sin(this.look.yaw) * cosPitch * this.distance
        const desiredOffsetY = Math.sin(this.look.pitch) * this.distance
        const desiredOffsetZ = Math.cos(this.look.yaw) * cosPitch * this.distance
        
        // Calculate right vector for aim offset
        // Yaw is rotation around Y. 0 is usually +Z or -Z depending on setup.
        // We want to move camera to the right relative to view.
        // If view is (sin(yaw), cos(yaw)), right is (sin(yaw - PI/2), cos(yaw - PI/2))
        // Actually, let's just add to the position perpendicular to look direction.
        const totalRightOffset = baseShoulderOffset + this.aim.offset
        const rightX = Math.cos(this.look.yaw) * totalRightOffset
        const rightZ = -Math.sin(this.look.yaw) * totalRightOffset

        const desiredPos = new THREE.Vector3(
            target.x + desiredOffsetX + rightX,
            target.y + desiredOffsetY,
            target.z + desiredOffsetZ + rightZ
        )

        // Collision clamp: raycast from target toward desiredPos
        let effectiveDistance = this.distance
        if (this.collision.enabled && this._collisionMeshes.length) {
            const dir = new THREE.Vector3().subVectors(desiredPos, target)
            const desiredDist = dir.length()
            if (desiredDist > 0.001) {
                dir.normalize()
                this._raycaster.set(target, dir)
                this._raycaster.near = 0.05
                this._raycaster.far = desiredDist

                const hits = this._raycaster.intersectObjects(this._collisionMeshes, false)
                const hit = hits.find((h) => h && h.distance > 0.0001)
                if (hit) {
                    const safeMin = Math.max(this.collision.minDistance, this._playerSafeDistance ?? 0)
                    effectiveDistance = Math.max(
                        safeMin,
                        Math.min(this.distance, hit.distance - this.collision.padding)
                    )
                }
            }
        }

        const offsetX = Math.sin(this.look.yaw) * cosPitch * effectiveDistance
        const offsetY = Math.sin(this.look.pitch) * effectiveDistance
        const offsetZ = Math.cos(this.look.yaw) * cosPitch * effectiveDistance
        
        // Re-apply right offset to final position (scaled by effective distance? No, offset should be constant or scaled?)
        // If we are close to wall, we might want to reduce offset? 
        // For now let's keep it simple and just add it.
        // But wait, collision logic above used desiredPos which INCLUDED the offset.
        // So if we hit a wall, effectiveDistance is reduced.
        // We should recalculate position with effectiveDistance AND the offset.
        
        this.instance.position.set(
            target.x + offsetX + rightX, 
            target.y + offsetY, 
            target.z + offsetZ + rightZ
        )

        // Apply per-location camera bounds clamping (if provided by World)
        const bounds = this.experience.world?.currentLocation?.cameraBounds
        if (bounds) {
            const pos = this.instance.position
            const m = 0.05
            pos.x = Math.max(bounds.minX + m, Math.min(bounds.maxX - m, pos.x))
            pos.z = Math.max(bounds.minZ + m, Math.min(bounds.maxZ - m, pos.z))

            target.x = Math.max(bounds.minX + m, Math.min(bounds.maxX - m, target.x))
            target.z = Math.max(bounds.minZ + m, Math.min(bounds.maxZ - m, target.z))
        }

        this.instance.lookAt(target)
    }

    setRotation(yaw, pitch) {
        if (yaw !== undefined) this.look.yaw = yaw
        if (pitch !== undefined) this.look.pitch = Math.max(this.look.minPitch, Math.min(this.look.maxPitch, pitch))
    }

    _rebuildCollisionMeshes() {
        const out = []
        const ignoreRoots = new Set()

        const playerRoot = this.experience.world?.player?.mesh
        if (playerRoot) ignoreRoots.add(playerRoot)

        const locGroup = this.experience.world?.currentLocation?.group
        const root = locGroup || this.scene

        root.traverse((obj) => {
            if (!obj) return
            if (!obj.isMesh) return

            // Ignore the player hierarchy
            for (const r of ignoreRoots) {
                if (r && (obj === r || r === obj || r.isObject3D && r.getObjectById && r.getObjectById(obj.id))) {
                    return
                }
                if (r && obj.parent && obj.parent === r) return
            }

            const name = (obj.name || '').toLowerCase()
            if (name === 'world-origin-debug' || name === 'cannon-debug') return
            if (name.includes('debug')) return

            out.push(obj)
        })

        this._collisionMeshes = out
    }

    destroy() {
        if (this._onCanvasClick) this.canvas.removeEventListener('click', this._onCanvasClick)
        if (this._onPointerLockChange) document.removeEventListener('pointerlockchange', this._onPointerLockChange)
        if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove)
        if (this._onWheel) window.removeEventListener('wheel', this._onWheel)
        this.exitPointerLock()
    }
}