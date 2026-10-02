/**
 * Dependency-free survival-horror rules. Positions are ground positions in metres;
 * both {x, y, z} objects and [x, y, z] arrays are accepted at the API boundary.
 * State is mutated deliberately so renderers can retain references to it.
 */

export const REQUIRED_ITEMS = Object.freeze(['student-id', 'fuse', 'archive-key']);
export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.04;

const EPS = 1e-7;
const SKIN = 0.0001;
const TWO_PI = Math.PI * 2;
const navCache = new WeakMap();

export function positionOf(value, fallback = { x: 0, y: 0, z: 0 }) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return { x: Number(value[0]) || 0, y: Number(value[1]) || 0, z: Number(value[2]) || 0 };
  }
  return {
    x: Number(value?.x ?? fallback.x) || 0,
    y: Number(value?.y ?? fallback.y) || 0,
    z: Number(value?.z ?? fallback.z) || 0,
  };
}

export function horizontalDistance(a, b) {
  a = positionOf(a);
  b = positionOf(b);
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function boxOf(collider) {
  return { min: positionOf(collider.min), max: positionOf(collider.max) };
}

function overlapsHeight(box, groundY, height) {
  return box.max.y > groundY + EPS && box.min.y < groundY + height - EPS;
}

function penetration(point, box, radius) {
  const closestX = Math.max(box.min.x, Math.min(box.max.x, point.x));
  const closestZ = Math.max(box.min.z, Math.min(box.max.z, point.z));
  const dx = point.x - closestX;
  const dz = point.z - closestZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius - EPS) return null;
  if (distance > EPS) {
    return { x: dx / distance, z: dz / distance, depth: radius - distance };
  }
  // The centre is inside the rectangle. Choose its nearest exterior face.
  const faces = [
    { x: -1, z: 0, depth: point.x - box.min.x + radius },
    { x: 1, z: 0, depth: box.max.x - point.x + radius },
    { x: 0, z: -1, depth: point.z - box.min.z + radius },
    { x: 0, z: 1, depth: box.max.z - point.z + radius },
  ];
  return faces.reduce((best, face) => face.depth < best.depth ? face : best);
}

function sweepCircle(point, delta, box, radius) {
  let best = null;
  const consider = (t, nx, nz) => {
    if (t < -EPS || t > 1 + EPS || delta.x * nx + delta.z * nz >= -EPS) return;
    t = Math.max(0, Math.min(1, t));
    if (!best || t < best.t - EPS) best = { t, x: nx, z: nz };
  };
  // Sweep against the four flat sections of the rounded expanded rectangle.
  if (delta.x > EPS) {
    const t = (box.min.x - radius - point.x) / delta.x;
    const z = point.z + delta.z * t;
    if (z >= box.min.z - EPS && z <= box.max.z + EPS) consider(t, -1, 0);
  } else if (delta.x < -EPS) {
    const t = (box.max.x + radius - point.x) / delta.x;
    const z = point.z + delta.z * t;
    if (z >= box.min.z - EPS && z <= box.max.z + EPS) consider(t, 1, 0);
  }
  if (delta.z > EPS) {
    const t = (box.min.z - radius - point.z) / delta.z;
    const x = point.x + delta.x * t;
    if (x >= box.min.x - EPS && x <= box.max.x + EPS) consider(t, 0, -1);
  } else if (delta.z < -EPS) {
    const t = (box.max.z + radius - point.z) / delta.z;
    const x = point.x + delta.x * t;
    if (x >= box.min.x - EPS && x <= box.max.x + EPS) consider(t, 0, 1);
  }
  // Swept point-versus-circle tests preserve actual circular corner clearance.
  const a = delta.x * delta.x + delta.z * delta.z;
  if (a > EPS * EPS) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = sx < 0 ? box.min.x : box.max.x;
        const cz = sz < 0 ? box.min.z : box.max.z;
        const ox = point.x - cx;
        const oz = point.z - cz;
        const b = ox * delta.x + oz * delta.z;
        const discriminant = b * b - a * (ox * ox + oz * oz - radius * radius);
        if (discriminant < 0) continue;
        const t = (-b - Math.sqrt(discriminant)) / a;
        if (t < -EPS || t > 1 + EPS) continue;
        const hx = point.x + delta.x * t - cx;
        const hz = point.z + delta.z * t - cz;
        if (hx * sx < -EPS || hz * sz < -EPS) continue;
        const length = Math.hypot(hx, hz);
        if (length > EPS) consider(t, hx / length, hz / length);
      }
    }
  }
  return best;
}

