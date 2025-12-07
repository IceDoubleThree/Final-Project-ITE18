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
            shift: false,
            interact: false // New key
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
        // console.log('Key Down:', event.code) 
        
        switch(event.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.keys.forward = true
                this.trigger('forwardStart')
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
                if(this.keys.jump === false) {
                    this.keys.jump = true
                    this.trigger('jump')
                }
                break
            
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.shift = true
                break

           case 'KeyF':
            console.log('F Key detected in Input.js') 
            if(this.keys.interact === false) {
                this.keys.interact = true
                this.trigger('interact')
            }
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

            // --- NEW: Interaction Key ---
            case 'KeyF':
                this.keys.interact = false
                break
        }
    }
    
    destroy() {
        window.removeEventListener('keydown')
        window.removeEventListener('keyup')
        this.off()
    }
}