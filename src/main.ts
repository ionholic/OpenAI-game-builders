import Phaser from 'phaser';

import { gameConfig } from './config';
import './styles.css';
import './testing/StateBridge';

const game = new Phaser.Game(gameConfig);

window.addEventListener('beforeunload', () => {
  game.destroy(true);
});