/** Continuous swept-circle movement with wall sliding; large deltas cannot tunnel. */
export function movePlayer(position, delta, colliders = [], options = {}) {
  const result = positionOf(position);
  delta = positionOf(delta);
  const radius = options.radius ?? PLAYER_RADIUS;
  const height = options.height ?? (options.crouched ? CROUCH_HEIGHT : PLAYER_HEIGHT);
  const boxes = colliders.filter(c => c.enabled !== false).map(boxOf)
    .filter(box => overlapsHeight(box, result.y, height));

  // Recover gracefully from a spawn or uncrouch that slightly overlaps a wall.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const box of boxes) {
      const overlap = penetration(result, box, radius);
      if (!overlap) continue;
      result.x += overlap.x * (overlap.depth + SKIN);
      result.z += overlap.z * (overlap.depth + SKIN);
      changed = true;
    }
    if (!changed) break;
  }

  let remaining = { x: delta.x, z: delta.z };
  for (let pass = 0; pass < 8 && Math.hypot(remaining.x, remaining.z) > EPS; pass++) {
    let hit = null;
    for (const box of boxes) {
      const next = sweepCircle(result, remaining, box, radius);
      if (next && (!hit || next.t < hit.t - EPS)) hit = next;
    }
    if (!hit) {
      result.x += remaining.x;
      result.z += remaining.z;
      break;
    }
    const length = Math.hypot(remaining.x, remaining.z);
    const travel = Math.max(0, hit.t - SKIN / length);
    result.x += remaining.x * travel;
    result.z += remaining.z * travel;
    remaining.x *= 1 - travel;
    remaining.z *= 1 - travel;
    const inward = remaining.x * hit.x + remaining.z * hit.z;
    if (inward < 0) {
      remaining.x -= hit.x * inward;
      remaining.z -= hit.z * inward;
    }
  }
  return result;
}

function segmentClear(a, b, colliders, radius, height) {
  a = positionOf(a);
  b = positionOf(b);
  const delta = { x: b.x - a.x, z: b.z - a.z };
  for (const collider of colliders) {
    if (collider.enabled === false) continue;
    const box = boxOf(collider);
    if (!overlapsHeight(box, a.y, height)) continue;
    if (penetration(a, box, radius) || penetration(b, box, radius) || sweepCircle(a, delta, box, radius)) return false;
  }
  return true;
}

/** Ground positions are raised to eye level. Set eyeHeight/targetEyeHeight to 0 for rays. */
export function lineOfSight(from, to, colliders = [], options = {}) {
  const a = positionOf(from);
  const b = positionOf(to);
  a.y += options.eyeHeight ?? 1.58;
  b.y += options.targetEyeHeight ?? 1.58;
  const delta = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  for (const collider of colliders) {
    if (collider.enabled === false || collider.blocksSight === false) continue;
    const box = boxOf(collider);
    let near = 0;
    let far = 1;
    let intersects = true;
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(delta[axis]) < EPS) {
        if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) { intersects = false; break; }
      } else {
        let t1 = (box.min[axis] - a[axis]) / delta[axis];
        let t2 = (box.max[axis] - a[axis]) / delta[axis];
        if (t1 > t2) [t1, t2] = [t2, t1];
        near = Math.max(near, t1);
        far = Math.min(far, t2);
        if (near > far) { intersects = false; break; }
      }
    }
    if (intersects && far > EPS && near < 1 - EPS) return false;
  }
  return true;
}

