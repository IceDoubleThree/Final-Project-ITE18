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

    // UI Elements
    this.ui = {
        container: document.getElementById('game-ui'),
        hpFill: document.getElementById('hud-hp-fill'),
        hpText: document.getElementById('hud-hp-text'),
        atk: document.getElementById('hud-stat-atk'),
        def: document.getElementById('hud-stat-def'),
    }
  }

  start(options = {}) {
    const startLevelKey = options.startLevelKey ?? "Academy";

    this.active = true;
    this.elapsedMs = 0;
    this.kills = 0;

    this.ensureTimerUI();
    if (this.ui.container) this.ui.container.style.display = 'block';

    this.setLevelOrderFromWorld();
    this.setLevel(startLevelKey);

    const player = this.experience?.world?.player;
    if (player?.resetStatsForNewGame) player.resetStatsForNewGame();
  }

  game_end(state) {
    console.log(`Game Ended. State: ${state}`);
    
    // Log stats before stopping
    const timeStr = this.formatElapsed(this.elapsedMs);
    console.log(`console: gamestats: time: ${timeStr}`);

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

    if (this.timerEl && this.timerEl.parentElement) {
      this.timerEl.parentElement.removeChild(this.timerEl);
    }
    this.timerEl = null;

    if (this.ui.container) this.ui.container.style.display = 'none';
  }

  update(deltaMs) {
    if (!this.active) return;

    const d = Number.isFinite(deltaMs) ? deltaMs : 0;
    this.elapsedMs += Math.max(0, d);

    if (this.timerEl) this.timerEl.textContent = this.formatElapsed(this.elapsedMs);

    this.updateHUD();
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
    this.currentLevelKey = locationKey;

    const idx = this.levelOrder.indexOf(locationKey);
    if (idx >= 0) {
      this.currentLevelNumber = idx + 1;
      return;
    }

    // If a new location appears that isn't in the initial order, append it.
    this.levelOrder.push(locationKey);
    this.currentLevelNumber = this.levelOrder.length;
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
