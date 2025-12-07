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

        // Position for good lighting angle
        this.sunLight.position.set(5, 8, 5)

        // Enhanced shadow settings for anime style
        this.sunLight.castShadow = true
        this.sunLight.shadow.mapSize.set(2048, 2048) // Higher resolution for better quality
        this.sunLight.shadow.camera.far = 20
        this.sunLight.shadow.camera.left = -10
        this.sunLight.shadow.camera.top = 10
        this.sunLight.shadow.camera.right = 10
        this.sunLight.shadow.camera.bottom = -10
        this.sunLight.shadow.bias = -0.0001 // Reduce shadow acne
        this.sunLight.shadow.normalBias = 0.02 // Additional bias for smooth shadows
        this.sunLight.shadow.radius = 8 // Softer shadow edges

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