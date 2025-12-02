import * as THREE from "three"
import Experience from "../Experience.js"

export default class Environment {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug

        // Debug Setup
        if(this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('environment')
        }

        this.setSunLight()
        this.setEnvironmentMap()
    }

    setSunLight() {
        this.sunLight = new THREE.DirectionalLight("#ffffff", 4)
        this.sunLight.castShadow = true
        this.sunLight.shadow.camera.far = 15
        this.sunLight.shadow.mapSize.set(1024, 1024)
        this.sunLight.shadow.normalBias = 0.05
        this.sunLight.position.set(3, 3, -2.25)
        this.scene.add(this.sunLight)

        // Debug Sun
        if(this.debug.active) {
            this.debugFolder.add(this.sunLight, 'intensity').min(0).max(10).step(0.001).name('sunIntensity')
            this.debugFolder.add(this.sunLight.position, 'x').min(-5).max(5).step(0.001).name('sunX')
            this.debugFolder.add(this.sunLight.position, 'y').min(-5).max(5).step(0.001).name('sunY')
            this.debugFolder.add(this.sunLight.position, 'z').min(-5).max(5).step(0.001).name('sunZ')
        }
    }

    setEnvironmentMap() {
        this.environmentMap = {}
        this.environmentMap.intensity = 0.4
        
        // 1. Get Texture (will be undefined since sources are empty)
        this.environmentMap.texture = this.resources.items.environmentMapTexture

        // 2. Safety Check: Only setup texture if it actually loaded
        if(this.environmentMap.texture) {
            this.environmentMap.texture.encoding = THREE.sRGBEncoding
            this.scene.environment = this.environmentMap.texture
        }

        // 3. Update Materials
        this.environmentMap.updateMaterials = () => {
            this.scene.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                    
                    // Only apply map if it exists
                    if(this.environmentMap.texture) {
                        child.material.envMap = this.environmentMap.texture
                    }
                    
                    child.material.envMapIntensity = this.environmentMap.intensity
                    child.material.needsUpdate = true
                }
            })
        }
        
        this.environmentMap.updateMaterials()

        // Debug Environment Map
        if(this.debug.active && this.environmentMap.texture) {
            this.debugFolder.add(this.environmentMap, 'intensity')
                .name('envMapIntensity')
                .min(0).max(4).step(0.001)
                .onChange(this.environmentMap.updateMaterials)
        }
    }
}