export default class GameManager {
  constructor(experience) {
    this.experience = experience;

    this.active = false;

    this.elapsedMs = 0;
    this.timerEl = null;
    this.timerPaused = false;

    this.levelOrder = [];
    this.currentLevelKey = null;
    this.currentLevelNumber = 0;

    this.kills = 0;

    // --- LEVEL CONDITIONS ---
    this.levelConditions = {
      Academy: {
        // Survival Mode: 2 Minutes (120,000 ms)
        timeTargetMs: 120000, 
        isComplete: (gm) => gm.elapsedMs >= 120000,
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

    // Level completion overlay UI
    this.levelCompleteOverlay = {
      container: document.getElementById('level-complete-overlay'),
      text: document.getElementById('level-complete-text'),
      _hideTimeout: null,
      _cleanupTimeout: null,
      isVisible: false,
    }

    // UI Elements
    this.ui = {
        container: document.getElementById('game-ui'),
        hpFill: document.getElementById('hud-hp-fill'),
        hpText: document.getElementById('hud-hp-text'),
        atk: document.getElementById('hud-stat-atk'),
        def: document.getElementById('hud-stat-def'),
        levelKills: document.getElementById('hud-level-kills'), // Will act as generic objective text
    }
  }

  start(options = {}) {
    const startLevelKey = options.startLevelKey ?? "Academy";

    this.active = true;
    this.elapsedMs = 0;
    this.timerPaused = false;
    this.kills = 0;
    this.levelProgress = {};

    this.ensureTimerUI();
    if (this.ui.container) this.ui.container.style.display = 'block';

    this.hideEndBoard();
    this.hideLevelCompleteOverlay();

    this.setLevelOrderFromWorld();
    this.setLevel(startLevelKey);

    const player = this.experience?.world?.player;
    if (player?.resetStatsForNewGame) player.resetStatsForNewGame();
  }

  game_end(state) {
    if (this.endBoard?.isVisible) return
    if (!this.active && state !== 'premature_end') return

    console.log(`Game Ended. State: ${state}`);
    
    const timeStr = this.formatElapsed(this.elapsedMs);
    
    this.showEndBoard({ state, timeStr, kills: this.kills });
    this.stop();
  }

  stop() {
    this.active = false;
    this.elapsedMs = 0;
    this.timerPaused = false;
    this.currentLevelKey = null;
    this.currentLevelNumber = 0;
    this.kills = 0;

    this.experience?.world?.clearEnemies?.();

    if (this.timerEl && this.timerEl.parentElement) {
      this.timerEl.parentElement.removeChild(this.timerEl);
    }
    this.timerEl = null;

    if (this.ui.container) this.ui.container.style.display = 'none';

    this.hideLevelCompleteOverlay();
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

    if (!this.endBoard._clickHandler) {
      this.endBoard._clickHandler = () => {
        if (!this.endBoard.isVisible) return
        this.hideEndBoard()
        if (this.experience) {
          this.experience._runStarted = false
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
      el.addEventListener('touchstart', this.endBoard._clickHandler, { passive: true })
    }

    if (!this.endBoard._keyHandler) {
      this.endBoard._keyHandler = (event) => {
        if (!this.endBoard.isVisible) return
        if (event.code !== 'Enter') return
        this.hideEndBoard()
        if (this.experience) {
          this.experience._runStarted = false
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

    const player = this.experience?.world?.player
    if (player && Number.isFinite(player.hp) && player.hp <= 0) {
      this.game_end('dead')
      return
    }

    const d = Number.isFinite(deltaMs) ? deltaMs : 0;
    if (!this.timerPaused) {
      this.elapsedMs += Math.max(0, d);
    }

    if (this.timerEl) this.timerEl.textContent = this.formatElapsed(this.elapsedMs);

    this.updateHUD();
    this.updateLevelCompletion();
  }

  updateHUD() {
      const player = this.experience?.world?.player;
      if (!player) return;

      // HP
      if (this.ui.hpFill && this.ui.hpText) {
          const hp = Math.max(0, player.hp);
          const maxHp = player.baseHp || 100;
          const pct = Math.min(100, (hp / maxHp) * 100);
          this.ui.hpFill.style.width = `${pct}%`;
          this.ui.hpText.textContent = `${Math.ceil(hp)}/${maxHp}`;
      }

      // Stats
      if (this.ui.atk) this.ui.atk.textContent = `ATK: ${player.attack}`;
      if (this.ui.def) this.ui.def.textContent = `DEF: ${player.defense}`;

      // Level Objective (Time or Kills)
      const levelKey = this.currentLevelKey;
      const cond = this.levelConditions?.[levelKey];
      
      if (this.ui.levelKills) {
          if (levelKey === 'Academy' && cond?.timeTargetMs) {
              const timeLeftMs = Math.max(0, cond.timeTargetMs - this.elapsedMs);
              const sec = Math.floor(timeLeftMs / 1000);
              const min = Math.floor(sec / 60);
              const s = sec % 60;
              this.ui.levelKills.textContent = `Survive: ${min}:${s.toString().padStart(2, '0')}`;
              this.ui.levelKills.style.display = 'block';
          } 
          else if (cond?.killsRequired) {
              const required = cond.killsRequired;
              const levelKills = this.getLevelKills(levelKey);
              this.ui.levelKills.textContent = `Kills: ${Math.min(levelKills, required)}/${required}`;
              this.ui.levelKills.style.display = 'block';
          } 
          else {
              this.ui.levelKills.style.display = 'none';
          }
      }
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
    const rest = keys.filter((k) => k !== "Academy");
    this.levelOrder = ["Academy", ...rest];
  }

  setLevel(locationKey) {
    const prevKey = this.currentLevelKey;
    this.currentLevelKey = locationKey;

    if (locationKey && locationKey !== prevKey) {
      this.timerPaused = false;
    }

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
      this.timerPaused = true;
      if (!progress._shownCompleteOverlay) {
        progress._shownCompleteOverlay = true;
        this.showLevelCompleteOverlay('Surived!')
      }
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