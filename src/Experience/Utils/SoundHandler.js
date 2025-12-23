const AUDIO_STATES = {
	main_menu: {
		src: './audio/bgm/main_menu.opus',
		loop: true,
		gap: 1 // seconds
	}
}

export default class SoundHandler {
	constructor() {
		this._audio = null
		this._loopTimer = null
		this._fadeRaf = null
		this._armedForUserGesture = false
		this._pendingConfig = null
		this._onUserGesture = this._onUserGesture.bind(this)
	}

	playAudio(state) {
		const config = typeof state === 'string' ? AUDIO_STATES[state] : state
		if (!config || !config.src) return

		this.stop()
		this._pendingConfig = config

		const audio = new Audio(config.src)
		audio.preload = 'auto'
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

		const startVolume = typeof audio.volume === 'number' ? audio.volume : 1
		const startTime = performance.now()

		const step = (now) => {
			if (this._audio !== audio) return
			const t = Math.min(1, (now - startTime) / durationMs)
			audio.volume = Math.max(0, startVolume * (1 - t))
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
	}
}
