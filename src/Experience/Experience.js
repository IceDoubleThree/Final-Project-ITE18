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
import GameManager from './Utils/GameManager.js'


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

        // Game state (timer, levels, kills, etc.)
        this.game = new GameManager(this)

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
        // Main menu "Start" should only enter the lobby (Room/Store/etc.).
        // The real game run (timer/levels/kills) begins from the Store warp.
        console.log('🎮 Enter lobby requested')

        // Defer the location load until the world exists and is ready
        this._pendingStartLocationKey = locationKey ?? 'Room'
        this._pendingStartGame = true
    }

    startRun(startLevelKey = 'Academy') {
        console.log('🕹️ Start run requested')

        this.playShortTransition()

        if (this.game) {
            this.game.start({ startLevelKey })
        }

        // Defer the location load slightly so the transition is visible
        setTimeout(() => {
            this._pendingStartLocationKey = startLevelKey
            this._pendingStartGame = true
        }, 120)
    }

    playShortTransition() {
        const el = document.getElementById('black-screen')
        if (!el) return

        // Make sure it's visible again if it was hidden by the main menu flow
        el.style.display = 'block'
        el.classList.add('fast')
        el.classList.remove('fade-out')

        // Force reflow so removing/adding classes transitions reliably
        void el.offsetWidth

        // Fade away shortly after appearing
        setTimeout(() => {
            el.classList.add('fade-out')
        }, 200)

        setTimeout(() => {
            el.style.display = 'none'
            el.classList.remove('fast')
        }, 700)
    }

    resize() {
        this.camera.resize()
        this.renderer.resize()
    }

    update() {
        // 1. UPDATE PHYSICS & PLAYER FIRST
        // The player must move to their new position...
        this.world.update()

        // Game timer / state
        this.game.update(this.time.delta)
        
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