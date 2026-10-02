import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.addInitScript(() => localStorage.setItem('hersleb-settings', JSON.stringify({ quality: 'low' })));
  await page.goto('/?test=1');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 40000 });
  await expect(page.locator('#start-label')).toHaveText('Enter the school');
}

test('Blender scene renders, information panels work, and movement/pause/hiding work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  expect(await page.evaluate(() => window.__HERSLEB_TEST__.renderer.info.render.triangles)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Field notes' }).click();
  await expect(page.locator('#modal-content')).toContainText('not yet a 1:1 recreation');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Enter the school' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  const initial = await page.evaluate(() => ({ ...window.__HERSLEB_TEST__.state.player.position }));
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(initial => {
    const p=window.__HERSLEB_TEST__.state.player.position;
    return Math.hypot(initial.x-p.x,initial.z-p.z);
  }, initial), { timeout: 15000 }).toBeGreaterThan(0.15);
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => ({ ...window.__HERSLEB_TEST__.state.player.position }));
  expect(Math.hypot(initial.x-moved.x, initial.z-moved.z)).toBeGreaterThan(0.15);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  const elapsed = await page.evaluate(() => window.__HERSLEB_TEST__.state.elapsed);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__HERSLEB_TEST__.state.elapsed)).toBe(elapsed);
  await page.getByRole('button', { name: 'Return to the halls' }).click();
  await expect(page.locator('#pause-screen')).toBeHidden();
  await page.evaluate(() => {
    const game = window.__HERSLEB_TEST__;
    const hide = game.world.hideSpots[0];
    game.teleport(hide.position);
  });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#hiding-indicator')).toBeVisible();
  await page.keyboard.press('KeyE');
  await expect(page.locator('#hiding-indicator')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Controls & settings' }).click();
  await page.locator('#settings-sound').uncheck();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/hersleb-gameplay.png' });
});

test('actual Blender layout is navigable and objective sequence reaches the street', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Enter the school' }).click();
  const result = await page.evaluate(async () => {
    const game = window.__HERSLEB_TEST__;
    const { findPath, positionOf, movePlayer } = await import('/src/game/logic.js');
    // The concave contextual wing must leave its visibly open courtyard usable.
    const courtyardTarget={x:-6,y:0,z:20};
    const courtyardPosition=movePlayer(game.state.player.position,
      {x:courtyardTarget.x-game.state.player.position.x,z:courtyardTarget.z-game.state.player.position.z},
      game.world.colliders);
    const courtyardDistance=Math.hypot(courtyardPosition.x-courtyardTarget.x,courtyardPosition.z-courtyardTarget.z);
    game.teleport(courtyardPosition);
    const reports = [];
    for (const id of ['student-id','fuse','archive-key','breaker','exit-gate']) {
      const item = game.world.interactables.find(item => item.id === id);
      if (!item) throw new Error(`Missing ${id}`);
      // Find a walkable point within interaction range: objects themselves may sit on a desk or inside a locker.
      const origin = positionOf(item.position);
      let destination = null, route = null;
      for (let r = 0.8; r <= 2.2 && !route; r += 0.35) {
        for (let n = 0; n < 16 && !route; n++) {
          const angle = n * Math.PI / 8;
          const candidate = { x:origin.x+Math.cos(angle)*r,y:0,z:origin.z+Math.sin(angle)*r };
          const path = findPath(game.world.navGrid, game.state.player.position, candidate);
          if (path.length) { destination = candidate; route = path; }
        }
      }
      reports.push({ id, navigable: Boolean(route) });
      if (!route) continue;
      // Traverse the route through the real collision solver, rather than teleporting through walls.
      let position = game.state.player.position;
      for (const waypoint of route) position = movePlayer(position, { x:waypoint.x-position.x,z:waypoint.z-position.z }, game.world.colliders);
      game.teleport(position);
      const interaction = game.interact(id);
      reports[reports.length-1].interaction = interaction;
    }
    game.setEnemy([-30,0,-30]);
    if (game.state.gateUnlocked) {
      game.teleport(game.world.exit.position ?? game.world.exit);
      game.frame(0.01);
    }
    return { reports, phase:game.state.phase, count:game.state.inventory.size, courtyardDistance };
  });
  expect(result.courtyardDistance,'open courtyard has no invisible building volume').toBeLessThan(0.05);
  for (const report of result.reports) {
    expect(report.navigable, `${report.id} is reachable on the exported school map`).toBe(true);
    expect(report.interaction?.ok, `${report.id}: ${report.interaction?.message}`).toBe(true);
  }
  expect(result.count).toBe(3);
  expect(result.phase).toBe('escaped');
  await expect(page.locator('#end-title')).toHaveText('Home. Almost.');
});

test('mobile layout fits the screen and exposes touch controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/hersleb-mobile-title.png' });
  await page.getByRole('button', { name: 'Enter the school' }).click();
  await expect(page.locator('#touch-controls')).toBeVisible();
  await expect(page.locator('#touch-interact')).toBeVisible();
  await expect(page.locator('#joystick')).toBeVisible();
  await context.close();
});

test('title scene has a finished desktop composition', async ({ page }) => {
  await ready(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/hersleb-title.png' });
});
