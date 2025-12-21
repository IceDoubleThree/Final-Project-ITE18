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
  }

  start(options = {}) {
    const startLevelKey = options.startLevelKey ?? "Academy";

    this.active = true;
    this.elapsedMs = 0;
    this.kills = 0;

    this.ensureTimerUI();
    this.setLevelOrderFromWorld();
    this.setLevel(startLevelKey);

    const player = this.experience?.world?.player;
    if (player?.resetStatsForNewGame) player.resetStatsForNewGame();
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
  }

  update(deltaMs) {
    if (!this.active) return;

    const d = Number.isFinite(deltaMs) ? deltaMs : 0;
    this.elapsedMs += Math.max(0, d);

    if (this.timerEl) this.timerEl.textContent = this.formatElapsed(this.elapsedMs);
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
