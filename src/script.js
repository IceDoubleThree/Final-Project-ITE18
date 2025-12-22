import Experience from './Experience/Experience.js'

const experience = new Experience(document.querySelector('canvas.webgl'))

// --- Loading screen wiring ---
const loadingScreen = document.getElementById('loading-screen')
const loadingStatus = document.getElementById('loading-status')
const loadingPercent = document.getElementById('loading-percent')
const loadingBarFill = document.getElementById('loading-bar-fill')

const setLoadingProgress = (loaded, toLoad, sourceName = null) => {
	const safeToLoad = Math.max(0, Number(toLoad) || 0)
	const safeLoaded = Math.max(0, Number(loaded) || 0)
	const pct = safeToLoad > 0 ? Math.min(100, Math.round((safeLoaded / safeToLoad) * 100)) : 100

	if (loadingBarFill) loadingBarFill.style.width = `${pct}%`
	if (loadingPercent) loadingPercent.textContent = `${pct}%`
	if (loadingStatus) {
		if (sourceName) loadingStatus.textContent = `Loading ${sourceName} (${safeLoaded}/${safeToLoad})`
		else loadingStatus.textContent = `Loading assets… (${safeLoaded}/${safeToLoad})`
	}
}

const hideLoadingScreen = () => {
	if (!loadingScreen) return
	loadingScreen.classList.add('fade-out')
	setTimeout(() => {
		loadingScreen.style.display = 'none'
	}, 650)
}

if (experience?.resources) {
	// Set initial state (some assets may already be in-flight)
	setLoadingProgress(experience.resources.loaded, experience.resources.toLoad)

	experience.resources.on('progress', (p) => {
		setLoadingProgress(p?.loaded, p?.toLoad, p?.source?.name ?? null)
	})

	experience.resources.on('error', (e) => {
		// Keep it minimal: show an error line but still allow the app to proceed.
		if (loadingStatus) {
			const name = e?.source?.name ?? 'asset'
			loadingStatus.textContent = `Failed to load ${name}. Continuing…`
		}
	})

	experience.resources.on('ready', () => {
		setLoadingProgress(experience.resources.loaded, experience.resources.toLoad)
		hideLoadingScreen()
	})
}

// Main menu wiring
const mainMenu = document.getElementById('main-menu')
const placeholder = document.getElementById('main-menu-placeholder')
const btnStart = document.getElementById('btn-start-game')
const btnSettings = document.getElementById('btn-settings')
const btnHelp = document.getElementById('btn-help')
const btnCredits = document.getElementById('btn-credits')

// Debug-only: add location selector to the main menu
const isDebugMenu = window.location.hash === '#debug'
let debugLocationSelect = null

if (isDebugMenu && mainMenu && btnStart && experience?.world?.locationConfigs) {
	const locationKeys = Object.keys(experience.world.locationConfigs)
	if (locationKeys.length) {
		const wrapper = document.createElement('div')
		wrapper.style.display = 'flex'
		wrapper.style.flexDirection = 'column'
		wrapper.style.gap = '6px'

		const label = document.createElement('div')
		label.textContent = 'Select location'
		label.style.fontSize = '14px'
		label.style.fontWeight = '600'
		label.style.textAlign = 'left'
		wrapper.appendChild(label)

		debugLocationSelect = document.createElement('select')
		debugLocationSelect.id = 'debug-location-select'
		debugLocationSelect.style.width = '100%'
		debugLocationSelect.style.padding = '10px'
		debugLocationSelect.style.borderRadius = '10px'

		locationKeys.forEach((key) => {
			const opt = document.createElement('option')
			opt.value = key
			opt.textContent = key
			debugLocationSelect.appendChild(opt)
		})

		// Default to Room if present, else first key
		debugLocationSelect.value = locationKeys.includes('Room') ? 'Room' : locationKeys[0]
		wrapper.appendChild(debugLocationSelect)

		// Put selector ABOVE the Start Game button
		btnStart.parentElement?.insertBefore(wrapper, btnStart)
	}
}

if (btnStart) {
	btnStart.addEventListener('click', () => {
		// Prevent repeated activation (e.g. Space key triggers click on focused button)
		btnStart.disabled = true
		btnStart.blur()
		if (document.activeElement && typeof document.activeElement.blur === 'function') {
			document.activeElement.blur()
		}

		// 1. Hide the Main Menu
		if (mainMenu) {
			mainMenu.classList.add('hidden')
		}

		// 2. Trigger the Black Screen Fade Out
		const blackScreen = document.getElementById('black-screen')
		if (blackScreen) {
			// Trigger reflow to ensure transition happens if added dynamically (optional)
			// void blackScreen.offsetWidth 
			
			// Add class to start opacity transition to 0
			blackScreen.classList.add('fade-out')

			// Optionally remove it after 3 seconds (slightly longer than transition)
			setTimeout(() => {
				blackScreen.style.display = 'none'
			}, 3000)
		}

		// 3. Start the Game Logic
		if (experience && typeof experience.startGame === 'function') {
			const selectedLocation = isDebugMenu ? debugLocationSelect?.value : null
			experience.startGame(selectedLocation)
		}
	}, { once: true })
}

const setPlaceholder = (text) => {
	if (placeholder) {
		placeholder.textContent = text
	}
}

btnSettings?.addEventListener('click', () => {
	setPlaceholder('Settings placeholder: audio, graphics, controls coming soon.')
})

btnHelp?.addEventListener('click', () => {
	setPlaceholder('Help placeholder: basic controls and tips will be shown here.')
})

btnCredits?.addEventListener('click', () => {
	setPlaceholder('Credits placeholder: team names and acknowledgements will go here.')
})