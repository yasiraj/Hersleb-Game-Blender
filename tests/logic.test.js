import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, startGame, pauseGame, resumeGame, restartGame, interact, tickGame,
  movePlayer, createNavGrid, findPath, lineOfSight, horizontalDistance, REQUIRED_ITEMS,
} from '../src/game/logic.js';

const wall = (min, max, extra = {}) => ({ min, max, ...extra });
const close = (actual, expected, tolerance = 0.001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};
function playing(options = {}) {
  return startGame(createGameState({ enemySpawn: [0, 0, -25], gracePeriod: 1000, ...options }));
}
function worldFor(colliders = [], extra = {}) {
  return {
    colliders,
    navGrid: createNavGrid(colliders, { bounds: { minX: -10, maxX: 10, minZ: -30, maxZ: 30 }, step: 0.5 }),
    patrol: [],
    ...extra,
  };
}

test('a large movement cannot tunnel through a thin wall, and preserves sliding', () => {
  const colliders = [wall([0, 0, -20], [0.025, 3, 20])];
  const end = movePlayer([-4, 0, -3], [100, 0, 6], colliders);
  close(end.x, -0.32);
  close(end.z, 3);
  close(end.y, 0);
});

test('two intersecting walls stop diagonal movement at a corner', () => {
  const colliders = [wall([0, 0, -10], [0.2, 3, 10]), wall([-10, 0, 0], [10, 3, 0.2])];
  const end = movePlayer([-1, 0, -1], [8, 0, 8], colliders);
  close(end.x, -0.32);
  close(end.z, -0.32);
});

test('circular corner clearance is preserved rather than expanding a square footprint', () => {
  const box = wall([0, 0, 0], [2, 3, 2]);
  const clear = movePlayer([-1, 0, -1], [0.77, 0, 0.77], [box]);
  close(clear.x, -0.23);
  close(clear.z, -0.23);
  const blocked = movePlayer([-1, 0, -1], [3, 0, 3], [box]);
  close(Math.hypot(blocked.x, blocked.z), 0.32);
  assert.ok(blocked.x < 0 && blocked.z < 0);
});

test('floor colliders are harmless, while crouching changes overhead clearance', () => {
  const floor = wall([-20, -0.3, -20], [20, 0, 20]);
  const overhead = wall([0, 1.1, -2], [0.2, 3, 2]);
  close(movePlayer([-1, 0, 0], [2, 0, 0], [floor]).x, 1);
  close(movePlayer([-1, 0, 0], [2, 0, 0], [floor, overhead]).x, -0.32);
  close(movePlayer([-1, 0, 0], [2, 0, 0], [floor, overhead], { crouched: true }).x, 1);
});

test('navigation routes around a wall and every resulting segment is collision-safe', () => {
  const colliders = [wall([-0.1, 0, -2], [0.1, 3, 2])];
  const grid = createNavGrid(colliders, { bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, step: 0.5 });
  const goal = { x: 3, y: 0, z: 0 };
  const path = findPath(grid, [-3, 0, 0], goal);
  assert.ok(path.length >= 2);
  assert.ok(path.some(p => Math.abs(p.z) >= 2.34));
  let previous = { x: -3, y: 0, z: 0 };
  for (const waypoint of path) {
    const moved = movePlayer(previous, { x: waypoint.x - previous.x, z: waypoint.z - previous.z }, colliders, { radius: grid.radius });
    close(moved.x, waypoint.x);
    close(moved.z, waypoint.z);
    previous = waypoint;
  }
  assert.deepEqual(path.at(-1), goal);
});

test('navigation checks edges across walls thinner than its grid spacing', () => {
  const thinWall = wall([0.23, 0, -5], [0.27, 3, 5]);
  const grid = createNavGrid([thinWall], {
    bounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }, step: 1, radius: 0.1,
  });
  assert.deepEqual(findPath(grid, [-2, 0, 0], [2, 0, 0]), []);
});

