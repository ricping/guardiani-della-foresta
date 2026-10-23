const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startButton = document.getElementById("start-button");
const levelButtons = Array.from(document.querySelectorAll("[data-level]"));
const savedCountEl = document.getElementById("saved-count");
const lostCountEl = document.getElementById("lost-count");
const timerEl = document.getElementById("timer");
const statusTextEl = document.getElementById("status-text");

const LEVELS = {
  easy: {
    label: "Facile",
    totalAnimals: 18,
    maxLost: 10,
    duration: 120,
    rescueRadius: 34,
    hunterCount: 3,
    hunterSpeedMin: 26,
    hunterSpeedMax: 34,
    hunterVisionRange: 160,
    hunterVisionArc: 0.95,
  },
  medium: {
    label: "Medio",
    totalAnimals: 18,
    maxLost: 5,
    duration: 100,
    rescueRadius: 30,
    hunterCount: 4,
    hunterSpeedMin: 30,
    hunterSpeedMax: 39,
    hunterVisionRange: 178,
    hunterVisionArc: 1.05,
  },
  hard: {
    label: "Difficile",
    totalAnimals: 18,
    maxLost: 1,
    duration: 85,
    rescueRadius: 26,
    hunterCount: 5,
    hunterSpeedMin: 33,
    hunterSpeedMax: 43,
    hunterVisionRange: 195,
    hunterVisionArc: 1.15,
  },
};

const WORLD = {
  width: canvas.width,
  height: canvas.height,
  sanctuary: { x: 42, y: 408, width: 190, height: 150 },
};

const SPECIES = [
  { key: "deer", label: "cervo", color: "#8f6847", accent: "#cfaa7b", dark: "#4d3728", speed: 78, size: 13 },
  { key: "fox", label: "volpe", color: "#b55c2d", accent: "#f0dbc2", dark: "#512f20", speed: 88, size: 11 },
  { key: "boar", label: "cinghiale", color: "#5d4b40", accent: "#8c7a68", dark: "#302923", speed: 68, size: 14 },
  { key: "hare", label: "lepre", color: "#a99b87", accent: "#eadfce", dark: "#5b5147", speed: 96, size: 10 },
];

const keys = new Set();
let gameState;
let selectedLevelId = "easy";
let lastTime = 0;
let animationFrame = 0;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function insideRect(entity, rect) {
  return entity.x > rect.x && entity.x < rect.x + rect.width && entity.y > rect.y && entity.y < rect.y + rect.height;
}

function moveEntity(entity, dx, dy) {
  entity.x = clamp(entity.x + dx, entity.radius, WORLD.width - entity.radius);
  entity.y = clamp(entity.y + dy, entity.radius, WORLD.height - entity.radius);
}

function moveAnimal(animal, dx, dy) {
  if (Math.hypot(dx, dy) > 0.01) {
    animal.facing = Math.atan2(dy, dx);
    animal.step += Math.hypot(dx, dy) * 0.08;
  }
  moveEntity(animal, dx, dy);
}

function createObstacles() {
  return [
    { x: 292, y: 90, radius: 34, kind: "tree" },
    { x: 365, y: 206, radius: 28, kind: "tree" },
    { x: 312, y: 360, radius: 30, kind: "tree" },
    { x: 468, y: 124, radius: 22, kind: "rock" },
    { x: 544, y: 274, radius: 34, kind: "tree" },
    { x: 635, y: 144, radius: 28, kind: "tree" },
    { x: 760, y: 238, radius: 22, kind: "rock" },
    { x: 720, y: 438, radius: 32, kind: "tree" },
    { x: 515, y: 468, radius: 24, kind: "rock" },
    { x: 850, y: 116, radius: 32, kind: "tree" },
  ];
}

function separateFromObstacles(entity) {
  for (const obstacle of gameState.obstacles) {
    const dx = entity.x - obstacle.x;
    const dy = entity.y - obstacle.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const minDist = obstacle.radius + entity.radius + 4;
    if (dist < minDist) {
      const push = minDist - dist;
      entity.x += (dx / dist) * push;
      entity.y += (dy / dist) * push;
      entity.x = clamp(entity.x, entity.radius, WORLD.width - entity.radius);
      entity.y = clamp(entity.y, entity.radius, WORLD.height - entity.radius);
    }
  }
}