/** Navigation nodes and edges both respect walls, including walls thinner than a cell. */
export function createNavGrid(colliders = [], options = {}) {
  const bounds = options.bounds ?? { minX: -38, maxX: 38, minZ: -35, maxZ: 35 };
  const step = options.step ?? 0.75;
  if (!(step > 0) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) {
    throw new RangeError('Navigation grid needs positive spacing and nonempty bounds.');
  }
  const width = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
  const depth = Math.floor((bounds.maxZ - bounds.minZ) / step) + 1;
  const radius = options.radius ?? 0.34;
  const height = options.height ?? PLAYER_HEIGHT;
  const floorY = options.floorY ?? 0;
  const blocked = new Uint8Array(width * depth);
  const boxes = colliders.filter(c => c.enabled !== false).map(boxOf).filter(b => overlapsHeight(b, floorY, height));
  const pointAt = (x, z) => ({ x: bounds.minX + x * step, y: floorY, z: bounds.minZ + z * step });
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const point = pointAt(x, z);
      blocked[z * width + x] = boxes.some(box => penetration(point, box, radius)) ? 1 : 0;
    }
  }
  return {
    bounds: { ...bounds }, step, width, depth, radius, height, floorY, colliders, blocked,
    pointAt,
    isWalkable(x, z) { return x >= 0 && z >= 0 && x < width && z < depth && !blocked[z * width + x]; },
  };
}

function nearestNode(grid, position) {
  const p = positionOf(position);
  const originX = Math.round((p.x - grid.bounds.minX) / grid.step);
  const originZ = Math.round((p.z - grid.bounds.minZ) / grid.step);
  let best = null;
  let bestDistance = Infinity;
  // Search nearby cells only; never snap across an intervening wall.
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = originX + dx;
      const z = originZ + dz;
      if (!grid.isWalkable(x, z)) continue;
      const point = grid.pointAt(x, z);
      const distance = horizontalDistance(point, p);
      if (distance >= bestDistance || !segmentClear(p, point, grid.colliders, grid.radius, grid.height)) continue;
      best = { x, z, index: z * grid.width + x };
      bestDistance = distance;
    }
  }
  return best;
}

class MinHeap {
  entries = [];
  push(entry) {
    const a = this.entries;
    let i = a.length;
    a.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].score <= entry.score) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = entry;
  }
  pop() {
    const a = this.entries;
    if (!a.length) return null;
    const first = a[0];
    const tail = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].score < a[child].score) child++;
        if (tail.score <= a[child].score) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = tail;
    }
    return first;
  }
}

/** Returns collision-safe waypoints, including the exact requested destination. */
export function findPath(grid, start, goal) {
  start = positionOf(start);
  goal = positionOf(goal);
  const from = nearestNode(grid, start);
  const to = nearestNode(grid, goal);
  if (!from || !to) return [];
  if (segmentClear(start, goal, grid.colliders, grid.radius, grid.height)) return [{ ...goal }];
  const size = grid.width * grid.depth;
  const cost = new Float64Array(size).fill(Infinity);
  const previous = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new MinHeap();
  const heuristic = (x, z) => Math.hypot(to.x - x, to.z - z);
  cost[from.index] = 0;
  open.push({ index: from.index, score: heuristic(from.x, from.z) });
  let reached = false;
  while (open.entries.length) {
    const { index } = open.pop();
    if (closed[index]) continue;
    if (index === to.index) { reached = true; break; }
    closed[index] = 1;
    const x = index % grid.width;
    const z = Math.floor(index / grid.width);
    for (const dz of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        if (!dx && !dz) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (!grid.isWalkable(nx, nz)) continue;
        if (dx && dz && (!grid.isWalkable(x + dx, z) || !grid.isWalkable(x, z + dz))) continue;
        const nextIndex = nz * grid.width + nx;
        if (closed[nextIndex]) continue;
        if (!segmentClear(grid.pointAt(x, z), grid.pointAt(nx, nz), grid.colliders, grid.radius, grid.height)) continue;
        const candidate = cost[index] + (dx && dz ? Math.SQRT2 : 1);
        if (candidate >= cost[nextIndex]) continue;
        cost[nextIndex] = candidate;
        previous[nextIndex] = index;
        open.push({ index: nextIndex, score: candidate + heuristic(nx, nz) });
      }
    }
  }
  if (!reached) return [];
  const raw = [];
  for (let index = to.index; index !== -1; index = previous[index]) {
    raw.push(grid.pointAt(index % grid.width, Math.floor(index / grid.width)));
    if (index === from.index) break;
  }
  raw.reverse();
  raw.push(goal);
  // String pulling keeps pursuit smooth without rounding a path through a wall.
  const path = [];
  let anchor = start;
  let i = 0;
  while (i < raw.length) {
    let farthest = i;
    for (let j = i + 1; j < raw.length; j++) {
      if (segmentClear(anchor, raw[j], grid.colliders, grid.radius, grid.height)) farthest = j;
    }
    const waypoint = raw[farthest];
    if (horizontalDistance(anchor, waypoint) > EPS) path.push({ ...waypoint });
    anchor = waypoint;
    i = farthest + 1;
  }
  return path;
}

