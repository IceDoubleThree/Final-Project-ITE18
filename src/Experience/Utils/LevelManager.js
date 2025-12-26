import EventEmitter from './EventEmitter.js'

export default class LevelManager extends EventEmitter {
    constructor(experience) {
        super()
        this.experience = experience

        // --- LEVEL CONFIGURATION ---
        this.levels = [
            {
                id: 1,
                name: "Academy",
                locationKey: "Academy",
                type: 'timed_survival', // Objective: Survive for time duration
                difficulty: 'easy',
                timeLimit: 600, // 10 minutes (max level time)
                exitTime: 30, // Time to reach exit after objective
                objectiveTarget: 10 // Survive for 2 minutes (120 seconds)
            },
            {
                id: 2,
                name: "PlaceHolder",
                locationKey: "Forest",
                type: 'survival',
                difficulty: 'medium',
                timeLimit: 600, // 10 minutes
                exitTime: 30,
                objectiveTarget: 25 // Kill 25 enemies
            },
            {
                id: 3,
                name: "PlaceHolder 2",
                locationKey: "Store",
                type: 'collection', // Objective: Find items
                difficulty: 'hard',
                timeLimit: 300, // 5 minutes
                exitTime: 30,
                objectiveTarget: 5 // Find 5 items
            },
            {
                id: 4,
                name: "Boss Battle",
                locationKey: "StageDesign",
                type: 'boss',
                difficulty: 'nightmare',
                timeLimit: 999,
                exitTime: 0, // Ends immediately on kill
                objectiveTarget: 1
            }
        ]

        this.currentLevelIndex = 0
        this.currentProgress = 0 // Deprecated - use statistics tracker instead

        // Statistics tracker reference (set by GameManager)
        this.statistics = null

        // State
        this.isActive = false
        this.isExitPhase = false // True when objective is done, running to exit
        this.timeLeft = 0 // Level time limit (game over if reaches 0)
        this.objectiveTimeLeft = 0 // Time remaining for objective completion (for timed objectives)

        // UI Elements (will be queried when needed if not found initially)
        this.uiTimer = document.getElementById('hud-timer')
        this.uiObjective = document.getElementById('hud-objective')
        this.uiLevelName = document.getElementById('hud-level-name')
        this.uiLevelKills = document.getElementById('hud-level-kills') // For kill/objective display

        // Overlay for level complete
        this.levelCompleteOverlay = {
            container: document.getElementById('level-complete-overlay'),
            text: document.getElementById('level-complete-text'),
            _hideTimeout: null,
            _cleanupTimeout: null,
            isVisible: false,
        }
    }

    ensureLevelCompleteOverlayUI() {
        if (this.levelCompleteOverlay?.container) return

        const container = document.createElement('div')
        container.id = 'level-complete-overlay'
        container.className = 'level-complete-overlay'
        container.style.display = 'none'

        const text = document.createElement('div')
        text.id = 'level-complete-text'
        text.className = 'level-complete-text'
        text.textContent = 'Level Complete'
        container.appendChild(text)

        document.body.appendChild(container)

        this.levelCompleteOverlay = this.levelCompleteOverlay || {}
        this.levelCompleteOverlay.container = container
        this.levelCompleteOverlay.text = text
        this.levelCompleteOverlay.isVisible = false
    }

    showLevelCompleteOverlay(message = 'Level Complete') {
        this.ensureLevelCompleteOverlayUI()

        const el = this.levelCompleteOverlay?.container
        if (!el) return

        if (this.levelCompleteOverlay._hideTimeout) {
            clearTimeout(this.levelCompleteOverlay._hideTimeout)
            this.levelCompleteOverlay._hideTimeout = null
        }
        if (this.levelCompleteOverlay._cleanupTimeout) {
            clearTimeout(this.levelCompleteOverlay._cleanupTimeout)
            this.levelCompleteOverlay._cleanupTimeout = null
        }

        if (this.levelCompleteOverlay.text) {
            this.levelCompleteOverlay.text.textContent = String(message)
        }

        el.style.display = 'flex'
        el.classList.remove('visible')
        this.levelCompleteOverlay.isVisible = true

        requestAnimationFrame(() => {
            el.classList.add('visible')
        })

        this.levelCompleteOverlay._hideTimeout = setTimeout(() => {
            el.classList.remove('visible')
            this.levelCompleteOverlay._cleanupTimeout = setTimeout(() => {
                if (!this.levelCompleteOverlay?.container) return
                this.levelCompleteOverlay.container.style.display = 'none'
                this.levelCompleteOverlay.isVisible = false
            }, 650)
        }, 3000)
    }