function spawnPoint() {
  let point = null;
  for (let i = 0; i < 200; i += 1) {
    const candidate = { x: rand(280, WORLD.width - 60), y: rand(50, WORLD.height - 50), radius: 12 };
    const blockedByObstacle = gameState?.obstacles?.some((obstacle) => distance(candidate, obstacle) < obstacle.radius + 42);
    const blockedByHunter = gameState?.hunters?.some((hunter) => distance(candidate, hunter) < 130);
    const blockedByPlayer = gameState?.player && distance(candidate, gameState.player) < 120;
    const blockedBySanctuary = insideRect(candidate, {
      x: WORLD.sanctuary.x - 20,
      y: WORLD.sanctuary.y - 20,
      width: WORLD.sanctuary.width + 40,
      height: WORLD.sanctuary.height + 40,
    });
    const blocked = blockedByObstacle || blockedByHunter || blockedByPlayer || blockedBySanctuary;
    if (!blocked) {
      point = candidate;
      break;
    }
  }
  return point || { x: rand(320, WORLD.width - 80), y: rand(70, WORLD.height - 70), radius: 12 };
}

function createAnimal(index) {
  const species = SPECIES[index % SPECIES.length];
  const point = spawnPoint();
  return {
    id: index,
    x: point.x,
    y: point.y,
    radius: species.size,
    species,
    speed: species.speed,
    state: "wild",
    following: false,
    fear: rand(0, Math.PI * 2),
    facing: rand(0, Math.PI * 2),
    step: rand(0, Math.PI * 2),
    wanderDir: rand(0, Math.PI * 2),
    wanderTimer: rand(0.8, 2.6),
  };
}

function respawnAnimal(slotIndex) {
  const animal = createAnimal(gameState.nextAnimalId);
  gameState.nextAnimalId += 1;
  gameState.animals[slotIndex] = animal;
  return animal;
}

function getLevelConfig(levelId) {
  return LEVELS[levelId] ?? LEVELS.easy;
}

function refreshLevelButtons() {
  for (const button of levelButtons) {
    button.classList.toggle("is-active", button.dataset.level === selectedLevelId);
  }
}

function createHunter(index, level) {
  const starts = [
    { x: 914, y: 84, dir: Math.PI },
    { x: 902, y: 314, dir: Math.PI * 0.92 },
    { x: 902, y: 518, dir: Math.PI * 1.08 },
  ];
  const base = starts[index % starts.length];
  return {
    x: base.x,
    y: base.y,
    radius: 15,
    speed: rand(level.hunterSpeedMin, level.hunterSpeedMax),
    facing: base.dir,
    state: "patrol",
    patrolTimer: rand(1.4, 3.4),
    patrolDir: base.dir,
    visionRange: level.hunterVisionRange,
    visionArc: level.hunterVisionArc,
    targetId: null,
    alert: 0,
  };
}

function resetGame() {
  const level = getLevelConfig(selectedLevelId);
  gameState = {
    running: false,
    won: false,
    lost: false,
    saved: 0,
    lostAnimals: 0,
    timeLeft: level.duration,
    message: "Premi Inizia missione",
    level,
    player: {
      x: 118,
      y: WORLD.height / 2,
      radius: 14,
      baseSpeed: 250,
      speedBoost: 1.55,
    },
    obstacles: createObstacles(),
    animals: [],
    hunters: Array.from({ length: level.hunterCount }, (_, index) => createHunter(index, level)),
    nextAnimalId: level.totalAnimals,
  };

  gameState.animals = Array.from({ length: level.totalAnimals }, (_, index) => createAnimal(index));
  refreshLevelButtons();
  updateHud();
  draw();
}

function startGame() {
  resetGame();
  gameState.running = true;
  gameState.message = `Modalita ${gameState.level.label}: avvicinati agli animali e guidali al rifugio`;
  updateHud();
}

function updateHud() {
  savedCountEl.textContent = `${gameState.saved} / ${gameState.level.totalAnimals}`;
  lostCountEl.textContent = `${gameState.lostAnimals} / ${gameState.level.maxLost}`;
  timerEl.textContent = `${Math.max(0, Math.ceil(gameState.timeLeft))}`;
  statusTextEl.textContent = gameState.message;
}

