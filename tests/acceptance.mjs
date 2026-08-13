import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:4173';
const OUTPUT_DIR = path.resolve('output/acceptance');
const checks = [];

function assert(condition, message, details = {}) {
  if (!condition) {
    throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
  }
  checks.push({ message, details });
}

async function state(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function advance(page, milliseconds) {
  await page.evaluate((duration) => window.advanceTime(duration), milliseconds);
  await page.waitForTimeout(20);
}

async function captureCanvas(page, name) {
  await page.locator('canvas').screenshot({ path: path.join(OUTPUT_DIR, name) });
}

async function waitForMode(page, mode) {
  await page.waitForFunction(
    (expected) => {
      if (typeof window.render_game_to_text !== 'function') return false;
      return JSON.parse(window.render_game_to_text()).mode === expected;
    },
    mode,
    { timeout: 8000 },
  );
}

async function holdAndAdvance(page, key, milliseconds) {
  await page.keyboard.down(key);
  await advance(page, milliseconds);
  await page.keyboard.up(key);
}

async function runDeterministicAcceptance(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ surface: 'acceptance', type: 'console', text: message.text() });
  });
  page.on('pageerror', (error) => errors.push({ surface: 'acceptance', type: 'pageerror', text: String(error) }));

  await page.goto(`${BASE_URL}/?qa=1`, { waitUntil: 'networkidle' });
  await waitForMode(page, 'title');
  const canvasResolution = await page.locator('canvas').evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    cssWidth: canvas.getBoundingClientRect().width,
    cssHeight: canvas.getBoundingClientRect().height,
  }));
  assert(
    canvasResolution.width === 1920 && canvasResolution.height === 1080,
    'QA-25 game renders internally at full HD while fitting the browser viewport',
    canvasResolution,
  );
  const titleState = await state(page);
  assert(titleState.mode === 'title' && titleState.controls.length === 9, 'QA-01 title presents objective and expanded controls', titleState);
  await captureCanvas(page, '01-title.png');

  const canvasBox = await page.locator('canvas').boundingBox();
  assert(
    canvasBox && canvasBox.x >= 0 && canvasBox.y >= 0 && canvasBox.x + canvasBox.width <= 1440 && canvasBox.y + canvasBox.height <= 900,
    'QA-18 canvas fits the desktop viewport',
    canvasBox ?? {},
  );
  if (canvasBox) {
    await page.mouse.click(canvasBox.x + (1238 / 1280) * canvasBox.width, canvasBox.y + (30 / 720) * canvasBox.height);
    await page.waitForTimeout(120);
    const fullscreenEntered = (await state(page)).fullscreen;
    assert(fullscreenEntered, 'QA-14 pointer-up F button enters browser fullscreen', { fullscreenEntered });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const escapeExited = !(await state(page)).fullscreen;
    if (!escapeExited) {
      const fullscreenBox = await page.locator('canvas').boundingBox();
      if (fullscreenBox) {
        await page.mouse.click(
          fullscreenBox.x + (1238 / 1280) * fullscreenBox.width,
          fullscreenBox.y + (30 / 720) * fullscreenBox.height,
        );
        await page.waitForTimeout(120);
      }
    }
    assert(!(await state(page)).fullscreen, 'QA-14 fullscreen exits through Escape or the visible F-button fallback', { escapeExited });
  }

  await page.keyboard.press('Enter');
  await waitForMode(page, 'playing');
  let current = await state(page);
  assert(
    current.player.hp === 100 && current.altar.seals === 0 && current.altar.requiredSeals === 5 && current.wave.index === 1 && current.wave.remaining === 6,
    'QA-02 game starts from a clean wave-one state',
    current,
  );

  const elapsedBeforePause = current.elapsedSeconds;
  await page.keyboard.press('p');
  const pausedAt = (await state(page)).elapsedSeconds;
  await advance(page, 800);
  current = await state(page);
  assert(
    current.paused && Math.abs(current.elapsedSeconds - pausedAt) <= 0.02,
    'QA-29 P pauses simulation time and displays settings',
    { ...current, inputLatencySeconds: Number((pausedAt - elapsedBeforePause).toFixed(2)) },
  );
  await page.evaluate(() => {
    window.__WOLHA_QA__.toggleVolume();
    window.__WOLHA_QA__.toggleQuality();
  });
  current = await state(page);
  const performanceCanvas = await page.locator('canvas').evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  assert(current.settings.volume === 0 && current.settings.quality === 'performance' && performanceCanvas.width === 1280 && performanceCanvas.height === 720, 'QA-30 pause menu toggles mute and 720p performance rendering', { current, performanceCanvas });
  await page.evaluate(() => {
    window.__WOLHA_QA__.toggleVolume();
    window.__WOLHA_QA__.toggleQuality();
  });
  await page.keyboard.press('p');
  current = await state(page);
  const highCanvas = await page.locator('canvas').evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  assert(!current.paused && current.settings.volume === 1 && current.settings.quality === 'high' && highCanvas.width === 1920 && highCanvas.height === 1080, 'QA-30 settings restore audio, 1080p rendering, and active play', { current, highCanvas });

  const spriteSheetMetrics = await page.evaluate(() => window.__WOLHA_QA__.spriteSheetMetrics());
  assert(
    spriteSheetMetrics.playerFrames === 32 &&
      spriteSheetMetrics.playerFrameWidth === 224 &&
      spriteSheetMetrics.playerFrameHeight === 256 &&
      spriteSheetMetrics.comboFrames === 12 &&
      spriteSheetMetrics.comboFrameWidth === 256 &&
      spriteSheetMetrics.comboFrameHeight === 256 &&
      spriteSheetMetrics.meleeAttackFrames === 12 &&
      spriteSheetMetrics.meleeAttackFrameWidth === 320 &&
      spriteSheetMetrics.meleeAttackFrameHeight === 256 &&
      spriteSheetMetrics.vfxFrames === 16 &&
      spriteSheetMetrics.vfxFrameWidth === 384 &&
      spriteSheetMetrics.vfxFrameHeight === 256,
    'QA-37 normalized sprite sheets load with all frames and safe cell dimensions',
    spriteSheetMetrics,
  );

  const startX = current.player.x;
  await page.keyboard.down('ArrowRight');
  await advance(page, 250);
  current = await state(page);
  assert(current.player.animation === 'run', 'QA-19 movement input selects the run sprite motion', current.player);
  const runFrameA = await page.evaluate(() => window.__WOLHA_QA__.playerFrame());
  await advance(page, 120);
  const runFrameB = await page.evaluate(() => window.__WOLHA_QA__.playerFrame());
  assert(runFrameA !== runFrameB, 'QA-26 run animation advances through distinct sprite-sheet frames', { runFrameA, runFrameB });
  await captureCanvas(page, '02-player-run.png');
  await advance(page, 130);
  await page.keyboard.up('ArrowRight');
  current = await state(page);
  assert(current.player.x > startX + 90, 'QA-03 arrow-key movement advances the player', { startX, endX: current.player.x });
  await page.evaluate(() => window.__WOLHA_QA__.setPlayerPosition(500, 500));
  await holdAndAdvance(page, 'KeyW', 250);
  current = await state(page);
  assert(current.player.y < 455, 'QA-03 WASD movement also advances the player', current.player);

  await page.evaluate(() => window.__WOLHA_QA__.setPlayerPosition(300, 500));
  await holdAndAdvance(page, 'ArrowRight', 1000);
  const straight = await state(page);
  const straightDistance = Math.hypot(straight.player.x - 300, straight.player.y - 500);
  assert(Math.abs(straightDistance - 220) < 1.5, 'QA-15 advanceTime(1000) performs exactly one second of fixed-step motion', { straightDistance });
  await page.evaluate(() => window.__WOLHA_QA__.setPlayerPosition(300, 500));
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await advance(page, 1000);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  const diagonal = await state(page);
  const diagonalDistance = Math.hypot(diagonal.player.x - 300, diagonal.player.y - 500);
  assert(
    Math.abs(straightDistance - diagonalDistance) < 3,
    'QA-03 diagonal movement is normalized',
    { straightDistance, diagonalDistance },
  );

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(500, 500);
    window.__WOLHA_QA__.placeEnemy('dokkaebi', 575, 500, 68);
  });
  await holdAndAdvance(page, 'ArrowRight', 1000 / 60);
  await page.keyboard.press('KeyJ');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(current.player.animation === 'attack' && current.enemies[0]?.hp === 34, 'QA-04 melee selects the attack sprite motion and deals exactly one 34-damage hit', current);
  assert(!current.combatVfx.attackVisible && current.combatVfx.attackStyle === 'restrained_arc', 'QA-27 first strike suppresses the oversized moonlight sheet and uses a restrained arc', current.combatVfx);
  assert(current.player.comboStep === 1 && current.combatVfx.bursts > 0, 'QA-31 first combo strike starts the chain and creates a hit burst', current);
  await captureCanvas(page, '03-player-attack.png');
  await page.keyboard.press('KeyJ');
  await advance(page, 120);
  current = await state(page);
  assert(current.enemies[0]?.hp === 34, 'QA-04 melee cooldown prevents duplicate damage', current.enemies[0] ?? {});
  await advance(page, 260);
  await page.keyboard.press('KeyJ');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(current.enemies.length === 0 && current.altar.active, 'QA-08 final enemy death activates the altar', current);

  await advance(page, 800);
  const comboDirections = [
    { key: 'ArrowRight', type: 'dokkaebi', expectedStep: 1, x: 1, y: 0, targetX: 590, targetY: 500, hp: 66 },
    { key: 'ArrowUp', type: 'gwishin', expectedStep: 2, x: 0, y: -1, targetX: 500, targetY: 410, hp: 60 },
    { key: 'ArrowLeft', type: 'bulgasari', expectedStep: 3, x: -1, y: 0, targetX: 410, targetY: 500, hp: 48 },
  ];
  for (const strike of comboDirections) {
    const targetId = await page.evaluate((setup) => {
      window.__WOLHA_QA__.clearWave();
      window.__WOLHA_QA__.setPlayerPosition(500, 500);
      return window.__WOLHA_QA__.placeEnemy(setup.type, setup.targetX, setup.targetY, 100);
    }, strike);
    for (const arrow of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) await page.keyboard.up(arrow);
    await advance(page, 1000 / 60);
    await page.keyboard.down(strike.key);
    await advance(page, 1000 / 60);
    await page.keyboard.press('KeyJ');
    await advance(page, 1000 / 60);
    await page.keyboard.up(strike.key);
    current = await state(page);
    const target = current.enemies.find((enemy) => enemy.id === targetId);
    const playerFrame = await page.evaluate(() => window.__WOLHA_QA__.playerFrame());
    assert(
      current.player.comboStep === strike.expectedStep &&
        Math.abs(current.player.attackDirectionX - strike.x) < 0.01 &&
        Math.abs(current.player.attackDirectionY - strike.y) < 0.01,
      `QA-32 combo strike ${strike.expectedStep} locks to its movement/facing direction`,
      current.player,
    );
    assert(
      current.player.spriteTexture === 'player-warden-combo-v1' &&
        playerFrame >= (strike.expectedStep - 1) * 4 && playerFrame < strike.expectedStep * 4,
      `QA-38 combo strike ${strike.expectedStep} uses its own four-frame motion row`,
      { playerFrame, strike, player: current.player },
    );
    assert(target?.hp === strike.hp, `QA-32 combo strike ${strike.expectedStep} deals its exact directional damage`, target ?? {});
    if (strike.expectedStep < 3) {
      assert(!current.combatVfx.attackVisible && current.combatVfx.attackStyle === 'restrained_arc', `QA-39 combo strike ${strike.expectedStep} keeps effects restrained`, current.combatVfx);
      await advance(page, 400);
    } else {
      assert(current.combatVfx.attackVisible && current.combatVfx.attackStyle === 'moonlight_finisher', 'QA-39 only the third combo strike uses the moonlight slash sheet', current.combatVfx);
      await captureCanvas(page, '04-combo-finisher.png');
    }
  }

  await advance(page, 800);
  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(500, 500);
    window.__WOLHA_QA__.placeEnemy('dokkaebi', 548, 500, 100);
    window.__WOLHA_QA__.placeEnemy('gwishin', 500, 448, 100);
    window.__WOLHA_QA__.placeEnemy('bulgasari', 448, 500, 100);
  });
  const observedEnemyStates = new Set();
  const observedEnemyFrames = new Map();
  let capturedEnemyStrike = false;
  for (let sample = 0; sample < 30; sample += 1) {
    await advance(page, 40);
    current = await state(page);
    for (const enemy of current.enemies) {
      observedEnemyStates.add(enemy.animation);
      if (enemy.attackFrame >= 0) {
        if (!observedEnemyFrames.has(enemy.type)) observedEnemyFrames.set(enemy.type, new Set());
        observedEnemyFrames.get(enemy.type).add(enemy.attackFrame);
      }
    }
    if (!capturedEnemyStrike && current.enemies.some((enemy) => enemy.animation === 'attack')) {
      await captureCanvas(page, '05-melee-enemy-strikes.png');
      capturedEnemyStrike = true;
    }
  }
  assert(
    observedEnemyStates.has('windup') && observedEnemyStates.has('attack') && observedEnemyStates.has('recover'),
    'QA-40 melee enemies visibly pass through anticipation, strike, and recovery',
    { observedEnemyStates: [...observedEnemyStates] },
  );
  assert(
    [...(observedEnemyFrames.get('dokkaebi') ?? [])].every((frame) => frame >= 0 && frame <= 3) &&
      [...(observedEnemyFrames.get('gwishin') ?? [])].every((frame) => frame >= 4 && frame <= 7) &&
      [...(observedEnemyFrames.get('bulgasari') ?? [])].every((frame) => frame >= 8 && frame <= 11),
    'QA-41 each melee monster family uses its dedicated attack-motion row without cell spill',
    Object.fromEntries([...observedEnemyFrames].map(([type, frames]) => [type, [...frames]])),
  );
  assert(current.player.hp < 100, 'QA-42 melee damage occurs during the visible strike phase', current.player);

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(500, 500);
    window.__WOLHA_QA__.placeEnemy('bulgasari', 605, 500, 150);
  });
  await holdAndAdvance(page, 'ArrowRight', 1000 / 60);
  await page.keyboard.press('KeyE');
  await advance(page, 100);
  current = await state(page);
  assert(current.player.animation === 'heavy' && current.enemies[0]?.hp === 72 && current.player.heavyCooldown > 1, 'QA-20 E heavy attack uses its unique pose, deals 78 damage, and starts cooldown', current);
  assert(current.combatVfx.heavyVisible && current.combatVfx.heavyFrame >= 4 && current.combatVfx.heavyFrame <= 7, 'QA-27 heavy attack uses the animated ground-impact effect sheet', current.combatVfx);
  await captureCanvas(page, '06-heavy-attack.png');
  await advance(page, 1050);
  await page.keyboard.press('KeyE');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(current.inputBuffers.heavy > 0 && current.player.heavyCooldown > 0, 'QA-23 early E input is buffered while heavy attack is almost ready', current);
  await advance(page, 180);
  current = await state(page);
  assert(current.player.animation === 'heavy' && current.inputBuffers.heavy === 0, 'QA-23 buffered heavy attack fires on the first available frame', current);
  await advance(page, 350);

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(300, 500);
    window.__WOLHA_QA__.placeEnemy('dokkaebi', 620, 500, 68);
  });
  await holdAndAdvance(page, 'ArrowRight', 1000 / 60);
  await page.keyboard.press('KeyQ');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(current.player.animation === 'talisman' && current.playerTalismans.length === 1, 'QA-21 Q throws a visible talisman using its unique pose', current);
  const talismanFrameA = current.playerTalismans[0].frame;
  await advance(page, 100);
  current = await state(page);
  assert(current.playerTalismans[0]?.frame !== talismanFrameA, 'QA-28 talisman projectile cycles through sprite-sheet frames while flying', { talismanFrameA, current: current.playerTalismans[0] });
  await captureCanvas(page, '07-talisman-throw.png');
  await advance(page, 600);
  current = await state(page);
  assert(current.enemies[0]?.hp === 20 && current.playerTalismans.length === 0, 'QA-21 talisman travels, hits once for 48 damage, and disappears', current);

  const hpBeforeGuard = current.player.hp;
  await page.keyboard.down('KeyC');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(current.player.animation === 'guard' && current.player.parryWindow, 'QA-22 C enters guard pose and opens the parry window', current.player);
  await page.evaluate(() => window.__WOLHA_QA__.damagePlayer(20));
  current = await state(page);
  assert(current.player.hp === hpBeforeGuard, 'QA-22 timed parry negates incoming damage', { hpBeforeGuard, player: current.player });
  assert(current.player.parryCounterReady, 'QA-33 perfect guard arms an immediate counterattack', current.player);
  await captureCanvas(page, '06-guard-parry.png');
  await page.keyboard.up('KeyC');
  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.placeEnemy('bulgasari', 385, 500, 100);
  });
  await page.keyboard.press('KeyJ');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(!current.player.parryCounterReady && current.enemies[0]?.hp === 24, 'QA-33 armed counterattack deals 76 damage and consumes the counter state', current);
  await page.keyboard.down('KeyC');
  await advance(page, 250);
  await page.evaluate(() => window.__WOLHA_QA__.damagePlayer(20));
  current = await state(page);
  assert(current.player.hp === hpBeforeGuard - 7, 'QA-22 held guard reduces damage to 35 percent after the parry window', current.player);
  await page.keyboard.up('KeyC');
  await advance(page, 700);
  await advance(page, 100);
  await page.keyboard.down('KeyC');
  await advance(page, 1000 / 60);
  await page.evaluate(() => window.__WOLHA_QA__.damagePlayer(20));
  await page.keyboard.up('KeyC');
  current = await state(page);
  assert(current.player.parryCounterReady && current.player.parryCounterTimer > 0.7, 'QA-39 a fresh perfect guard starts a bounded counterattack window', current.player);
  await advance(page, 800);
  current = await state(page);
  assert(!current.player.parryCounterReady && current.player.parryCounterTimer === 0, 'QA-39 unused counterattack readiness expires instead of persisting indefinitely', current.player);
  await page.evaluate(() => window.__WOLHA_QA__.clearWave());

  await page.evaluate(() => window.__WOLHA_QA__.setPlayerPosition(300, 500));
  await holdAndAdvance(page, 'ArrowRight', 1000 / 60);
  const dashStart = (await state(page)).player.x;
  await page.keyboard.press('ShiftLeft');
  await advance(page, 80);
  current = await state(page);
  assert(current.player.animation === 'dash', 'QA-19 dash selects the stretched dash sprite motion', current.player);
  await captureCanvas(page, '04-player-dash.png');
  await advance(page, 100);
  current = await state(page);
  const dashDistance = current.player.x - dashStart;
  assert(dashDistance >= 75 && dashDistance <= 95 && current.player.dashCooldown > 0.8, 'QA-05 dash covers the intended distance and starts cooldown', { dashDistance, cooldown: current.player.dashCooldown });
  assert(current.player.dashAttackReady, 'QA-34 dash arms a stronger follow-up slash', current.player);
  await page.evaluate(() => window.__WOLHA_QA__.placeEnemy('bulgasari', 485, 500, 100));
  await page.keyboard.press('KeyJ');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(!current.player.dashAttackReady && current.enemies[0]?.hp === 42, 'QA-34 dash slash deals 58 damage and consumes its ready state', current);
  await page.evaluate(() => window.__WOLHA_QA__.clearWave());
  const blockedDashStart = current.player.x;
  await page.keyboard.press('ShiftLeft');
  await advance(page, 180);
  current = await state(page);
  assert(Math.abs(current.player.x - blockedDashStart) < 3, 'QA-05 dash cannot be reused during cooldown', { blockedDashStart, endX: current.player.x });
  await advance(page, 1100);
  current = await state(page);
  assert(!current.player.dashAttackReady && current.player.dashAttackTimer === 0, 'QA-38 unused dash-slash readiness expires instead of persisting indefinitely', current.player);
  await page.evaluate(() => window.__WOLHA_QA__.setPlayerPosition(300, 500));
  const dashPointerBox = await page.locator('canvas').boundingBox();
  if (dashPointerBox) {
    await page.mouse.click(
      dashPointerBox.x + (600 / 1280) * dashPointerBox.width,
      dashPointerBox.y + (500 / 720) * dashPointerBox.height,
      { button: 'right' },
    );
  }
  await advance(page, 180);
  current = await state(page);
  assert(current.player.x > 375, 'QA-05 right-click also performs a directed dash', current.player);

  await page.evaluate(() => window.__WOLHA_QA__.setPlayerPosition(640, 450));
  await page.keyboard.down('KeyR');
  await advance(page, 1250);
  current = await state(page);
  assert(current.altar.seals === 0 && current.altar.channel > 1.15, 'QA-09 partial purification accumulates without completing', current.altar);
  await captureCanvas(page, '03-purifying.png');
  await page.keyboard.up('KeyR');
  await advance(page, 1000 / 60);
  current = await state(page);
  assert(current.altar.channel === 0 && current.altar.seals === 0, 'QA-09 releasing R resets incomplete purification', current.altar);

  const hpBeforeHit = (await state(page)).player.hp;
  await page.evaluate(() => window.__WOLHA_QA__.damagePlayer(10));
  current = await state(page);
  assert(current.player.animation === 'hit' && current.player.hp === hpBeforeHit - 10, 'QA-19 nonlethal damage selects the hit-recoil sprite motion', current.player);
  await captureCanvas(page, '05-player-hit.png');
  await advance(page, 700);

  await holdAndAdvance(page, 'KeyR', 2050);
  current = await state(page);
  assert(current.altar.seals === 1 && current.wave.state === 'intermission', 'QA-10 two seconds of R purifies exactly one seal', current);
  await advance(page, 1100);
  current = await state(page);
  assert(current.wave.index === 2 && current.wave.name === '통곡의 죽림' && current.wave.remaining === 8, 'QA-07 stage two changes arena and introduces the intended eight enemies', current.wave);
  await captureCanvas(page, '04-bamboo-stage.png');

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(640, 450);
  });
  await holdAndAdvance(page, 'KeyR', 2050);
  await advance(page, 1100);
  current = await state(page);
  assert(current.wave.index === 3 && current.wave.name === '장승의 관문' && current.wave.remaining === 8 && current.altar.seals === 2, 'QA-07 stage three fields a mixed boss wave after the second seal', current);

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(640, 450);
  });
  await holdAndAdvance(page, 'KeyR', 2050);
  await advance(page, 1100);
  current = await state(page);
  assert(current.wave.index === 4 && current.wave.name === '핏빛 월궁' && current.altar.seals === 3, 'QA-07 stage four reaches the palace arena', current);
  await captureCanvas(page, '04-palace-stage.png');

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(640, 450);
  });
  await holdAndAdvance(page, 'KeyR', 2050);
  await advance(page, 1100);
  current = await state(page);
  assert(current.wave.index === 5 && current.wave.name === '망월대' && current.altar.seals === 4, 'QA-07 final stage starts with four seals purified', current);

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(640, 450);
  });
  await holdAndAdvance(page, 'KeyR', 2050);
  await waitForMode(page, 'won');
  const won = await state(page);
  assert(won.seals === 5 && won.mode === 'won', 'QA-11 fifth purification transitions once to victory', won);
  await captureCanvas(page, '05-victory.png');

  await page.keyboard.press('KeyR');
  await waitForMode(page, 'playing');
  current = await state(page);
  assert(current.player.hp === 100 && current.altar.seals === 0 && current.kills === 0, 'QA-13 R restarts every gameplay counter', current);

  await page.evaluate(() => {
    window.__WOLHA_QA__.clearWave();
    window.__WOLHA_QA__.setPlayerPosition(640, 590);
    window.__WOLHA_QA__.placeEnemy('gwishin', 310, 260);
    window.__WOLHA_QA__.placeEnemy('bulgasari', 520, 250);
    window.__WOLHA_QA__.placeEnemy('reaper', 760, 245);
    window.__WOLHA_QA__.placeEnemy('moonlord', 990, 270);
  });
  await advance(page, 1450);
  current = await state(page);
  assert(
    current.enemies.some((enemy) => enemy.type === 'gwishin') &&
      current.enemies.some((enemy) => enemy.type === 'bulgasari') &&
      current.enemies.some((enemy) => enemy.type === 'reaper') &&
      current.enemies.some((enemy) => enemy.type === 'moonlord') &&
      current.enemies.some((enemy) => ['walk', 'hover', 'cast', 'windup'].includes(enemy.animation)) &&
      current.projectiles.length > 0 &&
      current.projectiles.every((projectile) => projectile.frame >= 12 && projectile.frame <= 15),
    'QA-07 new monsters, bosses, and live projectiles coexist correctly',
    current,
  );
  await captureCanvas(page, '06-expanded-roster.png');

  await page.evaluate(() => window.__WOLHA_QA__.damagePlayer(100));
  await waitForMode(page, 'lost');
  const lost = await state(page);
  assert(lost.mode === 'lost' && lost.seals === 0, 'QA-12 zero HP transitions to defeat', lost);
  await captureCanvas(page, '07-defeat.png');

  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(200);
  const smallBox = await page.locator('canvas').boundingBox();
  assert(
    smallBox && smallBox.width <= 900 && smallBox.height <= 700 && Math.abs(smallBox.width / smallBox.height - 16 / 9) < 0.02,
    'QA-14 FIT scaling preserves aspect ratio at a smaller viewport',
    smallBox ?? {},
  );

  await page.close();
}