    hideLevelCompleteOverlay() {
        const el = this.levelCompleteOverlay?.container
        if (!el) return

        if (this.levelCompleteOverlay._hideTimeout) {
            clearTimeout(this.levelCompleteOverlay._hideTimeout)
            this.levelCompleteOverlay._hideTimeout = null
        }
        if (this.levelCompleteOverlay._cleanupTimeout) {
            clearTimeout(this.levelCompleteOverlay._cleanupTimeout)
            this.levelCompleteOverlay._cleanupTimeout = null
        }

        el.classList.remove('visible')
        el.style.display = 'none'
        this.levelCompleteOverlay.isVisible = false
    }

    startLevel(index) {
        if (index >= this.levels.length) {
            console.log('🎉 ALL LEVELS COMPLETED!')
            this.trigger('gameComplete')
            return
        }

        this.currentLevelIndex = index
        const levelData = this.levels[index]

        // Initialize per-level statistics if not exists
        if (this.statistics) {
            if (!this.statistics.perLevel[index]) {
                this.statistics.perLevel[index] = {
                    kills: 0,
                    items: 0,
                    completed: false,
                }
            } else {
                // Reset stats for level restart
                this.statistics.perLevel[index].kills = 0
                this.statistics.perLevel[index].items = 0
                this.statistics.perLevel[index].completed = false
            }
        }

        // Reset State
        this.currentProgress = 0 // Keep for backward compatibility
        this.isExitPhase = false
        this.isActive = true
        this.timeLeft = levelData.timeLimit

        // Initialize objective time for timed objectives
        if (levelData.type === 'timed_survival') {
            this.objectiveTimeLeft = levelData.objectiveTarget // Time in seconds
        } else {
            this.objectiveTimeLeft = 0
        }

        // Update UI
        this.updateUI()

        console.log(`🚀 Starting Level ${levelData.id}: ${levelData.name}`)

        // Notify World/Spawner to set up difficulty and enemies
        this.trigger('levelStart', levelData)

        // Special triggers
        if (levelData.type === 'collection') {
            // Tell World to spawn collectable items
            this.trigger('spawnItems', levelData.objectiveTarget)
        } else if (levelData.type === 'boss') {
            this.trigger('spawnBoss')
        }
    }

    stop() {
        this.isActive = false
        this.currentProgress = 0
    }

    update(deltaTimeMs) {
        if (!this.isActive) return

        // Convert ms to seconds
        const dtSeconds = deltaTimeMs / 1000
        this.timeLeft -= dtSeconds

        // Track objective time for timed_survival levels
        const level = this.levels[this.currentLevelIndex]
        if (level && level.type === 'timed_survival' && this.objectiveTimeLeft > 0) {
            this.objectiveTimeLeft -= dtSeconds
            if (this.objectiveTimeLeft <= 0) {
                this.objectiveTimeLeft = 0
                this.checkObjective() // Check if objective is complete
            }
        }

        if (this.timeLeft <= 0) {
            this.trigger('gameOver', 'Time Run Out!')
            this.isActive = false
        }

        this.updateUI()
    }

    // --- EVENTS FROM PLAYER ---

    onEnemyKilled(isBoss = false) {
        if (!this.isActive || this.isExitPhase) return

        const level = this.levels[this.currentLevelIndex]
        const levelIndex = this.currentLevelIndex

        console.log(`✅ Enemy Kill Registered: ${isBoss ? 'BOSS' : 'Enemy'} | Level: ${level.name} (${levelIndex}) | Type: ${level.type}`)

        if (level.type === 'survival') {
            // Update statistics tracker
            if (this.statistics) {
                if (!this.statistics.perLevel[levelIndex]) {
                    this.statistics.perLevel[levelIndex] = { kills: 0, items: 0, completed: false }
                }
                this.statistics.perLevel[levelIndex].kills++
                this.statistics.total.kills++
                console.log(`📊 Stats updated: Level ${levelIndex} kills=${this.statistics.perLevel[levelIndex].kills}, Total kills=${this.statistics.total.kills}`)
            } else {
                console.warn('⚠️ Statistics tracker not available!')
            }

            // Keep currentProgress for backward compatibility
            this.currentProgress++
            this.updateUI() // Update UI immediately
            this.checkObjective()
        } else if (level.type === 'timed_survival') {
            // For timed survival, kills are tracked but don't affect objective
            // Update statistics tracker
            if (this.statistics) {
                if (!this.statistics.perLevel[levelIndex]) {
                    this.statistics.perLevel[levelIndex] = { kills: 0, items: 0, completed: false }
                }
                this.statistics.perLevel[levelIndex].kills++
                this.statistics.total.kills++
                console.log(`📊 Stats updated: Level ${levelIndex} kills=${this.statistics.perLevel[levelIndex].kills}, Total kills=${this.statistics.total.kills}`)
            }
            // Keep currentProgress for backward compatibility
            this.currentProgress++
            this.updateUI() // Update UI immediately
            // Don't check objective - it's time-based, checked in update()
        } else if (level.type === 'boss' && isBoss) {
            // Update statistics for boss kill
            if (this.statistics) {
                if (!this.statistics.perLevel[levelIndex]) {
                    this.statistics.perLevel[levelIndex] = { kills: 0, items: 0, completed: false }
                }
                this.statistics.perLevel[levelIndex].kills++
                this.statistics.total.kills++
                console.log(`📊 Boss Kill Stats: Level ${levelIndex} kills=${this.statistics.perLevel[levelIndex].kills}, Total kills=${this.statistics.total.kills}`)
            }
            this.victory()
        }
    }

