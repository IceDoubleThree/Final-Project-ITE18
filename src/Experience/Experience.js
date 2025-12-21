import * as THREE from "three"
import Sizes from './Utils/Sizes.js'
import Time from "./Utils/Time.js"
import Camera from "./Camera.js"
import Renderer from "./Renderer.js"
import World from "./World/World.js"
import Resources from "./Utils/Resources.js"
import sources from "./sources.js"
import Debug from "./Utils/Debug.js"
import Input from './Utils/Input.js'
import DialogueReader from './Utils/DialogueReader.js'


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
        this.time = new Time()
        this.scene = new THREE.Scene()
        this.resources = new Resources(sources) 
        
        this.input = new Input()
        this.dialogue = new DialogueReader()
        this.camera = new Camera()
        this.renderer = new Renderer()
        this.world = new World()
        console.log('✅ World Created:', this.world)

        this._pendingStartGame = false
        this._pendingStartLocationKey = null


        // Resize event
        this.sizes.on('resize', () => {
            this.resize()
        })

        // Tick event
        this.time.on('tick', () => {
            this.update()
        })
    }

    startGame(locationKey = null) {
        console.log('🎮 Start game requested from main menu')
        this._pendingStartLocationKey = locationKey
        this._pendingStartGame = true
    }

    resize() {
        this.camera.resize()
        this.renderer.resize()
    }

    update() {
        // 1. UPDATE PHYSICS & PLAYER FIRST
        // The player must move to their new position...
        this.world.update()
        
        // 2. UPDATE CAMERA SECOND
        // ...so the camera can look at where the player IS, not where they WERE.
        this.camera.update()
        
        // 3. RENDER LAST
        this.renderer.update()

        // 4. Start game once world and resources are ready
        if (this._pendingStartGame && this.world && this.world.environment) {
            // If a location was chosen from the debug menu, load it now.
            if (this._pendingStartLocationKey) {
                this.world.loadLocation(this._pendingStartLocationKey)
            }

            this._pendingStartLocationKey = null
            this._pendingStartGame = false
        }
    }

    destroy() {
        this.sizes.off('resize')
        this.time.off('tick')
        this.camera.controls.dispose()
        this.renderer.instance.dispose()

        this.scene.traverse((child) => {
            if (child instanceof THREE.Mesh)
            {
                child.geometry.dispose()
                for (const key in child.material) {
                    const value = child.material[key]
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