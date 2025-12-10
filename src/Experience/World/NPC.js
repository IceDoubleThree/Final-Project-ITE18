import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Experience from '../Experience.js'

export default class NPC {
    constructor(world, position, color, name, dialogueId) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.world = world
        this.physicsWorld = this.world.physicsWorld
        this.materials = this.world.materials.materials
        this.input = this.experience.input
        this.dialogue = this.experience.dialogue

        this.initialPosition = position
        this.color = color
        this.name = name
        this.dialogueId = dialogueId

        this.interactionDistance = 2.5
        this.isPlayerClose = false

        this.setMesh()
        this.setPhysics()
        this.createPromptElement()

        // --- DEBUG: Listen for Interaction ---
        this.input.on('interact', () => {
            // Log interaction attempt
            if (this.isPlayerClose) {
                console.log(`[NPC ${this.name}] 'F' key pressed.`)

                if (this.dialogue.isActive()) {
                    console.warn(`[NPC ${this.name}] Cannot talk: Dialogue system is BUSY. (Did you finish the tutorial text?)`)
                } else {
                    console.log(`[NPC ${this.name}] Triggering dialogue: ${this.dialogueId}`)
                    this.triggerDialogue()
                }
            }
        })
    }

    setMesh() {
        const geometry = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8)
        const material = new THREE.MeshStandardMaterial({ color: this.color })

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.castShadow = true
        this.mesh.position.copy(this.initialPosition)
        this.mesh.position.y += 0.8
        this.scene.add(this.mesh)
    }

    setPhysics() {
        const shape = new CANNON.Cylinder(0.3, 0.3, 1.6, 8)
        this.body = new CANNON.Body({
            mass: 0,
            material: this.materials.default,
            shape: shape
        })
        this.body.position.copy(this.initialPosition)
        this.body.position.y += 0.8
        this.physicsWorld.addBody(this.body)
    }

    createPromptElement() {
        this.prompt = document.createElement('div')
        this.prompt.classList.add('interact-prompt')
        this.prompt.innerHTML = `
            <span class="key-icon">F</span>
            <span>Talk to ${this.name}</span>
        `
        document.body.appendChild(this.prompt)
    }

    triggerDialogue() {
        this.dialogue.read(this.dialogueId)
        this.prompt.classList.remove('visible')
    }

    update() {
        if (!this.world.player || !this.world.player.mesh) return

        const playerPos = this.world.player.mesh.position
        const npcPos = this.mesh.position

        const distance = Math.sqrt(
            Math.pow(playerPos.x - npcPos.x, 2) +
            Math.pow(playerPos.z - npcPos.z, 2)
        )

        if (distance < this.interactionDistance) {
            this.isPlayerClose = true

            // Only show prompt if dialogue isn't currently open
            if (!this.dialogue.isActive()) {
                this.prompt.classList.add('visible')
            } else {
                this.prompt.classList.remove('visible')
            }

            this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z)
        } else {
            this.isPlayerClose = false
            this.prompt.classList.remove('visible')
        }
    }
}