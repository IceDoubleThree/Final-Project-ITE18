export default class DialogueReader {
    constructor() {
        this.dialogueData = null
        this.currentDialogueId = null
        this.currentMessageIndex = 0
        this.isDialogueActive = false
        this.dialogueBox = null
        this.isLoaded = false
        
        this.initializeHTML()
        this.loadDialogueData()
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
        container.className = 'dialogue-container hidden'

        // Create dialogue box
        const box = document.createElement('div')
        box.className = 'dialogue-box'

        // Create character name display
        const characterName = document.createElement('div')
        characterName.className = 'dialogue-character'
        characterName.id = 'dialogue-character'
        characterName.textContent = 'NPC'

        // Create text display
        const textDisplay = document.createElement('div')
        textDisplay.className = 'dialogue-text'
        textDisplay.id = 'dialogue-text'
        textDisplay.textContent = 'Dialogue will appear here...'

        // Create continue indicator (arrow or text)
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
     * Load dialogue data from JSON file
     */
    async loadDialogueData() {
        try {
            const response = await fetch('/dialogue.json')
            if (!response.ok) {
                throw new Error(`Failed to load dialogue data: ${response.statusText}`)
            }
            this.dialogueData = await response.json()
            this.isLoaded = true
            console.log('✅ Dialogue data loaded successfully')
        } catch (error) {
            console.error('❌ Error loading dialogue data:', error)
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
            if (this.isDialogueActive && !event.target.closest('.dialogue-box')) {
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
     * Read and display a dialogue sequence by ID
     * @param {string} dialogueId - The ID of the dialogue to display
     */
    read(dialogueId) {
        // Wait for data to load if not yet loaded
        if (!this.isLoaded) {
            console.warn(`⏳ Waiting for dialogue data to load before displaying "${dialogueId}"`)
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

        // Show the dialogue box
        this.dialogueBox.classList.remove('hidden')
        this.dialogueBox.classList.add('visible')

        // Display the first message
        this.displayMessage()
    }

    /**
     * Display the current message in the sequence
     */
    displayMessage() {
        const dialogue = this.dialogueData.dialogues[this.currentDialogueId]
        const message = dialogue.sequence[this.currentMessageIndex]

        if (!message) {
            this.closeDialogue()
            return
        }

        // Update character name
        const characterElement = document.getElementById('dialogue-character')
        characterElement.textContent = message.speaker

        // Update text display
        const textElement = document.getElementById('dialogue-text')
        textElement.textContent = message.text

        // Show continue indicator if not at the end
        const continueElement = document.getElementById('dialogue-continue')
        if (this.currentMessageIndex < dialogue.sequence.length - 1) {
            continueElement.classList.add('visible')
        } else {
            continueElement.classList.remove('visible')
        }
    }

    /**
     * Move to the next message in the sequence
     */
    nextMessage() {
        const dialogue = this.dialogueData.dialogues[this.currentDialogueId]

        if (this.currentMessageIndex < dialogue.sequence.length - 1) {
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
        this.currentDialogueId = null
        this.currentMessageIndex = 0

        // Dispatch custom event for dialogue closed
        window.dispatchEvent(new CustomEvent('dialogueClosed'))
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
