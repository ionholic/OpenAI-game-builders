type ToneShape = OscillatorType;

class AudioSynth {
  private context: AudioContext | null = null;

  private volume = 1;

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.volume;
  }

  unlock(): void {
    if (!this.context) {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
  }

  tone(frequency: number, duration: number, shape: ToneShape, volume = 0.035): void {
    if (!this.context || this.context.state !== 'running' || this.volume <= 0) return;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * this.volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  chord(frequencies: number[], duration: number, volume = 0.022): void {
    frequencies.forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, duration, 'sine', volume), index * 45);
    });
  }
}

export const audioSynth = new AudioSynth();