export function createGameState(options = {}) {
  const spawn = positionOf(options.spawn ?? [0, 0, 14]);
  const enemySpawn = positionOf(options.enemySpawn ?? [0, 0, -18]);
  const patrol = (options.patrol ?? [[-10, 0, -19], [10, 0, -19], [10, 0, -6], [-10, 0, -6]])
    .map(position => positionOf(position));
  return {
    phase: 'title', elapsed: 0, inventory: new Set(), breakerOn: false, gateUnlocked: false,
    player: {
      position: spawn, stamina: 100, crouched: false, hiding: null, sprinting: false,
      sprintLocked: false, recoveryDelay: 0, stepDistance: 0, noise: 0,
    },
    enemy: {
      position: enemySpawn, mode: 'patrol', facing: { x: 0, z: 1 }, patrolIndex: 0,
      target: null, lastKnown: null, path: [], pathIndex: 0, repathTimer: 0,
      unseenTime: 0, searchTime: 0, spottedCooldown: 0, warningIssued: false,
    },
    events: [], _pendingEvents: [],
    _options: { spawn: { ...spawn }, enemySpawn: { ...enemySpawn }, patrol: patrol.map(p => ({ ...p })),
      gracePeriod: options.gracePeriod ?? 12 },
  };
}

export function startGame(state) {
  if (state.phase === 'title') {
    state.phase = 'playing';
    state._pendingEvents.push({ type: 'started' });
  } else if (state.phase === 'caught' || state.phase === 'escaped') restartGame(state);
  return state;
}

export function pauseGame(state) {
  if (state.phase === 'playing') {
    state.phase = 'paused';
    state.player.sprinting = false;
    state.player.noise = 0;
  }
  return state;
}

export function resumeGame(state) {
  if (state.phase === 'paused') state.phase = 'playing';
  return state;
}

export function restartGame(state) {
  const fresh = createGameState(state._options);
  Object.assign(state, fresh);
  startGame(state);
  return state;
}

function activeColliders(state, world) {
  return (world.colliders ?? []).filter(collider => {
    if (collider.enabled === false) return false;
    const tag = collider.id ?? collider.tag ?? collider.kind;
    return !state.gateUnlocked || !['gate', 'exit-gate', 'street-gate'].includes(tag);
  });
}

function itemId(id) {
  return String(id ?? '').replaceAll('_', '-');
}

function objectKind(object, world) {
  const kind = object.kind ?? object.type;
  if (REQUIRED_ITEMS.includes(itemId(object.id))) return 'item';
  if (['item', 'collectable', 'collectible'].includes(kind)) return 'item';
  if (kind === 'breaker' || object.id === 'breaker') return 'breaker';
  if (['exit', 'gate', 'exit-gate', 'street-gate'].includes(kind) || ['gate', 'exit-gate', 'street-gate'].includes(object.id)) return 'gate';
  if (['hide', 'hideSpot', 'hide-spot', 'locker'].includes(kind) || world?.hideSpots?.some(spot => spot.id === object.id)) return 'hide';
  return kind;
}

function queueEvent(state, event) {
  state._pendingEvents.push(event);
}

