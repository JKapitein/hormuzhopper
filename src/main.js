import "./style.css";
import { initAnalytics, trackEvent } from "./analytics.js";
import trumpPoster from "./img/trump.png";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="shell">
    <section class="intro">
      <h1>Hormuz Hopper</h1>
      <p class="lede">
        Frogger, except you are a lumbering oil tanker trying to cross the Strait of Hormuz while
        speedboats, mines, destroyers, and drones turn the shipping lane into a panic attack.
      </p>
      <div class="chips">
        <span>Arrow keys or WASD to move</span>
        <span>Levels remix every run</span>
        <span>Oil spikes higher the longer you stall</span>
      </div>
      <div class="briefing-grid">
        <article class="brief-card">
          <span class="brief-label">Enemy Brief</span>
          <div class="brief-list">
            <div class="brief-item"><span class="swatch mine"></span><div><strong>Mines</strong><p>Slow, dense lane blockers that punish hesitation.</p></div></div>
            <div class="brief-item"><span class="swatch boat"></span><div><strong>Speedboats</strong><p>Fast skirmish craft that force quick lateral reads.</p></div></div>
            <div class="brief-item"><span class="swatch ship"></span><div><strong>Destroyers</strong><p>Big hulls that erase your margin for error.</p></div></div>
            <div class="brief-item"><span class="swatch drone"></span><div><strong>Drones</strong><p>Diagonal flyers with awkward, drifting hit paths.</p></div></div>
          </div>
        </article>
      </div>
    </section>

    <section class="game-wrap">
      <div class="board-topline">
        <span class="board-kicker">Shipping Lane Control</span>
        <span class="board-alert" id="threatTag">Level 1 · Open Water</span>
      </div>
      <div class="hud">
        <div class="stat">
          <span class="label">Oil Panic</span>
          <strong id="oilPrice">$80.00</strong>
        </div>
        <div class="stat">
          <span class="label">Threat Level</span>
          <strong id="currentLevel">1</strong>
        </div>
        <div class="stat">
          <span class="label">Fleet Score</span>
          <strong id="runScore">0</strong>
        </div>
        <div class="stat">
          <span class="label">Best Run</span>
          <strong id="bestRun">0</strong>
        </div>
      </div>

      <div class="board-shell">
        <canvas id="game" width="720" height="720" aria-label="Hormuz Hopper game area"></canvas>
      </div>

      <div class="statusbar">
        <p id="statusLine">Each crossing escalates the crisis. Clear lanes, bank score, survive the next level.</p>
        <button id="restartButton" class="primary">Start Run</button>
      </div>

      <div class="controls" aria-label="Touch controls">
        <span class="control-spacer" aria-hidden="true"></span>
        <button class="control-button" data-move="up" aria-label="Move up">↑</button>
        <span class="control-spacer" aria-hidden="true"></span>
        <button class="control-button" data-move="left" aria-label="Move left">←</button>
        <button class="control-button" data-move="down" aria-label="Move down">↓</button>
        <button class="control-button" data-move="right" aria-label="Move right">→</button>
      </div>
    </section>
  </main>
