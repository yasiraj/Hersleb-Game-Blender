import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  createGameState, startGame, pauseGame, resumeGame, restartGame,
  tickGame, interact, objectiveText, createNavGrid, horizontalDistance, positionOf, lineOfSight,
} from './game/logic.js';
import { HorrorAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const touchDevice = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let saved = {};
try { saved = JSON.parse(localStorage.getItem('hersleb-settings') || '{}'); } catch { /* Storage is optional. */ }
const settings = { sensitivity: 1, scares: true, quality: touchDevice ? 'low' : 'balanced', ...saved };
const audio = new HorrorAudio();
const keys = new Set();
const pointer = { x: 0, y: 0 };
const touchMove = { x: 0, y: 0 };
const camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, 0.08, 800);
camera.rotation.order = 'YXZ';
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14212a);
scene.fog = new THREE.FogExp2(0x14212a, 0.0095);
const clock = new THREE.Clock();
let renderer, controls, world, environment, enemyModel, playerHands, state;
let nearest = null, lastPhase = 'title', lastObjective = '', lastToast = 0;
let modalWasPlaying = false, cameraBob = 0, dragging = false, touchCrouch = false, lookPointerId = null;
let viewBeforeHiding = null;
let heroPosition = new THREE.Vector3(-39, 13, 54), heroTarget = new THREE.Vector3(-13, 6, -8);
let heroTime = 0, hudTime = 0, gateOpened = false, enemyStride = 0, lightingTime = 0;
const lights = [], interactableMeshes = new Map(), environmentMeshes = [];

function persistSettings() {
  try { localStorage.setItem('hersleb-settings', JSON.stringify(settings)); } catch { /* Storage is optional. */ }
}

function toast(text, duration = 4000) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  lastToast = performance.now() + duration;
}

function setSound(enabled) {
  audio.setEnabled(enabled);
  settings.sound = enabled;
  persistSettings();
  $('sound-label').textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
  $('sound-button').setAttribute('aria-pressed', String(enabled));
  $('sound-button').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
}

$('sound-button').addEventListener('click', () => {
  setSound(!audio.enabled);
  audio.unlock().catch(() => toast('Audio is unavailable in this browser. You can still play.'));
});

function start() {
  if (!state) return;
  closeModal();
  if (state.phase === 'title') startGame(state); else restartGame(state);
  resetVisuals();
  syncPhase();
  setSound(settings.sound ?? true);
  audio.unlock().catch(() => {});
  capturePointer();
  toast('Find your ID, a fuse, and the archive key. Listen for footsteps.', 6000);
}

function capturePointer() {
  if (touchDevice || state?.phase !== 'playing') return;
  try {
    const promise = canvas.requestPointerLock();
    if (promise?.catch) promise.catch(() => toast('Click and drag to look around. WASD to move.', 3500));
  } catch { toast('Click and drag to look around. WASD to move.', 3500); }
}

function releasePointer() {
  if (document.pointerLockElement) document.exitPointerLock();
  dragging = false;
  lookPointerId = null;
  keys.clear();
  touchMove.x = touchMove.y = 0;
}

function resetVisuals() {
  gateOpened = false;
  cameraBob = 0;
  enemyStride = 0;
  camera.rotation.set(0, 0, 0);
  if (world.spawnLookAt) {
    camera.position.copy(toVector(world.spawn)).add(new THREE.Vector3(0, 1.7, 0));
    camera.lookAt(toVector(world.spawnLookAt).add(new THREE.Vector3(0, 1.7, 0)));
  }
  for (const mesh of interactableMeshes.values()) mesh.visible = true;
  if (environment) {
    environment.traverse(object => {
      if (object.userData.initialPosition) object.position.copy(object.userData.initialPosition);
      if (object.userData.initialRotation) object.rotation.copy(object.userData.initialRotation);
    });
  }
}