export function interact(state, object, world = {}) {
  if (state.phase !== 'playing') return { ok: false, message: 'Resume the game first.' };
  if (!object) return { ok: false, message: 'Nothing within reach.' };
  const kind = objectKind(object, world);
  if (state.player.hiding && kind === 'hide') {
    const hiding = state.player.hiding;
    state.player.position = movePlayer(hiding.returnPosition, { x: 0, z: 0 }, activeColliders(state, world));
    state.player.crouched = hiding.wasCrouched;
    state.player.hiding = null;
    queueEvent(state, { type: 'unhide', id: hiding.id });
    return { ok: true, message: 'You leave your hiding place.' };
  }
  if (state.player.hiding) return { ok: false, message: 'Leave your hiding place first.' };
  if (object.position && horizontalDistance(state.player.position, object.position) > (object.interactionDistance ?? 2.3)) {
    return { ok: false, message: 'Move closer.' };
  }
  if (kind === 'item') {
    const id = itemId(object.id);
    if (!REQUIRED_ITEMS.includes(id)) return { ok: false, message: 'This cannot be collected.' };
    if (state.inventory.has(id)) return { ok: false, message: 'Already collected.' };
    state.inventory.add(id);
    queueEvent(state, { type: 'collected', id });
    const names = { 'student-id': 'student ID', fuse: 'fuse', 'archive-key': 'archive key' };
    return { ok: true, message: `Collected the ${names[id]}.` };
  }
  if (kind === 'breaker') {
    if (state.breakerOn) return { ok: false, message: 'The power is already restored.' };
    if (!state.inventory.has('fuse')) return { ok: false, message: 'The breaker needs a fuse.' };
    state.breakerOn = true;
    queueEvent(state, { type: 'breaker-on' });
    return { ok: true, message: 'Power restored. The street gate can open.' };
  }
  if (kind === 'gate') {
    if (state.gateUnlocked) return { ok: false, message: 'The gate is open. Get out into the street.' };
    if (!REQUIRED_ITEMS.every(id => state.inventory.has(id))) {
      return { ok: false, message: 'You need your student ID, the fuse, and the archive key.' };
    }
    if (!state.breakerOn) return { ok: false, message: 'Restore power at the breaker first.' };
    state.gateUnlocked = true;
    queueEvent(state, { type: 'gate-unlocked' });
    return { ok: true, message: 'Gate unlocked. Get out into the street.' };
  }
  if (kind === 'hide') {
    state.player.hiding = {
      id: object.id, returnPosition: { ...state.player.position }, wasCrouched: state.player.crouched,
    };
    state.player.position = positionOf(object.hidePosition ?? object.position ?? state.player.position);
    state.player.crouched = true;
    state.player.sprinting = false;
    state.player.noise = 0;
    queueEvent(state, { type: 'hide', id: object.id });
    return { ok: true, message: 'Stay quiet. Press E to leave.' };
  }
  return { ok: false, message: 'Nothing happens.' };
}

export function objectiveText(state) {
  if (state.phase === 'caught') return 'Caught. Try again and listen before moving.';
  if (state.phase === 'escaped') return 'You made it out of Hersleb.';
  if (state.gateUnlocked) return 'The gate is open. Escape into the street.';
  const missing = REQUIRED_ITEMS.filter(id => !state.inventory.has(id));
  if (missing.length) {
    const names = { 'student-id': 'student ID', fuse: 'fuse', 'archive-key': 'archive key' };
    return `Find the ${missing.map(id => names[id]).join(', ')}. (${3 - missing.length}/3)`;
  }
  if (!state.breakerOn) return 'Install the fuse at the breaker to restore power.';
  return 'Unlock the street gate and get out.';
}

function navFor(world) {
  if (world.navGrid) return world.navGrid;
  let cached = navCache.get(world);
  if (!cached || cached.colliders !== world.colliders) {
    cached = { colliders: world.colliders, grid: createNavGrid(world.colliders ?? [], world.navOptions) };
    navCache.set(world, cached);
  }
  return cached.grid;
}

function setEnemyMode(state, mode, events) {
  const enemy = state.enemy;
  if (enemy.mode === mode) return;
  const previous = enemy.mode;
  enemy.mode = mode;
  enemy.path = [];
  enemy.pathIndex = 0;
  enemy.repathTimer = 0;
  enemy.searchTime = 0;
  events.push({ type: 'enemy-mode', mode, previous });
  if (mode === 'chase' && enemy.spottedCooldown <= 0) {
    events.push({ type: 'spotted' });
    enemy.spottedCooldown = 12;
  }
}

function moveEnemyToward(state, target, speed, dt, world, colliders) {
  const enemy = state.enemy;
  if (!target) return;
  const changedTarget = !enemy.target || horizontalDistance(enemy.target, target) > 0.85;
  if (enemy.repathTimer <= 0 || changedTarget) {
    enemy.path = findPath(navFor(world), enemy.position, target);
    enemy.pathIndex = 0;
    enemy.target = { ...target };
    enemy.repathTimer = enemy.mode === 'chase' ? 0.45 : 1.1;
  }
  let distanceBudget = speed * dt;
  while (distanceBudget > EPS && enemy.pathIndex < enemy.path.length) {
    const waypoint = enemy.path[enemy.pathIndex];
    const dx = waypoint.x - enemy.position.x;
    const dz = waypoint.z - enemy.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.025) { enemy.pathIndex++; continue; }
    enemy.facing = { x: dx / distance, z: dz / distance };
    const travel = Math.min(distance, distanceBudget);
    const next = movePlayer(enemy.position, { x: dx / distance * travel, z: dz / distance * travel }, colliders,
      { radius: 0.34, height: PLAYER_HEIGHT });
    const actual = horizontalDistance(enemy.position, next);
    enemy.position = next;
    distanceBudget -= travel;
    if (actual < travel * 0.25) {
      enemy.repathTimer = 0;
      break;
    }
    if (travel >= distance - EPS) enemy.pathIndex++;
  }
}