    onItemCollected() {
        if (!this.isActive || this.isExitPhase) return

        const level = this.levels[this.currentLevelIndex]
        const levelIndex = this.currentLevelIndex

        if (level.type === 'collection') {
            // Update statistics tracker
            if (this.statistics) {
                if (!this.statistics.perLevel[levelIndex]) {
                    this.statistics.perLevel[levelIndex] = { kills: 0, items: 0, completed: false }
                }
                this.statistics.perLevel[levelIndex].items++
                this.statistics.total.items++
                console.log(`📊 Stats updated: Level ${levelIndex} items=${this.statistics.perLevel[levelIndex].items}, Total items=${this.statistics.total.items}`)
            } else {
                console.warn('⚠️ Statistics tracker not available!')
            }

            // Keep currentProgress for backward compatibility
            this.currentProgress++
            this.updateUI() // Update UI immediately
            this.checkObjective()
        }
    }

    onExitReached() {
        // Only trigger if we are actually looking for the exit
        if (this.isExitPhase) {
            this.victory()
        }
    }

    // --- STATISTICS HELPERS ---

    /**
     * Get current level progress from statistics tracker
     * @returns {number} Current progress for the active level
     */
    getCurrentProgress() {
        if (!this.isActive) return 0

        const level = this.levels[this.currentLevelIndex]
        const levelIndex = this.currentLevelIndex

        // For timed_survival, return time elapsed (objectiveTarget - timeLeft)
        if (level.type === 'timed_survival') {
            const elapsed = level.objectiveTarget - this.objectiveTimeLeft
            return Math.max(0, Math.floor(elapsed))
        }

        // Use statistics tracker as source of truth for other types
        if (this.statistics) {
            // Ensure per-level stats exist
            if (!this.statistics.perLevel[levelIndex]) {
                this.statistics.perLevel[levelIndex] = { kills: 0, items: 0, completed: false }
            }

            if (level.type === 'survival' || level.type === 'boss') {
                return this.statistics.perLevel[levelIndex].kills || 0
            } else if (level.type === 'collection') {
                return this.statistics.perLevel[levelIndex].items || 0
            }
        }

        // Fallback to currentProgress
        return this.currentProgress
    }

    /**
     * Get per-level statistics
     * @param {number} levelIndex - Level index (optional, defaults to current level)
     * @returns {object|null} Per-level stats or null if not found
     */
    getLevelStats(levelIndex = null) {
        const index = levelIndex !== null ? levelIndex : this.currentLevelIndex
        if (this.statistics && this.statistics.perLevel[index]) {
            return this.statistics.perLevel[index]
        }
        return null
    }

    /**
     * Get total statistics
     * @returns {object} Total statistics object
     */
    getTotalStats() {
        return this.statistics ? this.statistics.total : { kills: 0, items: 0, levelsCompleted: 0 }
    }

    // --- LOGIC ---

