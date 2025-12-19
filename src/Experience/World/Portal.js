import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Portal {
    constructor(world, position, destinationKey, name = "Next Stage", color = 0xffff00) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.world = world
        this.input = this.experience.input

        this.position = position
        this.destinationKey = destinationKey
        this.name = name
        this.color = color 

        this.interactionDistance = 2.0
        this.isPlayerClose = false
        this.isActive = true 

        // Debug Log
        console.log(`🚧 Creating Portal "${name}" at`, this.position)

        this.setMesh()
        this.createPromptElement()

        this.onInteract = this.handleInteract.bind(this)
        this.input.on('interact', this.onInteract)
    }

    setMesh() {
        // CHANGED: Use BoxGeometry for thickness (easier to see)
        const geometry = new THREE.BoxGeometry(1.5, 2.5, 0.2)
        
        // CHANGED: Solid material (no transparency) for debug visibility
        const material = new THREE.MeshStandardMaterial({ 
            color: this.color,
            emissive: this.color,
            emissiveIntensity: 0.5,
            roughness: 0.1,
            metalness: 0.1
        })

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.position.copy(this.position)
        this.mesh.position.y += 1.25 // Center vertical
        
        // Ensure it's added to the scene
        this.scene.add(this.mesh)
    }

    createPromptElement() {
        this.prompt = document.createElement('div')
        this.prompt.classList.add('interact-prompt')
        this.prompt.innerHTML = `
            <span class="key-icon">F</span>
            <span>Enter ${this.name}</span>
        `
        document.body.appendChild(this.prompt)
    }

    handleInteract() {
        if (this.isPlayerClose && this.isActive) {
            console.log(`🚪 Teleporting to ${this.destinationKey}`)
            this.isActive = false
            this.world.loadLocation(this.destinationKey)
        }
    }

    update() {
        if (!this.world.player || !this.world.player.mesh) return

        const playerPos = this.world.player.mesh.position
        const portalPos = this.mesh.position

        // Simple distance check
        const distance = Math.sqrt(
            Math.pow(playerPos.x - portalPos.x, 2) +
            Math.pow(playerPos.z - portalPos.z, 2)
        )

        if (distance < this.interactionDistance) {
            this.isPlayerClose = true
            this.prompt.classList.add('visible')
            
            // Pulse effect
            const pulse = 0.5 + Math.sin(Date.now() * 0.005) * 0.2
            this.mesh.material.emissiveIntensity = pulse
        } else {
            this.isPlayerClose = false
            this.prompt.classList.remove('visible')
            this.mesh.material.emissiveIntensity = 0.5
        }
    }

    destroy() {
        if (this.prompt) {
            this.prompt.remove()
        }

        this.scene.remove(this.mesh)
        this.mesh.geometry.dispose()
        this.mesh.material.dispose()

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