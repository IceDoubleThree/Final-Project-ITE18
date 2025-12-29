import EventEmitter from './EventEmitter.js'

export default class DialogueReader extends EventEmitter {
    constructor() {
        super()
        this.dialogueData = null
        this.currentDialogueId = null
        this.currentMessageIndex = 0
        this.isDialogueActive = false
        this.dialogueBox = null
        this.isLoaded = false
        this._subtitleTimeout = null
        
        // Queue for raw script arrays (manual play)
        this.scriptQueue = [] 
        this.isManualMode = false

        this.initializeHTML()
        this.loadDialogueData() // Optional: Keep if you plan to use JSON later
        this.setupEventListeners()
    }

    /**
     * Initialize HTML structure for the dialogue box
     */
    initializeHTML() {
        // Check if dialogue container already exists
        if (document.getElementById('dialogue-container')) {
            this.dialogueBox = document.getElementById('dialogue-container')
            return
        }

        // Create main dialogue container
        const container = document.createElement('div')
        container.id = 'dialogue-container'
        container.className = 'dialogue-container hidden' // CSS should handle visibility

        // Create dialogue box
        const box = document.createElement('div')
        box.className = 'dialogue-box'

        // Create character name display
        const characterName = document.createElement('div')
        characterName.className = 'dialogue-character'
        characterName.id = 'dialogue-character'
        characterName.textContent = 'System'

        // Create text display
        const textDisplay = document.createElement('div')
        textDisplay.className = 'dialogue-text'
        textDisplay.id = 'dialogue-text'
        textDisplay.textContent = '...'

        // Create continue indicator (arrow)
        const continueIndicator = document.createElement('div')
        continueIndicator.className = 'dialogue-continue'
        continueIndicator.id = 'dialogue-continue'
        continueIndicator.textContent = '▼'

        // Assemble the dialogue box
        box.appendChild(characterName)
        box.appendChild(textDisplay)
        box.appendChild(continueIndicator)
        container.appendChild(box)

        document.body.appendChild(container)
        this.dialogueBox = container
    }

    /**
     * Load dialogue data from JSON file (Optional, keeps existing functionality)
     */
    async loadDialogueData() {
        try {
            const response = await fetch('/dialogue.json')
            if (!response.ok) {
                // It's okay if file doesn't exist, we might be using manual mode only
                console.warn(`Dialogue JSON not found or error: ${response.statusText}`)
                this.dialogueData = { dialogues: {} }
                return
            }
            this.dialogueData = await response.json()
            this.isLoaded = true
            console.log('✅ Dialogue data loaded successfully')
        } catch (error) {
            console.warn('⚠️ Manual mode only (No dialogue.json found)')
            this.dialogueData = { dialogues: {} }
            this.isLoaded = false
        }
    }

    /**
     * Setup event listeners for dialogue progression
     */
    setupEventListeners() {
        // Click to advance dialogue
        document.addEventListener('click', (event) => {
            if (this.isDialogueActive) {
                // If clicking anywhere while active, advance
                this.nextMessage()
            }
        })

        // Also allow Space or Enter to advance
        document.addEventListener('keydown', (event) => {
            if (this.isDialogueActive && (event.code === 'Space' || event.code === 'Enter')) {
                event.preventDefault()
                this.nextMessage()
            }
        })

        // Allow Escape to close dialogue
        document.addEventListener('keydown', (event) => {
            if (this.isDialogueActive && event.code === 'Escape') {
                this.closeDialogue()
            }
        })
    }

    /**
     * --- NEW METHOD ---
     * Allows playing a raw array of dialogue objects directly.
     * Used by Experience.js for the intro story.
     * @param {Array} script - Array of objects like [{name: "System", text: "Hello"}]
     */
    play(script) {
        if (!script || script.length === 0) return

        console.log("📜 Playing Manual Dialogue Script", script)
        
        this.scriptQueue = script
        this.currentMessageIndex = 0
        this.isDialogueActive = true
        this.isManualMode = true // Flag to know we are using array, not JSON ID

        // Show the box
        this.dialogueBox.classList.remove('hidden')
        this.dialogueBox.classList.add('visible')
        this.dialogueBox.style.display = 'flex' // Ensure it's visible in layout

        this.displayMessage()
    }

    /**
     * Read and display a dialogue sequence by ID (Legacy JSON mode)
     * @param {string} dialogueId - The ID of the dialogue to display
     */
    read(dialogueId) {
        // Wait for data to load if not yet loaded
        if (!this.isLoaded) {
            console.warn(`⏳ Waiting for dialogue data...`)
            const checkInterval = setInterval(() => {
                if (this.isLoaded) {
                    clearInterval(checkInterval)
                    this.read(dialogueId)
                }
            }, 50)
            return
        }

        if (!this.dialogueData || !this.dialogueData.dialogues[dialogueId]) {
            console.error(`❌ Dialogue with ID "${dialogueId}" not found`)
            return
        }

        this.currentDialogueId = dialogueId
        this.currentMessageIndex = 0
        this.isDialogueActive = true
        this.isManualMode = false

        // Show the dialogue box
        this.dialogueBox.classList.remove('hidden')
        this.dialogueBox.classList.add('visible')
        this.dialogueBox.style.display = 'flex'

        // Display the first message
        this.displayMessage()
    }