function advancePlayer(state, dt, input, world, colliders, events) {
  const player = state.player;
  const oldPosition = { ...player.position };
  player.crouched = player.hiding ? true : Boolean(input.crouch);
  let mx = Number(input.moveX) || 0;
  let mz = Number(input.moveZ) || 0;
  const inputLength = Math.hypot(mx, mz);
  if (inputLength > 1) { mx /= inputLength; mz /= inputLength; }
  const wantsSprint = Boolean(input.sprint) && inputLength > EPS && !player.crouched && !player.hiding;
  if (player.sprintLocked && player.stamina >= 22) player.sprintLocked = false;
  player.sprinting = wantsSprint && !player.sprintLocked && player.stamina > EPS;
  if (!player.hiding) {
    const speed = player.crouched ? 1.3 : player.sprinting ? 4.5 : 2.7;
    player.position = movePlayer(player.position, { x: mx * speed * dt, z: mz * speed * dt }, colliders,
      { height: player.crouched ? CROUCH_HEIGHT : PLAYER_HEIGHT });
    if (world.bounds) {
      const bounds = world.bounds;
      player.position.x = Math.max(bounds.minX + PLAYER_RADIUS, Math.min(bounds.maxX - PLAYER_RADIUS, player.position.x));
      player.position.z = Math.max(bounds.minZ + PLAYER_RADIUS, Math.min(bounds.maxZ - PLAYER_RADIUS, player.position.z));
    }
  }
  const moved = horizontalDistance(oldPosition, player.position);
  if (player.sprinting && moved > EPS) {
    player.stamina = Math.max(0, player.stamina - 22 * dt);
    player.recoveryDelay = 1.05;
    if (player.stamina === 0) { player.sprintLocked = true; player.sprinting = false; }
  } else {
    player.sprinting = false;
    const recoveringTime = Math.max(0, dt - player.recoveryDelay);
    player.recoveryDelay = Math.max(0, player.recoveryDelay - dt);
    player.stamina = Math.min(100, player.stamina + 16 * recoveringTime);
  }
  player.noise = moved > EPS ? (player.crouched ? 0.06 : player.sprinting ? 1 : 0.35) : 0;
  player.stepDistance += moved;
  const stepLength = player.crouched ? 0.9 : player.sprinting ? 1.35 : 1.15;
  while (player.stepDistance >= stepLength) {
    player.stepDistance -= stepLength;
    events.push({ type: 'footstep', volume: player.crouched ? 0.12 : player.sprinting ? 0.8 : 0.38,
      surface: player.position.z > 0 ? 'street' : 'school' });
  }
}

