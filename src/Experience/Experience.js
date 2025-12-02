import * as THREE from "three"
import Sizes from './Utils/Sizes.js'
import Time from "./Utils/Time.js"
import Camera from "./Camera.js"
import Renderer from "./Renderer.js"
import World from "./World/World.js"
import Resources from "./Utils/Resources.js"
import sources from "./sources.js"
import Debug from "./Utils/Debug.js"


let instance = null

export default class Experience
{
    constructor(canvas){
        console.log('Here starts a great experience')
        if (instance) {
            return instance
        }
        instance = this

        //Global Access
        window.experience = this

        // Options
        this.canvas = canvas

        // Setup
        this.debug = new Debug()
        this.sizes = new Sizes()
            console.log(this.sizes.width)
            console.log(this.sizes.height)
            console.log(this.sizes.pixelRatio)
        this.time = new Time()
        this.scene = new THREE.Scene()
        this.resources = new Resources(sources)   
        this.camera = new Camera()
        this.renderer = new Renderer()
        this.world = new World()
        console.log('✅ World Created:', this.world)


        // Resize event
        this.sizes.on('resize', () => {
            console.log('A resize occurred')
            this.resize()
        })

        // Tick event
        this.time.on('tick', () => {
            this.update()
        })
    }
    resize() {
        this.camera.resize()
        this.renderer.resize()
    }

    update() {
        this.camera.update()
        this.world.update()
        this.renderer.update()
    }

    destroy() {
    // Remove event listeners
        this.sizes.off('resize')
        this.time.off('tick')
        this.camera.controls.dispose()
        this.renderer.instance.dispose()

        
        this.scene.traverse((child) => {
            // Test if it's a mesh
            if (child instanceof THREE.Mesh)
            {
                child.geometry.dispose()

                // Loop through the material properties
                for (const key in child.material) {
                    const value = child.material[key]
                    // Test if there is a dispose function
                    if (value && typeof value.dispose === 'function') {
                        value.dispose()
                    }
                }
            }
        })

        if(this.debug.active)
             this.debug.ui.destroy()
    }
}