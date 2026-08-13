export type GameMode = 'title' | 'playing' | 'won' | 'lost';

export interface SceneBridge {
  getSnapshot(): Record<string, unknown>;
  advanceTime?(milliseconds: number): void;
}

export interface QaBridge {
  clearWave(): void;
  damagePlayer(amount: number): void;
  placeEnemy(
    type: 'dokkaebi' | 'wisp' | 'gwishin' | 'bulgasari' | 'boss' | 'reaper' | 'moonlord',
    x: number,
    y: number,
    hp?: number,
  ): string;
  setPlayerPosition(x: number, y: number): void;
  playerFrame(): number;
  toggleVolume(): void;
  toggleQuality(): void;
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => Promise<void>;
    __WOLHA_QA__?: QaBridge;
  }
}

class StateBridge {
  private active: SceneBridge | null = null;

  private manual = false;

  constructor() {
    window.render_game_to_text = () => JSON.stringify(this.snapshot());
    window.advanceTime = async (milliseconds: number) => {
      this.manual = true;
      this.active?.advanceTime?.(milliseconds);
      await Promise.resolve();
    };
  }

  setActive(scene: SceneBridge): void {
    this.active = scene;
  }

  clear(scene: SceneBridge): void {
    if (this.active === scene) {
      this.active = null;
    }
  }

  isManual(): boolean {
    return this.manual;
  }

  resetManual(): void {
    this.manual = false;
  }

  private snapshot(): Record<string, unknown> {
    return this.active?.getSnapshot() ?? {
      mode: 'loading',
      coordinates: 'origin top-left; +x right; +y down; pixels',
    };
  }
}

export const stateBridge = new StateBridge();
