import Phaser from 'phaser';

const FONT_FAMILY = 'Noto Sans KR, Malgun Gothic, sans-serif';

export function makeFullscreenButton(
  scene: Phaser.Scene,
  statusText?: Phaser.GameObjects.Text,
): Phaser.GameObjects.Container {
  const plate = scene.add
    .rectangle(0, 0, 52, 42, 0x071222, 0.82)
    .setStrokeStyle(1, 0xdac67e, 0.68)
    .setInteractive({ useHandCursor: true });
  const label = scene.add
    .text(0, -1, 'F', {
      fontFamily: FONT_FAMILY,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#f5e9bd',
    })
    .setOrigin(0.5);
  const container = scene.add.container(1238, 30, [plate, label]).setDepth(1000);

  const toggle = (): void => {
    try {
      if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
      else scene.scale.startFullscreen({ navigationUI: 'hide' });
    } catch {
      statusText?.setText('이 브라우저에서는 전체화면을 시작할 수 없습니다.');
    }
  };

  plate.on('pointerover', () => plate.setFillStyle(0x1c3552, 0.96));
  plate.on('pointerout', () => plate.setFillStyle(0x071222, 0.82));
  plate.on('pointerup', toggle);

  const handleFullscreenFailure = (): void => {
    statusText?.setText('전체화면 요청이 차단되었습니다. F 버튼을 다시 눌러보세요.');
  };
  scene.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, handleFullscreenFailure);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.FULLSCREEN_FAILED, handleFullscreenFailure);
  });

  return container;
}

export const textStyle = {
  fontFamily: FONT_FAMILY,
  color: '#f6eed6',
};
