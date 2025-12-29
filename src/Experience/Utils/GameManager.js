import LevelManager from './LevelManager.js';

export default class GameManager {
  constructor(experience) {
    this.experience = experience;
    this.active = false;
    this.total_game_time = 0; // Total game time in milliseconds
    this.timerEl = null;
    this.timerPaused = false;
    this.timerFrozen = false; // Prevents UI updates when true

    // Statistics Tracker - Source of Truth for all statistics
    this.statistics = {
      // Total statistics across entire run
      total: {
        kills: 0,
        items: 0,
        levelsCompleted: 0,
        total_game_time: 0, // Total game time in milliseconds
      },
      // Per-level statistics (indexed by level index)
      perLevel: {},
    };

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

    // Level completion overlay is handled by LevelManager
    // Removed duplicate overlay management

    // UI Elements (global only)
    this.ui = {
      container: document.getElementById('game-ui'),
      hpFill: document.getElementById('hud-hp-fill'),
      hpText: document.getElementById('hud-hp-text'),
      atk: document.getElementById('hud-stat-atk'),
      def: document.getElementById('hud-stat-def'),
    }

    // LevelManager handles all level logic
    this.levelManager = new LevelManager(this.experience);

    // Pass statistics tracker reference to LevelManager
    this.levelManager.statistics = this.statistics;

    // Track whether we've shown the Road->Academy intro overlay (fallback local flag)
    this._roadIntroShown = false;

    // --- Wire LevelManager signals to World ---
    // Attach handlers regardless of whether World exists yet. Each handler
    // resolves `this.experience.world` at runtime so late World creation
    // (Experience creates GameManager before World) is handled.
    if (this.levelManager) {
      this.levelManager.on('levelStart', (levelData) => {
        // Resume total_game_time when starting a new level
        this.timerPaused = false;
        this.timerFrozen = false;
        console.log('⏱️ Total game time resumed - Level started');
        // (intro is handled on loaderStarted instead)
        const worldNow = this.experience?.world;
        console.log('[GameManager] forward levelStart -> world present?', !!worldNow, 'onLevelStart?', typeof (worldNow && worldNow.onLevelStart));
        if (worldNow && typeof worldNow.onLevelStart === 'function') {
          try { worldNow.onLevelStart(levelData); } catch (e) { console.warn('[GameManager] world.onLevelStart threw', e); }
        }
      });

      // Intro flow: when the dummy visual loader starts, run the intro once, then after 3s play subtitle sequence
      this.levelManager.on('loaderStarted', (levelData) => {
        // Loader start is no longer used to trigger the Road2Academy intro;
        // intro is centrally triggered in GameManager.update() based on
        // the total game timer (2 seconds). This handler is intentionally
        // left empty to avoid duplicate triggers.
      });

      this.levelManager.on('spawnItems', (count) => {
        const worldNow = this.experience?.world;
        if (worldNow && typeof worldNow.onSpawnItems === 'function') worldNow.onSpawnItems(count);
      });

      this.levelManager.on('spawnBoss', () => {
        const worldNow = this.experience?.world;
        if (worldNow && typeof worldNow.onSpawnBoss === 'function') worldNow.onSpawnBoss();
      });

      this.levelManager.on('objectiveComplete', () => {
        // Pause total_game_time when objective is complete (until next level)
        this.timerPaused = true;
        this.timerFrozen = true;
        // Freeze timer UI at final value
        if (this.timerEl) {
          this.timerEl.textContent = this.formatElapsed(this.total_game_time);
        }
        console.log('⏸️ Total game time paused & frozen - Objective complete');
        const worldNow = this.experience?.world;
        if (worldNow && typeof worldNow.onObjectiveComplete === 'function') worldNow.onObjectiveComplete();
      });

      this.levelManager.on('levelComplete', () => {
        // Pause timer when level completes
        this.timerPaused = true;
        this.timerFrozen = true;
        console.log('⏸️ Timer paused & frozen - Level completed');
        // Statistics are already tracked by LevelManager via statistics tracker
        // Just increment levels completed
        this.statistics.total.levelsCompleted++;
        const worldNow = this.experience?.world;
        if (worldNow && typeof worldNow.onLevelComplete === 'function') worldNow.onLevelComplete();
      });

      this.levelManager.on('gameComplete', () => {
        const worldNow = this.experience?.world;
        if (worldNow && typeof worldNow.onGameComplete === 'function') worldNow.onGameComplete();
      });

      this.levelManager.on('gameOver', (reason) => {
        const worldNow = this.experience?.world;
        if (worldNow && typeof worldNow.onGameOver === 'function') worldNow.onGameOver(reason);
      });
    }
  }