/** Enemy perception and navigation, useful independently of a renderer. */
export function updateEnemy(state, dt, world = {}, events = state.events ?? []) {
  if (state.phase !== 'playing' || !(dt > 0)) return events;
  const enemy = state.enemy;
  const player = state.player;
  const colliders = activeColliders(state, world);
  const patrol = (world.patrol ?? state._options.patrol).map(p => positionOf(p));
  enemy.repathTimer -= dt;
  enemy.spottedCooldown = Math.max(0, enemy.spottedCooldown - dt);
  const grace = state._options.gracePeriod;
  const active = state.elapsed >= grace;
  if (!enemy.warningIssued && state.elapsed >= Math.max(0, grace - 2)) {
    enemy.warningIssued = true;
    events.push({ type: 'warning' });
  }
  const distance = horizontalDistance(enemy.position, player.position);
  const dx = player.position.x - enemy.position.x;
  const dz = player.position.z - enemy.position.z;
  const inView = distance < 2.2 || distance < EPS || (dx * enemy.facing.x + dz * enemy.facing.z) / distance >= Math.cos(Math.PI / 3);
  const visible = active && !player.hiding && distance <= (world.visionRange ?? 13) && inView
    && lineOfSight(enemy.position, player.position, colliders, { targetEyeHeight: player.crouched ? 0.92 : 1.58 });
  const hearingRange = player.noise >= 0.9 ? 9.5 : player.noise > 0.1 ? 3.2 : 0;
  const heard = active && !player.hiding && hearingRange > 0 && distance <= hearingRange;

  if (visible) {
    setEnemyMode(state, 'chase', events);
    enemy.lastKnown = { ...player.position };
    enemy.unseenTime = 0;
  } else if (enemy.mode === 'chase') {
    enemy.unseenTime += dt;
    // A locker ends direct pursuit. Searching has a finite duration so it cannot camp forever.
    if (player.hiding || enemy.unseenTime >= 2.5) setEnemyMode(state, 'search', events);
  } else if (heard && enemy.mode !== 'search') {
    enemy.lastKnown = { ...player.position };
    setEnemyMode(state, 'search', events);
  }

  if (enemy.mode === 'chase') {
    moveEnemyToward(state, enemy.lastKnown, 3.2, dt, world, colliders);
  } else if (enemy.mode === 'search') {
    enemy.searchTime += dt;
    if (enemy.lastKnown && horizontalDistance(enemy.position, enemy.lastKnown) > 0.45 && enemy.searchTime < 5) {
      moveEnemyToward(state, enemy.lastKnown, 1.65, dt, world, colliders);
    } else {
      const angle = Math.atan2(enemy.facing.z, enemy.facing.x) + dt * 0.8;
      enemy.facing = { x: Math.cos(angle % TWO_PI), z: Math.sin(angle % TWO_PI) };
    }
    if (enemy.searchTime >= 8) {
      enemy.lastKnown = null;
      setEnemyMode(state, 'return', events);
      if (patrol.length) {
        let nearest = 0;
        for (let i = 1; i < patrol.length; i++) {
          if (horizontalDistance(enemy.position, patrol[i]) < horizontalDistance(enemy.position, patrol[nearest])) nearest = i;
        }
        enemy.patrolIndex = nearest;
      }
    }
  } else if (patrol.length) {
    const target = patrol[enemy.patrolIndex % patrol.length];
    moveEnemyToward(state, target, 1, dt, world, colliders);
    if (horizontalDistance(enemy.position, target) < 0.45) {
      enemy.patrolIndex = (enemy.patrolIndex + 1) % patrol.length;
      enemy.repathTimer = 0;
      if (enemy.mode === 'return') setEnemyMode(state, 'patrol', events);
    }
  } else if (enemy.mode === 'return') setEnemyMode(state, 'patrol', events);

  if (active && !player.hiding && horizontalDistance(enemy.position, player.position) < 0.72
    && lineOfSight(enemy.position, player.position, colliders, { targetEyeHeight: player.crouched ? 0.92 : 1.58 })) {
    state.phase = 'caught';
    player.sprinting = false;
    events.push({ type: 'caught' });
  }
  return events;
}

/** Advances exactly dt seconds in short steps and returns this tick's fresh events. */
export function tickGame(state, dt, input = {}, world = {}) {
  const events = state._pendingEvents.splice(0);
  state.events = events;
  if (state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return events;
  const colliders = activeColliders(state, world);
  let remaining = dt;
  while (remaining > EPS && state.phase === 'playing') {
    const step = Math.min(0.1, remaining);
    state.elapsed += step;
    advancePlayer(state, step, input, world, colliders, events);
    updateEnemy(state, step, world, events);
    // Crossing the street exit wins only after the complete objective sequence.
    const exit = world.exit ?? { position: [0, 0, 29], radius: 1.6 };
    const exitPosition = exit.position ?? exit;
    if (state.phase === 'playing' && state.gateUnlocked && state.breakerOn
      && REQUIRED_ITEMS.every(id => state.inventory.has(id)) && !state.player.hiding
      && horizontalDistance(state.player.position, exitPosition) <= (exit.radius ?? 1.6)) {
      state.phase = 'escaped';
      state.player.sprinting = false;
      events.push({ type: 'escaped' });
    }
    remaining -= step;
  }
  return events;
}
