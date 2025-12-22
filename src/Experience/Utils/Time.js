import EventEmitter from './EventEmitter.js'

export default class Time extends EventEmitter
{
    constructor()
    {
        super()

        this.start = Date.now()
        this.current = this.start
        this.elapsed = 0
        this.delta = 16
        this.paused = false
        this.animationFrameId = null

        this.tick = this.tick.bind(this)

        this.animationFrameId = window.requestAnimationFrame(this.tick)
    }

    pause() {
        if (this.paused) return
        this.paused = true
        if (this.animationFrameId) {
            window.cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
    }

    resume() {
        if (!this.paused) return
        this.paused = false
        this.current = Date.now() // Reset current to avoid huge delta
        this.tick()
    }

    tick()
    {
        const currentTime = Date.now()
        this.delta = currentTime - this.current
        this.current = currentTime
        this.elapsed = this.current - this.start

        this.trigger('tick')

        this.animationFrameId = window.requestAnimationFrame(this.tick)
    }
}