  start(options = {}) {
    this.active = true;
    this.total_game_time = 0;
    this.timerPaused = false;

    // Reset statistics for new run
    this.statistics = {
      total: {
        kills: 0,
        items: 0,
        levelsCompleted: 0,
        total_game_time: 0,
      },
      perLevel: {},
    };

    // Update LevelManager's reference (important: must update after reset)
    if (this.levelManager) {
      this.levelManager.statistics = this.statistics;
      console.log('📊 Statistics tracker initialized and linked to LevelManager')
    }

    this.ensureTimerUI();
    if (this.ui.container) this.ui.container.style.display = 'block';

    this.hideEndBoard();
    // Hide overlay via LevelManager if it exists
    if (this.levelManager?.hideLevelCompleteOverlay) {
      this.levelManager.hideLevelCompleteOverlay();
    }

    // Delegate level start to LevelManager
    // Use startLevelKey from options if provided, otherwise start at level 0
    const startLevelKey = options?.startLevelKey;
    let startIndex = 0;

    if (startLevelKey) {
      // Find level index by locationKey
      const matchingIndex = this.levelManager.levels.findIndex(
        level => level.locationKey === startLevelKey
      );
      if (matchingIndex >= 0) {
        startIndex = matchingIndex;
      }
    }

    this.levelManager.startLevel(startIndex);

    const player = this.experience?.world?.player;
    if (player?.resetStatsForNewGame) player.resetStatsForNewGame();
  }

  game_end(state) {
    if (this.endBoard?.isVisible) return
    if (!this.active && state !== 'premature_end') return

    console.log(`Game Ended. State: ${state}`);
    // Update statistics with final total_game_time before displaying
    if (this.statistics && this.statistics.total) {
      this.statistics.total.total_game_time = this.total_game_time;
    }
    const timeStr = this.formatElapsed(this.total_game_time);

    // IMPORTANT: Collect statistics BEFORE calling stop() (which might reset things)
    // Ensure statistics object exists - check both this.statistics and levelManager.statistics
    let statsToUse = this.statistics;

    // If statistics don't exist or are empty, check levelManager's reference
    if (!statsToUse || (!statsToUse.total && !statsToUse.perLevel)) {
      console.warn('⚠️ Statistics object not found on GameManager, checking LevelManager...');
      if (this.levelManager?.statistics) {
        statsToUse = this.levelManager.statistics;
        console.log('✅ Using statistics from LevelManager');
      } else {
        console.warn('⚠️ Statistics not found anywhere, initializing...');
        statsToUse = {
          total: { kills: 0, items: 0, levelsCompleted: 0 },
          perLevel: {},
        };
        this.statistics = statsToUse;
        if (this.levelManager) {
          this.levelManager.statistics = statsToUse;
        }
      }
    }

    // Calculate statistics from per-level stats (most reliable source of truth)
    let calculatedKills = 0;
    let calculatedItems = 0;

    if (statsToUse.perLevel && typeof statsToUse.perLevel === 'object') {
      Object.values(statsToUse.perLevel).forEach((levelStats, index) => {
        if (levelStats && typeof levelStats === 'object') {
          calculatedKills += Number(levelStats.kills) || 0;
          calculatedItems += Number(levelStats.items) || 0;
          console.log(`📊 Level ${index} stats: kills=${levelStats.kills || 0}, items=${levelStats.items || 0}`);
        }
      });
    }

    // Get totals from statistics object
    let totalKills = Number(statsToUse.total?.kills) || 0;
    let totalItems = Number(statsToUse.total?.items) || 0;
    let levelsCompleted = Number(statsToUse.total?.levelsCompleted) || 0;

    // Prefer calculated values (sum of per-level stats) as they're more reliable
    // Only fall back to totals if per-level stats don't exist (edge case)
    const hasPerLevelStats = statsToUse.perLevel && Object.keys(statsToUse.perLevel).length > 0;

    if (hasPerLevelStats) {
      // Use calculated values from per-level stats (source of truth)
      totalKills = calculatedKills;
      totalItems = calculatedItems;
      // Update totals to match (for consistency)
      if (statsToUse.total) {
        statsToUse.total.kills = calculatedKills;
        statsToUse.total.items = calculatedItems;
      }
    }
    // Otherwise use totals (shouldn't happen normally, but handle edge case)

    console.log(`📊 Statistics Summary:`);
    console.log(`  - Total from stats object: kills=${statsToUse.total?.kills || 0}, items=${statsToUse.total?.items || 0}`);
    console.log(`  - Calculated from per-level: kills=${calculatedKills}, items=${calculatedItems}`);
    console.log(`  - Final values: kills=${totalKills}, items=${totalItems}, levels=${levelsCompleted}`);
    console.log(`  - Per-level stats:`, statsToUse.perLevel);

    // Show total statistics in end board BEFORE calling stop()
    this.showEndBoard({
      state,
      timeStr,
      kills: totalKills,
      items: totalItems,
      levelsCompleted: levelsCompleted
    });

    // Call stop() AFTER showing the board (to preserve statistics for display)
    this.stop();

    // Reset the one-time intro flag so a new run can show the intro again
    try {
      if (this.experience && this.experience._roadIntroShown) this.experience._roadIntroShown = false;
    } catch (e) {}
    this._roadIntroShown = false;
  }