function syncPhase() {
  const phase = state?.phase ?? 'title';
  document.body.dataset.phase = phase;
  const title = phase === 'title';
  $('title-screen').hidden = !title;
  $('masthead').hidden = !title;
  $('title-footer').hidden = !title;
  $('scene-caption').hidden = !title;
  $('hud').hidden = title || phase === 'caught' || phase === 'escaped';
  $('touch-controls').hidden = !touchDevice || phase !== 'playing';
  $('pause-screen').hidden = phase !== 'paused' || !$('modal').hidden;
  $('end-screen').hidden = !['caught', 'escaped'].includes(phase);
  if (phase === 'caught' || phase === 'escaped') {
    releasePointer();
    const escaped = phase === 'escaped';
    $('end-screen').classList.toggle('escaped', escaped);
    $('end-eyebrow').textContent = escaped ? 'CHAPTER 01 — COMPLETE' : 'THE SCHOOL IS NOT EMPTY';
    $('end-title').textContent = escaped ? 'Home. Almost.' : 'Found you.';
    $('end-copy').textContent = escaped
      ? 'The gate closes behind you. Across the courtyard, one classroom light comes back on.'
      : 'Some footsteps are not yours. Break its line of sight, find a locker, and wait until the halls fall silent.';
    $('retry-button').innerHTML = escaped ? 'Play another night <span>↗</span>' : 'Try again <span>↗</span>';
  }
  lastPhase = phase;
}

function pause() {
  if (state?.phase !== 'playing') return;
  pauseGame(state);
  releasePointer();
  syncPhase();
}

function resume() {
  if (state?.phase !== 'paused') return;
  closeModal();
  resumeGame(state);
  syncPhase();
  capturePointer();
}

$('start-button').addEventListener('click', start);
$('pause-button').addEventListener('click', pause);
$('resume-button').addEventListener('click', resume);
$('restart-button').addEventListener('click', start);
$('retry-button').addEventListener('click', start);
$('home-button').addEventListener('click', () => {
  state = createGameState({ spawn: world.spawn, enemySpawn: world.enemySpawn, patrol: world.patrol });
  resetVisuals();
  syncPhase();
});
document.querySelector('.brand').addEventListener('click', event => {
  event.preventDefault();
  if (state?.phase === 'playing') pause();
});

function flashlightToggle() {
  if (!flashlight) return;
  flashlight.visible = !flashlight.visible;
  $('flashlight-button').setAttribute('aria-pressed', String(flashlight.visible));
  if (state?.phase === 'playing') audio.noiseBurst(0.04, 0.07, 1200);
}
$('flashlight-button').addEventListener('click', flashlightToggle);

function useNearest() {
  if (state?.phase !== 'playing') return;
  const object = state.player.hiding
    ? world.hideSpots.find(spot => spot.id === state.player.hiding.id)
    : nearest;
  if (!object) { toast('Move closer to a locker, item, or control.'); return; }
  const result = interact(state, object, world);
  toast(result.message, 3000);
  updateHUD();
}
$('touch-interact').addEventListener('click', useNearest);