`;

initAnalytics();

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const oilPriceNode = document.querySelector("#oilPrice");
const currentLevelNode = document.querySelector("#currentLevel");
const runScoreNode = document.querySelector("#runScore");
const bestRunNode = document.querySelector("#bestRun");
const threatTagNode = document.querySelector("#threatTag");
const statusLineNode = document.querySelector("#statusLine");
const restartButton = document.querySelector("#restartButton");
const trumpImage = new Image();
trumpImage.src = trumpPoster;

const world = {
  cols: 8,
  rows: 9,
  laneHeight: canvas.height / 9,
  colWidth: canvas.width / 8
};

const colors = {
  tanker: "#f7b955",
  tankerDeck: "#1d2430",
  mine: "#101317",
  speedboat: "#ff6f61",
  destroyer: "#dae4ee",
  drone: "#8bf7d0",
  text: "#f4efe3"
};

const laneTemplates = [
  {
    type: "mine",
    weight: 3,
    speedRange: [72, 106],
    widthRange: [0.88, 1.05],
    countRange: [2, 3]
  },
  {
    type: "speedboat",
    weight: 4,
    speedRange: [190, 236],
    widthRange: [0.64, 0.82],
    countRange: [3, 4]
  },
  {
    type: "destroyer",
    weight: 2,
    speedRange: [96, 128],
    widthRange: [1.22, 1.6],
    countRange: [1, 2]
  },
  {
    type: "drone",
    weight: 2,
    speedRange: [162, 212],
    widthRange: [0.46, 0.62],
    countRange: [2, 3]
  }
];

const modifierPool = [
  {
    id: "open_water",
    name: "Open Water",
    description: "A brief clean window. Fewer boats, calmer pricing.",
    oilRateDelta: -0.08,
    speedScale: 0.96,
    scoreMultiplier: 0.95,
    countAdjust: { speedboat: -1 },
    focusType: "speedboat",
    maxFocusLanes: 1
  },
  {
    id: "mine_surge",
    name: "Mine Surge",
    description: "Fresh mines flood the channel and slow decisions.",
    oilRateDelta: 0.12,
    speedScale: 1.02,
    scoreMultiplier: 1.15,
    countAdjust: { mine: 1 },
    focusType: "mine",
    minFocusLanes: 2
  },
  {
    id: "drone_swarm",
    name: "Drone Swarm",
    description: "More drones, more drift, less peace of mind.",
    oilRateDelta: 0.14,
    speedScale: 1.06,
    scoreMultiplier: 1.18,
    countAdjust: { drone: 1 },
    droneDriftScale: 1.45,
    focusType: "drone",
    minFocusLanes: 2
  },
  {
    id: "escort_screen",
    name: "Escort Screen",
    description: "Destroyers crowd the route and shrink your margin.",
    oilRateDelta: 0.1,
    speedScale: 1.03,
    scoreMultiplier: 1.16,
    countAdjust: { destroyer: 1 },
    widthAdjust: { destroyer: 0.12 },
    focusType: "destroyer",
    minFocusLanes: 2
  },
  {
    id: "panic_bid",
    name: "Panic Bid",
    description: "Every trader loses their mind. Oil climbs much faster.",
    oilRateDelta: 0.28,
    speedScale: 1.08,
    scoreMultiplier: 1.28
  }
];

const hazardCaps = {
  mine: 4,
  speedboat: 5,
  destroyer: 3,
  drone: 4
};

let bestRun = Number(localStorage.getItem("hh-best-run") || 0);
bestRunNode.textContent = `${bestRun}`;

const state = {
  active: false,
  result: "idle",
  runSeed: 1,
  level: 1,
  runScore: 0,
  startTime: 0,
  elapsed: 0,
  oilPrice: 80,
  oilRate: 0.5,
  player: { col: 3, row: 8 },
  lanes: [],
  highestRowReached: 8,
  modifier: modifierPool[0]
};

const sessionStats = {
  pageStartedAt: performance.now(),
  firstInteractionAt: null,
  summarySent: false,
  runsStarted: 0,
  restartClicks: 0,
  runsCompleted: 0,
  levelsStarted: 0,
  levelsCompleted: 0,
  highestLevelReached: 1,
  collisionLosses: 0,
  oilSeizures: 0,
  maxRunScore: 0,
  lastOutcome: "idle"
};

let currentRunStartedAt = 0;

setupLevel(1);
updateHud();

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function laneTop(row) {
  return row * world.laneHeight;
}

function formatPrice(value) {
  return `$${value.toFixed(2)}`;
}

function updateHud() {
  oilPriceNode.textContent = formatPrice(state.oilPrice);
  currentLevelNode.textContent = `${state.level}`;
  runScoreNode.textContent = `${Math.round(state.runScore)}`;
  bestRunNode.textContent = `${bestRun}`;
  threatTagNode.textContent = `Level ${state.level} · ${state.modifier.name}`;
}

function markFirstInteraction() {
  if (sessionStats.firstInteractionAt === null) {
    sessionStats.firstInteractionAt = performance.now();
  }
}

function trackLevelStarted(context) {
  sessionStats.levelsStarted += 1;
  sessionStats.highestLevelReached = Math.max(sessionStats.highestLevelReached, state.level);
  trackEvent("level_started", {
    level_number: state.level,
    modifier_id: state.modifier.id,
    modifier_name: state.modifier.name,
    start_context: context
  });
}

function sendSessionSummary(trigger) {
  if (sessionStats.summarySent) {
    return;
  }

  sessionStats.summarySent = true;
  trackEvent(
    "page_session_summary",
    {
      trigger,
      duration_seconds: Number(((performance.now() - sessionStats.pageStartedAt) / 1000).toFixed(1)),
      first_interaction_seconds:
        sessionStats.firstInteractionAt === null
          ? undefined
          : Number(((sessionStats.firstInteractionAt - sessionStats.pageStartedAt) / 1000).toFixed(1)),
      runs_started: sessionStats.runsStarted,
      restart_clicks: sessionStats.restartClicks,
      runs_completed: sessionStats.runsCompleted,
      levels_started: sessionStats.levelsStarted,
      levels_completed: sessionStats.levelsCompleted,
      highest_level_reached: sessionStats.highestLevelReached,
      collision_losses: sessionStats.collisionLosses,
      oil_seizures: sessionStats.oilSeizures,
      max_run_score: sessionStats.maxRunScore,
      last_outcome: sessionStats.lastOutcome
    },
    { transport: "beacon" }
  );
}

function scorePoints(points) {
  state.runScore += Math.round(points * state.modifier.scoreMultiplier);
  updateHud();
}

function pickWeightedTemplate(rng, previousType) {
  const focusType = state.modifier?.focusType;
  const entries = laneTemplates.map((template) => {
    let effectiveWeight = template.type === previousType ? template.weight * 0.45 : template.weight;

    if (focusType && template.type === focusType) {
      effectiveWeight *= 1.8;
    }

    if (focusType && state.modifier?.maxFocusLanes === 1 && template.type === focusType) {
      effectiveWeight *= 0.7;
    }

    return {
      ...template,
      effectiveWeight
    };
  });
  const totalWeight = entries.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  let roll = rng() * totalWeight;

  for (const entry of entries) {
    roll -= entry.effectiveWeight;
    if (roll <= 0) {
      return entry;
    }
  }

  return entries[entries.length - 1];
}

function pickModifier(level, rng) {
  if (level === 1) {
    return modifierPool[0];
  }

  return modifierPool[1 + randInt(rng, 0, modifierPool.length - 2)];
}

function buildHazards(lane, rowIndex, rng) {
  const spacing = canvas.width / lane.count;
  const jitter = spacing * 0.24;

  return Array.from({ length: lane.count }, (_, index) => {
    const offset = randRange(rng, -jitter, jitter);
    return {
      type: lane.type,
      width: lane.width * world.colWidth,
      height: world.laneHeight * (lane.type === "drone" ? 0.28 : 0.52),
      x: index * spacing + offset - spacing / 2,
      direction: lane.direction,
      speed: lane.speed,
      driftScale: lane.type === "drone" ? state.modifier.droneDriftScale || 1 : 1,
      rowIndex
    };
  });
}

function buildLaneFromTemplate(template, rowIndex, level, modifier, rng) {
  const countAdjust = modifier.countAdjust?.[template.type] || 0;
  const widthAdjust = modifier.widthAdjust?.[template.type] || 0;
  const baseCount = randInt(rng, template.countRange[0], template.countRange[1]);
  const extraCount = level > 2 && rng() > 0.62 ? 1 : 0;
  const count = clamp(baseCount + countAdjust + extraCount, 1, hazardCaps[template.type]);
  const speedBoost = (level - 1) * (template.type === "destroyer" ? 6 : 9);
  const speed = randRange(rng, template.speedRange[0], template.speedRange[1]) + speedBoost;
  const width = randRange(rng, template.widthRange[0], template.widthRange[1]) + widthAdjust;
  const lane = {
    type: template.type,
    rowIndex,
    count,
    width,
    speed: speed * modifier.speedScale,
    direction: rng() > 0.5 ? 1 : -1
  };

  return {
    ...lane,
    hazards: buildHazards(lane, rowIndex, rng)
  };
}

function enforceModifierTheme(rows, level, modifier, rng) {
  const focusType = modifier.focusType;
  if (!focusType) {
    return rows;
  }

  const playableRows = rows.slice(1, -1);
  const template = laneTemplates.find((entry) => entry.type === focusType);
  if (!template) {
    return rows;
  }

  let focusCount = playableRows.filter((lane) => lane.type === focusType).length;

  if (modifier.minFocusLanes) {
    for (let index = 0; index < playableRows.length && focusCount < modifier.minFocusLanes; index += 1) {
      if (playableRows[index].type === focusType) {
        continue;
      }

      playableRows[index] = buildLaneFromTemplate(template, playableRows[index].rowIndex, level, modifier, rng);
      focusCount += 1;
    }
  }

  if (modifier.maxFocusLanes !== undefined && focusCount > modifier.maxFocusLanes) {
    for (let index = playableRows.length - 1; index >= 0 && focusCount > modifier.maxFocusLanes; index -= 1) {
      if (playableRows[index].type !== focusType) {
        continue;
      }

      const replacementOptions = laneTemplates.filter((entry) => entry.type !== focusType);
      const replacement = replacementOptions[randInt(rng, 0, replacementOptions.length - 1)];
      playableRows[index] = buildLaneFromTemplate(replacement, playableRows[index].rowIndex, level, modifier, rng);
      focusCount -= 1;
    }
  }

  return [rows[0], ...playableRows, rows[rows.length - 1]];
}

function generateLevel(level, modifier, rng) {
  const rows = [{ type: "goal", rowIndex: 0, hazards: [] }];
  let previousType = "";

  for (let rowIndex = 1; rowIndex < world.rows - 1; rowIndex += 1) {
    const template = pickWeightedTemplate(rng, previousType);
    rows.push(buildLaneFromTemplate(template, rowIndex, level, modifier, rng));

    previousType = template.type;
  }

  rows.push({ type: "start", rowIndex: world.rows - 1, hazards: [] });
  return enforceModifierTheme(rows, level, modifier, rng);
}

function buildLevelMessage(prefix = "Threat level live.") {
  return `${prefix} Level ${state.level}: ${state.modifier.name}. ${state.modifier.description}`;
}

function setupLevel(level) {
  const rng = mulberry32(state.runSeed + level * 9973);
  state.level = level;
  state.modifier = pickModifier(level, rng);
  state.lanes = generateLevel(level, state.modifier, rng);
  state.player = { col: 3, row: 8 };
  state.highestRowReached = 8;
  state.oilPrice = 80;
  state.oilRate = 1.5;
  updateHud();
}

function resetGame(source = "button") {
  const isRestart = state.active || state.result !== "idle";
  markFirstInteraction();
  state.active = true;
  state.result = "running";
  state.runSeed = Math.floor(Math.random() * 1_000_000_000);
  state.runScore = 0;
  state.startTime = performance.now();
  currentRunStartedAt = state.startTime;
  state.elapsed = 0;
  state.oilPrice = 80;
  setupLevel(1);
  updateHud();
  sessionStats.runsStarted += 1;
  statusLineNode.textContent = buildLevelMessage("Convoy underway.");
  restartButton.textContent = "Restart Run";
  trackEvent("run_started", {
    entry_method: source,
    start_kind: isRestart ? "restart" : "first_start",
    run_number: sessionStats.runsStarted,
    page_title: document.title,
    run_seed: state.runSeed
  });
  trackLevelStarted(isRestart ? "restart" : "fresh_run");
}

function playerRect() {
  const width = world.colWidth * 0.54;
  const height = world.laneHeight * 0.42;
  const x = state.player.col * world.colWidth + (world.colWidth - width) / 2;
  const y = laneTop(state.player.row) + world.laneHeight * 0.27;
  return { x, y, width, height };
}

function playerSpriteRect() {
  const width = world.colWidth * 0.94;
  const height = world.laneHeight * 0.66;
  const x = state.player.col * world.colWidth + (world.colWidth - width) / 2;
  const y = laneTop(state.player.row) + world.laneHeight * 0.16;
  return { x, y, width, height };
}

function collide(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function movePlayer(direction) {
  if (!state.active) {
    resetGame();
    return;
  }

  const previousRow = state.player.row;
  const previousCol = state.player.col;

  switch (direction) {
    case "up":
      state.player.row = clamp(state.player.row - 1, 0, world.rows - 1);
      break;
    case "down":
      state.player.row = clamp(state.player.row + 1, 0, world.rows - 1);
      break;
    case "left":
      state.player.col = clamp(state.player.col - 1, 0, world.cols - 1);
      break;
    case "right":
      state.player.col = clamp(state.player.col + 1, 0, world.cols - 1);
      break;
    default:
      return;
  }

  if (previousRow === state.player.row && previousCol === state.player.col) {
    return;
  }

  if (state.player.row < state.highestRowReached) {
    state.highestRowReached = state.player.row;
    const progressScore = world.rows - 1 - state.highestRowReached;
    scorePoints(90 + state.level * 20);
    trackEvent("lane_advanced", {
      lane_number: state.player.row,
      level_number: state.level,
      progress_score: progressScore,
      run_score: Math.round(state.runScore)
    });
  }
}

function finishRun(reason = "collision") {
  state.active = false;
  state.result = reason === "oil_seizure" ? "seized" : "lost";
  sessionStats.runsCompleted += 1;
  sessionStats.lastOutcome = reason;
  sessionStats.maxRunScore = Math.max(sessionStats.maxRunScore, Math.round(state.runScore));
  if (reason === "oil_seizure") {
    sessionStats.oilSeizures += 1;
  } else {
    sessionStats.collisionLosses += 1;
  }
  const clearedLevels = state.level - 1;
  statusLineNode.textContent =
    reason === "oil_seizure"
      ? `Oil broke $125 on level ${state.level}. Trump ordered the tanker seized before you could clear the strait.`
      : `Run over at level ${state.level}. You banked ${Math.round(state.runScore)} points and cleared ${clearedLevels} full crossings.`;

  if (state.runScore > bestRun) {
    bestRun = Math.round(state.runScore);
    localStorage.setItem("hh-best-run", String(bestRun));
    bestRunNode.textContent = `${bestRun}`;
  }

  trackEvent("run_completed", {
    outcome: reason,
    level_number: state.level,
    levels_cleared: clearedLevels,
    oil_price: Number(state.oilPrice.toFixed(2)),
    run_score: Math.round(state.runScore),
    time_seconds: Number(state.elapsed.toFixed(1)),
    run_duration_seconds: currentRunStartedAt ? Number(((performance.now() - currentRunStartedAt) / 1000).toFixed(1)) : undefined
  });
}

function advanceLevel() {
  sessionStats.levelsCompleted += 1;
  trackEvent("level_completed", {
    level_number: state.level,
    modifier_id: state.modifier.id,
    oil_price: Number(state.oilPrice.toFixed(2)),
    run_score: Math.round(state.runScore)
  });

  scorePoints(520 + state.level * 140);
  const nextLevel = state.level + 1;
  setupLevel(nextLevel);
  statusLineNode.textContent = buildLevelMessage("Channel crossed. Escalation continues.");
  trackLevelStarted("carry_over");
}

function update(dt) {
  if (!state.active) {
    return;
  }

  state.elapsed = (performance.now() - state.startTime) / 1000;
  state.oilPrice += dt * state.oilRate;
  updateHud();

  if (state.oilPrice > 125) {
    trackEvent("oil_limit_hit", {
      level_number: state.level,
      oil_price: Number(state.oilPrice.toFixed(2)),
      run_score: Math.round(state.runScore)
    });
    finishRun("oil_seizure");
    return;
  }

  for (const lane of state.lanes) {
    for (const hazard of lane.hazards) {
      hazard.x += hazard.speed * hazard.direction * dt;
      const padding = hazard.width + world.colWidth * 0.8;
      if (hazard.direction === 1 && hazard.x > canvas.width + padding) {
        hazard.x = -padding;
      }
      if (hazard.direction === -1 && hazard.x < -padding) {
        hazard.x = canvas.width + padding;
      }
    }
  }

  if (state.player.row === 0) {
    advanceLevel();
    return;
  }

  const lane = state.lanes[state.player.row];
  const player = playerRect();

  for (const hazard of lane.hazards) {
    const rect = hazardRect(lane, hazard);
    if (collide(player, rect)) {
      trackEvent("hazard_hit", {
        lane_number: state.player.row,
        level_number: state.level,
        hazard_type: hazard.type,
        oil_price: Number(state.oilPrice.toFixed(2)),
        run_score: Math.round(state.runScore)
      });
      finishRun();
      return;
    }
  }
}

function hazardRect(lane, hazard) {
  const baseY = laneTop(lane.rowIndex) + world.laneHeight * 0.24;
  const drift = hazard.type === "drone" ? Math.sin((hazard.x + lane.rowIndex * 30) / 38) * 12 * hazard.driftScale : 0;
  return {
    x: hazard.x,
    y: baseY + drift,
    width: hazard.width,
    height: hazard.height
  };
}

function drawBackdrop() {
  const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, "#06111d");
  base.addColorStop(0.55, "#103459");
  base.addColorStop(1, "#0d2137");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const flare = ctx.createRadialGradient(canvas.width * 0.78, 72, 10, canvas.width * 0.78, 72, 260);
  flare.addColorStop(0, "rgba(247, 185, 85, 0.24)");
  flare.addColorStop(1, "rgba(247, 185, 85, 0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(7, 16, 26, 0.42)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(90, 0);
  ctx.lineTo(54, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(canvas.width, 0);
  ctx.lineTo(canvas.width - 120, 0);
  ctx.lineTo(canvas.width - 68, canvas.height);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  for (let row = 0; row < world.rows; row += 1) {
    const y = laneTop(row);
    const lane = state.lanes[row];
    const laneGradient = ctx.createLinearGradient(0, y, canvas.width, y);
    laneGradient.addColorStop(0, laneFill(lane.type, 0.18));
    laneGradient.addColorStop(0.5, laneFill(lane.type, 0.1));
    laneGradient.addColorStop(1, laneFill(lane.type, 0.2));
    ctx.fillStyle = laneGradient;
    ctx.fillRect(0, y, canvas.width, world.laneHeight - 2);

    ctx.strokeStyle = laneStroke(lane.type);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + world.laneHeight - 1);
    ctx.lineTo(canvas.width, y + world.laneHeight - 1);
    ctx.stroke();

    if (lane.type !== "goal" && lane.type !== "start") {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -state.elapsed * (36 + row * 3) * (row % 2 === 0 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(118, y + world.laneHeight / 2);
      ctx.lineTo(canvas.width - 118, y + world.laneHeight / 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.fillStyle = "rgba(143, 211, 255, 0.18)";
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 73 + state.elapsed * 30) % canvas.width;
    const y = (i * 61) % canvas.height;
    ctx.fillRect(x, y, 18, 2);
  }

}

function laneFill(type, alpha) {
  const palette = {
    goal: `rgba(183, 255, 122, ${alpha + 0.05})`,
    start: `rgba(247, 185, 85, ${alpha + 0.02})`,
    mine: `rgba(255, 219, 112, ${alpha * 0.62})`,
    speedboat: `rgba(255, 111, 97, ${alpha * 0.78})`,
    destroyer: `rgba(218, 228, 238, ${alpha * 0.52})`,
    drone: `rgba(139, 247, 208, ${alpha * 0.82})`
  };
  return palette[type] || `rgba(255, 255, 255, ${alpha})`;
}

function laneStroke(type) {
  const palette = {
    goal: "rgba(183, 255, 122, 0.34)",
    start: "rgba(247, 185, 85, 0.32)",
    mine: "rgba(255, 219, 112, 0.18)",
    speedboat: "rgba(255, 111, 97, 0.18)",
    destroyer: "rgba(218, 228, 238, 0.18)",
    drone: "rgba(139, 247, 208, 0.2)"
  };
  return palette[type] || "rgba(143, 211, 255, 0.16)";
}

function drawSoftShadow(x, y, width, height, scale = 0.3) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
  ctx.beginPath();
  ctx.ellipse(x, y, width * scale, height * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTankerSprite(player) {
  const centerX = player.x + player.width / 2;
  const top = player.y;
  const bottom = player.y + player.height;
  const left = player.x;
  const right = player.x + player.width;

  drawSoftShadow(centerX, bottom + 10, player.width, player.height, 0.4);

  if (state.active) {
    ctx.strokeStyle = "rgba(143, 211, 255, 0.26)";
    ctx.lineWidth = 2.5;
    for (let wake = 0; wake < 3; wake += 1) {
      const offset = wake * 11 + ((state.elapsed * 44) % 12);
      ctx.beginPath();
      ctx.moveTo(centerX - player.width * 0.16, bottom + offset);
      ctx.lineTo(centerX - player.width * 0.34, bottom + offset + 18);
      ctx.moveTo(centerX + player.width * 0.16, bottom + offset);
      ctx.lineTo(centerX + player.width * 0.34, bottom + offset + 18);
      ctx.stroke();
    }
  }

  const hull = ctx.createLinearGradient(left, top, right, bottom);
  hull.addColorStop(0, "#ffe0a0");
  hull.addColorStop(0.5, "#f7b955");
  hull.addColorStop(1, "#b56f2f");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(centerX, top);
  ctx.lineTo(right - player.width * 0.14, top + player.height * 0.18);
  ctx.lineTo(right - player.width * 0.08, bottom - player.height * 0.18);
  ctx.lineTo(centerX + player.width * 0.16, bottom);
  ctx.lineTo(centerX - player.width * 0.16, bottom);
  ctx.lineTo(left + player.width * 0.08, bottom - player.height * 0.18);
  ctx.lineTo(left + player.width * 0.14, top + player.height * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(52, 33, 15, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#1f2936";
  ctx.beginPath();
  ctx.roundRect(centerX - player.width * 0.22, top + player.height * 0.15, player.width * 0.44, player.height * 0.22, 8);
  ctx.fill();

  ctx.fillStyle = "#2f3c4b";
  ctx.beginPath();
  ctx.roundRect(centerX - player.width * 0.13, top + player.height * 0.44, player.width * 0.26, player.height * 0.14, 7);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 245, 224, 0.88)";
  ctx.beginPath();
  ctx.roundRect(centerX - player.width * 0.075, top + player.height * 0.47, player.width * 0.15, player.height * 0.08, 4);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 1.5;
  for (let stripe = 0; stripe < 3; stripe += 1) {
    const y = top + player.height * (0.62 + stripe * 0.09);
    ctx.beginPath();
    ctx.moveTo(centerX - player.width * 0.24, y);
    ctx.lineTo(centerX + player.width * 0.24, y);
    ctx.stroke();
  }
}

function drawMineSprite(rect) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = rect.height * 0.38;

  drawSoftShadow(cx, cy + radius + 8, rect.width, rect.height, 0.28);

  const body = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.25, radius * 0.2, cx, cy, radius);
  body.addColorStop(0, "#495260");
  body.addColorStop(0.55, "#131920");
  body.addColorStop(1, "#06090d");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 219, 112, 0.9)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * radius * 0.74, cy + Math.sin(angle) * radius * 0.74);
    ctx.lineTo(cx + Math.cos(angle) * radius * 1.28, cy + Math.sin(angle) * radius * 1.28);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 245, 220, 0.32)";
  ctx.beginPath();
  ctx.arc(cx - radius * 0.25, cy - radius * 0.28, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpeedboatSprite(rect, direction) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(direction, 1);

  drawSoftShadow(0, rect.height * 0.55, rect.width, rect.height, 0.32);

  ctx.strokeStyle = "rgba(143, 211, 255, 0.24)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-rect.width * 0.3, rect.height * 0.18);
  ctx.lineTo(-rect.width * 0.56, rect.height * 0.36);
  ctx.moveTo(-rect.width * 0.08, rect.height * 0.24);
  ctx.lineTo(-rect.width * 0.34, rect.height * 0.48);
  ctx.stroke();

  const hull = ctx.createLinearGradient(-rect.width / 2, 0, rect.width / 2, 0);
  hull.addColorStop(0, "#ffaea3");
  hull.addColorStop(0.7, "#ff6f61");
  hull.addColorStop(1, "#cb463d");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-rect.width * 0.48, rect.height * 0.22);
  ctx.lineTo(rect.width * 0.2, rect.height * 0.22);
  ctx.quadraticCurveTo(rect.width * 0.48, 0, rect.width * 0.5, -rect.height * 0.06);
  ctx.lineTo(rect.width * 0.2, -rect.height * 0.22);
  ctx.lineTo(-rect.width * 0.42, -rect.height * 0.22);
  ctx.quadraticCurveTo(-rect.width * 0.56, 0, -rect.width * 0.48, rect.height * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f6f8fb";
  ctx.beginPath();
  ctx.moveTo(-rect.width * 0.08, -rect.height * 0.08);
  ctx.lineTo(rect.width * 0.18, -rect.height * 0.08);
  ctx.lineTo(rect.width * 0.12, rect.height * 0.06);
  ctx.lineTo(-rect.width * 0.04, rect.height * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(28, 33, 41, 0.7)";
  ctx.fillRect(-rect.width * 0.18, -2, rect.width * 0.42, 4);
  ctx.restore();
}

function drawDestroyerSprite(rect, direction) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(direction, 1);

  drawSoftShadow(0, rect.height * 0.62, rect.width, rect.height, 0.34);

  const hull = ctx.createLinearGradient(-rect.width / 2, 0, rect.width / 2, 0);
  hull.addColorStop(0, "#f9fcff");
  hull.addColorStop(0.55, "#d7e0e9");
  hull.addColorStop(1, "#a2b0bc");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-rect.width * 0.48, rect.height * 0.22);
  ctx.lineTo(rect.width * 0.18, rect.height * 0.22);
  ctx.lineTo(rect.width * 0.46, 0);
  ctx.lineTo(rect.width * 0.18, -rect.height * 0.22);
  ctx.lineTo(-rect.width * 0.4, -rect.height * 0.22);
  ctx.quadraticCurveTo(-rect.width * 0.56, 0, -rect.width * 0.48, rect.height * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#90a1b1";
  ctx.beginPath();
  ctx.roundRect(-rect.width * 0.12, -rect.height * 0.12, rect.width * 0.28, rect.height * 0.18, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-rect.width * 0.02, -rect.height * 0.28, rect.width * 0.16, rect.height * 0.16, 4);
  ctx.fill();
  ctx.fillRect(rect.width * 0.05, -rect.height * 0.36, rect.width * 0.04, rect.height * 0.26);
  ctx.fillStyle = "#4e5e6f";
  ctx.fillRect(-rect.width * 0.34, -rect.height * 0.03, rect.width * 0.38, rect.height * 0.06);
  ctx.restore();
}

function drawDroneSprite(rect, direction) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(direction, 1);

  ctx.strokeStyle = "rgba(139, 247, 208, 0.92)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-rect.width * 0.34, 0);
  ctx.lineTo(rect.width * 0.34, 0);
  ctx.moveTo(-rect.width * 0.16, -rect.height * 0.26);
  ctx.lineTo(rect.width * 0.16, rect.height * 0.26);
  ctx.moveTo(rect.width * 0.16, -rect.height * 0.26);
  ctx.lineTo(-rect.width * 0.16, rect.height * 0.26);
  ctx.stroke();

  ctx.fillStyle = "rgba(139, 247, 208, 0.14)";
  for (const rotorX of [-rect.width * 0.36, rect.width * 0.36]) {
    ctx.beginPath();
    ctx.arc(rotorX, 0, rect.height * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#8bf7d0";
  ctx.beginPath();
  ctx.roundRect(-rect.width * 0.12, -rect.height * 0.12, rect.width * 0.24, rect.height * 0.24, 5);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const player = playerSpriteRect();
  drawTankerSprite(player);
}

function drawHazard(lane, hazard) {
  const rect = hazardRect(lane, hazard);
  const direction = hazard.direction === -1 ? -1 : 1;

  if (hazard.type === "mine") {
    drawMineSprite(rect);
    return;
  }

  if (hazard.type === "speedboat") {
    drawSpeedboatSprite(rect, direction);
    return;
  }

  if (hazard.type === "destroyer") {
    drawDestroyerSprite(rect, direction);
    return;
  }

  drawDroneSprite(rect, direction);
}

function drawWrappedText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });

  return lines.length;
}

function drawLabels() {
  ctx.fillStyle = colors.text;
  ctx.font = "700 14px 'SFMono-Regular', Menlo, monospace";
  ctx.fillText(`OPEN WATER  //  LEVEL ${state.level}`, 24, laneTop(0) + 30);
  ctx.fillText(state.modifier.name.toUpperCase(), 24, laneTop(8) + 30);

  if (!state.active) {
    const cardX = 72;
    const cardY = state.result === "seized" ? 214 : 238;
    const cardWidth = canvas.width - 144;
    const cardHeight = state.result === "seized" ? 254 : 210;

    ctx.fillStyle = "rgba(5, 16, 28, 0.9)";
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 30);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = state.result === "seized" ? "rgba(255, 174, 125, 0.14)" : "rgba(139, 247, 208, 0.08)";
    ctx.beginPath();
    ctx.roundRect(cardX + 18, cardY + 18, cardWidth - 36, 38, 18);
    ctx.fill();

    const textX = cardX + 34;
    const textColumnWidth = state.result === "seized" ? 270 : cardWidth - 68;
    const imageWidth = 164;
    const imageHeight = 198;
    const imageX = cardX + cardWidth - imageWidth - 28;
    const imageY = cardY + 30;

    ctx.fillStyle = "#f4efe3";
    ctx.font = "700 34px 'Avenir Next Condensed', 'Helvetica Neue', sans-serif";
    ctx.fillText(state.result === "seized" ? "Tanker Seized" : state.result === "lost" ? "Run Sunk" : "Escalation Awaits", textX, cardY + 92);
    ctx.font = "600 13px 'SFMono-Regular', Menlo, monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = state.result === "seized" ? "rgba(255, 185, 122, 0.9)" : "rgba(139, 247, 208, 0.84)";
    ctx.fillText(state.result === "seized" ? "WHITE HOUSE HOTLINE" : "SHIPPING BRIEF", textX, cardY + 37);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f4efe3";
    ctx.font = "400 18px 'Avenir Next', 'Segoe UI', sans-serif";
    const body =
      state.result === "seized"
        ? `Oil hit ${formatPrice(state.oilPrice)}. Trump called to seize the tanker before you could clear the lane.`
        : state.result === "lost"
        ? `Best score ${bestRun}. Start again for a new lane mix and a cleaner crossing.`
        : "Each level shuffles hazards and market panic.";
    const lines = drawWrappedText(body, textX, cardY + 128, textColumnWidth, 28);
    ctx.fillStyle = "rgba(244, 239, 227, 0.8)";
    ctx.font = "500 16px 'Avenir Next', 'Segoe UI', sans-serif";
    ctx.fillText("Press Start Run or move to begin.", textX, cardY + 128 + lines * 28 + 30);

    if (state.result === "seized" && trumpImage.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imageX, imageY, imageWidth, imageHeight, 22);
      ctx.clip();
      ctx.drawImage(trumpImage, imageX, imageY, imageWidth, imageHeight);
      ctx.restore();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(imageX, imageY, imageWidth, imageHeight, 22);
      ctx.stroke();
    }
  }
}

