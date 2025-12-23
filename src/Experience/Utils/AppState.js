import EventEmitter from './EventEmitter.js'

export const ENVIRONMENTS = /** @type {const} */ ({
	MAIN_MENU: 'main_menu',
	LOBBY: 'lobby',
	GAME: 'game',
})

const VALID_ENVS = new Set(Object.values(ENVIRONMENTS))

export default class AppState extends EventEmitter {
	constructor() {
		super()
		/** @type {'main_menu'|'lobby'|'game'} */
		this.current_env = ENVIRONMENTS.MAIN_MENU
		/** @type {string|null} */
		this.current_loc = null
	}

	setEnv(nextEnv) {
		const env = String(nextEnv ?? '')
		if (!VALID_ENVS.has(env)) {
			console.warn(`[AppState] Invalid env: ${env}`)
			return
		}
		if (this.current_env === env) return
		const prev = this.current_env
		this.current_env = env
		this.trigger('env', [env, prev])
	}

	setLoc(nextLoc) {
		const loc = nextLoc == null ? null : String(nextLoc)
		if (this.current_loc === loc) return
		const prev = this.current_loc
		this.current_loc = loc
		this.trigger('loc', [loc, prev])
	}
}