document.addEventListener('keydown', event => {
  if (event.code === 'Escape') {
    if (!$('modal').hidden) closeModal();
    else if (state?.phase === 'playing') pause();
    else if (state?.phase === 'paused') resume();
    return;
  }
  if (event.code === 'Tab' && !$('modal').hidden) {
    const focusable = [...$('modal').querySelectorAll('button, a, input, select')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.target.matches('input, select, textarea')) return;
  if (state?.phase === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyM', 'ControlLeft', 'ControlRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  keys.add(event.code);
  if (state?.phase === 'playing') {
    if (event.code === 'KeyE') useNearest();
    if (event.code === 'KeyF') flashlightToggle();
    if (event.code === 'KeyM' || event.code === 'Tab') openPanel('map');
  }
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

canvas.addEventListener('pointerdown', event => {
  if (state?.phase !== 'playing' || event.button > 0) return;
  if (lookPointerId !== null) return;
  dragging = true;
  lookPointerId = event.pointerId;
  if (touchDevice) canvas.setPointerCapture(event.pointerId);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (!touchDevice && !document.pointerLockElement) capturePointer();
});
for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, event => {
  if (event.pointerId !== lookPointerId) return;
  dragging = false;
  lookPointerId = null;
});
canvas.addEventListener('pointermove', event => {
  if (state?.phase !== 'playing' || document.pointerLockElement === canvas || !dragging || event.pointerId !== lookPointerId) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  camera.rotation.y -= dx * 0.003 * settings.sensitivity;
  camera.rotation.x = Math.max(-1.45, Math.min(1.45, camera.rotation.x - dy * 0.003 * settings.sensitivity));
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});

const joystick = $('joystick'), joystickKnob = $('joystick-knob');
let joystickPointer = null;
function moveJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  let dx = event.clientX - rect.left - rect.width / 2;
  let dy = event.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(dx, dy);
  if (distance > 34) { dx = dx / distance * 34; dy = dy / distance * 34; }
  touchMove.x = dx / 34; touchMove.y = dy / 34;
  joystickKnob.style.transform = `translate(${dx}px,${dy}px)`;
}
joystick.addEventListener('pointerdown', event => {
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) moveJoystick(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(type, () => {
  joystickPointer = null;
  touchMove.x = touchMove.y = 0;
  joystickKnob.style.transform = '';
});
$('touch-run').addEventListener('pointerdown', event => { keys.add('ShiftLeft'); event.currentTarget.setPointerCapture(event.pointerId); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-run').addEventListener(type, () => keys.delete('ShiftLeft'));
$('touch-crouch').addEventListener('click', () => {
  touchCrouch = !touchCrouch;
  $('touch-crouch').style.borderColor = touchCrouch ? '#ecdaaa' : '';
});

const panels = {
  story: { eyebrow: '01 — THE LAST BELL', title: 'You stayed too late.', content: `<p>You are a student at <strong>Hersleb videregående skole</strong>. You came back for a notebook. A light was still on. The front door was still open.</p><p>Now the street gate is locked. Your ID is at reception, the breaker is missing a fuse, and the archive key has vanished into the library. Somewhere behind you, a door closes.</p><p class="control-tip">Find what you need. Restore the power. Make it back to the street.<br /><strong>And when the footsteps stop, do not assume you are alone.</strong></p><p>This is a fictional horror story. Its characters and events are invented.</p>` },
  controls: { eyebrow: 'LISTEN. HIDE. SURVIVE.', title: 'Know your way out.', content: `<div class="controls-table"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><div>Move · mouse to look</div><span><kbd>SHIFT</kbd></span><div>Run. It is loud, and stamina runs out.</div><span><kbd>CTRL</kbd></span><div>Crouch to move quietly</div><span><kbd>E</kbd></span><div>Pick up, use, hide, or leave a locker</div><span><kbd>F</kbd></span><div>Toggle your flashlight</div><span><kbd>M</kbd></span><div>Open your exploration map</div><span><kbd>ESC</kbd></span><div>Pause and catch your breath</div></div><p class="control-tip">Doors do not need keys to enter. Follow the room signs. Break line of sight when chased and hide in a locker. Wait for the footsteps to pass.</p><p>On a phone: left thumbstick to move, drag the scene to look, and use the action buttons. If mouse capture is unavailable, click and drag to look.</p><div class="settings-row"><label for="sensitivity">Look sensitivity</label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="${settings.sensitivity}" /></div><div class="settings-row"><label for="scares">Sudden scare effects</label><input id="scares" type="checkbox" ${settings.scares ? 'checked' : ''} /></div><div class="settings-row"><label for="quality">Render quality</label><select id="quality"><option value="balanced" ${settings.quality === 'balanced' ? 'selected' : ''}>Balanced</option><option value="cinematic" ${settings.quality === 'cinematic' ? 'selected' : ''}>Cinematic</option><option value="low" ${settings.quality === 'low' ? 'selected' : ''}>Low</option></select></div>` },
  notes: { eyebrow: 'A REAL PLACE. A FICTIONAL NIGHT.', title: 'Behind the courtyard.', content: `<p>Hersleb stands at <strong>Herslebs gate 20b, Oslo</strong>. The school and surrounding building positions use public OpenStreetMap footprints. Its cream facade, hipped slate roof, dormers, and courtyard draw on public exterior photographs.</p><p><strong>Reconstruction status:</strong> this is a playable prototype. The room layout is provisional; current interior plans, facade measurements, and a full location survey remain unverified. It is not yet a 1:1 recreation.</p><p>Movement and glTF loading take inspiration from the <a href="https://github.com/mrdoob/three.js" target="_blank" rel="noreferrer">Three.js examples</a> and <a href="https://github.com/donmccurdy/three-gltf-viewer" target="_blank" rel="noreferrer">Don McCurdy’s glTF viewer</a>. The hiding and chase rhythm is inspired by DOORS, Pressure, and The Mimic.</p><p>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, ODbL. Exterior reference: <a href="https://commons.wikimedia.org/wiki/File:140824_Hersleb01.JPG" target="_blank" rel="noreferrer">Chell Hill, 2014</a>, CC BY-SA 4.0. Original game assets made in Blender.</p>` },
};

function mapContent() {
  if (!world) return '<p>The school map is loading.</p>';
  const bounds = world.bounds ?? world.navBounds ?? { minX: -40, maxX: 105, minZ: -35, maxZ: 55 };
  const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
  const sx = x => (x - bounds.minX) / width * 500;
  const sz = z => (z - bounds.minZ) / depth * 320;
  const walls = world.colliders.filter(c => c.max?.[1] > 0.6 && c.min?.[1] < 1.8).map(c => `<rect x="${sx(c.min[0])}" y="${sz(c.min[2])}" width="${Math.max(1,(c.max[0]-c.min[0])/width*500)}" height="${Math.max(1,(c.max[2]-c.min[2])/depth*320)}" fill="#36504b"/>`).join('');
  const points = world.interactables.filter(item => !state.inventory.has(item.id)).map(item => {
    const p = positionOf(item.position);
    return `<circle cx="${sx(p.x)}" cy="${sz(p.z)}" r="3" fill="${item.kind === 'hide' ? '#748e7b' : '#d6b77b'}"/>`;
  }).join('');
  const player = state.player.position;
  return `<svg class="school-map" viewBox="0 0 500 320" role="img" aria-label="Exploration map showing walls, supplies, and your position">${walls}${points}<circle cx="${sx(player.x)}" cy="${sz(player.z)}" r="6" fill="#b2c9bc" stroke="#101a1b" stroke-width="2"/></svg><div class="map-legend"><span><i class="legend-dot player"></i>You are here</span><span><i class="legend-dot"></i>Items & controls</span><span>Dark green · walls</span></div><p class="map-note">Your exploration map. The interior layout is provisional and awaiting verified school references.</p>`;
}

function openPanel(name) {
  if (state?.phase === 'playing') {
    modalWasPlaying = true;
    pauseGame(state);
    releasePointer();
  } else modalWasPlaying = false;
  const panel = name === 'map' ? { title: 'Find your bearings.', eyebrow: 'EXPLORATION MAP', content: mapContent() } : panels[name];
  if (!panel) return;
  $('modal-title').textContent = panel.title;
  $('modal-eyebrow').textContent = panel.eyebrow;
  $('modal-content').innerHTML = panel.content;
  $('modal').hidden = false;
  $('pause-screen').hidden = true;
  $('modal-close').focus();
  if (name === 'controls') {
    $('sensitivity').addEventListener('input', event => { settings.sensitivity = +event.target.value; if (controls) controls.pointerSpeed = settings.sensitivity; persistSettings(); });
    $('scares').addEventListener('change', event => { settings.scares = event.target.checked; persistSettings(); });
    $('quality').addEventListener('change', event => { settings.quality = event.target.value; applyQuality(); persistSettings(); });
    const soundRow = document.createElement('div');
    soundRow.className = 'settings-row';
    soundRow.innerHTML = `<label for="settings-sound">Sound</label><input id="settings-sound" type="checkbox" ${audio.enabled ? 'checked' : ''} />`;
    $('modal-content').appendChild(soundRow);
    $('settings-sound').addEventListener('change', event => { setSound(event.target.checked); audio.unlock().catch(() => {}); });
  }
}

function closeModal() {
  $('modal').hidden = true;
  if (modalWasPlaying && state?.phase === 'paused') {
    modalWasPlaying = false;
    resumeGame(state);
    syncPhase();
    capturePointer();
  } else if (state?.phase === 'paused') syncPhase();
}
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('click', event => { if (event.target === $('modal')) closeModal(); });
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => openPanel(button.dataset.panel)));
$('pause-controls-button').addEventListener('click', () => openPanel('controls'));
$('map-button').addEventListener('click', () => openPanel('map'));

let flashlight;
const flashTarget = new THREE.Object3D();
function addLighting() {
  scene.add(new THREE.HemisphereLight(0xc2d4e1, 0x3c4236, 1.3));
  const moon = new THREE.DirectionalLight(0xacc2d5, 1.9);
  moon.position.set(-35, 60, 30);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -90, right: 120, top: 80, bottom: -80, near: 1, far: 180 });
  moon.shadow.bias = -0.0005;
  scene.add(moon);
  for (const data of world.lights ?? []) {
    const light = new THREE.PointLight(data.color ?? 0xffbe72, data.intensity ?? 35, data.distance ?? 16, 2);
    light.position.copy(toVector(data.position));
    scene.add(light);
    lights.push({ light, base: light.intensity, data });
  }
  flashlight = new THREE.SpotLight(0xffe8bf, 55, 30, Math.PI / 7, 0.7, 1.5);
  flashlight.position.set(0.18, -0.12, 0);
  flashlight.target = flashTarget;
  camera.add(flashlight);
  camera.add(new THREE.PointLight(0x9fb9c3, 0.75, 3.5, 2));
  camera.add(flashTarget);
  flashTarget.position.set(0, 0, -10);
  scene.add(camera);
}

const toVector = p => { const v = positionOf(p); return new THREE.Vector3(v.x, v.y, v.z); };
let rain, rainPositions;
function makeRain() {
  const count = settings.quality === 'low' ? 220 : 550;
  rainPositions = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * 170 - 40, y = Math.random() * 33 + 1, z = Math.random() * 120 - 50;
    rainPositions.set([x,y,z,x-0.1,y-0.85,z+0.1],i*6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x98aeb4, transparent: true, opacity: 0.2, depthWrite: false }));
  scene.add(rain);
}

