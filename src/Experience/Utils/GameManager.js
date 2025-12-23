export default class GameManager {
  constructor(experience) {
    this.experience = experience;

    this.active = false;

    this.elapsedMs = 0;
    this.timerEl = null;

    this.levelOrder = [];
    this.currentLevelKey = null;
    this.currentLevelNumber = 0;

    this.kills = 0;

    // Progression / level conditions (extensible)
    // Each level can define its own completion requirements.
    this.levelConditions = {
      Academy: {
        killsRequired: 20,
        isComplete: (gm) => gm.getLevelKills('Academy') >= 20,
      },
    };

    this.levelProgress = {};

    // End-of-run board UI
    this.endBoard = {
      container: document.getElementById('game-end-board'),
      title: document.getElementById('game-end-title'),
      time: document.getElementById('game-end-time'),
      kills: document.getElementById('game-end-kills'),
      _keyHandler: null,
      _clickHandler: null,
      isVisible: false,
    }

    // UI Elements
    this.ui = {
        container: document.getElementById('game-ui'),
        hpFill: document.getElementById('hud-hp-fill'),
        hpText: document.getElementById('hud-hp-text'),
        atk: document.getElementById('hud-stat-atk'),
        def: document.getElementById('hud-stat-def'),
      levelKills: document.getElementById('hud-level-kills'),
    }
  }

  start(options = {}) {
    const startLevelKey = options.startLevelKey ?? "Academy";

    this.active = true;
    this.elapsedMs = 0;
    this.kills = 0;
    this.levelProgress = {};

    this.ensureTimerUI();
    if (this.ui.container) this.ui.container.style.display = 'block';

    this.hideEndBoard();

    this.setLevelOrderFromWorld();
    this.setLevel(startLevelKey);

    const player = this.experience?.world?.player;
    if (player?.resetStatsForNewGame) player.resetStatsForNewGame();
  }

  game_end(state) {
    // Prevent double-end (can happen if multiple enemies hit player same tick)
    if (this.endBoard?.isVisible) return
    if (!this.active && state !== 'premature_end') return

    console.log(`Game Ended. State: ${state}`);
    
    // Log stats before stopping
    const timeStr = this.formatElapsed(this.elapsedMs);
    console.log(`console: gamestats: time: ${timeStr}`);
    console.log(`console: gamestats: enemies_killed: ${this.kills}`);

    // Show end-of-run board before stopping (so it can read the final values)
    this.showEndBoard({ state, timeStr, kills: this.kills });

    this.stop();
    
    // If premature end, we might want to trigger some UI or event
    if (state === 'premature_end') {
        // Logic for quitting mid-game
    }
  }

  stop() {
    this.active = false;
    this.elapsedMs = 0;
    this.currentLevelKey = null;
    this.currentLevelNumber = 0;
    this.kills = 0;

    // Stop enemies from persisting across runs.
    this.experience?.world?.clearEnemies?.();

    if (this.timerEl && this.timerEl.parentElement) {
      this.timerEl.parentElement.removeChild(this.timerEl);
    }
    this.timerEl = null;

    if (this.ui.container) this.ui.container.style.display = 'none';
  }

  showEndBoard({ state, timeStr, kills } = {}) {
    const el = this.endBoard?.container
    if (!el) return

    const s = String(state ?? '')
    const isDead = s === 'dead' || s === 'death'
    if (this.endBoard.title) this.endBoard.title.textContent = isDead ? 'You Died' : 'Run Complete'

    if (this.endBoard.time) this.endBoard.time.textContent = String(timeStr ?? '00:00')
    if (this.endBoard.kills) this.endBoard.kills.textContent = String(Number.isFinite(kills) ? kills : 0)

    el.style.display = 'flex'
    this.endBoard.isVisible = true

    // Click/tap anywhere on the board to return to lobby
    // (same behavior as pressing Enter)
    if (!this.endBoard._clickHandler) {
      this.endBoard._clickHandler = () => {
        if (!this.endBoard.isVisible) return

        this.hideEndBoard()

        // Reset run state and return to lobby (Room)
        if (this.experience) {
          this.experience._runStarted = false

          // Let the target function manage current_env
          if (typeof this.experience.enterLobby === 'function') {
            this.experience.enterLobby('Room')
          } else {
            this.experience.playShortTransition?.()
            setTimeout(() => {
              this.experience.world?.loadLocation?.('Room')
            }, 120)
          }
        }
      }
      el.addEventListener('click', this.endBoard._clickHandler)
      // Optional: allow touchscreens to dismiss without waiting for click synthesis.
      el.addEventListener('touchstart', this.endBoard._clickHandler, { passive: true })
    }

    // Press Enter to return to lobby
    if (!this.endBoard._keyHandler) {
      this.endBoard._keyHandler = (event) => {
        if (!this.endBoard.isVisible) return
        if (event.code !== 'Enter') return

        this.hideEndBoard()

        // Reset run state and return to lobby (Room)
        if (this.experience) {
          this.experience._runStarted = false

          // Let the target function manage current_env
          if (typeof this.experience.enterLobby === 'function') {
            this.experience.enterLobby('Room')
          } else {
            this.experience.playShortTransition?.()
            setTimeout(() => {
              this.experience.world?.loadLocation?.('Room')
            }, 120)
          }
        }
      }
      window.addEventListener('keydown', this.endBoard._keyHandler)
    }
  }

  hideEndBoard() {
    const el = this.endBoard?.container
    if (el) el.style.display = 'none'
    if (this.endBoard) this.endBoard.isVisible = false
  }

  update(deltaMs) {
    if (!this.active) return;

    // Player death -> end run
    const player = this.experience?.world?.player
    if (player && Number.isFinite(player.hp) && player.hp <= 0) {
      this.game_end('dead')
      return
    }

    const d = Number.isFinite(deltaMs) ? deltaMs : 0;
    this.elapsedMs += Math.max(0, d);

    if (this.timerEl) this.timerEl.textContent = this.formatElapsed(this.elapsedMs);

    this.updateHUD();

    // Update current level completion after HUD refresh
    this.updateLevelCompletion();
  }

  updateHUD() {
      const player = this.experience?.world?.player;
      if (!player) return;

      // Update HP
      if (this.ui.hpFill && this.ui.hpText) {
          const hp = Math.max(0, player.hp);
          const maxHp = player.baseHp || 100;
          const pct = Math.min(100, (hp / maxHp) * 100);
          
          this.ui.hpFill.style.width = `${pct}%`;
          this.ui.hpText.textContent = `${Math.ceil(hp)}/${maxHp}`;
      }

      // Update Stats
      if (this.ui.atk) this.ui.atk.textContent = `ATK: ${player.attack}`;
      if (this.ui.def) this.ui.def.textContent = `DEF: ${player.defense}`;

      // Level 1 UI: kills tracker (Academy)
      const levelKey = this.currentLevelKey;
      const cond = this.levelConditions?.[levelKey];
      if (this.ui.levelKills && levelKey === 'Academy' && cond?.killsRequired) {
        const required = cond.killsRequired;
        const levelKills = this.getLevelKills(levelKey);
        this.ui.levelKills.textContent = `Kills: ${Math.min(levelKills, required)}/${required}`;
        this.ui.levelKills.style.display = 'block';
      } else if (this.ui.levelKills) {
        this.ui.levelKills.style.display = 'none';
      }
  }

  // Dev testing: Empty event case for weapon switching
  switchWeapon(slotIndex) {
      // TODO: Implement weapon switching logic
      console.log(`GameManager: Switch to weapon slot ${slotIndex}`);
      
      // Visual update for dev testing
      const slots = document.querySelectorAll('.hud-weapon-slot');
      slots.forEach(s => s.classList.remove('active'));
      
      const target = document.querySelector(`.hud-weapon-slot.slot-${slotIndex}`);
      if (target) target.classList.add('active');
  }

  ensureTimerUI() {
    if (this.timerEl) return;

    const el = document.createElement("div");
    el.id = "game-timer";
    el.style.position = "fixed";
    el.style.top = "10px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "6px 12px";
    el.style.background = "rgba(0, 0, 0, 0.7)";
    el.style.color = "#fff";
    el.style.fontFamily = "monospace";
    el.style.fontSize = "14px";
    el.style.zIndex = "9999";
    el.style.pointerEvents = "none";
    el.textContent = "00:00";

    document.body.appendChild(el);
    this.timerEl = el;
  }

  setLevelOrderFromWorld() {
    const keys = Object.keys(this.experience?.world?.locationConfigs ?? {});

    // Each location is a level, but Academy should be the first level.
    const rest = keys.filter((k) => k !== "Academy");
    this.levelOrder = ["Academy", ...rest];
  }

  setLevel(locationKey) {
    const prevKey = this.currentLevelKey;
    this.currentLevelKey = locationKey;

    // Initialize per-level progress when entering a new level
    if (locationKey && locationKey !== prevKey) {
      this.levelProgress[locationKey] = {
        startKills: this.kills,
        completed: false,
      };
    }

    const idx = this.levelOrder.indexOf(locationKey);
    if (idx >= 0) {
      this.currentLevelNumber = idx + 1;
      return;
    }

    // If a new location appears that isn't in the initial order, append it.
    this.levelOrder.push(locationKey);
    this.currentLevelNumber = this.levelOrder.length;
  }

  getLevelKills(levelKey) {
    const p = this.levelProgress?.[levelKey];
    const start = Number.isFinite(p?.startKills) ? p.startKills : 0;
    return Math.max(0, this.kills - start);
  }

  isLevelComplete(levelKey) {
    return !!this.levelProgress?.[levelKey]?.completed;
  }

  updateLevelCompletion() {
    const key = this.currentLevelKey;
    if (!key) return;
    const cond = this.levelConditions?.[key];
    if (!cond || typeof cond.isComplete !== 'function') return;

    const progress = this.levelProgress?.[key];
    if (!progress) return;
    if (progress.completed) return;

    if (cond.isComplete(this)) {
      progress.completed = true;
    }
  }

  addKill(count = 1) {
    if (!this.active) return;
    const n = Number.isFinite(count) ? count : 0;
    this.kills += Math.max(0, Math.floor(n));
  }

  formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${mm}:${ss}`;
  }
}
