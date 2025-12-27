const AUDIO_STATES = {
	main_menu: {
		src: './audio/bgm/main_menu.opus',
		loop: true,
		gap: 1 // seconds
	}
}

const SFX_STATES = {
	pistol_shot: {
		src: './audio/sfx/pistol/pistol-gunshot.mp3',
		volume: 0.9
	},
	pistol_reload: {
		src: './audio/sfx/pistol/pistol-cock.mp3',
		volume: 0.9
	}
}

export default class SoundHandler {
	constructor() {
		this._audio = null
		this._loopTimer = null
		this._fadeRaf = null
		this._armedForUserGesture = false
		this._pendingConfig = null
		this._muted = false
		this._activeSfx = new Set()
		this._pendingSfx = []
		this._onUserGesture = this._onUserGesture.bind(this)
	}

	setMuted(muted) {
		this._muted = Boolean(muted)
		if (this._audio) {
			try {
				this._audio.muted = this._muted
			} catch {
				// ignore
			}
		}

		if (this._activeSfx && this._activeSfx.size) {
			for (const a of this._activeSfx) {
				try {
					a.muted = this._muted
				} catch {
					// ignore
				}
			}
		}
	}

	isMuted() {
		return this._muted
	}

	playAudio(state) {
		const config = typeof state === 'string' ? AUDIO_STATES[state] : state
		if (!config || !config.src) return

		this.stop()
		this._pendingConfig = config

		const audio = new Audio(config.src)
		audio.preload = 'auto'
		audio.muted = this._muted
		audio.loop = false // custom looping so we can apply a gap
		audio.addEventListener('ended', () => {
			if (!config.loop) return
			const gapMs = Math.max(0, Number(config.gap) || 0) * 1000
			this._loopTimer = window.setTimeout(() => {
				// If something else started, don't resume.
				if (this._audio !== audio) return
				this._safePlay(audio)
			}, gapMs)
		})

		this._audio = audio
		this._safePlay(audio)
	}

	playSfx(name, opts = {}) {
		const config = typeof name === 'string' ? SFX_STATES[name] : name
		if (!config || !config.src) return null

		const baseVol = Number.isFinite(config.volume) ? config.volume : 1
		const optVol = Number.isFinite(opts.volume) ? opts.volume : 1
		const volume = Math.max(0, Math.min(1, baseVol * optVol))
		const playbackRate = Number.isFinite(opts.playbackRate) ? Math.max(0.25, Math.min(4, opts.playbackRate)) : 1

		const audio = new Audio(config.src)
		audio.preload = 'auto'
		audio.loop = false
		audio.muted = this._muted
		audio.volume = volume
		try {
			audio.playbackRate = playbackRate
		} catch {
			// ignore
		}

		this._activeSfx.add(audio)
		audio.addEventListener('ended', () => {
			this._activeSfx.delete(audio)
		})
		audio.addEventListener('error', () => {
			this._activeSfx.delete(audio)
		})

		this._safePlaySfx(audio)
		return audio
	}

	stop() {
		this._cancelFade()

		if (this._loopTimer) {
			clearTimeout(this._loopTimer)
			this._loopTimer = null
		}

		if (this._audio) {
			try {
				this._audio.volume = 1
				this._audio.pause()
				this._audio.currentTime = 0
			} catch {
				// ignore
			}
			this._audio = null
		}

		this._pendingConfig = null
		this._disarmUserGesture()
	}

	fadeOut(ms = 800) {
		const audio = this._audio
		if (!audio) return
		const durationMs = Math.max(0, Number(ms) || 0)
		if (durationMs === 0) {
			this.stop()
			return
		}

		this._cancelFade()
		// Prevent any scheduled loop restart while fading
		if (this._loopTimer) {
			clearTimeout(this._loopTimer)
			this._loopTimer = null
		}

		// Ensure startVolume is within [0,1] to avoid IndexSizeError in some browsers
		const startVolume = typeof audio.volume === 'number' ? Math.max(0, Math.min(1, audio.volume)) : 1
		const startTime = performance.now()

		const step = (now) => {
			if (this._audio !== audio) return
			const t = Math.min(1, (now - startTime) / durationMs)
			// Clamp computed volume to [0,1]
			audio.volume = Math.max(0, Math.min(1, startVolume * (1 - t)))
			if (t < 1) {
				this._fadeRaf = requestAnimationFrame(step)
				return
			}
			this.stop()
		}

		this._fadeRaf = requestAnimationFrame(step)
	}

	_cancelFade() {
		if (!this._fadeRaf) return
		cancelAnimationFrame(this._fadeRaf)
		this._fadeRaf = null
	}

	_safePlay(audio) {
		try {
			const p = audio.play()
			if (p && typeof p.catch === 'function') {
				p.catch(() => {
					// Autoplay blocked until user interacts.
					this._armForUserGesture()
				})
			}
		} catch {
			this._armForUserGesture()
		}
	}

	_safePlaySfx(audio) {
		try {
			const p = audio.play()
			if (p && typeof p.catch === 'function') {
				p.catch(() => {
					// Autoplay blocked until user interacts.
					this._pendingSfx.push(audio)
					this._armForUserGesture()
				})
			}
		} catch {
			this._pendingSfx.push(audio)
			this._armForUserGesture()
		}
	}

	_armForUserGesture() {
		if (this._armedForUserGesture) return
		this._armedForUserGesture = true
		window.addEventListener('pointerdown', this._onUserGesture, { once: true })
		window.addEventListener('keydown', this._onUserGesture, { once: true })
	}

	_disarmUserGesture() {
		if (!this._armedForUserGesture) return
		this._armedForUserGesture = false
		window.removeEventListener('pointerdown', this._onUserGesture)
		window.removeEventListener('keydown', this._onUserGesture)
	}

	_onUserGesture() {
		this._armedForUserGesture = false
		if (this._audio) this._safePlay(this._audio)

		if (this._pendingSfx && this._pendingSfx.length) {
			const pending = this._pendingSfx.slice()
			this._pendingSfx.length = 0
			for (const a of pending) {
				try {
					a.muted = this._muted
					a.play().catch(() => {})
				} catch {
					// ignore
				}
			}
		}
	}
}