function updateRain(dt) {
  if (!rain || reducedMotion) return;
  for (let i = 0; i < rainPositions.length; i += 6) {
    rainPositions[i+1] -= dt * 17;
    if (rainPositions[i+1] < 0.3) rainPositions[i+1] = 33;
    rainPositions[i+4] = rainPositions[i+1] - 0.85;
  }
  rain.geometry.attributes.position.needsUpdate = true;
}

function normalizeWorld(data) {
  data.spawn ??= [18, 0, 18];
  data.enemySpawn ??= data.patrol?.[0] ?? [25, 0, -9];
  data.colliders ??= [];
  data.hideSpots ??= [];
  data.interactables ??= data.collectables ?? [];
  data.interactables = data.interactables.map(item => ({ ...item, kind: item.kind ?? item.type ?? (['student-id','fuse','archive-key'].includes(item.id) ? 'item' : item.id), interactionDistance: item.interactionDistance ?? item.radius }));
  for (const hide of data.hideSpots) if (!data.interactables.some(item => item.id === hide.id)) data.interactables.push({ ...hide, kind: 'hide' });
  const bounds = data.bounds ?? data.navBounds;
  data.bounds = bounds?.minX !== undefined ? bounds : bounds?.min ? {
    minX: bounds.min[0], maxX: bounds.max[0],
    minZ: bounds.min.length === 3 ? bounds.min[2] : bounds.min[1],
    maxZ: bounds.max.length === 3 ? bounds.max[2] : bounds.max[1],
  } : { minX: -45, maxX: 110, minZ: -50, maxZ: 65 };
  if (Object.values(data.bounds).some(value => !Number.isFinite(value))) throw new Error('Invalid school bounds.');
  data.navGrid = createNavGrid(data.colliders, { bounds: data.bounds, step: 0.75, radius: 0.34 });
  return data;
}

