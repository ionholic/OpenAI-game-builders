import Phaser from 'phaser';

import { audioSynth } from '../audio/AudioSynth';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { QaBridge, stateBridge } from '../testing/StateBridge';
import { makeFullscreenButton, textStyle } from './sceneUi';

const FIXED_STEP_SECONDS = 1 / 60;
const FIXED_STEP_MS = 1000 / 60;
const PLAYER_MAX_HP = 100;
const PLAYER_SPEED = 220;
const PLAYER_RADIUS = 18;
const DASH_SPEED = 520;
const DASH_DURATION = 0.16;
const DASH_COOLDOWN = 1.1;
const ATTACK_DAMAGE = 34;
const ATTACK_RANGE = 94;
const ATTACK_HALF_ANGLE = Phaser.Math.DegToRad(58);
const ATTACK_COOLDOWN = 0.32;
const HEAVY_DAMAGE = 78;
const HEAVY_RANGE = 124;
const HEAVY_COOLDOWN = 1.15;
const TALISMAN_DAMAGE = 48;
const TALISMAN_COOLDOWN = 1.35;
const GUARD_COOLDOWN = 0.75;
const INPUT_BUFFER = 0.14;
const ARENA_BOUNDS = { left: 105, right: 1175, top: 112, bottom: 650 };
const ALTAR = { x: 640, y: 360, interactRadius: 94, collisionRadius: 64 };

type EnemyType = 'dokkaebi' | 'wisp' | 'gwishin' | 'bulgasari' | 'boss' | 'reaper' | 'moonlord';
type WaveState = 'spawning' | 'active' | 'altar_ready' | 'purifying' | 'intermission';

interface StageSpec {
  name: string;
  arena: 'arena-courtyard' | 'arena-bamboo' | 'arena-palace';
  enemies: EnemyType[];
}

interface InputKeys {
  upW: Phaser.Input.Keyboard.Key;
  downS: Phaser.Input.Keyboard.Key;
  leftA: Phaser.Input.Keyboard.Key;
  rightD: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  purify: Phaser.Input.Keyboard.Key;
  guard: Phaser.Input.Keyboard.Key;
}

interface Enemy {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  damage: number;
  displaySize: number;
  attackCooldown: number;
  shotCooldown: number;
  windup: number;
  hitFlash: number;
  castFlash: number;
  motion: number;
  sprite: Phaser.GameObjects.Sprite;
  warning: Phaser.GameObjects.Arc;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  sprite: Phaser.GameObjects.Arc;
}

interface Trail {
  x: number;
  y: number;
  life: number;
}

interface PlayerTalisman {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  sprite: Phaser.GameObjects.Rectangle;
}

const REQUIRED_SEALS = 5;
const STAGE_SPECS: StageSpec[] = [
  { name: '사당의 달뜰', arena: 'arena-courtyard', enemies: ['dokkaebi', 'dokkaebi', 'dokkaebi', 'dokkaebi', 'wisp', 'wisp'] },
  { name: '통곡의 죽림', arena: 'arena-bamboo', enemies: ['dokkaebi', 'dokkaebi', 'dokkaebi', 'gwishin', 'gwishin', 'wisp', 'wisp', 'wisp'] },
  { name: '장승의 관문', arena: 'arena-bamboo', enemies: ['dokkaebi', 'dokkaebi', 'gwishin', 'gwishin', 'wisp', 'wisp', 'bulgasari', 'boss'] },
  { name: '핏빛 월궁', arena: 'arena-palace', enemies: ['dokkaebi', 'dokkaebi', 'gwishin', 'gwishin', 'gwishin', 'wisp', 'wisp', 'bulgasari', 'reaper'] },
  { name: '망월대', arena: 'arena-palace', enemies: ['dokkaebi', 'gwishin', 'gwishin', 'wisp', 'wisp', 'bulgasari', 'bulgasari', 'moonlord'] },
];

const BOSS_TYPES = new Set<EnemyType>(['boss', 'reaper', 'moonlord']);
const isBoss = (type: EnemyType): boolean => BOSS_TYPES.has(type);

const SPAWN_POINTS = [
  { x: 150, y: 155 },
  { x: 1130, y: 155 },
  { x: 160, y: 330 },
  { x: 1120, y: 330 },
  { x: 260, y: 135 },
  { x: 1020, y: 135 },
  { x: 180, y: 580 },
  { x: 1100, y: 580 },
  { x: 420, y: 125 },
  { x: 860, y: 125 },
  { x: 640, y: 125 },
];

const round = (value: number): number => Number(value.toFixed(2));

export class GameScene extends Phaser.Scene {
  private keys!: InputKeys;

  private playerSprite!: Phaser.GameObjects.Sprite;

  private arenaBackground!: Phaser.GameObjects.Image;

  private playerShadow!: Phaser.GameObjects.Ellipse;

  private dashRing!: Phaser.GameObjects.Arc;

  private altarSprite!: Phaser.GameObjects.Image;

  private altarGlow!: Phaser.GameObjects.Arc;

  private sealLights: Phaser.GameObjects.Arc[] = [];

  private attackGraphics!: Phaser.GameObjects.Graphics;

  private worldGraphics!: Phaser.GameObjects.Graphics;

  private hpFill!: Phaser.GameObjects.Rectangle;

  private hpText!: Phaser.GameObjects.Text;

  private waveText!: Phaser.GameObjects.Text;

  private sealText!: Phaser.GameObjects.Text;

  private killText!: Phaser.GameObjects.Text;

  private promptText!: Phaser.GameObjects.Text;

  private messageText!: Phaser.GameObjects.Text;

  private fullscreenStatus!: Phaser.GameObjects.Text;

  private skillText!: Phaser.GameObjects.Text;

  private playerX = 640;

  private playerY = 590;

  private playerHp = PLAYER_MAX_HP;

  private facingX = 0;

  private facingY = -1;

  private attackQueued = false;

  private attackBuffer = 0;

  private dashQueued = false;

  private dashBuffer = 0;

  private heavyQueued = false;

  private heavyBuffer = 0;

  private talismanQueued = false;

  private talismanBuffer = 0;

  private attackCooldown = 0;

  private attackFxTime = 0;

  private heavyCooldown = 0;

  private heavyFxTime = 0;

  private talismanCooldown = 0;

  private talismanFxTime = 0;

  private guardCooldown = 0;

  private guardParryWindow = 0;

  private guardFxTime = 0;

  private dashCooldown = 0;

  private dashRemaining = 0;

  private dashX = 0;

  private dashY = -1;

  private invulnerable = 0;

  private damageFlash = 0;

  private playerMotion = 0;

  private hitStop = 0;

  private enemies: Enemy[] = [];

  private projectiles: Projectile[] = [];

  private trails: Trail[] = [];

  private playerTalismans: PlayerTalisman[] = [];

  private spawnQueue: EnemyType[] = [];

  private spawnTimer = 0;

  private spawnCursor = 0;

  private waveIndex = 0;

  private waveState: WaveState = 'spawning';

  private altarActive = false;

  private channelProgress = 0;

  private seals = 0;

  private intermission = 0;

  private elapsedSeconds = 0;

  private kills = 0;

  private accumulator = 0;

  private messageTimer = 0;

  private nextEnemyId = 1;

  private nextProjectileId = 1;

  private nextTalismanId = 1;

  private ended = false;

  private hudCache = '';

  private contextMenuHandler = (event: Event): void => event.preventDefault();

  constructor() {
    super('GameScene');
  }