test('sight is blocked by walls, ignores the ground, and distinguishes crouched height', () => {
  const floor = wall([-10, -0.4, -10], [10, 0, 10]);
  assert.equal(lineOfSight([-2, 0, 0], [2, 0, 0], [floor]), true);
  assert.equal(lineOfSight([-2, 0, 0], [2, 0, 0], [wall([-0.1, 0, -1], [0.1, 3, 1])]), false);
  const desk = wall([0.7, 0, -1], [0.9, 1.3, 1]);
  assert.equal(lineOfSight([-2, 0, 0], [2, 0, 0], [desk]), true);
  assert.equal(lineOfSight([-2, 0, 0], [2, 0, 0], [desk], { targetEyeHeight: 0.92 }), false);
});

test('gate cannot unlock before all three objects and restored power; escape is a separate step', () => {
  const state = playing({ spawn: [0, 0, 0] });
  const world = worldFor([], { exit: { position: [0, 0, 4], radius: 0.5 } });
  const gate = { id: 'exit-gate', kind: 'exit-gate', position: [0, 0, 0] };
  const breaker = { id: 'breaker', position: [0, 0, 0] };
  assert.equal(interact(state, gate).ok, false);
  assert.equal(interact(state, breaker).ok, false);
  for (const id of REQUIRED_ITEMS) assert.equal(interact(state, { id, kind: 'collectable', position: [0, 0, 0] }).ok, true);
  assert.equal(interact(state, gate).ok, false);
  assert.equal(interact(state, breaker).ok, true);
  assert.equal(interact(state, gate).ok, true);
  assert.equal(state.phase, 'playing');
  const events = tickGame(state, 2, { moveZ: 1 }, world);
  assert.equal(state.phase, 'escaped');
  assert.equal(events.filter(e => e.type === 'escaped').length, 1);
  assert.equal(tickGame(state, 1, {}, world).some(e => e.type === 'escaped'), false);
});

test('interaction respects range and duplicate collectibles do not advance progress', () => {
  const state = playing({ spawn: [0, 0, 0] });
  const item = { id: 'student-id', kind: 'item', position: [0, 0, 5] };
  assert.equal(interact(state, item).ok, false);
  assert.equal(state.inventory.size, 0);
  item.position = [0, 0, 2];
  assert.equal(interact(state, item).ok, true);
  assert.equal(interact(state, item).ok, false);
  assert.equal(state.inventory.size, 1);
  assert.equal(tickGame(state, 0).filter(e => e.type === 'collected').length, 1);
  assert.equal(tickGame(state, 0).length, 0);
});

test('sprinting drains stamina, exhaustion prevents full-speed movement, and rest recovers it', () => {
  const state = playing({ spawn: [0, 0, 0] });
  const world = worldFor();
  tickGame(state, 1, { moveX: 1, sprint: true }, world);
  close(state.player.position.x, 4.5);
  close(state.player.stamina, 78);
  tickGame(state, 3.6, { moveX: 1, sprint: true }, world);
  assert.ok(state.player.stamina <= 0.001);
  const exhaustedX = state.player.position.x;
  tickGame(state, 0.5, { moveX: 1, sprint: true }, world);
  close(state.player.position.x - exhaustedX, 1.35);
  tickGame(state, 3, {}, world);
  assert.ok(state.player.stamina > 30 && state.player.stamina <= 100);
  tickGame(state, 10, {}, world);
  close(state.player.stamina, 100);
});

test('the initial grace has a warning and paused games do not advance simulation', () => {
  const state = playing({ spawn: [0, 0, 0], enemySpawn: [0, 0, 1.5], gracePeriod: 12 });
  const world = worldFor();
  const early = tickGame(state, 9, {}, world);
  assert.equal(state.phase, 'playing');
  assert.equal(early.some(e => e.type === 'spotted' || e.type === 'warning'), false);
  const warning = tickGame(state, 1.2, {}, world);
  assert.equal(warning.filter(e => e.type === 'warning').length, 1);
  pauseGame(state);
  const before = structuredClone({ elapsed: state.elapsed, player: state.player, enemy: state.enemy });
  tickGame(state, 20, { moveX: 1, sprint: true }, world);
  assert.deepEqual({ elapsed: state.elapsed, player: state.player, enemy: state.enemy }, before);
  resumeGame(state);
  const active = tickGame(state, 2.5, {}, world);
  assert.equal(state.phase, 'caught');
  assert.equal(active.filter(e => e.type === 'caught').length, 1);
});

