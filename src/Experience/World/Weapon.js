export default class Weapon {
    constructor(name, options = {}) {
        this.name = name
        this.damage = options.damage || 10
        this.range = options.range || 100

        // Cooldown between shots (ms). Back-compat: options.fireRate is treated as seconds.
        const cooldownMs =
            (Number.isFinite(options.cooldownMs) ? options.cooldownMs : null) ??
            (Number.isFinite(options.cooldown) ? options.cooldown * 1000 : null) ??
            (Number.isFinite(options.cooldownSec) ? options.cooldownSec * 1000 : null) ??
            (Number.isFinite(options.fireRate) ? options.fireRate * 1000 : null) ??
            500

        this.cooldownMs = Math.max(0, cooldownMs)

        // Ammo + reload
        this.ammoSize = Number.isFinite(options.ammo_size) ? options.ammo_size : (Number.isFinite(options.ammoSize) ? options.ammoSize : Infinity)
        this.ammo = this.ammoSize

        const reloadTimeMs =
            (Number.isFinite(options.reloading_time) ? options.reloading_time * 1000 : null) ??
            (Number.isFinite(options.reloadTimeSec) ? options.reloadTimeSec * 1000 : null) ??
            (Number.isFinite(options.reloadTimeMs) ? options.reloadTimeMs : null) ??
            0
        this.reloadTimeMs = Math.max(0, reloadTimeMs)

        this.isReloading = false
        this.reloadEndTimeMs = 0

        // Firing state
        this.nextFireTimeMs = 0

        // Input buffer for rapid clicking
        // When a click happens during cooldown, it will fire as soon as possible (within buffer window).
        this.bufferedShot = false
        this.bufferedUntilMs = 0
        this.bufferWindowMs = Number.isFinite(options.bufferWindowMs)
            ? Math.max(0, options.bufferWindowMs)
            : this.cooldownMs
    }

    _finishReloadIfDone(nowMs) {
        if (!this.isReloading) return
        if (nowMs < this.reloadEndTimeMs) return

        this.isReloading = false
        this.reloadEndTimeMs = 0
        this.ammo = this.ammoSize
    }

    startReload(nowMs) {
        if (this.isReloading) return
        if (!Number.isFinite(this.ammoSize) || this.ammoSize === Infinity) return
        if (this.reloadTimeMs <= 0) return

        this.isReloading = true
        this.reloadEndTimeMs = nowMs + this.reloadTimeMs
    }

    canFire(nowMs) {
        this._finishReloadIfDone(nowMs)
        if (this.isReloading) return false
        if (this.ammo <= 0) return false
        return nowMs >= this.nextFireTimeMs
    }

    _fire(nowMs) {
        this.nextFireTimeMs = nowMs + this.cooldownMs
        if (Number.isFinite(this.ammo) && this.ammo !== Infinity) {
            this.ammo = Math.max(0, this.ammo - 1)
        }

        console.log(`Bang! ${this.name} fired. Ammo: ${Number.isFinite(this.ammo) ? this.ammo : '∞'}/${Number.isFinite(this.ammoSize) ? this.ammoSize : '∞'}`)

        // Auto-reload when empty.
        if (this.ammo <= 0) {
            this.startReload(nowMs)
        }
        return true
    }

    requestFire(nowMs) {
        // Called on trigger press/hold. Returns true if a shot fired.
        this._finishReloadIfDone(nowMs)

        if (this.isReloading) return false

        if (this.ammo <= 0) {
            this.startReload(nowMs)
            return false
        }

        if (this.canFire(nowMs)) {
            this.bufferedShot = false
            this.bufferedUntilMs = 0
            return this._fire(nowMs)
        }

        // Buffer the click so it fires once cooldown ends.
        this.bufferedShot = true
        this.bufferedUntilMs = Math.max(this.bufferedUntilMs, nowMs + this.bufferWindowMs)
        return false
    }

    tryFireHeld(nowMs) {
        // Called while trigger is held down.
        // IMPORTANT: does NOT buffer, otherwise a slightly-long click can queue an extra shot.
        this._finishReloadIfDone(nowMs)

        if (this.isReloading) return false

        if (this.ammo <= 0) {
            this.startReload(nowMs)
            return false
        }

        if (!this.canFire(nowMs)) return false
        return this._fire(nowMs)
    }

    update(nowMs) {
        this._finishReloadIfDone(nowMs)

        if (!this.bufferedShot) return false
        if (nowMs > this.bufferedUntilMs) {
            this.bufferedShot = false
            this.bufferedUntilMs = 0
            return false
        }

        if (this.canFire(nowMs)) {
            this.bufferedShot = false
            this.bufferedUntilMs = 0
            return this._fire(nowMs)
        }

        return false
    }
}