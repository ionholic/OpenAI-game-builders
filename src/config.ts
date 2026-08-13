import Phaser from 'phaser';

import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { TitleScene } from './scenes/TitleScene';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export type RenderQuality = 'high' | 'performance';

let renderQuality: RenderQuality = 'high';

export const getRenderScale = (): number => renderQuality === 'high' ? 1.5 : 1;
export const getRenderQuality = (): RenderQuality => renderQuality;

export function setRenderQuality(scene: Phaser.Scene, quality: RenderQuality): void {
  renderQuality = quality;
  const scale = getRenderScale();
  scene.scale.setGameSize(GAME_WIDTH * scale, GAME_HEIGHT * scale);
  scene.cameras.main.setZoom(scale).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
}

export function configureSceneCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(getRenderScale());
  scene.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
}

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'app',
  width: GAME_WIDTH * 1.5,
  height: GAME_HEIGHT * 1.5,
  backgroundColor: '#071120',
  transparent: false,
  render: {
    antialias: true,
    roundPixels: false,
    preserveDrawingBuffer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH * 1.5,
    height: GAME_HEIGHT * 1.5,
    fullscreenTarget: 'app',
  },
  scene: [BootScene, TitleScene, GameScene, ResultScene],
};
