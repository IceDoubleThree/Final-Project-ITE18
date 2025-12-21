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

        this.setInstance()
        this.setControls()
        this.setPointerLock()
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            35,
            this.sizes.width / this.sizes.height,
            // Smaller near plane reduces close-up clipping (prevents player vanishing when camera is forced close)
            0.005,
            100
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
            this.distance = Math.max(minD, Math.min(maxD, this.distance * factor))
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

    update() {
        const playerMesh = this.experience.world?.player?.mesh
        if (!this.modes.follow || !playerMesh) return

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
        target.y += 2.2

        // Initialize yaw/pitch/distance from current camera placement once the player exists
        if (!this.look.initializedFromPlayer) {
            const offset = new THREE.Vector3().subVectors(this.instance.position, target)
            const d = Math.max(0.001, offset.length())
            const minD = this.controls?.minDistance ?? 3
            const maxD = this.controls?.maxDistance ?? 15
            this.distance = Math.max(minD, Math.min(maxD, d))

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
        const desiredPos = new THREE.Vector3(
            target.x + desiredOffsetX,
            target.y + desiredOffsetY,
            target.z + desiredOffsetZ
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
        this.instance.position.set(target.x + offsetX, target.y + offsetY, target.z + offsetZ)

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