function applyQuality() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : settings.quality === 'cinematic' ? 2 : 1.5));
  renderer.shadowMap.enabled = settings.quality !== 'low';
}

function updatePracticalLights() {
  const limit = settings.quality === 'low' ? 6 : settings.quality === 'cinematic' ? lights.length : 12;
  const ranked = [...lights].sort((a,b) => a.light.position.distanceToSquared(camera.position) - b.light.position.distanceToSquared(camera.position));
  ranked.forEach(({light}, index) => { light.visible = index < limit; });
}

function updateHUD() {
  if (!state || !world) return;
  const objective = objectiveText(state);
  if (objective !== lastObjective) { $('objective-text').textContent = objective; lastObjective = objective; }
  $('objective-count').textContent = `${state.inventory.size} / 3`;
  $('stamina-bar').style.width = `${state.player.stamina}%`;
  $('stamina-label').textContent = Math.round(state.player.stamina);
  for (const slot of document.querySelectorAll('[data-item]')) slot.classList.toggle('collected', state.inventory.has(slot.dataset.item));
  $('hiding-indicator').hidden = !state.player.hiding;
  nearest = null;
  let nearestDistance = Infinity;
  if (state.player.hiding) {
    nearest = world.hideSpots.find(s => s.id === state.player.hiding.id);
  } else {
    for (const item of world.interactables) {
      if (state.inventory.has(item.id) || (item.kind === 'breaker' && state.breakerOn)) continue;
      const distance = horizontalDistance(state.player.position, item.position);
      const clear = item.kind === 'hide' || lineOfSight(state.player.position, item.position, world.colliders, { targetEyeHeight: 1.2 });
      if (distance < (item.interactionDistance ?? 2.3) && distance < nearestDistance && clear) {
        nearest = item; nearestDistance = distance;
      }
    }
  }
  $('interaction-prompt').hidden = !nearest;
  if (nearest) $('interaction-text').textContent = state.player.hiding ? 'Leave hiding place'
    : nearest.prompt ?? ({ 'student-id': 'Take student ID', fuse: 'Take the fuse', 'archive-key': 'Take archive key', breaker: 'Restore power', 'exit-gate': 'Unlock street gate' }[nearest.id] ?? (nearest.kind === 'hide' ? 'Hide in the locker' : nearest.label ?? 'Interact'));
  const p = state.player.position;
  let location = 'School courtyard';
  for (const region of world.locations ?? []) {
    const b = region.bounds;
    if (b && p.x >= (b.minX ?? b.min?.[0]) && p.x <= (b.maxX ?? b.max?.[0]) && p.z >= (b.minZ ?? b.min?.[2]) && p.z <= (b.maxZ ?? b.max?.[2])) location = region.name ?? region.label;
  }
  $('location-name').textContent = location;
}

