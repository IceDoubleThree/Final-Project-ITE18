# Academy of Spent Shells

A game where you get to be a anime girl shooting monsters because why not?

### Project Story

Originally, this project was designed as a 3D Visual Novel. However, during early development, we determined that the volume of assets and the complexity of a branching narrative system exceeded our project scope and timeline.

We pivoted to a 3D Third-Person Shooter to better utilize our technical architecture. This shift allowed us to focus on player movement, combat logic, and modular environment building. We retained the original anime aesthetic while focusing the gameplay on level progression and enemy encounters.

### Team Roles & Responsibilities

**Francese Angelou Rabago**

- **Lead Developer & Lead 3D Designer**
- Core project architecture, 3D modeling, and stage design.

**Raymond Jay Mondres**

- **Co-Developer**
- Gameplay logic and stage design.

**Angelo Dompor**

- **Co-Developer**
- Systems implementation and game mechanics.

## Setup

Download [Node.js](https://nodejs.org/en/download/).
Run this followed commands:

```bash
# Install dependencies (only the first time)
npm install

# Run the local server at localhost:8080
npm run dev

# Build for production in the dist/ directory
npm run build
```

### Game Concept

- **One-line:** A level-based 3rd-person shooter with arcade pacing, upgradeable weapons, and short narrative interludes.
- **Core mechanics:** player movement, aiming & shooting, enemy AI waves, weapon pickups/drops, health/ammo management, checkpoints between levels.
- **Features:** Distinct level themes, simple progression/score, HUD with health/ammo, background music + SFX, light dialogue system for story beats.

### Development Stack

- **Engine:** Three.js (WebGL)
- **Build Tool:** Vite / NPM
- **Modeling:** Blender (GLTF exports)
- **Architecture:** Object-Oriented (Managers/Utils pattern)

### Tools & Frameworks

- **3D Loaders:** GLTFLoader + DRACOLoader (DRACO decoder files are included in the `draco/` folder)
- **Rendering & Engine:** three.js (WebGL)
- **Audio:** Project-local `SoundHandler` in `src/Experience/Utils/SoundHandler.js` for SFX/BGM management
- **Build & Dev:** Vite / npm
- **Version Control & Deploy:** git, GitHub; deploy via Vercel or GitHub Pages (see Deployment below)

### Changelog

v1.0.1 - demo

Major resource optimizations
- models and textures have been compressed to reduce file size.
