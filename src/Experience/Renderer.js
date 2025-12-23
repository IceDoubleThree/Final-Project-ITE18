import * as THREE from "three"
import Experience from "./Experience.js"

export default class Renderer {
    constructor() {
        this.experience = new Experience()
        this.canvas = this.experience.canvas
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.camera = this.experience.camera

        this.setInstance()
    }

    setInstance() {
        this.instance = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        })
        this.instance.physicallyCorrectLights = false // Disable for anime style
        this.instance.outputEncoding = THREE.sRGBEncoding
        this.instance.toneMapping = THREE.ACESFilmicToneMapping // Better for anime aesthetic
        this.instance.toneMappingExposure = 1.2 // Slightly reduced for anime look
        this.instance.shadowMap.enabled = false // Disabled by default
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap // Soft shadows for anime style
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(Math.min(this.sizes.pixelRatio, 2))
    }

    setShadows(enabled) {
        this.instance.shadowMap.enabled = enabled
        this.instance.shadowMap.needsUpdate = true
        
        // We also need to traverse the scene to update materials if needed, 
        // but usually just setting the renderer flag and triggering an update is enough 
        // for the next render call. 
        // However, sometimes materials need a re-compile.
        this.scene.traverse((child) => {
            if (child.material) {
                child.material.needsUpdate = true
            }
        })
    }

    resize() {
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(Math.min(this.sizes.pixelRatio, 2))
    }

    update() {
        this.instance.render(this.scene, this.camera.instance)
    }
}
