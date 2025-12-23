import EventEmitter from './EventEmitter.js'
import Experience from '../Experience.js'

export default class LevelManager extends EventEmitter {
    constructor() {
        super()
        this.experience = new Experience()
        
        // --- LEVEL CONFIGURATION ---
        this.levels = [
            {
                id: 1,
                name: "Outskirts (Easy)",
                type: 'survival', // Objective: Kill enemies
                difficulty: 'easy',
                timeLimit: 600, // 10 minutes
                exitTime: 30, // Time to reach exit after objective
                objectiveTarget: 15 // Kill 15 enemies
            },
            {
                id: 2,
                name: "The City (Medium)",
                type: 'survival',
                difficulty: 'medium',
                timeLimit: 600, // 10 minutes
                exitTime: 30,
                objectiveTarget: 25 // Kill 25 enemies
            },
            {
                id: 3,
                name: "Lab Scavenge (Hard)",
                type: 'collection', // Objective: Find items
                difficulty: 'hard',
                timeLimit: 300, // 5 minutes
                exitTime: 30,
                objectiveTarget: 5 // Find 5 items
            },
            {
                id: 4,
                name: "Boss Battle",
                type: 'boss',
                difficulty: 'nightmare',
                timeLimit: 999,
                exitTime: 0, // Ends immediately on kill
                objectiveTarget: 1
            }
        ]

        this.currentLevelIndex = 0
        this.currentProgress = 0
        
        // State
        this.isActive = false
        this.isExitPhase = false // True when objective is done, running to exit
        this.timeLeft = 0
        
        // UI Elements
        this.uiTimer = document.getElementById('hud-timer')
        this.uiObjective = document.getElementById('hud-objective')
        this.uiLevelName = document.getElementById('hud-level-name')
    }

    startLevel(index) {
        if (index >= this.levels.length) {
            console.log('🎉 ALL LEVELS COMPLETED!')
            this.trigger('gameComplete')
            return
        }

        this.currentLevelIndex = index
        const levelData = this.levels[index]
        
        // Reset State
        this.currentProgress = 0
        this.isExitPhase = false
        this.isActive = true
        this.timeLeft = levelData.timeLimit

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

        if (level.type === 'survival') {
            this.currentProgress++
            this.checkObjective()
        } else if (level.type === 'boss' && isBoss) {
            this.victory()
        }
    }

    onItemCollected() {
        if (!this.isActive || this.isExitPhase) return

        const level = this.levels[this.currentLevelIndex]

        if (level.type === 'collection') {
            this.currentProgress++
            this.checkObjective()
        }
    }

    onExitReached() {
        // Only trigger if we are actually looking for the exit
        if (this.isExitPhase) {
            this.victory()
        }
    }

    // --- LOGIC ---

    checkObjective() {
        const level = this.levels[this.currentLevelIndex]
        
        if (this.currentProgress >= level.objectiveTarget) {
            console.log("✅ Objective Complete! Find the Exit!")
            this.trigger('objectiveComplete') // World should enable the Exit Zone mesh
            
            this.isExitPhase = true
            this.timeLeft = level.exitTime // Set timer to 30 seconds
            
            if(this.uiObjective) {
                this.uiObjective.style.color = '#ff0000'
                this.uiObjective.classList.add('pulse') // Assuming you have css for pulse
            }
        }
    }

    victory() {
        this.isActive = false
        console.log("🏆 Level Cleared!")
        this.trigger('levelComplete') // Show victory screen or fade out

        // Wait 3 seconds, then start next level
        setTimeout(() => {
            this.startLevel(this.currentLevelIndex + 1)
        }, 3000)
    }

    updateUI() {
        const level = this.levels[this.currentLevelIndex]
        
        // Timer Format MM:SS
        const minutes = Math.floor(this.timeLeft / 60)
        const seconds = Math.floor(this.timeLeft % 60)
        const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`

        if(this.uiTimer) this.uiTimer.textContent = timeString
        if(this.uiLevelName) this.uiLevelName.textContent = level.name
        
        if (this.uiObjective) {
            if (this.isExitPhase) {
                this.uiObjective.textContent = "ESCAPE! RUN TO EXIT!"
            } else {
                this.uiObjective.style.color = '#ffffff'
                this.uiObjective.classList.remove('pulse')
                if(level.type === 'boss') {
                    this.uiObjective.textContent = "Defeat the Boss"
                } else if (level.type === 'collection') {
                    this.uiObjective.textContent = `Collect Items: ${this.currentProgress} / ${level.objectiveTarget}`
                } else {
                    this.uiObjective.textContent = `Defeat Enemies: ${this.currentProgress} / ${level.objectiveTarget}`
                }
            }
        }
    }
}