function onGameEvent(event) {
  audio.event(event);
  if (event.type === 'hide') {
    const spot = world.hideSpots.find(spot => spot.id === event.id);
    viewBeforeHiding = camera.rotation.clone();
    if (spot?.hideLookAt) {
      camera.position.copy(toVector(state.player.position)).add(new THREE.Vector3(0,1.04,0));
      camera.lookAt(toVector(spot.hideLookAt));
    }
  }
  if (event.type === 'unhide' && viewBeforeHiding) {
    camera.rotation.copy(viewBeforeHiding);
    viewBeforeHiding = null;
  }
  if (event.type === 'collected') {
    const mesh = interactableMeshes.get(event.id);
    if (mesh) mesh.visible = false;
  }
  if (event.type === 'warning') toast('A bell. Then footsteps. Find a hiding place.', 5000);
  if (event.type === 'spotted') {
    toast('It saw you. Break line of sight. Hide.', 3200);
    if (settings.scares && !reducedMotion) {
      $('scare-flash').classList.remove('scare');
      void $('scare-flash').offsetWidth;
      $('scare-flash').classList.add('scare');
    }
  }
  if (event.type === 'gate-unlocked') openGate();
  if (event.type === 'caught' && settings.scares && !reducedMotion) {
    $('scare-flash').classList.add('scare');
    camera.lookAt(toVector(state.enemy.position).add(new THREE.Vector3(0, 1.65, 0)));
  }
}

