import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Portal {
    static activeMenuPortal = null

    /**
     * A portal is now a box trigger volume + UI.
     *
     * @param {World} world
     * @param {THREE.Vector3} position - center position (used if no boundsBox provided)
     * @param {string|null} destinationKey - optional single-destination shortcut
     * @param {string} name - display name
     * @param {number} color - unused for invisible triggers; kept for compatibility
     * @param {object} options
     * @param {THREE.Vector3} options.size - box size (default: 2x2x2)
     * @param {THREE.Box3} options.boundsBox - explicit world-space box
     * @param {number} options.interactionRadius - distance outside the box to show prompt (default: 1)
     * @param {Array<{ label: string, destinationKey?: string, onSelect?: Function }>} options.options
     */
    constructor(world, position, destinationKey, name = "Next Stage", color = 0xffff00, options = {}) {
        this.experience = new Experience()
        this.world = world
        this.input = this.experience.input

        this.position = position || new THREE.Vector3()
        this.destinationKey = destinationKey || null
        this.name = name
        this.color = color

        this.size = options.size || new THREE.Vector3(2, 2, 2)
        this.boundsBox = options.boundsBox || null
        this.interactionRadius = typeof options.interactionRadius === 'number' ? options.interactionRadius : 1

        this.menuOptions = Array.isArray(options.options) ? options.options : null
        if (!this.menuOptions) {
            // Default: single option to travel
            const label = `Go to ${this.name}`
            this.menuOptions = [{ label, destinationKey: this.destinationKey }]
        }

        this.isPlayerClose = false
        this.isActive = true
        this.isMenuOpen = false

        this._worldBox = new THREE.Box3()
        this._tmp = new THREE.Vector3()

        this.createPromptElement()
        this.createOptionsElement()

        this.onInteract = this.handleInteract.bind(this)
        this.input.on('interact', this.onInteract)

        this.onKeyDown = this.handleKeyDown.bind(this)
        document.addEventListener('keydown', this.onKeyDown)
    }

    normalizeGoToLabel(label) {
        const raw = String(label ?? '').trim()
        const lower = raw.toLowerCase()

        // Keep non-travel actions as-is
        if (lower === 'start game') return raw

        if (lower.startsWith('go to ')) return raw
        if (lower.startsWith('enter ')) return `Go to ${raw.slice(6)}`
        if (lower.startsWith('return to ')) return `Go to ${raw.slice(10)}`
        if (lower.startsWith('travel to ')) return `Go to ${raw.slice(10)}`
        if (lower.startsWith('warp to ')) return `Go to ${raw.slice(8)}`

        return raw
    }

    isSingleAction() {
        if (!Array.isArray(this.menuOptions) || this.menuOptions.length !== 1) return false
        const opt = this.menuOptions[0]
        if (!opt) return false
        return typeof opt.onSelect === 'function' || !!opt.destinationKey || !!this.destinationKey
    }

    getPromptText() {
        if (this.isSingleAction()) {
            const label = this.normalizeGoToLabel(this.menuOptions[0]?.label)
            return label
        }
        return 'Choose destination'
    }

    createPromptElement() {
        this.prompt = document.createElement('div')
        this.prompt.classList.add('interact-prompt', 'portal-prompt')

        const label = this.getPromptText()
        this.prompt.innerHTML = `
            <span class="key-icon">F</span>
            <span>${label}</span>
        `
        document.body.appendChild(this.prompt)
    }

    createOptionsElement() {
        this.optionsEl = document.createElement('div')
        this.optionsEl.classList.add('interact-options', 'portal-options')
        this.optionsEl.classList.add('hidden')
        document.body.appendChild(this.optionsEl)
        this.renderOptions()
    }

    renderOptions() {
        if (!this.optionsEl) return

        const buttons = this.menuOptions
            .map((opt, idx) => {
                const key = idx + 1
                const safeLabel = this.normalizeGoToLabel(opt.label ?? `Option ${key}`)
                return `<button type="button" data-index="${idx}"><span class="opt-key">${key}</span>${safeLabel}</button>`
            })
            .join('')

        this.optionsEl.innerHTML = `
            <div class="interact-options-title">Go to</div>
            <div class="interact-options-buttons">${buttons}</div>
        `

        // Click handling
        this.optionsEl.querySelectorAll('button[data-index]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-index'))
                this.selectOption(idx)
            })
        })
    }

    handleInteract() {
        if (!this.isPlayerClose || !this.isActive) return

        // No extra step: if there's only one action, do it immediately.
        if (this.isSingleAction()) {
            this.selectOption(0)
            return
        }

        if (!this.isMenuOpen) {
            this.openMenu()
        }
    }

    handleKeyDown(event) {
        if (!this.isMenuOpen) return

        if (event.code === 'Escape') {
            this.closeMenu()
            return
        }

        // Number keys 1..9 select options
        if (event.code.startsWith('Digit')) {
            const n = Number(event.code.replace('Digit', ''))
            if (!Number.isFinite(n)) return
            const idx = n - 1
            if (idx >= 0 && idx < this.menuOptions.length) {
                this.selectOption(idx)
            }
        }
    }

    openMenu() {
        if (!this.optionsEl) return

        // Only one portal menu at a time
        if (Portal.activeMenuPortal && Portal.activeMenuPortal !== this) {
            Portal.activeMenuPortal.closeMenu()
        }
        Portal.activeMenuPortal = this

        this.isMenuOpen = true
        this.optionsEl.classList.remove('hidden')
        this.optionsEl.classList.add('visible')
        // Hide prompt while menu is open
        if (this.prompt) this.prompt.classList.remove('visible')
    }

    closeMenu() {
        if (!this.optionsEl) return
        this.isMenuOpen = false
        this.optionsEl.classList.remove('visible')
        this.optionsEl.classList.add('hidden')

        if (Portal.activeMenuPortal === this) {
            Portal.activeMenuPortal = null
        }
    }

    selectOption(index) {
        const opt = this.menuOptions[index]
        if (!opt) return

        // Close UI first to avoid overlapping with location load
        this.closeMenu()

        if (typeof opt.onSelect === 'function') {
            opt.onSelect()
            return
        }

        const destination = opt.destinationKey || this.destinationKey
        if (destination) {
            console.log(`🚪 Teleporting to ${destination}`)
            this.isActive = false
            this.world.loadLocation(destination)
        }
    }

    updateWorldBox() {
        if (this.boundsBox) {
            this._worldBox.copy(this.boundsBox)
            return
        }

        // Box centered at `position`
        const half = this._tmp.copy(this.size).multiplyScalar(0.5)
        this._worldBox.min.set(
            this.position.x - half.x,
            this.position.y - half.y,
            this.position.z - half.z
        )
        this._worldBox.max.set(
            this.position.x + half.x,
            this.position.y + half.y,
            this.position.z + half.z
        )
    }

    distanceToBoxXZ(point) {
        // Distance from point to AABB in XZ only (0 if inside on both axes)
        const min = this._worldBox.min
        const max = this._worldBox.max
        const px = point.x
        const pz = point.z

        const dx = px < min.x ? (min.x - px) : (px > max.x ? (px - max.x) : 0)
        const dz = pz < min.z ? (min.z - pz) : (pz > max.z ? (pz - max.z) : 0)
        return Math.sqrt(dx * dx + dz * dz)
    }

    update() {
        if (!this.world.player || !this.world.player.mesh) return

        const playerPos = this.world.player.mesh.position

        this.updateWorldBox()
        const dist = this.distanceToBoxXZ(playerPos)

        if (dist <= this.interactionRadius) {
            this.isPlayerClose = true
            if (!this.isMenuOpen) {
                this.prompt.classList.add('visible')
            }
        } else {
            this.isPlayerClose = false
            this.prompt.classList.remove('visible')
            if (this.isMenuOpen) {
                this.closeMenu()
            }
        }
    }

    destroy() {
        if (this.prompt) {
            this.prompt.remove()
        }

        if (this.optionsEl) {
            this.optionsEl.remove()
        }

        document.removeEventListener('keydown', this.onKeyDown)

        // Clean up event listener safely
        if (this.input && this.input.callbacks && this.input.callbacks.base && this.input.callbacks.base.interact) {
            const callbacks = this.input.callbacks.base.interact
            const index = callbacks.indexOf(this.onInteract)
            if (index > -1) {
                callbacks.splice(index, 1)
            }
        }
    }
}