function endGame(won, message) {
  gameState.running = false;
  gameState.won = won;
  gameState.lost = !won;
  gameState.message = message;
  updateHud();
}

function updatePlayer(delta) {
  const player = gameState.player;
  const moveX = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
  const moveY = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
  const running = keys.has("Shift");
  const speed = player.baseSpeed * (running ? player.speedBoost : 1);
  const len = Math.hypot(moveX, moveY) || 1;

  moveEntity(player, (moveX / len) * speed * delta, (moveY / len) * speed * delta);
  separateFromObstacles(player);

  let newFollowers = 0;
  for (const animal of gameState.animals) {
    if (animal.state !== "wild") continue;
    if (distance(player, animal) < gameState.level.rescueRadius) {
      animal.state = "following";
      animal.following = true;
      newFollowers += 1;
    }
  }

  if (newFollowers > 0) {
    gameState.message = "Portali al rifugio";
  }
}

function nearestThreat(animal) {
  let threat = null;
  let nearest = Infinity;
  for (const hunter of gameState.hunters) {
    const dist = distance(animal, hunter);
    if (dist < nearest) {
      nearest = dist;
      threat = hunter;
    }
  }
  return { threat, dist: nearest };
}

function updateAnimals(delta) {
  const player = gameState.player;

  for (const animal of gameState.animals) {
    if (animal.state === "dead" || animal.state === "saved") continue;

    const { threat, dist } = nearestThreat(animal);
    if (animal.state === "following") {
      const angle = Math.atan2(player.y - animal.y, player.x - animal.x);
      const targetDist = distance(animal, player);
      if (targetDist > 24) {
        moveAnimal(animal, Math.cos(angle) * animal.speed * delta, Math.sin(angle) * animal.speed * delta);
      }
      if (dist < 90 && threat) {
        const fleeAngle = Math.atan2(animal.y - threat.y, animal.x - threat.x);
        moveAnimal(animal, Math.cos(fleeAngle) * animal.speed * 0.65 * delta, Math.sin(fleeAngle) * animal.speed * 0.65 * delta);
      }
    } else {
      if (dist < 120 && threat) {
        const fleeAngle = Math.atan2(animal.y - threat.y, animal.x - threat.x);
        moveAnimal(animal, Math.cos(fleeAngle) * animal.speed * delta, Math.sin(fleeAngle) * animal.speed * delta);
      } else {
        animal.wanderTimer -= delta;
        if (animal.wanderTimer <= 0) {
          animal.wanderTimer = rand(1.2, 3.2);
          animal.wanderDir = rand(0, Math.PI * 2);
        }
        moveAnimal(animal, Math.cos(animal.wanderDir) * animal.speed * 0.22 * delta, Math.sin(animal.wanderDir) * animal.speed * 0.22 * delta);
      }
    }

    separateFromObstacles(animal);

    if (animal.state === "following" && insideRect(animal, WORLD.sanctuary)) {
      animal.state = "saved";
      animal.following = false;
      gameState.saved += 1;
      gameState.message = `${animal.species.label} salvato: arriva un nuovo animale`;
      if (gameState.saved < gameState.level.totalAnimals) {
        const slotIndex = gameState.animals.indexOf(animal);
        if (slotIndex !== -1) {
          respawnAnimal(slotIndex);
        }
      }
      if (gameState.saved === gameState.level.totalAnimals) {
        endGame(true, "Hai salvato tutti gli animali previsti.");
      }
    }
  }
}

function pickHunterTarget(hunter) {
  let bestAnimal = null;
  let bestDistance = Infinity;

  for (const animal of gameState.animals) {
    if (animal.state === "dead" || animal.state === "saved") continue;
    const dist = distance(hunter, animal);
    const angleToAnimal = Math.atan2(animal.y - hunter.y, animal.x - hunter.x);
    const inCone = Math.abs(angleDiff(angleToAnimal, hunter.facing)) < hunter.visionArc / 2;
    if (dist < hunter.visionRange && inCone && dist < bestDistance) {
      bestAnimal = animal;
      bestDistance = dist;
    }
  }

  return bestAnimal;
}

