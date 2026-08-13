import Phaser from 'phaser';

import { configureSceneCamera } from '../config';

const asset = (filename: string): string =>
  `${import.meta.env.BASE_URL}assets/generated/${filename}`;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    configureSceneCamera(this);
    const progressBar = this.add.rectangle(640, 380, 420, 10, 0x22334e).setOrigin(0.5);
    const progressFill = this.add.rectangle(432, 380, 4, 10, 0xe7c86f).setOrigin(0, 0.5);

    this.add
      .text(640, 330, '달빛 아래 사당을 깨우는 중…', {
        fontFamily: 'Noto Sans KR, Malgun Gothic, sans-serif',
        fontSize: '24px',
        color: '#f4ead0',
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressFill.width = Math.max(4, progressBar.width * value);
    });

    this.load.image('arena-courtyard', asset('arena-courtyard.webp'));
    this.load.image('arena-bamboo', asset('arena-bamboo.webp'));
    this.load.image('arena-palace', asset('arena-palace.webp'));
    this.load.image('player-warden', asset('player-warden.png'));
    this.load.image('enemy-dokkaebi', asset('enemy-dokkaebi.png'));
    this.load.image('enemy-wisp', asset('enemy-wisp.png'));
    this.load.image('enemy-gwishin', asset('enemy-gwishin.png'));
    this.load.image('enemy-bulgasari', asset('enemy-bulgasari.png'));
    this.load.image('altar', asset('altar.png'));
    this.load.spritesheet('player-warden-sheet', asset('player-warden-sheet.png'), { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet('player-warden-poses-v2', asset('player-warden-poses-v2.png'), { frameWidth: 384, frameHeight: 512 });
    this.load.spritesheet('player-warden-motion-v3', asset('player-warden-motion-v4-normalized.png'), { frameWidth: 224, frameHeight: 256 });
    this.load.spritesheet('combat-vfx-v1', asset('combat-vfx-v2-normalized.png'), { frameWidth: 384, frameHeight: 256 });
    this.load.spritesheet('enemy-dokkaebi-sheet', asset('enemy-dokkaebi-sheet.png'), { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet('enemy-wisp-sheet', asset('enemy-wisp-sheet.png'), { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet('enemy-gwishin-sheet', asset('enemy-gwishin-sheet.png'), { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet('enemy-bulgasari-sheet', asset('enemy-bulgasari-sheet.png'), { frameWidth: 512, frameHeight: 512 });
  }

  create(): void {
    this.scene.start('TitleScene');
  }
}