    checkObjective() {
        const level = this.levels[this.currentLevelIndex]
        let objectiveComplete = false

        // Check objective based on level type
        if (level.type === 'timed_survival') {
            // Objective complete when time runs out (survived the duration)
            objectiveComplete = this.objectiveTimeLeft <= 0
            if (objectiveComplete) {
                console.log(`✅ Objective Complete! Survived ${level.objectiveTarget} seconds! Find the Exit!`)
            }
        } else {
            // Use statistics tracker as source of truth for kill/item objectives
            const progress = this.getCurrentProgress()
            objectiveComplete = progress >= level.objectiveTarget
            if (objectiveComplete) {
                console.log("✅ Objective Complete! Find the Exit!")
            }
        }

        if (objectiveComplete) {
            this.trigger('objectiveComplete') // World should enable the Exit Zone mesh
            this.isExitPhase = true
            this.timeLeft = level.exitTime // Set timer to 30 seconds

            // Show objective complete overlay
            const levelName = level.name || 'Level'
            let message = 'Objective Complete!'
            if (level.type === 'timed_survival') {
                message = `Survived ${Math.floor(level.objectiveTarget / 60)}:${String(Math.floor(level.objectiveTarget % 60)).padStart(2, '0')}!`
            } else if (level.type === 'survival') {
                message = `Defeated ${level.objectiveTarget} Enemies!`
            } else if (level.type === 'collection') {
                message = `Collected ${level.objectiveTarget} Items!`
            }
            this.showLevelCompleteOverlay(message)

            // Update UI immediately to reflect exit phase
            this.updateUI()
            if (this.uiObjective) {
                this.uiObjective.style.color = '#ff0000'
                this.uiObjective.classList.add('pulse')
            }
            if (this.uiLevelKills) {
                this.uiLevelKills.style.display = 'none'
            }
        }
    }

    victory() {
        this.isActive = false

        // Mark level as completed in statistics
        const levelIndex = this.currentLevelIndex
        if (this.statistics && this.statistics.perLevel[levelIndex]) {
            this.statistics.perLevel[levelIndex].completed = true
        }

        console.log("🏆 Level Cleared!")
        this.trigger('levelComplete') // Show victory screen or fade out
        this.showLevelCompleteOverlay('Level Complete!')
        // Wait 3 seconds, then start next level
        setTimeout(() => {
            this.hideLevelCompleteOverlay()
            this.startLevel(this.currentLevelIndex + 1)
        }, 3000)
    }

    updateUI() {
        if (!this.isActive) {
            // Don't update timer UI when level is not active (e.g., level complete)
            return
        }

        const level = this.levels[this.currentLevelIndex]

        // Get progress from statistics tracker (source of truth)
        const progress = this.getCurrentProgress()

        // Timer Format MM:SS
        const minutes = Math.floor(this.timeLeft / 60)
        const seconds = Math.floor(this.timeLeft % 60)
        const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`

        // Re-query UI elements if they're null (in case DOM wasn't ready when constructor ran)
        // Use GameManager's timer for display
        const gm = this.experience?.gameManager;
        const uiLevelName = this.uiLevelName || document.getElementById('hud-level-name');
        const uiObjective = this.uiObjective || document.getElementById('hud-objective');
        const uiLevelKills = this.uiLevelKills || document.getElementById('hud-level-kills');
        // Remove per-level timer UI update

        if (uiLevelName) {
            uiLevelName.textContent = level.name
            this.uiLevelName = uiLevelName // Cache it
        }

        if (uiObjective) {
            if (this.isExitPhase) {
                uiObjective.textContent = "ESCAPE! RUN TO EXIT!"
            } else {
                uiObjective.style.color = '#ffffff'
                uiObjective.classList.remove('pulse')
                if (level.type === 'boss') {
                    uiObjective.textContent = "Defeat the Boss"
                } else if (level.type === 'timed_survival') {
                    // Format time as MM:SS
                    const minutes = Math.floor(this.objectiveTimeLeft / 60)
                    const seconds = Math.floor(this.objectiveTimeLeft % 60)
                    const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
                    uiObjective.textContent = `Survive: ${timeString}`
                } else if (level.type === 'collection') {
                    uiObjective.textContent = `Collect Items: ${progress} / ${level.objectiveTarget}`
                } else {
                    uiObjective.textContent = `Defeat Enemies: ${progress} / ${level.objectiveTarget}`
                }
            }
            this.uiObjective = uiObjective // Cache it
        }

        // Level-specific HUD (kills/objective) - this element exists in HTML
        if (uiLevelKills) {
            if (level.type === 'survival') {
                uiLevelKills.textContent = `Kills: ${progress} / ${level.objectiveTarget}`
                uiLevelKills.style.display = 'block'
            } else if (level.type === 'timed_survival') {
                // Show time remaining for timed survival
                const minutes = Math.floor(this.objectiveTimeLeft / 60)
                const seconds = Math.floor(this.objectiveTimeLeft % 60)
                const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
                uiLevelKills.textContent = `Time: ${timeString} / ${Math.floor(level.objectiveTarget / 60)}:${String(Math.floor(level.objectiveTarget % 60)).padStart(2, '0')}`
                uiLevelKills.style.display = 'block'
            } else if (level.type === 'collection') {
                uiLevelKills.textContent = `Items: ${progress} / ${level.objectiveTarget}`
                uiLevelKills.style.display = 'block'
            } else {
                uiLevelKills.style.display = 'none'
            }
            this.uiLevelKills = uiLevelKills // Cache it
        }
    }
}