    /**
     * Display the current message in the sequence (Handles both modes)
     */
    displayMessage() {
        let message = null

        if (this.isManualMode) {
            // Get from passed array
            message = this.scriptQueue[this.currentMessageIndex]
        } else if (this.dialogueData && this.currentDialogueId) {
            // Get from JSON data
            const dialogue = this.dialogueData.dialogues[this.currentDialogueId]
            if(dialogue) message = dialogue.sequence[this.currentMessageIndex]
        }

        if (!message) {
            this.closeDialogue()
            return
        }

        // Update character name
        const characterElement = document.getElementById('dialogue-character')
        // Supports 'speaker' (JSON) or 'name' (Manual Array) properties
        characterElement.textContent = message.name || message.speaker || "System"

        // Update text display
        const textElement = document.getElementById('dialogue-text')
        textElement.textContent = message.text

        // Show continue indicator if not at the end
        const continueElement = document.getElementById('dialogue-continue')
        
        let isLast = true
        if (this.isManualMode) {
            isLast = this.currentMessageIndex >= this.scriptQueue.length - 1
        } else if (this.currentDialogueId) {
            const dialogue = this.dialogueData.dialogues[this.currentDialogueId]
            isLast = this.currentMessageIndex >= dialogue.sequence.length - 1
        }

        if (!isLast) {
            continueElement.classList.add('visible')
        } else {
            continueElement.classList.remove('visible')
        }
    }

    /**
     * Display a transient subtitle centered at the bottom of the screen.
     * This is separate from the main dialogue box and will not interfere
     * with existing dialogue behavior.
     * @param {string} text
     * @param {number} durationMs - milliseconds to show (0 = persistent)
     */
    displaySubtitle(text, durationMs = 3000) {
        if (!text) {
            this.clearSubtitle()
            return
        }

        let el = document.getElementById('subtitle')
        if (!el) {
            // Fallback: create if missing
            el = document.createElement('div')
            el.id = 'subtitle'
            el.className = 'subtitle-overlay'
            el.style.display = 'none'
            document.body.appendChild(el)
        }

        el.textContent = text
        el.style.display = 'block'
        el.classList.remove('hidden')
        el.classList.add('visible')

        if (this._subtitleTimeout) {
            clearTimeout(this._subtitleTimeout)
            this._subtitleTimeout = null
        }

        if (durationMs > 0) {
            this._subtitleTimeout = setTimeout(() => {
                this.clearSubtitle()
            }, durationMs)
        }
    }

    /**
     * Clear/hide the subtitle immediately.
     */
    clearSubtitle() {
        const el = document.getElementById('subtitle')
        if (!el) return
        el.classList.remove('visible')
        el.classList.add('hidden')
        // allow transition then remove from flow
        setTimeout(() => {
            if (el && !el.classList.contains('visible')) {
                el.style.display = 'none'
            }
        }, 220)
        if (this._subtitleTimeout) {
            clearTimeout(this._subtitleTimeout)
            this._subtitleTimeout = null
        }
    }

    /**
     * Display a sequence of subtitles in order. Each entry may be a string
     * or an object { text, duration, gap } where duration/gap are ms.
     * The sequence waits for any active dialogue to finish before starting.
     * @param {Array<string|object>} entries
     * @param {number} startDelay - ms to wait before starting the sequence
     */
    async displaySubtitleSequence(entries = [], startDelay = 0, opts = {}) {
        if (!Array.isArray(entries) || entries.length === 0) return

        const force = opts && opts.force

        const waitForIdle = () => new Promise((resolve) => {
            if (!this.isDialogueActive) return resolve()
            const iv = setInterval(() => {
                if (!this.isDialogueActive) {
                    clearInterval(iv)
                    resolve()
                }
            }, 150)
        })

        if (!force) await waitForIdle()
        if (startDelay > 0) await new Promise(r => setTimeout(r, startDelay))

        for (const entry of entries) {
            const item = typeof entry === 'string' ? { text: entry } : entry || {}
            const text = item.text || ''
            const duration = Number.isFinite(item.duration) ? item.duration : 3000
            const gap = Number.isFinite(item.gap) ? item.gap : 200

            if (text) this.displaySubtitle(text, duration)
            await new Promise(r => setTimeout(r, duration + gap))
        }
    }

    /**
     * Move to the next message in the sequence
     */
    nextMessage() {
        let length = 0
        
        // Determine total length based on mode
        if (this.isManualMode) {
            length = this.scriptQueue.length
        } else if (this.dialogueData && this.currentDialogueId) {
            length = this.dialogueData.dialogues[this.currentDialogueId].sequence.length
        }

        if (this.currentMessageIndex < length - 1) {
            this.currentMessageIndex++
            this.displayMessage()
        } else {
            this.closeDialogue()
        }
    }

    /**
     * Close the dialogue box and clean up
     */
    closeDialogue() {
        this.isDialogueActive = false
        this.dialogueBox.classList.remove('visible')
        this.dialogueBox.classList.add('hidden')
        
        // Delay display:none to allow CSS opacity transition
        setTimeout(() => {
            if (!this.isDialogueActive) {
                this.dialogueBox.style.display = 'none'
            }
        }, 300)

        this.currentDialogueId = null
        this.currentMessageIndex = 0
        this.scriptQueue = []

        // Dispatch custom event for dialogue closed
        window.dispatchEvent(new CustomEvent('dialogueClosed'))
        this.trigger('end')
    }

    /**
     * Check if a dialogue is currently active
     */
    isActive() {
        return this.isDialogueActive
    }

    /**
     * Get current dialogue ID
     */
    getCurrentDialogueId() {
        return this.currentDialogueId
    }
}