function openGate() {
  if (gateOpened || !environment) return;
  gateOpened = true;
  environment.traverse(object => {
    if (/exit.?gate.?leaf|gate.?panel/i.test(object.name)) {
      object.userData.initialRotation ??= object.rotation.clone();
      object.rotation.y += Math.PI / 2;
    }
  });
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  heroTime += dt;
  if (state?.phase === 'title') {
    camera.position.copy(heroPosition);
    if (!reducedMotion) camera.position.x += Math.sin(heroTime * 0.07) * 1.4;
    camera.lookAt(heroTarget);
  } else if (state?.phase === 'playing') {
    const strafe = (Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))) + touchMove.x;
    const forward = (Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))) - touchMove.y;
    const yaw = camera.rotation.y;
    const input = {
      moveX: strafe * Math.cos(yaw) - forward * Math.sin(yaw),
      moveZ: -strafe * Math.sin(yaw) - forward * Math.cos(yaw),
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      crouch: touchCrouch || keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
    };
    const oldEnemyPosition = { ...state.enemy.position };
    const events = tickGame(state, dt, input, world);
    events.forEach(onGameEvent);
    const player = state.player;
    const moving = Math.abs(input.moveX) + Math.abs(input.moveZ) > 0.08 && !player.hiding;
    if (moving) cameraBob += dt * (player.sprinting ? 13 : 8);
    const bob = moving && !reducedMotion ? Math.sin(cameraBob) * (player.sprinting ? 0.045 : 0.018) : 0;
    const height = player.crouched ? 1.04 : 1.7;
    camera.position.set(player.position.x, player.position.y + height + bob, player.position.z);
    const distance = horizontalDistance(player.position, state.enemy.position);
    enemyStride += horizontalDistance(oldEnemyPosition, state.enemy.position);
    if (enemyStride > 0.85) {
      enemyStride %= 0.85;
      const directionX = state.enemy.position.x - player.position.x;
      const directionZ = state.enemy.position.z - player.position.z;
      const pan = (directionX * Math.cos(yaw) - directionZ * Math.sin(yaw)) / Math.max(distance, 1);
      audio.enemyStep(Math.max(0, 1 - distance / 18) * 0.32, pan);
    }
    const threat = state.enemy.mode === 'chase' ? Math.max(0.4, 1 - distance / 20) : Math.max(0, 1 - distance / 6) * 0.2;
    $('danger-vignette').style.opacity = String(player.hiding ? 0.1 : threat * 0.75);
    audio.update(threat, heroTime);
    if (enemyModel) {
      enemyModel.position.copy(toVector(state.enemy.position));
      enemyModel.rotation.y = Math.atan2(state.enemy.facing.x, state.enemy.facing.z);
      if (!reducedMotion) enemyModel.position.y += Math.sin(heroTime * 3.2) * 0.025;
    }
    for (const { light, base, data } of lights) {
      if ((data.flicker || data.kind === 'hall') && !reducedMotion) light.intensity = base * (0.93 + Math.sin(heroTime * 9.2 + light.position.x) * 0.04 + (threat > 0.3 ? Math.sin(heroTime * 23) * 0.18 : 0));
    }
    hudTime += dt;
    if (hudTime > 0.08) { updateHUD(); hudTime = 0; }
    if (state.phase !== lastPhase) syncPhase();
  }
  if (state?.phase === 'playing' || state?.phase === 'title') updateRain(dt);
  lightingTime += dt;
  if (lightingTime > 0.5) { updatePracticalLights(); lightingTime = 0; }
  if (playerHands) {
    playerHands.visible = ['playing', 'paused'].includes(state?.phase) && !state?.player.hiding;
    if (!reducedMotion) playerHands.position.y = -0.23 + (state?.player.sprinting ? Math.sin(cameraBob) * 0.012 : 0);
  }
  if (!$('toast').hidden && performance.now() > lastToast) $('toast').hidden = true;
  renderer.render(scene, camera);
}