function draw() {
  drawBackdrop();

  for (const lane of state.lanes) {
    for (const hazard of lane.hazards) {
      drawHazard(lane, hazard);
    }
  }

  drawPlayer();
  drawLabels();
}

let lastFrame = performance.now();
function loop(timestamp) {
  const dt = Math.min((timestamp - lastFrame) / 1000, 0.033);
  lastFrame = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function handleMoveCommand(command) {
  markFirstInteraction();
  movePlayer(command);
}

document.addEventListener("keydown", (event) => {
  const keyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right"
  };

  const direction = keyMap[event.key];
  if (!direction) {
    return;
  }

  event.preventDefault();
  handleMoveCommand(direction);
});

document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    handleMoveCommand(button.dataset.move);
  });
});

restartButton.addEventListener("click", () => {
  markFirstInteraction();
  if (state.active || state.result !== "idle") {
    sessionStats.restartClicks += 1;
    trackEvent("restart_clicked", {
      prior_outcome: state.result,
      prior_level: state.level,
      prior_run_score: Math.round(state.runScore)
    });
  }
  resetGame("button");
});

trackEvent("page_loaded", {
  page_title: document.title,
  experience: "hormuz_hopper"
});

window.addEventListener("pagehide", () => {
  sendSessionSummary("pagehide");
});

window.addEventListener("beforeunload", () => {
  sendSessionSummary("beforeunload");
});

draw();
requestAnimationFrame(loop);
