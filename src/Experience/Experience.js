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
import AppState, { ENVIRONMENTS } from './Utils/AppState.js'


let instance = null

export default class Experience
{
    constructor(canvas){
        if (instance) {
            return instance
        }
        instance = this

        console.log('Here starts a great experience')

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

        // NOTE: Use `experience.appState.current_env/current_loc` for environment-aware logic.
        // main_env = [main_menu, lobby, game]
        this.appState = new AppState()

        // Game state (timer, levels, kills, etc.)
        this.game = new GameManager(this)

        this.world = new World()
        console.log('✅ World Created:', this.world)

        this._pendingStartGame = false
        this._pendingStartLocationKey = null

        // Prevent repeated lobby/run triggers (e.g. Space activating focused UI button)
        this._lobbyStarted = false
        this._runStarted = false
        this.isPaused = false

        // Setup Pause Menu
        this.setupPauseMenu()

        // App starts on the main menu
        this.enterMainMenu()

        // Resize event
        this.sizes.on('resize', () => {
            this.resize()
        })

        // Tick event
        this.time.on('tick', () => {
            this.update()
        })

        // Input events
        this.input.on('pause', () => {
            this.togglePause()
        })
    }

    enterMainMenu() {
        // Target function sets current_env itself
        this.appState?.setEnv(ENVIRONMENTS.MAIN_MENU)
    }

    enterLobby(locationKey = 'Room', options = {}) {
        // Target function sets current_env itself
        this.appState?.setEnv(ENVIRONMENTS.LOBBY)

        const withTransition = options?.transition !== false
        const delayMs = Number.isFinite(options?.delayMs) ? options.delayMs : 120

        if (withTransition) this.playShortTransition?.()

        setTimeout(() => {
            this.world?.loadLocation?.(locationKey)
        }, Math.max(0, delayMs))
    }

    setupPauseMenu() {
        this.pauseMenu = document.getElementById('pause-menu')
        this.btnPauseContinue = document.getElementById('btn-pause-continue')
        this.btnPauseOptions = document.getElementById('btn-pause-options')
        this.btnPauseEndGame = document.getElementById('btn-pause-endgame')
        this.btnPauseMainMenu = document.getElementById('btn-pause-mainmenu')
        
        // Sub-menu elements
        this.pauseMainButtons = document.getElementById('pause-main-buttons')
        this.pauseSubMenu = document.getElementById('pause-sub-menu')
        this.btnPauseBack = document.getElementById('btn-pause-back')
        this.pauseShadowCheckbox = document.getElementById('pause-setting-shadows')

        this.btnPauseContinue?.addEventListener('click', () => this.togglePause())
        
        this.btnPauseOptions?.addEventListener('click', () => {
            // Switch to sub-menu view
            if (this.pauseMainButtons) this.pauseMainButtons.style.display = 'none'
            if (this.pauseSubMenu) this.pauseSubMenu.style.display = 'flex'
        })

        this.btnPauseBack?.addEventListener('click', () => {
            // Switch back to main buttons
            if (this.pauseSubMenu) this.pauseSubMenu.style.display = 'none'
            if (this.pauseMainButtons) this.pauseMainButtons.style.display = 'flex'
        })

        // Sync shadow checkbox
        if (this.pauseShadowCheckbox) {
            this.pauseShadowCheckbox.addEventListener('change', (e) => {
                if (this.renderer) {
                    this.renderer.setShadows(e.target.checked)
                    // Sync with main menu checkbox
                    const mainShadow = document.getElementById('setting-shadows')
                    if(mainShadow) mainShadow.checked = e.target.checked
                }
            })
        }

        this.btnPauseEndGame?.addEventListener('click', () => {
            this.togglePause() // Unpause first
            this.game.game_end('premature_end')
            
            // Reset run state but keep lobby state
            this._runStarted = false
            
            // Transition back to Room (Lobby)
            this.enterLobby('Room')
        })

        this.btnPauseMainMenu?.addEventListener('click', () => {
            this.togglePause() // Unpause logic (hide menu)
            this.returnToMainMenu()
        })
    }

    togglePause() {
        // Only allow pause if we are in lobby or run
        if (!this._lobbyStarted) return

        this.isPaused = !this.isPaused

        if (this.isPaused) {
            this.time.pause()
            if (this.pauseMenu) this.pauseMenu.style.display = 'flex'
            
            // Reset to main buttons view every time we open pause menu
            if (this.pauseMainButtons) this.pauseMainButtons.style.display = 'flex'
            if (this.pauseSubMenu) this.pauseSubMenu.style.display = 'none'

            document.exitPointerLock()
            
            // Update buttons based on state
            if (this._runStarted) {
                if (this.btnPauseEndGame) this.btnPauseEndGame.style.display = 'block'
                if (this.btnPauseMainMenu) this.btnPauseMainMenu.style.display = 'none'
            } else {
                if (this.btnPauseEndGame) this.btnPauseEndGame.style.display = 'none'
                if (this.btnPauseMainMenu) this.btnPauseMainMenu.style.display = 'block'
            }

        } else {
            this.time.resume()
            if (this.pauseMenu) this.pauseMenu.style.display = 'none'
            this.camera?.requestPointerLock?.()
        }
    }

    returnToMainMenu() {
        // Target function sets current_env itself
        this.enterMainMenu()

        // Reset states
        this._lobbyStarted = false
        this._runStarted = false
        
        // Stop game if running
        if (this.game.active) {
            this.game.stop()
        }

        // Show Main Menu
        const mainMenu = document.getElementById('main-menu')
        if (mainMenu) {
            mainMenu.classList.remove('hidden')
            mainMenu.style.display = 'block' // Ensure it's visible
        }
        
        // Re-enable Start Button
        const btnStart = document.getElementById('btn-start-game')
        if (btnStart) {
            btnStart.disabled = false
        }

        // Hide Pause Menu (already done in togglePause, but safety)
        if (this.pauseMenu) this.pauseMenu.style.display = 'none'

        // Optional: Unload current world/location to save resources or reset
        // this.world.destroyCurrentLocation() 
    }

    startGame(locationKey = null) {
        // Target function sets current_env itself
        this.appState?.setEnv(ENVIRONMENTS.LOBBY)

        // Main menu "Start" should only enter the lobby (Room/Store/etc.).
        // The real game run (timer/levels/kills) begins from the Store warp.
        if (this._lobbyStarted) return
        this._lobbyStarted = true

        console.log('🎮 Enter lobby requested')

        // Enable mouse-look camera (requires a user gesture; this method is called from a click)
        this.camera?.requestPointerLock?.()

        // Defer the location load until the world exists and is ready
        this._pendingStartLocationKey = locationKey ?? 'Room'
        this._pendingStartGame = true
    }

    startRun(startLevelKey = 'Academy') {
        // Target function sets current_env itself
        this.appState?.setEnv(ENVIRONMENTS.GAME)

        if (this._runStarted) return
        this._runStarted = true

        console.log('🕹️ Start run requested')

        // Enable mouse-look camera (can be triggered by keyboard interaction)
        this.camera?.requestPointerLock?.()

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

        // Keep environment/shadows in sync with the player (anime-styled directional shadows)
        this.world?.environment?.update?.()

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
        this.camera?.destroy?.()
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