async function boot() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    applyQuality();
    controls = new PointerLockControls(camera, canvas);
    controls.pointerSpeed = settings.sensitivity;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI - 0.12;
    controls.addEventListener('unlock', () => { if (state?.phase === 'playing' && !dragging) pause(); });
    const loader = new GLTFLoader();
    const base = import.meta.env.BASE_URL;
    const [data, model, enemy, hands] = await Promise.all([
      fetch(`${base}models/environment.json`).then(response => {
        if (!response.ok) throw new Error('School layout did not load.');
        return response.json();
      }),
      loader.loadAsync(`${base}models/environment.glb`),
      loader.loadAsync(`${base}models/enemy.glb`),
      loader.loadAsync(`${base}models/player-hands.glb`),
    ]);
    world = normalizeWorld(data);
    environment = model.scene;
    scene.add(environment);
    environment.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        environmentMeshes.push(object);
      }
      const id = object.userData.interactableId ?? object.userData.id;
      if (id) interactableMeshes.set(id, object);
      for (const item of world.interactables) {
        if (object.name === item.mesh || object.name === item.meshName || object.name === item.id || object.name === `item_${item.id}`) interactableMeshes.set(item.id, object);
      }
    });
    enemyModel = enemy.scene;
    enemyModel.traverse(object => { if (object.isMesh) object.castShadow = true; });
    scene.add(enemyModel);
    playerHands = hands.scene;
    playerHands.position.set(0.27, -0.23, -0.5);
    playerHands.visible = false;
    camera.add(playerHands);
    state = createGameState({ spawn: world.spawn, enemySpawn: world.enemySpawn, patrol: world.patrol });
    enemyModel.position.copy(toVector(state.enemy.position));
    if (world.heroCamera) {
      heroPosition = toVector(world.heroCamera.position);
      heroTarget = toVector(world.heroCamera.target);
    }
    addLighting();
    makeRain();
    camera.position.copy(heroPosition);
    camera.lookAt(heroTarget);
    updatePracticalLights();
    renderer.render(scene, camera);
    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
    $('start-button').disabled = false;
    $('start-label').textContent = 'Enter the school';
    $('loading-status').hidden = true;
    renderer.setAnimationLoop(animate);
    updateHUD();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
      window.__HERSLEB_TEST__ = {
        get state() { return state; }, get world() { return world; },
        get renderer() { return renderer; }, get camera() { return camera; },
        teleport(position) { state.player.position = positionOf(position); updateHUD(); },
        setEnemy(position, mode = 'patrol') { state.enemy.position = positionOf(position); state.enemy.mode = mode; },
        interact: id => { const result = interact(state, world.interactables.find(i => i.id === id), world); updateHUD(); return result; },
        pause, resume,
        frame(dt) { const events = tickGame(state, dt, {}, world); events.forEach(onGameEvent); syncPhase(); return events; },
      };
    }
  } catch (error) {
    console.error(error);
    $('loading-status').innerHTML = '';
    $('loading-status').textContent = `Unable to open the school: ${error.message} Reload to retry. A WebGL-capable browser is required.`;
    $('start-label').textContent = 'School unavailable';
    $('start-button').disabled = true;
  }
}

boot();