  init(): void {
    this.playerX = 640;
    this.playerY = 590;
    this.playerHp = PLAYER_MAX_HP;
    this.facingX = 0;
    this.facingY = -1;
    this.attackQueued = false;
    this.attackBuffer = 0;
    this.dashQueued = false;
    this.dashBuffer = 0;
    this.heavyQueued = false;
    this.heavyBuffer = 0;
    this.talismanQueued = false;
    this.talismanBuffer = 0;
    this.heavyQueued = false;
    this.talismanQueued = false;
    this.attackCooldown = 0;
    this.attackFxTime = 0;
    this.heavyCooldown = 0;
    this.heavyFxTime = 0;
    this.talismanCooldown = 0;
    this.talismanFxTime = 0;
    this.guardCooldown = 0;
    this.guardParryWindow = 0;
    this.guardFxTime = 0;
    this.dashCooldown = 0;
    this.dashRemaining = 0;
    this.dashX = 0;
    this.dashY = -1;
    this.invulnerable = 0;
    this.damageFlash = 0;
    this.playerMotion = 0;
    this.hitStop = 0;
    this.enemies = [];
    this.projectiles = [];
    this.trails = [];
    this.playerTalismans = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnCursor = 0;
    this.waveIndex = 0;
    this.waveState = 'spawning';
    this.altarActive = false;
    this.channelProgress = 0;
    this.seals = 0;
    this.intermission = 0;
    this.elapsedSeconds = 0;
    this.kills = 0;
    this.accumulator = 0;
    this.messageTimer = 0;
    this.nextEnemyId = 1;
    this.nextProjectileId = 1;
    this.nextTalismanId = 1;
    this.ended = false;
    this.hudCache = '';
  }