async function runExploratoryCombat(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ surface: 'exploratory', type: 'console', text: message.text() });
  });
  page.on('pageerror', (error) => errors.push({ surface: 'exploratory', type: 'pageerror', text: String(error) }));
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.keyboard.press('Enter');
  await waitForMode(page, 'playing');

  let damagedEnemy = false;
  for (let iteration = 0; iteration < 150; iteration += 1) {
    const current = await state(page);
    if (current.mode !== 'playing') break;
    if (current.enemies.some((enemy) => enemy.hp < enemy.maxHp)) damagedEnemy = true;
    if (current.kills > 0) break;
    const nearest = [...current.enemies].sort((first, second) => {
      const firstDistance = Math.hypot(first.x - current.player.x, first.y - current.player.y);
      const secondDistance = Math.hypot(second.x - current.player.x, second.y - current.player.y);
      return firstDistance - secondDistance;
    })[0];

    if (!nearest) {
      await page.waitForTimeout(100);
      continue;
    }
    const dx = nearest.x - current.player.x;
    const dy = nearest.y - current.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 78) {
      const horizontal = Math.abs(dx) > 10 ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : null;
      const vertical = Math.abs(dy) > 10 ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : null;
      if (horizontal) await page.keyboard.down(horizontal);
      if (vertical) await page.keyboard.down(vertical);
      await page.waitForTimeout(iteration % 18 === 0 ? 145 : 90);
      if (horizontal) await page.keyboard.up(horizontal);
      if (vertical) await page.keyboard.up(vertical);
      if (iteration % 18 === 0) await page.keyboard.press('ShiftLeft');
    } else {
      const box = await page.locator('canvas').boundingBox();
      if (box) {
        await page.mouse.click(box.x + (nearest.x / 1280) * box.width, box.y + (nearest.y / 720) * box.height);
      }
      await page.waitForTimeout(115);
    }
  }

  const explored = await state(page);
  assert(explored.kills > 0 || damagedEnemy, 'Exploratory real-time play damages or defeats an unstaged enemy', explored);
  await captureCanvas(page, '07-exploratory-combat.png');
  await page.close();
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.rm(path.join(OUTPUT_DIR, 'failure.txt'), { force: true });
  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });

  try {
    await runDeterministicAcceptance(browser, errors);
    await runExploratoryCombat(browser, errors);
    assert(errors.length === 0, 'QA-17 no console or page errors occur during either run', { errors });
  } finally {
    await browser.close();
  }

  const report = {
    passed: true,
    url: BASE_URL,
    generatedAt: new Date().toISOString(),
    checks,
    errors,
  };
  await fs.writeFile(path.join(OUTPUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Acceptance passed: ${checks.length} checks`);
}

main().catch(async (error) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'failure.txt'),
    `${error.stack || error}\n`,
    'utf8',
  );
  console.error(error);
  process.exitCode = 1;
});