function updateHunter(hunter, delta) {
  const seenAnimal = pickHunterTarget(hunter);
  if (seenAnimal) {
    hunter.state = "chase";
    hunter.targetId = seenAnimal.id;
    hunter.alert = 1;
  } else if (hunter.state === "chase") {
    hunter.alert -= delta;
    if (hunter.alert <= 0) {
      hunter.state = "patrol";
      hunter.targetId = null;
    }
  }

  if (hunter.state === "patrol") {
    hunter.patrolTimer -= delta;
    if (hunter.patrolTimer <= 0) {
      hunter.patrolTimer = rand(1.5, 3.5);
      hunter.patrolDir += rand(-1.2, 1.2);
    }
    hunter.facing = hunter.patrolDir;
    moveEntity(hunter, Math.cos(hunter.facing) * hunter.speed * delta, Math.sin(hunter.facing) * hunter.speed * delta);
    if (hunter.x < 260 || hunter.x > WORLD.width - 20 || hunter.y < 20 || hunter.y > WORLD.height - 20) {
      hunter.patrolDir += Math.PI * 0.8;
    }
  } else {
    const target = gameState.animals.find((animal) => animal.id === hunter.targetId && animal.state !== "dead" && animal.state !== "saved");
    if (!target) {
      hunter.state = "patrol";
      hunter.targetId = null;
      return;
    }
    hunter.facing = Math.atan2(target.y - hunter.y, target.x - hunter.x);
    moveEntity(hunter, Math.cos(hunter.facing) * hunter.speed * 1.18 * delta, Math.sin(hunter.facing) * hunter.speed * 1.18 * delta);
  }

  separateFromObstacles(hunter);

  for (let index = 0; index < gameState.animals.length; index += 1) {
    const animal = gameState.animals[index];
    if (animal.state === "dead" || animal.state === "saved") continue;
    if (distance(hunter, animal) < hunter.radius + animal.radius + 2) {
      animal.state = "dead";
      animal.following = false;
      gameState.lostAnimals += 1;
      if (gameState.lostAnimals < gameState.level.maxLost) {
        const replacement = respawnAnimal(index);
        gameState.message = `Un ${animal.species.label} e stato ucciso: arriva un ${replacement.species.label}`;
      } else {
        gameState.message = `Un ${animal.species.label} e stato ucciso`;
      }
      if (gameState.lostAnimals >= gameState.level.maxLost) {
        endGame(false, `Hai perso: i cacciatori hanno ucciso ${gameState.level.maxLost} animali.`);
      }
    }
  }
}

function updateHunters(delta) {
  for (const hunter of gameState.hunters) {
    updateHunter(hunter, delta);
  }
}

function update(delta) {
  if (!gameState.running) return;

  gameState.timeLeft -= delta;
  if (gameState.timeLeft <= 0) {
    endGame(false, "Il tempo e finito. La zona e stata persa.");
    return;
  }

  updatePlayer(delta);
  updateAnimals(delta);
  updateHunters(delta);
  updateHud();
}

function drawGround() {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, "#95a57f");
  gradient.addColorStop(0.55, "#798d68");
  gradient.addColorStop(1, "#5a7052");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.ellipse(130 + i * 110, 90 + (i % 3) * 180, 80, 34, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#6c7f5d";
  ctx.beginPath();
  ctx.moveTo(210, 0);
  ctx.bezierCurveTo(286, 118, 280, 250, 244, 370);
  ctx.bezierCurveTo(225, 430, 242, 530, 286, 600);
  ctx.lineTo(414, 600);
  ctx.bezierCurveTo(388, 520, 372, 430, 391, 328);
  ctx.bezierCurveTo(414, 198, 438, 103, 382, 0);
  ctx.closePath();
  ctx.fill();
}

function drawSanctuary() {
  const s = WORLD.sanctuary;
  ctx.fillStyle = "rgba(215, 194, 138, 0.18)";
  ctx.fillRect(s.x - 14, s.y - 14, s.width + 28, s.height + 28);
  ctx.fillStyle = "#ccb584";
  ctx.fillRect(s.x, s.y, s.width, s.height);
  ctx.fillStyle = "#8a6848";
  ctx.fillRect(s.x + 18, s.y + 28, 68, 84);
  ctx.fillRect(s.x + 98, s.y + 42, 74, 70);
  ctx.fillStyle = "#5b4330";
  ctx.beginPath();
  ctx.moveTo(s.x + 8, s.y + 28);
  ctx.lineTo(s.x + 52, s.y - 4);
  ctx.lineTo(s.x + 96, s.y + 28);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s.x + 92, s.y + 42);
  ctx.lineTo(s.x + 136, s.y + 8);
  ctx.lineTo(s.x + 182, s.y + 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#223026";
  ctx.font = "bold 22px Georgia";
  ctx.fillText("Rifugio", s.x + 48, s.y + 130);
}