  create(): void {
    stateBridge.setActive(this);

    this.arenaBackground = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'arena-courtyard')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(0);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x06101e, 0.12).setDepth(1);

    this.altarGlow = this.add
      .circle(ALTAR.x, ALTAR.y + 5, 84, 0xe8c35f, 0.08)
      .setStrokeStyle(3, 0xf3d778, 0.28)
      .setDepth(2);
    this.altarSprite = this.add.image(ALTAR.x, ALTAR.y, 'altar').setDisplaySize(142, 142).setDepth(4);
    this.createSealLights();

    this.playerShadow = this.add.ellipse(this.playerX, this.playerY + 24, 58, 22, 0x02040a, 0.46).setDepth(17);
    this.dashRing = this.add
      .circle(this.playerX, this.playerY + 20, 30, 0x000000, 0)
      .setStrokeStyle(3, 0x62e6ea, 0.95)
      .setDepth(18);
    this.playerSprite = this.add
      .sprite(this.playerX, this.playerY, 'player-warden-poses-v2', 0)
      .setDisplaySize(98, 98)
      .setDepth(20);

    this.attackGraphics = this.add.graphics().setDepth(28);
    this.worldGraphics = this.add.graphics().setDepth(29);

    this.createHud();
    this.createInput();
    this.startWave(0);
    this.installQaBridge();
    this.renderVisuals();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  update(_time: number, delta: number): void {
    if (stateBridge.isManual() || this.ended) return;

    this.accumulator += Math.min(delta, 100) / 1000;
    while (this.accumulator >= FIXED_STEP_SECONDS) {
      this.simulate(FIXED_STEP_SECONDS);
      this.accumulator -= FIXED_STEP_SECONDS;
      if (this.ended) break;
    }
  }

  advanceTime(milliseconds: number): void {
    const steps = Math.max(1, Math.round(milliseconds / FIXED_STEP_MS));
    for (let step = 0; step < steps; step += 1) {
      this.simulate(FIXED_STEP_SECONDS);
      if (this.ended) break;
    }
  }

  getSnapshot(): Record<string, unknown> {
    return {
      mode: 'playing',
      coordinates: 'origin top-left; +x right; +y down; pixels',
      arena: {
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        bounds: ARENA_BOUNDS,
      },
      player: {
        x: round(this.playerX),
        y: round(this.playerY),
        hp: round(this.playerHp),
        maxHp: PLAYER_MAX_HP,
        facingX: round(this.facingX),
        facingY: round(this.facingY),
        meleeCooldown: round(this.attackCooldown),
        dashCooldown: round(this.dashCooldown),
        heavyCooldown: round(this.heavyCooldown),
        talismanCooldown: round(this.talismanCooldown),
        guardCooldown: round(this.guardCooldown),
        guarding: this.keys?.guard.isDown ?? false,
        parryWindow: this.guardParryWindow > 0,
        invulnerable: this.invulnerable > 0,
        animation: this.getPlayerAnimationState(),
      },
      wave: {
        index: this.waveIndex + 1,
        total: STAGE_SPECS.length,
        name: STAGE_SPECS[this.waveIndex].name,
        state: this.waveState,
        remaining: this.enemies.length + this.spawnQueue.length,
      },
      altar: {
        x: ALTAR.x,
        y: ALTAR.y,
        radius: ALTAR.interactRadius,
        seals: this.seals,
        requiredSeals: REQUIRED_SEALS,
        active: this.altarActive,
        channel: round(this.channelProgress),
        channelRequired: 2,
      },
      enemies: this.enemies.map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        x: round(enemy.x),
        y: round(enemy.y),
        hp: round(enemy.hp),
        maxHp: enemy.maxHp,
        state: enemy.windup > 0 ? 'windup' : ['wisp', 'reaper'].includes(enemy.type) ? 'ranged' : 'chase',
        animation: this.getEnemyAnimationState(enemy),
      })),
      projectiles: this.projectiles.map((projectile) => ({
        id: projectile.id,
        x: round(projectile.x),
        y: round(projectile.y),
        vx: round(projectile.vx),
        vy: round(projectile.vy),
      })),
      playerTalismans: this.playerTalismans.map((talisman) => ({
        id: talisman.id,
        x: round(talisman.x),
        y: round(talisman.y),
        vx: round(talisman.vx),
        vy: round(talisman.vy),
      })),
      kills: this.kills,
      elapsedSeconds: round(this.elapsedSeconds),
      fullscreen: this.scale.isFullscreen,
      inputBuffers: {
        attack: round(this.attackBuffer),
        heavy: round(this.heavyBuffer),
        talisman: round(this.talismanBuffer),
        dash: round(this.dashBuffer),
      },
    };
  }

  private simulate(delta: number): void {
    if (this.ended) return;

    if (this.dashQueued) this.dashBuffer = INPUT_BUFFER;
    if (this.heavyQueued) this.heavyBuffer = INPUT_BUFFER;
    if (this.talismanQueued) this.talismanBuffer = INPUT_BUFFER;
    if (this.attackQueued) this.attackBuffer = INPUT_BUFFER;
    this.dashQueued = false;
    this.heavyQueued = false;
    this.talismanQueued = false;
    this.attackQueued = false;

    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - delta);
      this.renderVisuals();
      return;
    }

    this.elapsedSeconds += delta;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.heavyCooldown = Math.max(0, this.heavyCooldown - delta);
    this.heavyFxTime = Math.max(0, this.heavyFxTime - delta);
    this.talismanCooldown = Math.max(0, this.talismanCooldown - delta);
    this.talismanFxTime = Math.max(0, this.talismanFxTime - delta);
    this.guardCooldown = Math.max(0, this.guardCooldown - delta);
    this.guardParryWindow = Math.max(0, this.guardParryWindow - delta);
    this.guardFxTime = Math.max(0, this.guardFxTime - delta);
    this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    this.damageFlash = Math.max(0, this.damageFlash - delta);
    this.attackFxTime = Math.max(0, this.attackFxTime - delta);
    this.messageTimer = Math.max(0, this.messageTimer - delta);

    this.attackBuffer = Math.max(0, this.attackBuffer - delta);
    this.heavyBuffer = Math.max(0, this.heavyBuffer - delta);
    this.talismanBuffer = Math.max(0, this.talismanBuffer - delta);
    this.dashBuffer = Math.max(0, this.dashBuffer - delta);

    if (this.dashBuffer > 0 && this.tryDash()) this.dashBuffer = 0;
    if (this.heavyBuffer > 0 && this.tryHeavyAttack()) this.heavyBuffer = 0;
    if (this.talismanBuffer > 0 && this.tryTalisman()) this.talismanBuffer = 0;
    if (this.attackBuffer > 0 && this.tryAttack()) this.attackBuffer = 0;

    if (this.keys.guard.isDown && this.guardCooldown <= 0 && this.guardFxTime <= 0) {
      this.guardParryWindow = 0.18;
      this.guardFxTime = 0.34;
      this.guardCooldown = GUARD_COOLDOWN;
      audioSynth.tone(540, 0.08, 'triangle', 0.018);
    }

    this.updatePlayer(delta);
    this.updateWave(delta);
    this.updateEnemies(delta);
    if (this.ended) return;
    this.updateProjectiles(delta);
    if (this.ended) return;
    this.updatePlayerTalismans(delta);
    this.updatePurification(delta);
    if (this.ended) return;
    this.updateTrails(delta);
    this.checkWaveCleared();
    this.renderVisuals();
  }

  private createSealLights(): void {
    const positions = [
      { x: ALTAR.x, y: ALTAR.y - 48 },
      { x: ALTAR.x - 43, y: ALTAR.y + 26 },
      { x: ALTAR.x + 43, y: ALTAR.y + 26 },
    ];
    this.sealLights = positions.map((position) =>
      this.add
        .circle(position.x, position.y, 8, 0x101724, 0.95)
        .setStrokeStyle(2, 0xbda85e, 0.78)
        .setDepth(6),
    );
  }

  private createHud(): void {
    this.add.rectangle(640, 42, 1240, 64, 0x04101f, 0.84).setStrokeStyle(1, 0xbca65c, 0.34).setDepth(100);
    this.add.rectangle(42, 42, 248, 18, 0x190f18, 0.96).setOrigin(0, 0.5).setDepth(101);
    this.hpFill = this.add.rectangle(42, 42, 248, 18, 0xb74543, 1).setOrigin(0, 0.5).setDepth(102);
    this.hpText = this.add
      .text(42, 16, '생명 100 / 100', { ...textStyle, fontSize: '17px', fontStyle: 'bold' })
      .setDepth(103);
    this.waveText = this.add
      .text(640, 24, '첫 번째 달무리 · 소환 중', {
        ...textStyle,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#e8eff6',
      })
      .setOrigin(0.5, 0)
      .setDepth(103);
    this.sealText = this.add
      .text(1090, 18, `봉인 0 / ${REQUIRED_SEALS}`, {
        ...textStyle,
        fontSize: '21px',
        fontStyle: 'bold',
        color: '#f1d477',
      })
      .setOrigin(1, 0)
      .setDepth(103);
    this.killText = this.add
      .text(1090, 44, '처치 0', { ...textStyle, fontSize: '15px', color: '#b9c7d9' })
      .setOrigin(1, 0)
      .setDepth(103);
    this.skillText = this.add
      .text(330, 18, 'E 강공격 준비 · Q 부적 준비 · C 튕겨내기 준비', {
        ...textStyle,
        fontSize: '13px',
        color: '#9ee9e4',
      })
      .setDepth(103);

    this.promptText = this.add
      .text(640, 610, '', {
        ...textStyle,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffe29a',
        backgroundColor: 'rgba(5, 14, 28, 0.86)',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(110)
      .setVisible(false);

    this.messageText = this.add
      .text(640, 102, '', {
        ...textStyle,
        fontFamily: 'Batang, Nanum Myeongjo, serif',
        fontSize: '29px',
        fontStyle: 'bold',
        color: '#fff0bc',
        stroke: '#101222',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(111);

    this.add
      .text(24, 684, '공격 J · 강공격 E · 부적 Q · 방어 C · 대시 Shift · 정화 R', {
        ...textStyle,
        fontSize: '14px',
        color: '#bdc8d6',
        backgroundColor: 'rgba(3, 9, 19, 0.72)',
        padding: { x: 10, y: 6 },
      })
      .setDepth(105);

    this.fullscreenStatus = this.add
      .text(640, 674, '', { ...textStyle, fontSize: '13px', color: '#e5b0a5' })
      .setOrigin(0.5)
      .setDepth(111);
    makeFullscreenButton(this, this.fullscreenStatus);
  }

  private createInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable.');

    keyboard.addCapture('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,Q,C,R,SPACE,SHIFT,E,F');
    this.keys = keyboard.addKeys({
      upW: Phaser.Input.Keyboard.KeyCodes.W,
      downS: Phaser.Input.Keyboard.KeyCodes.S,
      leftA: Phaser.Input.Keyboard.KeyCodes.A,
      rightD: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      purify: Phaser.Input.Keyboard.KeyCodes.R,
      guard: Phaser.Input.Keyboard.KeyCodes.C,
    }) as unknown as InputKeys;

    keyboard.on('keydown-J', this.queueAttack, this);
    keyboard.on('keydown-SPACE', this.queueAttack, this);
    keyboard.on('keydown-SHIFT', this.queueDash, this);
    keyboard.on('keydown-E', this.queueHeavyAttack, this);
    keyboard.on('keydown-Q', this.queueTalisman, this);
    keyboard.on('keydown-F', this.toggleFullscreen, this);

    this.input.on('pointermove', this.updatePointerFacing, this);
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.game.canvas.addEventListener('contextmenu', this.contextMenuHandler);
  }

  private queueAttack(): void {
    this.attackQueued = true;
  }

  private queueDash(): void {
    this.dashQueued = true;
  }

  private queueHeavyAttack(): void {
    this.heavyQueued = true;
  }

  private queueTalisman(): void {
    this.talismanQueued = true;
  }

  private updatePointerFacing(pointer: Phaser.Input.Pointer): void {
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const dx = world.x - this.playerX;
    const dy = world.y - this.playerY;
    const length = Math.hypot(dx, dy);
    if (length > 4) {
      this.facingX = dx / length;
      this.facingY = dy / length;
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.updatePointerFacing(pointer);
    if (pointer.button === 2) this.queueDash();
    else if (pointer.button === 0) this.queueAttack();
  }

  private updatePlayer(delta: number): void {
    let moveX = Number(this.keys.rightD.isDown || this.keys.right.isDown) - Number(this.keys.leftA.isDown || this.keys.left.isDown);
    let moveY = Number(this.keys.downS.isDown || this.keys.down.isDown) - Number(this.keys.upW.isDown || this.keys.up.isDown);
    const moveLength = Math.hypot(moveX, moveY);
    this.playerMotion += delta * (this.dashRemaining > 0 ? 20 : moveLength > 0 ? 10 : 3.4);
    if (moveLength > 0) {
      moveX /= moveLength;
      moveY /= moveLength;
      if (this.dashRemaining <= 0) {
        this.facingX = moveX;
        this.facingY = moveY;
      }
    }

    if (this.dashRemaining > 0) {
      this.dashRemaining = Math.max(0, this.dashRemaining - delta);
      this.playerX += this.dashX * DASH_SPEED * delta;
      this.playerY += this.dashY * DASH_SPEED * delta;
      this.invulnerable = Math.max(this.invulnerable, 0.05);
      this.trails.push({ x: this.playerX, y: this.playerY, life: 0.18 });
    } else {
      this.playerX += moveX * PLAYER_SPEED * delta;
      this.playerY += moveY * PLAYER_SPEED * delta;
    }

    this.playerX = Phaser.Math.Clamp(this.playerX, ARENA_BOUNDS.left, ARENA_BOUNDS.right);
    this.playerY = Phaser.Math.Clamp(this.playerY, ARENA_BOUNDS.top, ARENA_BOUNDS.bottom);
    this.pushOutOfAltar();
  }

  private pushOutOfAltar(): void {
    const dx = this.playerX - ALTAR.x;
    const dy = this.playerY - ALTAR.y;
    const distance = Math.hypot(dx, dy);
    const minimum = ALTAR.collisionRadius + PLAYER_RADIUS;
    if (distance > 0 && distance < minimum) {
      this.playerX = ALTAR.x + (dx / distance) * minimum;
      this.playerY = ALTAR.y + (dy / distance) * minimum;
    }
  }

  private tryDash(): boolean {
    if (this.dashCooldown > 0 || this.dashRemaining > 0 || this.guardFxTime > 0) return false;
    this.attackFxTime = 0;
    this.heavyFxTime = 0;
    this.talismanFxTime = 0;
    const movement = this.readMovementDirection();
    this.dashX = movement.x || this.facingX;
    this.dashY = movement.y || this.facingY;
    const length = Math.hypot(this.dashX, this.dashY) || 1;
    this.dashX /= length;
    this.dashY /= length;
    this.dashRemaining = DASH_DURATION;
    this.dashCooldown = DASH_COOLDOWN;
    this.invulnerable = Math.max(this.invulnerable, DASH_DURATION);
    audioSynth.tone(205, 0.12, 'sawtooth', 0.025);
    return true;
  }

  private readMovementDirection(): { x: number; y: number } {
    let x = Number(this.keys.rightD.isDown || this.keys.right.isDown) - Number(this.keys.leftA.isDown || this.keys.left.isDown);
    let y = Number(this.keys.downS.isDown || this.keys.down.isDown) - Number(this.keys.upW.isDown || this.keys.up.isDown);
    const length = Math.hypot(x, y);
    if (length > 0) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  private tryAttack(): boolean {
    if (this.attackCooldown > 0 || this.dashRemaining > 0 || this.heavyFxTime > 0 || this.guardFxTime > 0) return false;
    this.attackCooldown = ATTACK_COOLDOWN;
    this.attackFxTime = 0.12;
    audioSynth.tone(310, 0.085, 'triangle', 0.028);

    const cosineThreshold = Math.cos(ATTACK_HALF_ANGLE);
    for (const enemy of [...this.enemies]) {
      const dx = enemy.x - this.playerX;
      const dy = enemy.y - this.playerY;
      const distance = Math.hypot(dx, dy);
      if (distance > ATTACK_RANGE + enemy.radius || distance < 0.001) continue;
      const dot = (dx / distance) * this.facingX + (dy / distance) * this.facingY;
      if (dot < cosineThreshold) continue;
      this.damageEnemy(enemy, ATTACK_DAMAGE, dx / distance, dy / distance);
    }
    return true;
  }

  private tryHeavyAttack(): boolean {
    if (this.heavyCooldown > 0 || this.dashRemaining > 0 || this.guardFxTime > 0 || this.talismanFxTime > 0) return false;
    this.heavyCooldown = HEAVY_COOLDOWN;
    this.heavyFxTime = 0.32;
    this.attackCooldown = Math.max(this.attackCooldown, 0.42);
    audioSynth.chord([110, 165, 220], 0.18, 0.028);
    for (const enemy of [...this.enemies]) {
      const dx = enemy.x - this.playerX;
      const dy = enemy.y - this.playerY;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance > HEAVY_RANGE + enemy.radius) continue;
      this.damageEnemy(enemy, HEAVY_DAMAGE, dx / distance, dy / distance);
      enemy.x += (dx / distance) * 22;
      enemy.y += (dy / distance) * 22;
    }
    return true;
  }

  private tryTalisman(): boolean {
    if (this.talismanCooldown > 0 || this.dashRemaining > 0 || this.guardFxTime > 0 || this.heavyFxTime > 0) return false;
    this.talismanCooldown = TALISMAN_COOLDOWN;
    this.talismanFxTime = 0.28;
    const aim = this.getAssistedAim();
    const sprite = this.add
      .rectangle(this.playerX, this.playerY, 24, 11, 0xffe38b, 1)
      .setStrokeStyle(2, 0xff7c48, 0.95)
      .setRotation(Math.atan2(aim.y, aim.x))
      .setDepth(27);
    this.playerTalismans.push({
      id: `t${this.nextTalismanId}`,
      x: this.playerX,
      y: this.playerY,
      vx: aim.x * 430,
      vy: aim.y * 430,
      life: 1.4,
      sprite,
    });
    this.nextTalismanId += 1;
    audioSynth.tone(760, 0.12, 'sine', 0.022);
    return true;
  }

  private getAssistedAim(): { x: number; y: number } {
    let best: Enemy | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      const dx = enemy.x - this.playerX;
      const dy = enemy.y - this.playerY;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance > 420) continue;
      const dot = (dx / distance) * this.facingX + (dy / distance) * this.facingY;
      if (dot < Math.cos(Phaser.Math.DegToRad(24))) continue;
      const score = distance - dot * 80;
      if (score < bestScore) {
        best = enemy;
        bestScore = score;
      }
    }
    if (!best) return { x: this.facingX, y: this.facingY };
    const dx = best.x - this.playerX;
    const dy = best.y - this.playerY;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  private updatePlayerTalismans(delta: number): void {
    for (const talisman of [...this.playerTalismans]) {
      talisman.x += talisman.vx * delta;
      talisman.y += talisman.vy * delta;
      talisman.life -= delta;
      talisman.sprite.setPosition(talisman.x, talisman.y).setRotation(talisman.sprite.rotation + delta * 5);
      const enemy = this.enemies.find((candidate) => Math.hypot(candidate.x - talisman.x, candidate.y - talisman.y) <= candidate.radius + 10);
      if (enemy) {
        const speed = Math.hypot(talisman.vx, talisman.vy) || 1;
        this.damageEnemy(enemy, TALISMAN_DAMAGE, talisman.vx / speed, talisman.vy / speed);
        this.destroyPlayerTalisman(talisman);
      } else if (
        talisman.life <= 0 ||
        talisman.x < ARENA_BOUNDS.left ||
        talisman.x > ARENA_BOUNDS.right ||
        talisman.y < ARENA_BOUNDS.top ||
        talisman.y > ARENA_BOUNDS.bottom
      ) this.destroyPlayerTalisman(talisman);
    }
  }

  private destroyPlayerTalisman(talisman: PlayerTalisman): void {
    const index = this.playerTalismans.indexOf(talisman);
    if (index < 0) return;
    talisman.sprite.destroy();
    this.playerTalismans.splice(index, 1);
  }

  private damageEnemy(enemy: Enemy, damage: number, directionX: number, directionY: number): void {
    enemy.hp -= damage;
    enemy.hitFlash = 0.1;
    enemy.x += directionX * 18;
    enemy.y += directionY * 18;
    audioSynth.tone(['wisp', 'reaper'].includes(enemy.type) ? 720 : 120, 0.07, 'square', 0.018);
    this.hitStop = Math.max(this.hitStop, damage >= HEAVY_DAMAGE ? 0.075 : 0.035);
    this.cameras.main.shake(damage >= HEAVY_DAMAGE ? 90 : 45, damage >= HEAVY_DAMAGE ? 0.006 : 0.0025);
    if (enemy.hp <= 0) this.destroyEnemy(enemy, true);
  }

  private updateWave(delta: number): void {
    if (this.waveState === 'spawning') {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0 && this.spawnQueue.length > 0) {
        const next = this.spawnQueue.shift();
        if (next) this.spawnEnemy(next);
        this.spawnTimer = 0.4;
      }
      if (this.spawnQueue.length === 0) this.waveState = 'active';
    } else if (this.waveState === 'intermission') {
      this.intermission -= delta;
      if (this.intermission <= 0) this.startWave(this.waveIndex + 1);
    }
  }

  private startWave(index: number): void {
    this.waveIndex = Phaser.Math.Clamp(index, 0, STAGE_SPECS.length - 1);
    this.waveState = 'spawning';
    this.altarActive = false;
    this.channelProgress = 0;
    this.spawnQueue = [...STAGE_SPECS[this.waveIndex].enemies];
    this.spawnTimer = 0.32;
    this.spawnCursor = this.waveIndex * 3;
    this.arenaBackground.setTexture(STAGE_SPECS[this.waveIndex].arena).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.showMessage(`${this.waveIndex + 1}장 · ${STAGE_SPECS[this.waveIndex].name}`, 1.8);
  }

  private spawnEnemy(type: EnemyType, forcedX?: number, forcedY?: number, forcedHp?: number): Enemy {
    const point = SPAWN_POINTS[this.spawnCursor % SPAWN_POINTS.length];
    this.spawnCursor += 1;
    const stats: Record<EnemyType, { hp: number; radius: number; speed: number; damage: number; texture: string; size: number }> = {
      dokkaebi: { hp: 68, radius: 22, speed: 92, damage: 10, texture: 'enemy-dokkaebi', size: 76 },
      wisp: { hp: 38, radius: 18, speed: 68, damage: 8, texture: 'enemy-wisp', size: 64 },
      gwishin: { hp: 82, radius: 21, speed: 128, damage: 13, texture: 'enemy-gwishin', size: 82 },
      bulgasari: { hp: 150, radius: 30, speed: 52, damage: 19, texture: 'enemy-bulgasari', size: 104 },
      boss: { hp: 238, radius: 31, speed: 78, damage: 16, texture: 'enemy-dokkaebi', size: 112 },
      reaper: { hp: 310, radius: 30, speed: 82, damage: 15, texture: 'enemy-gwishin', size: 122 },
      moonlord: { hp: 430, radius: 38, speed: 68, damage: 21, texture: 'enemy-bulgasari', size: 138 },
    };
    const spec = stats[type];
    const maxHp = spec.hp;
    const radius = spec.radius;
    const speed = spec.speed;
    const damage = spec.damage;
    const texture = `${spec.texture}-sheet`;
    const displaySize = spec.size;
    const x = forcedX ?? point.x;
    const y = forcedY ?? point.y;

    const warning = this.add
      .circle(x, y + 18, radius + 12, 0x9e252b, 0.08)
      .setStrokeStyle(3, 0xff5b55, 0.8)
      .setVisible(false)
      .setDepth(8);
    const sprite = this.add.sprite(x, y, texture).setDisplaySize(displaySize, displaySize).setDepth(12);
    if (type === 'boss') sprite.setTint(0xd5a64b);
    if (type === 'reaper') sprite.setTint(0xb59cff);
    if (type === 'moonlord') sprite.setTint(0xff9275);

    const enemy: Enemy = {
      id: `e${this.nextEnemyId}`,
      type,
      x,
      y,
      hp: forcedHp ?? maxHp,
      maxHp,
      speed,
      radius,
      damage,
      attackCooldown: 0.35,
      shotCooldown: type === 'wisp' ? 1.1 : isBoss(type) ? 1.35 : 999,
      windup: 0,
      hitFlash: 0,
      castFlash: 0,
      motion: this.nextEnemyId * 0.83,
      displaySize,
      sprite,
      warning,
    };
    this.nextEnemyId += 1;
    this.enemies.push(enemy);
    return enemy;
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta);
      enemy.shotCooldown = Math.max(0, enemy.shotCooldown - delta);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
      enemy.castFlash = Math.max(0, enemy.castFlash - delta);
      enemy.motion += delta * (enemy.windup > 0 ? 15 : ['wisp', 'reaper'].includes(enemy.type) ? 5 : enemy.speed / 9);

      const dx = this.playerX - enemy.x;
      const dy = this.playerY - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const directionX = dx / distance;
      const directionY = dy / distance;

      if (enemy.windup > 0) {
        enemy.windup = Math.max(0, enemy.windup - delta);
        if (enemy.windup === 0) {
          if (distance <= enemy.radius + PLAYER_RADIUS + 20) this.damagePlayer(enemy.damage);
          enemy.attackCooldown = isBoss(enemy.type) ? 1.1 : enemy.type === 'gwishin' ? 0.7 : 0.9;
        }
      } else if (enemy.type === 'wisp' || enemy.type === 'reaper') {
        let movement = 0;
        const far = enemy.type === 'reaper' ? 330 : 270;
        const near = enemy.type === 'reaper' ? 235 : 185;
        if (distance > far) movement = 1;
        else if (distance < near) movement = -1;
        enemy.x += directionX * enemy.speed * movement * delta;
        enemy.y += directionY * enemy.speed * movement * delta;
        if (enemy.shotCooldown <= 0) {
          const angles = enemy.type === 'reaper' ? [-0.28, 0, 0.28] : [0];
          for (const angle of angles) {
            const rotatedX = directionX * Math.cos(angle) - directionY * Math.sin(angle);
            const rotatedY = directionX * Math.sin(angle) + directionY * Math.cos(angle);
            this.fireProjectile(enemy, rotatedX, rotatedY, enemy.damage);
          }
          enemy.castFlash = 0.22;
          enemy.shotCooldown = enemy.type === 'reaper' ? 1.55 : 1.7;
        }
      } else {
        const attackDistance = enemy.radius + PLAYER_RADIUS + 16;
        if (distance <= attackDistance && enemy.attackCooldown <= 0) {
          enemy.windup = isBoss(enemy.type) || enemy.type === 'bulgasari' ? 0.36 : enemy.type === 'gwishin' ? 0.16 : 0.24;
        } else if (distance > attackDistance) {
          enemy.x += directionX * enemy.speed * delta;
          enemy.y += directionY * enemy.speed * delta;
        }
        if ((enemy.type === 'boss' || enemy.type === 'moonlord') && enemy.shotCooldown <= 0) {
          const angles = enemy.type === 'moonlord' ? [-0.75, -0.38, 0, 0.38, 0.75] : [-0.22, 0, 0.22];
          for (const angle of angles) {
            const rotatedX = directionX * Math.cos(angle) - directionY * Math.sin(angle);
            const rotatedY = directionX * Math.sin(angle) + directionY * Math.cos(angle);
            this.fireProjectile(enemy, rotatedX, rotatedY, 10);
          }
          enemy.castFlash = 0.24;
          enemy.shotCooldown = enemy.type === 'moonlord' ? 1.8 : 2.2;
        }
      }

      enemy.x = Phaser.Math.Clamp(enemy.x, ARENA_BOUNDS.left, ARENA_BOUNDS.right);
      enemy.y = Phaser.Math.Clamp(enemy.y, ARENA_BOUNDS.top, ARENA_BOUNDS.bottom);
    }

    this.separateEnemies();
  }

  private separateEnemies(): void {
    for (let firstIndex = 0; firstIndex < this.enemies.length; firstIndex += 1) {
      const first = this.enemies[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < this.enemies.length; secondIndex += 1) {
        const second = this.enemies[secondIndex];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const minimum = first.radius + second.radius - 8;
        if (distance >= minimum) continue;
        const push = (minimum - distance) * 0.25;
        const nx = dx / distance;
        const ny = dy / distance;
        first.x -= nx * push;
        first.y -= ny * push;
        second.x += nx * push;
        second.y += ny * push;
      }
    }
  }

  private fireProjectile(enemy: Enemy, directionX: number, directionY: number, damage: number): void {
    const bossShot = isBoss(enemy.type);
    const speed = enemy.type === 'moonlord' ? 310 : bossShot ? 285 : 250;
    const radius = bossShot ? 9 : 8;
    const sprite = this.add
      .circle(enemy.x, enemy.y, radius, enemy.type === 'moonlord' ? 0xff6b58 : bossShot ? 0xc195ff : 0x7cecff, 0.96)
      .setStrokeStyle(3, bossShot ? 0xffe1d2 : 0xd6fbff, 0.7)
      .setDepth(16);
    this.projectiles.push({
      id: `p${this.nextProjectileId}`,
      x: enemy.x,
      y: enemy.y,
      vx: directionX * speed,
      vy: directionY * speed,
      radius,
      damage,
      life: 4,
      sprite,
    });
    this.nextProjectileId += 1;
    audioSynth.tone(bossShot ? 175 : 520, 0.08, 'sine', 0.012);
  }

  private updateProjectiles(delta: number): void {
    for (const projectile of [...this.projectiles]) {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      projectile.sprite.setPosition(projectile.x, projectile.y);

      const distance = Math.hypot(projectile.x - this.playerX, projectile.y - this.playerY);
      if (distance <= projectile.radius + PLAYER_RADIUS) {
        this.damagePlayer(projectile.damage);
        this.destroyProjectile(projectile);
      } else if (
        projectile.life <= 0 ||
        projectile.x < ARENA_BOUNDS.left - 24 ||
        projectile.x > ARENA_BOUNDS.right + 24 ||
        projectile.y < ARENA_BOUNDS.top - 24 ||
        projectile.y > ARENA_BOUNDS.bottom + 24
      ) {
        this.destroyProjectile(projectile);
      }
      if (this.ended) return;
    }
  }

  private damagePlayer(amount: number): void {
    if (this.invulnerable > 0 || this.ended) return;
    const guarding = this.keys.guard.isDown || this.guardFxTime > 0;
    if (this.guardParryWindow > 0) {
      this.guardParryWindow = 0;
      this.invulnerable = 0.24;
      this.clearNearbyProjectiles(150);
      audioSynth.chord([659, 880, 1047], 0.12, 0.025);
      this.showMessage('튕겨내기!', 0.45);
      return;
    }
    const received = guarding ? Math.max(1, Math.ceil(amount * 0.35)) : amount;
    this.playerHp = Math.max(0, this.playerHp - received);
    this.invulnerable = 0.65;
    this.damageFlash = 0.16;
    audioSynth.tone(84, 0.16, 'sawtooth', 0.035);
    if (this.playerHp <= 0) this.finish('lost');
  }

  private clearNearbyProjectiles(radius: number): void {
    for (const projectile of [...this.projectiles]) {
      if (Math.hypot(projectile.x - this.playerX, projectile.y - this.playerY) <= radius) this.destroyProjectile(projectile);
    }
  }

  private updatePurification(delta: number): void {
    if (this.waveState !== 'altar_ready' && this.waveState !== 'purifying') {
      this.channelProgress = 0;
      return;
    }

    const distance = Math.hypot(this.playerX - ALTAR.x, this.playerY - ALTAR.y);
    const canPurify = this.altarActive && distance <= ALTAR.interactRadius;
    if (canPurify && this.keys.purify.isDown) {
      this.waveState = 'purifying';
      this.channelProgress = Math.min(2, this.channelProgress + delta);
      if (this.channelProgress >= 2) this.completePurification();
    } else {
      if (this.channelProgress > 0) audioSynth.tone(165, 0.07, 'sine', 0.012);
      this.channelProgress = 0;
      this.waveState = 'altar_ready';
    }
  }

  private completePurification(): void {
    this.seals += 1;
    this.playerHp = Math.min(PLAYER_MAX_HP, this.playerHp + 15);
    this.altarActive = false;
    this.channelProgress = 0;
    this.clearProjectiles();
    audioSynth.chord([523, 659, 784], 0.28, 0.024);
    this.showMessage(`봉인 ${this.seals}개 정화`, 1.2);

    if (this.seals >= REQUIRED_SEALS) {
      this.finish('won');
      return;
    }

    this.waveState = 'intermission';
    this.intermission = 1.05;
  }

  private checkWaveCleared(): void {
    if (this.ended || this.altarActive || this.waveState === 'intermission') return;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;
    this.altarActive = true;
    this.waveState = 'altar_ready';
    this.clearProjectiles();
    this.showMessage('요기가 걷혔습니다', 1.25);
    audioSynth.chord([330, 440], 0.18, 0.016);
  }

  private destroyEnemy(enemy: Enemy, countKill: boolean): void {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    enemy.sprite.destroy();
    enemy.warning.destroy();
    this.enemies.splice(index, 1);
    if (countKill) this.kills += 1;
  }

  private destroyProjectile(projectile: Projectile): void {
    const index = this.projectiles.indexOf(projectile);
    if (index < 0) return;
    projectile.sprite.destroy();
    this.projectiles.splice(index, 1);
  }

  private clearProjectiles(): void {
    for (const projectile of this.projectiles) projectile.sprite.destroy();
    this.projectiles = [];
  }

  private clearPlayerTalismans(): void {
    for (const talisman of this.playerTalismans) talisman.sprite.destroy();
    this.playerTalismans = [];
  }

  private updateTrails(delta: number): void {
    for (const trail of this.trails) trail.life -= delta;
    this.trails = this.trails.filter((trail) => trail.life > 0);
  }

  private renderVisuals(): void {
    const playerState = this.getPlayerAnimationState();
    const playerCycle = Math.sin(this.playerMotion);
    let playerWidth = 98;
    let playerHeight = 98;
    let playerBob = Math.sin(this.elapsedSeconds * 3.4) * 1.4;
    let playerAngle = 0;
    if (playerState === 'run') {
      playerWidth = 98 + Math.abs(playerCycle) * 5;
      playerHeight = 98 - Math.abs(playerCycle) * 4;
      playerBob = Math.abs(playerCycle) * -5;
      playerAngle = playerCycle * 3.5;
    } else if (playerState === 'dash') {
      playerWidth = 118;
      playerHeight = 78;
      playerBob = -3;
      playerAngle = this.facingX * 9;
    } else if (playerState === 'attack' || playerState === 'heavy' || playerState === 'talisman' || playerState === 'guard') {
      const slash = 1 - this.attackFxTime / 0.12;
      playerWidth = playerState === 'heavy' ? 112 : playerState === 'guard' ? 102 : 106;
      playerHeight = playerState === 'heavy' ? 102 : 94;
      playerBob = -2;
      playerAngle = playerState === 'attack' ? (slash - 0.5) * 18 * (this.facingX < 0 ? -1 : 1) : 0;
    } else if (playerState === 'hit') {
      playerWidth = 92;
      playerHeight = 104;
      playerAngle = Math.sin(this.elapsedSeconds * 55) * 7;
    } else {
      playerWidth = 98 + playerCycle * 1.8;
      playerHeight = 98 - playerCycle * 1.8;
    }
    const playerFrame: Record<ReturnType<GameScene['getPlayerAnimationState']>, number> = {
      idle: 0,
      run: 1,
      attack: 2,
      heavy: 3,
      talisman: 4,
      guard: 5,
      dash: 6,
      hit: 7,
    };
    this.playerSprite.setFrame(playerFrame[playerState]).setPosition(this.playerX, this.playerY + playerBob).setDisplaySize(playerWidth, playerHeight).setAngle(playerAngle);
    this.playerSprite.setFlipX(this.facingX < -0.08);
    this.playerSprite.setAlpha(this.damageFlash > 0 ? 0.5 : 1);
    this.playerShadow.setPosition(this.playerX, this.playerY + 25);
    this.dashRing
      .setPosition(this.playerX, this.playerY + 22)
      .setStrokeStyle(3, this.dashCooldown <= 0 ? 0x65f0e8 : 0x536275, this.dashCooldown <= 0 ? 0.92 : 0.42);

    const pulse = 1 + Math.sin(this.elapsedSeconds * 3) * 0.035;
    this.altarGlow
      .setScale(pulse)
      .setFillStyle(this.altarActive ? 0xf3d675 : 0x496b82, this.altarActive ? 0.19 : 0.07)
      .setStrokeStyle(3, this.altarActive ? 0xffe79c : 0x8bb4c8, this.altarActive ? 0.72 : 0.22);
    this.altarSprite.setTint(this.altarActive ? 0xffe8a8 : 0xffffff);
    this.sealLights.forEach((light, index) => {
      const lit = index < this.seals;
      light.setFillStyle(lit ? 0xffd86c : 0x101724, lit ? 1 : 0.95);
      light.setStrokeStyle(2, lit ? 0xfff0ae : 0xbda85e, lit ? 1 : 0.78);
    });

    this.worldGraphics.clear();
    for (const trail of this.trails) {
      this.worldGraphics.fillStyle(0x7fe9e3, Phaser.Math.Clamp(trail.life / 0.18, 0, 1) * 0.22);
      this.worldGraphics.fillCircle(trail.x, trail.y + 2, 22 * (trail.life / 0.18));
    }
    if (this.guardFxTime > 0) {
      const alpha = Phaser.Math.Clamp(this.guardFxTime / 0.34, 0, 1);
      this.worldGraphics.lineStyle(this.guardParryWindow > 0 ? 7 : 4, this.guardParryWindow > 0 ? 0xfff0a3 : 0x6de8ff, alpha * 0.9);
      this.worldGraphics.strokeCircle(this.playerX, this.playerY, 36 + (1 - alpha) * 12);
    }
    if (this.heavyFxTime > 0) {
      const alpha = Phaser.Math.Clamp(this.heavyFxTime / 0.32, 0, 1);
      this.worldGraphics.lineStyle(8, 0xffbd61, alpha * 0.82);
      this.worldGraphics.strokeCircle(this.playerX, this.playerY, HEAVY_RANGE * (1.08 - alpha * 0.08));
    }

    for (const enemy of this.enemies) {
      const state = this.getEnemyAnimationState(enemy);
      const cycle = Math.sin(enemy.motion);
      let width = enemy.displaySize;
      let height = enemy.displaySize;
      let enemyBob = 0;
      let angle = 0;
      if (['wisp', 'reaper'].includes(enemy.type)) {
        enemyBob = cycle * 7;
        width *= 1 - cycle * 0.035;
        height *= 1 + cycle * 0.045;
        angle = cycle * 2.5;
      } else if (enemy.type === 'bulgasari' || enemy.type === 'moonlord') {
        enemyBob = -Math.abs(cycle) * 3;
        width *= 1 + Math.abs(cycle) * 0.055;
        height *= 1 - Math.abs(cycle) * 0.04;
        angle = cycle * 1.6;
      } else {
        enemyBob = -Math.abs(cycle) * (enemy.type === 'gwishin' ? 6 : 4);
        width *= 1 + Math.abs(cycle) * 0.035;
        height *= 1 - Math.abs(cycle) * 0.025;
        angle = cycle * (enemy.type === 'gwishin' ? 5 : 3);
      }
      if (state === 'windup') {
        width *= 1.14;
        height *= 0.86;
        enemyBob += 5;
        angle += this.playerX > enemy.x ? 7 : -7;
      } else if (state === 'cast') {
        width *= 1.12;
        height *= 1.12;
        enemyBob -= 8;
        angle += cycle * 8;
      } else if (state === 'hit') {
        width *= 0.9;
        height *= 1.08;
        angle += Math.sin(this.elapsedSeconds * 60) * 8;
      }
      const enemyFrame = state === 'windup' || state === 'cast' ? 3 : state === 'hit' ? 2 : Math.floor(enemy.motion / 1.4) % 3;
      enemy.sprite.setFrame(enemyFrame).setPosition(enemy.x, enemy.y + enemyBob).setDisplaySize(width, height).setAngle(angle);
      enemy.sprite.setFlipX(this.playerX > enemy.x);
      enemy.warning.setPosition(enemy.x, enemy.y + 16).setVisible(enemy.windup > 0);
      if (enemy.hitFlash > 0) enemy.sprite.setTint(0xfff2bd);
      else if (enemy.type === 'boss') enemy.sprite.setTint(0xd5a64b);
      else if (enemy.type === 'reaper') enemy.sprite.setTint(0xb59cff);
      else if (enemy.type === 'moonlord') enemy.sprite.setTint(0xff9275);
      else enemy.sprite.clearTint();

      if (enemy.hp < enemy.maxHp || isBoss(enemy.type)) {
        const width = isBoss(enemy.type) ? 104 : enemy.type === 'bulgasari' ? 70 : 54;
        const y = enemy.y - (isBoss(enemy.type) ? 70 : enemy.type === 'bulgasari' ? 54 : 42);
        this.worldGraphics.fillStyle(0x111521, 0.9).fillRect(enemy.x - width / 2, y, width, 7);
        this.worldGraphics
          .fillStyle(enemy.type === 'moonlord' ? 0xe46f55 : isBoss(enemy.type) ? 0xb68bdf : 0xd95855, 1)
          .fillRect(enemy.x - width / 2, y, width * Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1), 7);
      }
    }

    if (this.altarActive) {
      this.worldGraphics.lineStyle(4, 0xffdf80, 0.5);
      this.worldGraphics.strokeCircle(ALTAR.x, ALTAR.y, ALTAR.interactRadius);
      if (this.channelProgress > 0) {
        this.worldGraphics.lineStyle(8, 0xfff1ac, 0.95);
        this.worldGraphics.beginPath();
        this.worldGraphics.arc(
          ALTAR.x,
          ALTAR.y,
          ALTAR.interactRadius + 10,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * (this.channelProgress / 2),
          false,
        );
        this.worldGraphics.strokePath();
      }
    }

    this.drawAttackFan();
    this.updateHud();
  }

  private drawAttackFan(): void {
    this.attackGraphics.clear();
    if (this.attackFxTime <= 0) return;
    const baseAngle = Math.atan2(this.facingY, this.facingX);
    const points = [new Phaser.Math.Vector2(this.playerX, this.playerY)];
    const segments = 14;
    for (let index = 0; index <= segments; index += 1) {
      const angle = baseAngle - ATTACK_HALF_ANGLE + (ATTACK_HALF_ANGLE * 2 * index) / segments;
      points.push(
        new Phaser.Math.Vector2(
          this.playerX + Math.cos(angle) * ATTACK_RANGE,
          this.playerY + Math.sin(angle) * ATTACK_RANGE,
        ),
      );
    }
    const alpha = Phaser.Math.Clamp(this.attackFxTime / 0.12, 0, 1);
    this.attackGraphics.fillStyle(0xffe8a1, 0.25 * alpha).fillPoints(points, true);
    this.attackGraphics.lineStyle(5, 0xfff2be, 0.8 * alpha).strokePoints(points.slice(1), false);
  }

  private updateHud(): void {
    const hpWidth = 248 * (this.playerHp / PLAYER_MAX_HP);
    this.hpFill.displayWidth = Math.max(0.01, hpWidth);
    const stateLabel: Record<WaveState, string> = {
      spawning: '소환 중',
      active: `남은 요괴 ${this.enemies.length + this.spawnQueue.length}`,
      altar_ready: '제단 정화 가능',
      purifying: '정화 중',
      intermission: '다음 달무리 준비',
    };
    const heavyReady = this.heavyCooldown <= 0;
    const talismanReady = this.talismanCooldown <= 0;
    const guardReady = this.guardCooldown <= 0;
    const heavyLabel = heavyReady ? '준비' : `${this.heavyCooldown.toFixed(1)}초`;
    const talismanLabel = talismanReady ? '준비' : `${this.talismanCooldown.toFixed(1)}초`;
    const guardLabel = guardReady ? '준비' : `${this.guardCooldown.toFixed(1)}초`;
    const cache = `${Math.ceil(this.playerHp)}|${this.waveIndex}|${this.waveState}|${this.enemies.length}|${this.spawnQueue.length}|${this.seals}|${this.kills}|${heavyLabel}|${talismanLabel}|${guardLabel}`;
    if (cache !== this.hudCache) {
      this.hudCache = cache;
      this.hpText.setText(`생명 ${Math.ceil(this.playerHp)} / ${PLAYER_MAX_HP}`);
      this.waveText.setText(`${this.waveIndex + 1}장 ${STAGE_SPECS[this.waveIndex].name} · ${stateLabel[this.waveState]}`);
      this.sealText.setText(`봉인 ${this.seals} / ${REQUIRED_SEALS}`);
      this.killText.setText(`처치 ${this.kills}`);
      this.skillText.setText(
        `E 강공격 ${heavyLabel} · Q 부적 ${talismanLabel} · C 튕겨내기 ${guardLabel}`,
      );
      this.skillText.setColor(heavyReady && talismanReady && guardReady ? '#9ee9e4' : '#b8c5d4');
    }

    const distance = Math.hypot(this.playerX - ALTAR.x, this.playerY - ALTAR.y);
    if (this.altarActive) {
      const prompt = distance <= ALTAR.interactRadius ? 'R을 누르고 봉인을 정화하세요' : '중앙 제단으로 이동하세요';
      if (this.promptText.text !== prompt) this.promptText.setText(prompt);
      this.promptText.setVisible(true);
    } else {
      this.promptText.setVisible(false);
    }

    this.messageText.setVisible(this.messageTimer > 0);
  }

  private getPlayerAnimationState(): 'idle' | 'run' | 'attack' | 'heavy' | 'talisman' | 'guard' | 'dash' | 'hit' {
    if (this.damageFlash > 0) return 'hit';
    if (this.dashRemaining > 0) return 'dash';
    if (this.guardFxTime > 0 || this.keys?.guard.isDown) return 'guard';
    if (this.heavyFxTime > 0) return 'heavy';
    if (this.talismanFxTime > 0) return 'talisman';
    if (this.attackFxTime > 0) return 'attack';
    if (
      this.keys?.upW.isDown ||
      this.keys?.downS.isDown ||
      this.keys?.leftA.isDown ||
      this.keys?.rightD.isDown ||
      this.keys?.up.isDown ||
      this.keys?.down.isDown ||
      this.keys?.left.isDown ||
      this.keys?.right.isDown
    ) return 'run';
    return 'idle';
  }

  private getEnemyAnimationState(enemy: Enemy): 'walk' | 'hover' | 'windup' | 'cast' | 'hit' {
    if (enemy.hitFlash > 0) return 'hit';
    if (enemy.windup > 0) return 'windup';
    if (enemy.castFlash > 0) return 'cast';
    return ['wisp', 'reaper'].includes(enemy.type) ? 'hover' : 'walk';
  }

  private showMessage(message: string, duration: number): void {
    this.messageText?.setText(message).setVisible(true);
    this.messageTimer = duration;
  }

  private finish(result: 'won' | 'lost'): void {
    if (this.ended) return;
    this.ended = true;
    this.attackQueued = false;
    this.dashQueued = false;
    if (result === 'won') audioSynth.chord([523, 659, 784, 1047], 0.42, 0.025);
    else audioSynth.chord([220, 165, 110], 0.3, 0.025);
    this.scene.start('ResultScene', {
      result,
      elapsedSeconds: this.elapsedSeconds,
      kills: this.kills,
      wave: this.waveIndex + 1,
      seals: this.seals,
    });
  }

  private installQaBridge(): void {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const qa: QaBridge = {
      clearWave: () => {
        this.spawnQueue = [];
        for (const enemy of [...this.enemies]) this.destroyEnemy(enemy, false);
        this.clearProjectiles();
        this.altarActive = false;
        this.waveState = 'active';
        this.checkWaveCleared();
        this.renderVisuals();
      },
      damagePlayer: (amount: number) => {
        this.invulnerable = 0;
        this.damagePlayer(Math.max(0, amount));
        if (!this.ended) this.renderVisuals();
      },
      placeEnemy: (type: EnemyType, x: number, y: number, hp?: number) => {
        this.altarActive = false;
        this.waveState = 'active';
        const enemy = this.spawnEnemy(
          type,
          Phaser.Math.Clamp(x, ARENA_BOUNDS.left, ARENA_BOUNDS.right),
          Phaser.Math.Clamp(y, ARENA_BOUNDS.top, ARENA_BOUNDS.bottom),
          hp,
        );
        this.renderVisuals();
        return enemy.id;
      },
      setPlayerPosition: (x: number, y: number) => {
        this.playerX = Phaser.Math.Clamp(x, ARENA_BOUNDS.left, ARENA_BOUNDS.right);
        this.playerY = Phaser.Math.Clamp(y, ARENA_BOUNDS.top, ARENA_BOUNDS.bottom);
        this.pushOutOfAltar();
        this.renderVisuals();
      },
    };
    window.__WOLHA_QA__ = qa;
  }

  private toggleFullscreen(): void {
    try {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen({ navigationUI: 'hide' });
    } catch {
      this.fullscreenStatus.setText('전체화면 요청이 차단되었습니다. 우측 F 버튼을 눌러보세요.');
    }
  }

  private shutdown(): void {
    const keyboard = this.input.keyboard;
    keyboard?.off('keydown-J', this.queueAttack, this);
    keyboard?.off('keydown-SPACE', this.queueAttack, this);
    keyboard?.off('keydown-SHIFT', this.queueDash, this);
    keyboard?.off('keydown-E', this.queueHeavyAttack, this);
    keyboard?.off('keydown-Q', this.queueTalisman, this);
    keyboard?.off('keydown-F', this.toggleFullscreen, this);
    this.input.off('pointermove', this.updatePointerFacing, this);
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.game.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    this.clearProjectiles();
    this.clearPlayerTalismans();
    stateBridge.clear(this);
    delete window.__WOLHA_QA__;
  }
}