test('an exposed student triggers pursuit; hiding breaks it and search eventually releases', () => {
  const state = playing({ spawn: [0, 0, 0], enemySpawn: [0, 0, 6], gracePeriod: 0 });
  state.enemy.facing = { x: 0, z: -1 };
  const hideSpot = { id: 'locker-1', kind: 'hideSpot', position: [0, 0, 0] };
  const world = worldFor([], { hideSpots: [hideSpot], patrol: [[0, 0, 6]] });
  const sight = tickGame(state, 0.1, {}, world);
  assert.equal(state.enemy.mode, 'chase');
  assert.equal(sight.filter(e => e.type === 'spotted').length, 1);
  assert.equal(interact(state, hideSpot, world).ok, true);
  const hiddenEvents = tickGame(state, 9, {}, world);
  assert.equal(state.phase, 'playing');
  assert.ok(state.player.hiding);
  assert.ok(['return', 'patrol'].includes(state.enemy.mode));
  assert.equal(hiddenEvents.some(e => e.type === 'caught'), false);
  assert.equal(interact(state, hideSpot, world).ok, true);
  assert.equal(state.player.hiding, null);
  close(state.player.position.x, 0);
  close(state.player.position.z, 0);
});

test('pursuer follows a route around a wall rather than crossing or catching through it', () => {
  const colliders = [wall([-0.1, 0, -1], [0.1, 3, 1])];
  const world = worldFor(colliders);
  const state = playing({ spawn: [2, 0, 0], enemySpawn: [-2, 0, 0], gracePeriod: 0 });
  state.enemy.mode = 'chase';
  state.enemy.lastKnown = { ...state.player.position };
  state.enemy.facing = { x: 1, z: 0 };
  let wentAround = false;
  for (let i = 0; i < 40 && state.phase === 'playing'; i++) {
    const previous = { ...state.enemy.position };
    tickGame(state, 0.1, {}, world);
    const p = state.enemy.position;
    if (Math.abs(p.z) >= 1.34) wentAround = true;
    assert.ok(!(Math.abs(p.x) < 0.44 - 0.001 && Math.abs(p.z) < 1), 'enemy must remain outside the expanded wall');
    assert.ok(horizontalDistance(previous, p) <= 0.321, 'pursuer cannot teleport between path nodes');
  }
  assert.equal(wentAround, true);
  assert.equal(state.phase, 'caught');
});

test('walls block visual detection while nearby sprinting can still be heard', () => {
  const colliders = [wall([-0.1, 0, -8], [0.1, 3, 8])];
  const world = worldFor(colliders);
  const state = playing({ spawn: [-3, 0, 0], enemySpawn: [3, 0, 0], gracePeriod: 0 });
  state.enemy.facing = { x: -1, z: 0 };
  tickGame(state, 0.2, {}, world);
  assert.equal(state.enemy.mode, 'patrol');
  tickGame(state, 0.1, { moveZ: 1, sprint: true }, world);
  assert.equal(state.enemy.mode, 'search');
  assert.equal(state.events.some(e => e.type === 'spotted'), false);
  assert.ok(state.enemy.position.x >= 0.44 - 0.001);
});

test('caught state is terminal until restart, which restores all objectives and spawns', () => {
  const state = playing({ spawn: [4, 0, 2], enemySpawn: [4, 0, 2.5], gracePeriod: 0 });
  const world = worldFor();
  interact(state, { id: 'fuse', kind: 'item' });
  tickGame(state, 0.1, {}, world);
  assert.equal(state.phase, 'caught');
  const position = { ...state.player.position };
  tickGame(state, 1, { moveX: 1 }, world);
  assert.deepEqual(state.player.position, position);
  assert.equal(interact(state, { id: 'archive-key', kind: 'item' }).ok, false);
  state.breakerOn = true;
  state.gateUnlocked = true;
  restartGame(state);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.player.position, { x: 4, y: 0, z: 2 });
  assert.equal(state.inventory.size, 0);
  assert.equal(state.breakerOn, false);
  assert.equal(state.gateUnlocked, false);
  assert.equal(state.elapsed, 0);
  assert.equal(state.player.stamina, 100);
});
