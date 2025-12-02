import EventEmitter from './EventEmitter.js'

export default class Input extends EventEmitter {
    constructor() {
        super()

        // Options
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            shift: false
        }

        // Listen to DOM events
        window.addEventListener('keydown', (event) => {
            this.keyDown(event)
        })

        window.addEventListener('keyup', (event) => {
            this.keyUp(event)
        })
    }

    keyDown(event) {
        // --- DEBUG LOG START ---
        console.log('Key Down:', event.code) 
        // --- DEBUG LOG END ---
        
        switch(event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.keys.forward = true
                this.trigger('forwardStart') // Signal that movement started
                break

            case 'ArrowLeft':
            case 'KeyA':
                this.keys.left = true
                break

            case 'ArrowDown':
            case 'KeyS':
                this.keys.backward = true
                break

            case 'ArrowRight':
            case 'KeyD':
                this.keys.right = true
                break

            case 'Space':
                // Only trigger jump once per press (prevent holding space to fly)
                if(this.keys.jump === false) {
                    this.keys.jump = true
                    this.trigger('jump') // Signal to jump
                }
                break
            
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.shift = true
                break
        }
    }

    keyUp(event) {
        switch(event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.keys.forward = false
                break

            case 'ArrowLeft':
            case 'KeyA':
                this.keys.left = false
                break

            case 'ArrowDown':
            case 'KeyS':
                this.keys.backward = false
                break

            case 'ArrowRight':
            case 'KeyD':
                this.keys.right = false
                break
            
            case 'Space':
                this.keys.jump = false
                break

            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.shift = false
                break
        }
    }
    
    destroy() {
        // Clean up event listeners
        window.removeEventListener('keydown')
        window.removeEventListener('keyup')
        this.off() // Clears all EventEmitter callbacks
    }
}