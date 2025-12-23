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
            interact: false,
            reload: false, 
            shoot: false,
            aim: false
        }

        // Listen to DOM events
        window.addEventListener('keydown', (event) => {
            this.keyDown(event)
        })

        window.addEventListener('keyup', (event) => {
            this.keyUp(event)
        })

        window.addEventListener('mousedown', (event) => {
            this.mouseDown(event)
        })

        window.addEventListener('mouseup', (event) => {
            this.mouseUp(event)
        })
    }

    mouseDown(event) {
        if (document.pointerLockElement !== document.querySelector('canvas.webgl')) return

        switch (event.button) {
            case 0: // Left Click
                this.keys.shoot = true
                this.trigger('shoot')
                break
            case 2: // Right Click
                this.keys.aim = true
                this.trigger('aimStart')
                break
        }
    }

    mouseUp(event) {
        switch (event.button) {
            case 0: // Left Click
                this.keys.shoot = false
                break
            case 2: // Right Click
                this.keys.aim = false
                this.trigger('aimEnd')
                break
        }
    }

    keyDown(event) {
        // console.log('Key Down:', event.code) 

        switch (event.code) {
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

            case 'Escape':
                this.trigger('pause')
                break

            case 'Space':
                if (this.keys.jump === false) {
                    this.keys.jump = true
                    console.log('Input: Space pressed -> triggering jump')
                    this.trigger('jump')
                }
                break

            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.shift = true
                break

            case 'KeyF':
                console.log('F Key detected in Input.js')
                if (this.keys.interact === false) {
                    this.keys.interact = true
                    this.trigger('interact')
                }
                break

            //Reload Key
            case 'KeyR':
                if (this.keys.reload === false) {
                    this.keys.reload = true
                    console.log('Input: R pressed -> triggering reload')
                    this.trigger('reload')
                }
                break
        }
    }

    keyUp(event) {
        switch (event.code) {
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

            case 'KeyF':
                this.keys.interact = false
                break

            case 'KeyR':
                this.keys.reload = false
                break

            case 'Digit1':
                this.trigger('slot1')
                break
            case 'Digit2':
                this.trigger('slot2')
                break
            case 'Digit3':
                this.trigger('slot3')
                break
        }
    }

    destroy() {
        window.removeEventListener('keydown')
        window.removeEventListener('keyup')
        window.removeEventListener('mousedown')
        window.removeEventListener('mouseup')
        this.off()
    }
}