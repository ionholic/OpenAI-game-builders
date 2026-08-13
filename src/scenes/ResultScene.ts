import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audioSynth } from '../audio/AudioSynth';
import { stateBridge } from '../testing/StateBridge';
import { makeFullscreenButton, textStyle } from './sceneUi';

interface ResultData {
  result: 'won' | 'lost';
  elapsedSeconds: number;
  kills: number;
  wave: number;
  seals: number;
}

export class ResultScene extends Phaser.Scene {
  private result: 'won' | 'lost' = 'lost';

  private elapsedSeconds = 0;

  private kills = 0;

  private wave = 1;

  private seals = 0;

  private restarting = false;

  constructor() {
    super('ResultScene');
  }

  init(data: ResultData): void {
    this.result = data.result;
    this.elapsedSeconds = data.elapsedSeconds;
    this.kills = data.kills;
    this.wave = data.wave;
    this.seals = data.seals;
    this.restarting = false;
  }

  create(): void {
    stateBridge.setActive(this);

    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'arena-courtyard')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setTint(this.result === 'won' ? 0xcad6af : 0x675a76);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020611, 0.68);

    if (this.result === 'won') {
      this.add.image(GAME_WIDTH / 2, 260, 'altar').setDisplaySize(190, 190).setTint(0xffd879);
    } else {
      this.add.image(GAME_WIDTH / 2, 260, 'player-warden').setDisplaySize(124, 124).setAlpha(0.5);
    }

    this.add
      .text(GAME_WIDTH / 2, 100, this.result === 'won' ? '제단 정화 완료' : '혼이 잠식되었습니다', {
        ...textStyle,
        fontFamily: 'Batang, Nanum Myeongjo, serif',
        fontSize: '58px',
        fontStyle: 'bold',
        color: this.result === 'won' ? '#ffe89b' : '#f0a6a7',
        stroke: '#101222',
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = Math.floor(this.elapsedSeconds % 60);
    const summary =
      this.result === 'won'
        ? `봉인 ${this.seals}/3 · 처치 ${this.kills}\n정화 시간 ${minutes}:${seconds.toString().padStart(2, '0')}`
        : `도달 달무리 ${this.wave}/3 · 정화 ${this.seals}/3\n처치 ${this.kills}`;

    this.add
      .text(GAME_WIDTH / 2, 410, summary, {
        ...textStyle,
        fontSize: '24px',
        color: '#e7edf3',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    const button = this.add
      .rectangle(GAME_WIDTH / 2, 534, 300, 64, 0x873339, 0.96)
      .setStrokeStyle(2, 0xf1d283, 0.9)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add
      .text(GAME_WIDTH / 2, 532, '다시 정화하기', {
        ...textStyle,
        fontSize: '27px',
        fontStyle: 'bold',
        color: '#fff0c8',
      })
      .setOrigin(0.5);

    button.on('pointerover', () => {
      button.setFillStyle(0xa44742, 1).setScale(1.025);
      buttonText.setScale(1.025);
    });
    button.on('pointerout', () => {
      button.setFillStyle(0x873339, 0.96).setScale(1);
      buttonText.setScale(1);
    });
    button.on('pointerup', () => this.restartGame());

    this.add
      .text(GAME_WIDTH / 2, 592, 'R 또는 Enter', {
        ...textStyle,
        fontSize: '16px',
        color: '#aab7ca',
      })
      .setOrigin(0.5);

    const fullscreenStatus = this.add
      .text(GAME_WIDTH / 2, 676, '', {
        ...textStyle,
        fontSize: '14px',
        color: '#e2b8a9',
      })
      .setOrigin(0.5);
    makeFullscreenButton(this, fullscreenStatus);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.addCapture('R,ENTER,F');
      keyboard.once('keydown-R', this.restartGame, this);
      keyboard.once('keydown-ENTER', this.restartGame, this);
      keyboard.on('keydown-F', this.toggleFullscreen, this);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown-F', this.toggleFullscreen, this);
      stateBridge.clear(this);
    });
  }

  getSnapshot(): Record<string, unknown> {
    return {
      mode: this.result,
      coordinates: 'origin top-left; +x right; +y down; pixels',
      result: this.result,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(2)),
      kills: this.kills,
      wave: this.wave,
      seals: this.seals,
      fullscreen: this.scale.isFullscreen,
    };
  }

  private restartGame(): void {
    if (this.restarting) return;
    this.restarting = true;
    audioSynth.unlock();
    audioSynth.tone(440, 0.12, 'sine', 0.025);
    stateBridge.resetManual();
    this.scene.start('GameScene');
  }

  private toggleFullscreen(): void {
    try {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen({ navigationUI: 'hide' });
    } catch {
      // Pointer button remains the reliable fallback.
    }
  }
}
