import Phaser from 'phaser';

import { configureSceneCamera, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audioSynth } from '../audio/AudioSynth';
import { stateBridge } from '../testing/StateBridge';
import { makeFullscreenButton, textStyle } from './sceneUi';

export class TitleScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    configureSceneCamera(this);
    this.started = false;
    stateBridge.setActive(this);

    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'arena-courtyard')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setTint(0x8396bc);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020713, 0.58);

    this.add
      .text(GAME_WIDTH / 2, 132, '月下鎭魂', {
        ...textStyle,
        fontFamily: 'Batang, Nanum Myeongjo, serif',
        fontSize: '30px',
        color: '#d9bd64',
        letterSpacing: 12,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 205, '월 하 진 혼', {
        ...textStyle,
        fontFamily: 'Batang, Nanum Myeongjo, serif',
        fontSize: '74px',
        fontStyle: 'bold',
        color: '#fff3cf',
        stroke: '#171128',
        strokeThickness: 8,
        letterSpacing: 16,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 278, '세 전장을 가로지르는 다섯 장의 요괴 습격을 막고\n중앙 제단의 봉인 다섯 개를 정화하세요.', {
        ...textStyle,
        fontSize: '23px',
        color: '#dce7f4',
        align: 'center',
        lineSpacing: 9,
      })
      .setOrigin(0.5);

    const guidePlate = this.add
      .rectangle(GAME_WIDTH / 2, 412, 900, 140, 0x061426, 0.8)
      .setStrokeStyle(1, 0xcdb764, 0.48);
    const controls = this.add
      .text(
        GAME_WIDTH / 2,
        guidePlate.y,
        '이동 WASD/방향키 · 공격 J/클릭 · 강공격 E · 부적 Q\n방어/튕겨내기 C · 대시 Shift/우클릭 · 정화 R · 일시정지 P',
        {
          ...textStyle,
          fontSize: '20px',
          color: '#f2ead3',
          align: 'center',
          lineSpacing: 14,
        },
      )
      .setOrigin(0.5);
    controls.setDepth(guidePlate.depth + 1);

    const buttonPlate = this.add
      .rectangle(GAME_WIDTH / 2, 554, 286, 64, 0x8f2f32, 0.96)
      .setStrokeStyle(2, 0xf4d683, 0.9)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add
      .text(GAME_WIDTH / 2, 552, '정화 시작', {
        ...textStyle,
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#fff2cb',
      })
      .setOrigin(0.5);

    buttonPlate.on('pointerover', () => {
      buttonPlate.setFillStyle(0xb2453e, 1).setScale(1.025);
      buttonText.setScale(1.025);
    });
    buttonPlate.on('pointerout', () => {
      buttonPlate.setFillStyle(0x8f2f32, 0.96).setScale(1);
      buttonText.setScale(1);
    });
    buttonPlate.on('pointerup', () => this.startGame());

    this.add
      .text(GAME_WIDTH / 2, 614, 'Enter 키로도 시작할 수 있습니다', {
        ...textStyle,
        fontSize: '16px',
        color: '#aebbd0',
      })
      .setOrigin(0.5);

    const fullscreenStatus = this.add
      .text(GAME_WIDTH / 2, 678, '', {
        ...textStyle,
        fontSize: '14px',
        color: '#e2b8a9',
      })
      .setOrigin(0.5);
    makeFullscreenButton(this, fullscreenStatus);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.addCapture('ENTER,SPACE,F');
      keyboard.once('keydown-ENTER', this.startGame, this);
      keyboard.once('keydown-SPACE', this.startGame, this);
      keyboard.on('keydown-F', this.toggleFullscreen, this);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown-F', this.toggleFullscreen, this);
      stateBridge.clear(this);
    });
  }

  getSnapshot(): Record<string, unknown> {
    return {
      mode: 'title',
      coordinates: 'origin top-left; +x right; +y down; pixels',
      title: '월하진혼',
      objective: '세 전장의 다섯 스테이지를 돌파하고 봉인 다섯 개를 정화한다',
      controls: ['WASD/방향키 이동', 'J/마우스 공격', 'E 강공격', 'Q 부적 투척', 'C 방어/튕겨내기', 'Shift 대시', 'R 정화', 'P 일시정지', 'F 전체화면'],
      started: this.started,
      fullscreen: this.scale.isFullscreen,
    };
  }

  private startGame(): void {
    if (this.started) return;
    this.started = true;
    audioSynth.unlock();
    audioSynth.chord([392, 523, 659], 0.18, 0.018);
    stateBridge.resetManual();
    this.scene.start('GameScene');
  }

  private toggleFullscreen(): void {
    try {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen({ navigationUI: 'hide' });
    } catch {
      // The visible pointer button remains available when keyboard fullscreen is blocked.
    }
  }
}