  // Legacy method for compatibility - delegates to levelManager
  addKill(count = 1) {
    // This method is called by player/enemy but kills are tracked by LevelManager
    // LevelManager handles kill tracking via onEnemyKilled
    // This is kept for backward compatibility but does nothing
    // The actual kill tracking happens in LevelManager.onEnemyKilled()
  }

  stop() {
    this.active = false;
    this.total_game_time = 0;
    this.timerPaused = false;

    this.experience?.world?.clearEnemies?.();

    if (this.timerEl && this.timerEl.parentElement) {
      this.timerEl.parentElement.removeChild(this.timerEl);
    }
    this.timerEl = null;

    if (this.ui.container) this.ui.container.style.display = 'none';

    // Hide overlay via LevelManager if it exists
    if (this.levelManager?.hideLevelCompleteOverlay) {
      this.levelManager.hideLevelCompleteOverlay();
    }
    // Stop level manager (this sets isActive = false)
    if (this.levelManager) {
      this.levelManager.stop();
    }
  }

  showEndBoard({ state, timeStr, kills, items, levelsCompleted } = {}) {
    const el = this.endBoard?.container
    if (!el) {
      console.error('❌ End board container not found!')
      return
    }

    // Re-query UI elements if they're null (in case DOM wasn't ready when constructor ran)
    if (!this.endBoard.title) {
      this.endBoard.title = document.getElementById('game-end-title')
    }
    if (!this.endBoard.time) {
      this.endBoard.time = document.getElementById('game-end-time')
    }
    if (!this.endBoard.kills) {
      this.endBoard.kills = document.getElementById('game-end-kills')
    }

    const s = String(state ?? '')
    const isDead = s === 'dead' || s === 'death'
    if (this.endBoard.title) {
      this.endBoard.title.textContent = isDead ? 'You Died' : 'Run Complete'
    }

    // Format and display time
    if (this.endBoard.time) {
      this.endBoard.time.textContent = String(timeStr ?? '00:00')
    } else {
      console.warn('⚠️ End board time element not found!')
    }

    // Format and display kills - ensure it's a valid number
    const killCount = Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0
    if (this.endBoard.kills) {
      this.endBoard.kills.textContent = String(killCount)
      console.log(`📊 End Board: Displaying ${killCount} kills in UI`)
    } else {
      console.error('❌ End board kills element not found! Element ID: game-end-kills')
      // Try to find it one more time
      const killsEl = document.getElementById('game-end-kills')
      if (killsEl) {
        killsEl.textContent = String(killCount)
        this.endBoard.kills = killsEl
        console.log('✅ Found kills element on retry')
      }
    }

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

    // Trigger the one-time intro once total_game_time >= 2000ms
    if (!this._roadIntroShown && Number.isFinite(this.total_game_time) && this.total_game_time >= 2000) {
      try {
        // Mark as shown so we don't re-trigger
        this._roadIntroShown = true;
        if (this.experience) this.experience._roadIntroShown = true;

        // Show title overlay, then after it hides wait 3s and play subtitle sequence
        this.showIntroOverlay('Simulation Start', []).then(() => {
          setTimeout(() => {
            const dialogue = this.experience?.dialogue;
            const seq = [{ text: 'Objective: Reach the Endpoint', duration: 4000 }];
            if (dialogue && typeof dialogue.displaySubtitleSequence === 'function') {
              dialogue.displaySubtitleSequence(seq, 0, { force: true });
            } else {
              const subEl = document.getElementById('subtitle');
              if (subEl) {
                subEl.textContent = seq[0].text;
                subEl.classList.add('visible');
                setTimeout(() => subEl.classList.remove('visible'), seq[0].duration || 3000);
              }
            }
          }, 3000);
        }).catch((e) => console.warn('[GameManager] showIntroOverlay promise rejected', e));
      } catch (e) {
        console.warn('[GameManager] intro trigger failed', e);
      }
    }

    const d = Number.isFinite(deltaMs) ? deltaMs : 0;
    if (!this.timerPaused) {
      this.total_game_time += Math.max(0, d);
      // Update statistics with current total_game_time
      if (this.statistics && this.statistics.total) {
        this.statistics.total.total_game_time = this.total_game_time;
      }
    }
    // Only update timer UI if not frozen and game is active
    if (this.timerEl && !this.timerFrozen && this.active) {
      const formatted = this.formatElapsed(this.total_game_time);
      this.timerEl.textContent = formatted;
      // Also update HUD timer if present
      const hudTimer = document.getElementById('hud-timer');
      if (hudTimer) hudTimer.textContent = formatted;
    }

    this.updateHUD();
    // Delegate level update to LevelManager
    this.levelManager.update(d);
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
    // Level-specific HUD is handled by LevelManager
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



  formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  // Show a centered intro overlay with a title and optional subtitle sequence
  showIntroOverlay(title, subtitleSequence = []) {
    return new Promise((resolve) => {
      try {
        const el = document.getElementById('intro-overlay');
        if (!el) return resolve();
        const titleEl = el.querySelector('.intro-title');
        if (titleEl) titleEl.textContent = String(title ?? '');
        el.style.display = 'flex';
        // Force next frame then add visible for transition
        requestAnimationFrame(() => el.classList.add('visible'));

        const dialogue = this.experience?.dialogue;
        // After a short delay, show subtitle(s) if provided
        setTimeout(() => {
          if (subtitleSequence && subtitleSequence.length > 0) {
            if (dialogue && typeof dialogue.displaySubtitleSequence === 'function') {
              try {
                dialogue.displaySubtitleSequence(subtitleSequence, 600);
              } catch (e) { console.warn('[GameManager] dialogue.displaySubtitleSequence threw', e); }
            } else {
              // Fallback to subtitle overlay (show first item only)
              const sub = subtitleSequence[0];
              const subEl = document.getElementById('subtitle');
              if (subEl) {
                subEl.textContent = String(sub.text || '');
                subEl.classList.add('visible');
                setTimeout(() => subEl.classList.remove('visible'), sub.duration || 3000);
              }
            }
          }
        }, 700);

        // Hide overlay after subtitles have finished (sum durations)
        const totalDur = (subtitleSequence || []).reduce((acc, s) => acc + (s.duration || 3000), 0);
        const hideAfter = 700 + Math.max(1200, totalDur) + 600;
        setTimeout(() => {
          el.classList.remove('visible');
          setTimeout(() => {
            el.style.display = 'none';
            resolve();
          }, 300);
        }, hideAfter);
      } catch (e) { console.warn('[GameManager] showIntroOverlay error', e); resolve(); }
    })
  }

  // --- STATISTICS ACCESS METHODS ---

  /**
   * Get total statistics across all levels
   * @returns {object} Total statistics object
   */
  getTotalStats() {
    return this.statistics ? this.statistics.total : { kills: 0, items: 0, levelsCompleted: 0, total_game_time: 0 };
  }

  /**
   * Get per-level statistics
   * @param {number} levelIndex - Level index
   * @returns {object|null} Per-level stats or null if not found
   */
  getLevelStats(levelIndex) {
    if (this.statistics && this.statistics.perLevel[levelIndex]) {
      return this.statistics.perLevel[levelIndex];
    }
    return null;
  }

  /**
   * Get all per-level statistics
   * @returns {object} All per-level statistics indexed by level index
   */
  getAllLevelStats() {
    return this.statistics ? this.statistics.perLevel : {};
  }

  /**
   * Get current level progress from statistics
   * @returns {number} Current progress for the active level
   */
  getCurrentLevelProgress() {
    if (!this.levelManager || !this.levelManager.isActive) return 0;
    return this.levelManager.getCurrentProgress();
  }
}