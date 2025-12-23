import * as THREE from "three"
import Experience from "../Experience.js"

export default class Environment {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug

        // Debug Setup
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('environment')
        }

        this.setLights()
        this.setEnvironmentMap()
    }

    setLights() {
        // 1. Ambient Light - Warm tint for overall warmth
        this.ambientLight = new THREE.AmbientLight('#fff4e6', 0.4) // Warm cream
        this.scene.add(this.ambientLight)

        // 2. Main Directional Light (Sun) - Warmer orange/yellow for anime aesthetic
        this.sunLight = new THREE.DirectionalLight("#ffd89b", 1.2) // Warm golden/orange

        // Keep the sun's direction stable but follow the player so the shadow
        // camera volume stays centered on gameplay (prevents "shadows only work at certain distance")
        this.sunFollow = {
            enabled: true,
            offset: new THREE.Vector3(5, 8, 5),
        }

        // Position for good lighting angle (will be updated each frame if follow is enabled)
        this.sunLight.position.copy(this.sunFollow.offset)

        // Enhanced shadow settings for anime style
        this.sunLight.castShadow = true
        // Higher resolution to keep shadows clean even with a larger shadow camera
        this.sunLight.shadow.mapSize.set(4096, 4096)
        // Expanded range so shadows don't get cut off in larger locations
        this.sunLight.shadow.camera.near = 0.1
        this.sunLight.shadow.camera.far = 250
        // Make the shadow camera much larger to avoid a visible shadow edge on the ground
        this.sunLight.shadow.camera.left = -120
        this.sunLight.shadow.camera.top = 120
        this.sunLight.shadow.camera.right = 120
        this.sunLight.shadow.camera.bottom = -120
        this.sunLight.shadow.bias = -0.0001 // Reduce shadow acne
        this.sunLight.shadow.normalBias = 0.02 // Additional bias for smooth shadows
        this.sunLight.shadow.radius = 8 // Softer shadow edges

        this.sunLight.shadow.camera.updateProjectionMatrix()

        // Ensure the light target is in the scene (required for reliable directional shadows)
        this.scene.add(this.sunLight.target)

        this.scene.add(this.sunLight)

        // 3. Rim Light (Back Light) - Warm orange/pink for anime-style edge highlights
        this.rimLight = new THREE.DirectionalLight("#ffb380", 0.8) // Warm orange/pink
        this.rimLight.position.set(-5, 3, -5) // Opposite side from main light
        this.rimLight.castShadow = false // Rim light doesn't cast shadows
        this.scene.add(this.rimLight)

        // 4. Fill Light - Warm peach to soften shadows
        this.fillLight = new THREE.DirectionalLight("#ffe5cc", 0.4) // Warm peach, slightly increased intensity
        this.fillLight.position.set(-3, 2, 3) // Side position
        this.fillLight.castShadow = false
        this.scene.add(this.fillLight)

        // Debug Controls
        if (this.debug.active && this.debugFolder) {
            this.debugFolder.add(this.sunLight, 'intensity').min(0).max(10).step(0.001).name('sunIntensity')
            this.debugFolder.add(this.ambientLight, 'intensity').min(0).max(10).step(0.001).name('ambientIntensity')
            this.debugFolder.add(this.rimLight, 'intensity').min(0).max(5).step(0.001).name('rimIntensity')
            this.debugFolder.add(this.fillLight, 'intensity').min(0).max(5).step(0.001).name('fillIntensity')
            this.debugFolder.add(this.sunLight.position, 'x').min(-10).max(10).step(0.001).name('sunX')
            this.debugFolder.add(this.sunLight.position, 'y').min(-10).max(10).step(0.001).name('sunY')
            this.debugFolder.add(this.sunLight.position, 'z').min(-10).max(10).step(0.001).name('sunZ')
        }
    }

    update() {
        if (!this.sunFollow?.enabled || !this.sunLight) return

        const player = this.experience.world?.player
        const meshPos = player?.mesh?.position
        const bodyPos = player?.body?.position

        const px = (bodyPos?.x ?? meshPos?.x)
        const py = (bodyPos?.y ?? meshPos?.y)
        const pz = (bodyPos?.z ?? meshPos?.z)
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return

        // Keep shadows centered around the player
        this.sunLight.target.position.set(px, py, pz)
        this.sunLight.position.set(
            px + this.sunFollow.offset.x,
            py + this.sunFollow.offset.y,
            pz + this.sunFollow.offset.z
        )
        this.sunLight.target.updateMatrixWorld()
    }

    setEnvironmentMap() {
        this.environmentMap = {}
        this.environmentMap.intensity = 0.4

        this.environmentMap.texture = this.resources.items.environmentMapTexture

        if (this.environmentMap.texture) {
            this.environmentMap.texture.encoding = THREE.sRGBEncoding
            this.scene.environment = this.environmentMap.texture
        }

        this.environmentMap.updateMaterials = () => {
            this.scene.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                    if (this.environmentMap.texture) {
                        child.material.envMap = this.environmentMap.texture
                    }
                    child.material.envMapIntensity = this.environmentMap.intensity
                    child.material.needsUpdate = true
                }
            })
        }

        this.environmentMap.updateMaterials()

        if (this.debug.active && this.debugFolder && this.environmentMap.texture) {
            this.debugFolder.add(this.environmentMap, 'intensity')
                .name('envMapIntensity')
                .min(0).max(4).step(0.001)
                .onChange(this.environmentMap.updateMaterials)
        }
    }
}