function drawObstacle(obstacle) {
  if (obstacle.kind === "tree") {
    ctx.fillStyle = "#5b432e";
    ctx.beginPath();
    ctx.ellipse(obstacle.x, obstacle.y + obstacle.radius * 0.82, obstacle.radius * 0.18, obstacle.radius * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d4332";
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
    ctx.arc(obstacle.x - obstacle.radius * 0.72, obstacle.y + 8, obstacle.radius * 0.64, 0, Math.PI * 2);
    ctx.arc(obstacle.x + obstacle.radius * 0.7, obstacle.y + 6, obstacle.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#7c807d";
    ctx.beginPath();
    ctx.ellipse(obstacle.x, obstacle.y, obstacle.radius, obstacle.radius * 0.74, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawLegs(length, color, step) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  const lift = Math.sin(step) * 2.5;
  const pairs = [
    [-7, 5, lift],
    [-2, 6, -lift],
    [6, 5, -lift],
    [10, 4, lift],
  ];
  for (const [x, y, offset] of pairs) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + offset * 0.35, y + length);
    ctx.stroke();
  }
}

function drawEye(x, y) {
  ctx.fillStyle = "#16120e";
  ctx.beginPath();
  ctx.arc(x, y, 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x + 0.35, y - 0.35, 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawAnimal(animal) {
  if (animal.state === "dead" || animal.state === "saved") return;

  ctx.save();
  ctx.translate(animal.x, animal.y);
  ctx.rotate(animal.facing || 0);
  ctx.fillStyle = "rgba(22, 25, 18, 0.2)";
  ctx.beginPath();
  ctx.ellipse(-1, animal.radius * 0.72, animal.radius * 1.3, animal.radius * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = animal.species.color;
  ctx.strokeStyle = animal.species.dark;
  ctx.lineWidth = 1.2;

  if (animal.species.key === "deer") {
    drawLegs(10, animal.species.dark, animal.step);
    ctx.beginPath();
    ctx.ellipse(-2, 0, 16, 8, 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(-7, -3, 6, 2.4, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = animal.species.accent;
    ctx.beginPath();
    ctx.ellipse(13, -3, 6.8, 5, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = animal.species.color;
    ctx.beginPath();
    ctx.moveTo(11, -7);
    ctx.lineTo(7, -14);
    ctx.lineTo(15, -9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, -7);
    ctx.lineTo(20, -13);
    ctx.lineTo(19, -5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#5f442e";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(13, -8);
    ctx.lineTo(11, -18);
    ctx.moveTo(13, -8);
    ctx.lineTo(18, -17);
    ctx.moveTo(11, -14);
    ctx.lineTo(7, -18);
    ctx.moveTo(17, -14);
    ctx.lineTo(22, -17);
    ctx.stroke();
    drawEye(17, -4);
  } else if (animal.species.key === "fox") {
    drawLegs(7, animal.species.dark, animal.step);
    ctx.beginPath();
    ctx.ellipse(-2, 0, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.bezierCurveTo(-22, -8, -28, -2, -15, 7);
    ctx.lineTo(-19, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = animal.species.accent;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-26, -2);
    ctx.lineTo(-17, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = animal.species.color;
    ctx.beginPath();
    ctx.moveTo(8, -6);
    ctx.lineTo(12, -14);
    ctx.lineTo(15, -6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, -6);
    ctx.lineTo(20, -13);
    ctx.lineTo(21, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = animal.species.accent;
    ctx.beginPath();
    ctx.ellipse(12, -2, 7, 4.6, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = animal.species.dark;
    ctx.beginPath();
    ctx.arc(18, -1, 1.4, 0, Math.PI * 2);
    ctx.fill();
    drawEye(13, -4);
  } else if (animal.species.key === "boar") {
    drawLegs(8, animal.species.dark, animal.step);
    ctx.beginPath();
    ctx.ellipse(-2, 0, 17, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(45, 35, 29, 0.55)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-12 + i * 5, -8);
      ctx.lineTo(-10 + i * 5, -12);
      ctx.stroke();
    }
    ctx.fillStyle = animal.species.accent;
    ctx.beginPath();
    ctx.ellipse(13, -1, 7, 5.4, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = animal.species.dark;
    ctx.beginPath();
    ctx.ellipse(19, -1, 2.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e7dfd1";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(17, 2);
    ctx.quadraticCurveTo(21, 6, 23, 1);
    ctx.moveTo(17, -3);
    ctx.quadraticCurveTo(21, -7, 23, -2);
    ctx.stroke();
    drawEye(13, -5);
  } else {
    drawLegs(8, animal.species.dark, animal.step);
    ctx.beginPath();
    ctx.ellipse(-2, 1, 11, 6.8, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = animal.species.accent;
    ctx.beginPath();
    ctx.ellipse(8, -2, 5, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = animal.species.color;
    ctx.beginPath();
    ctx.ellipse(5, -14, 2.2, 10, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(11, -14, 2.1, 9, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,245,225,0.55)";
    ctx.beginPath();
    ctx.ellipse(5, -14, 0.9, 7, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(11, -14, 0.8, 6.2, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = animal.species.dark;
    ctx.beginPath();
    ctx.arc(13, -2, 1.1, 0, Math.PI * 2);
    ctx.fill();
    drawEye(8, -4);
  }

  if (animal.state === "following") {
    ctx.strokeStyle = "rgba(243, 217, 110, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, animal.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHunter(hunter) {
  ctx.save();
  ctx.translate(hunter.x, hunter.y);

  ctx.fillStyle = hunter.state === "chase" ? "rgba(152, 58, 45, 0.2)" : "rgba(40, 28, 18, 0.1)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, hunter.visionRange, hunter.facing - hunter.visionArc / 2, hunter.facing + hunter.visionArc / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#664430";
  ctx.beginPath();
  ctx.ellipse(0, 5, 12, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ceb295";
  ctx.beginPath();
  ctx.arc(0, -10, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4c5c3e";
  ctx.beginPath();
  ctx.moveTo(-10, -15);
  ctx.lineTo(0, -23);
  ctx.lineTo(10, -15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#241d18";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(3, -1);
  ctx.lineTo(24, 7);
  ctx.stroke();

  ctx.restore();
}

function drawPlayer() {
  const player = gameState.player;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = "#4e6b50";
  ctx.beginPath();
  ctx.ellipse(0, 5, 12, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d6c0a2";
  ctx.beginPath();
  ctx.arc(0, -10, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#314534";
  ctx.beginPath();
  ctx.moveTo(-10, -15);
  ctx.lineTo(0, -22);
  ctx.lineTo(10, -15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#2e241a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(0, 21);
  ctx.stroke();
  ctx.restore();
}

function drawOverlay() {
  if (gameState.running) return;

  ctx.fillStyle = "rgba(10, 18, 11, 0.42)";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.fillStyle = "#f4ecdd";
  ctx.beginPath();
  ctx.roundRect(238, 168, 484, 188, 24);
  ctx.fill();
  ctx.fillStyle = "#1f2c21";
  ctx.font = "bold 34px Georgia";
  ctx.fillText(gameState.won ? "Foresta salvata" : "Operazione di salvataggio", 300, 228);
  ctx.font = "20px Georgia";
  ctx.fillText(gameState.message, 300, 274);
  ctx.fillText(`Livello: ${gameState.level.label}`, 300, 308);
  ctx.fillText("Scegli un livello, poi premi il pulsante o R.", 300, 336);
}

function draw() {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  drawGround();
  drawSanctuary();
  for (const obstacle of gameState.obstacles) drawObstacle(obstacle);
  for (const hunter of gameState.hunters) drawHunter(hunter);
  for (const animal of gameState.animals) drawAnimal(animal);
  drawPlayer();
  drawOverlay();
}

function frame(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000 || 0, 0.033);
  lastTime = timestamp;
  update(delta);
  draw();
  animationFrame = window.requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(event.key);
  keys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === "r") startGame();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", startGame);
for (const button of levelButtons) {
  button.addEventListener("click", () => {
    selectedLevelId = button.dataset.level;
    startGame();
  });
}

resetGame();
cancelAnimationFrame(animationFrame);
animationFrame = window.requestAnimationFrame(frame);
