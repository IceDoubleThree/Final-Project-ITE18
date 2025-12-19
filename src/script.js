import Experience from './Experience/Experience.js'

const experience = new Experience(document.querySelector('canvas.webgl'))

// Main menu wiring
const mainMenu = document.getElementById('main-menu')
const placeholder = document.getElementById('main-menu-placeholder')
const btnStart = document.getElementById('btn-start-game')
const btnSettings = document.getElementById('btn-settings')
const btnHelp = document.getElementById('btn-help')
const btnCredits = document.getElementById('btn-credits')

if (btnStart) {
	btnStart.addEventListener('click', () => {
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
			experience.startGame()
		}
	})
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