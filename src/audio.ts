export class AudioManager {
  ctx: AudioContext | null = null;
  sfxVolume = 0.7;
  musicVolume = 0.3;
  masterGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  droneOsc: OscillatorNode | null = null;
  padOsc: OscillatorNode | null = null;

  // Rally intensity
  private rallyDroneNode: OscillatorNode | null = null;
  private rallyDroneGain: GainNode | null = null;

  private init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      this.startAmbient();
    } catch {}
  }

  private startAmbient() {
    if (!this.ctx || !this.musicGain) return;

    // Base drone
    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.value = 55;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.12;
    this.droneOsc.connect(droneGain);
    droneGain.connect(this.musicGain);
    this.droneOsc.start();

    // Pad
    this.padOsc = this.ctx.createOscillator();
    this.padOsc.type = 'triangle';
    this.padOsc.frequency.value = 82.5;
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.06;

    // LFO on pad
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();

    this.padOsc.connect(padGain);
    padGain.connect(this.musicGain);
    this.padOsc.start();

    // Rally intensity drone (starts silent, intensifies with rallies)
    this.rallyDroneNode = this.ctx.createOscillator();
    this.rallyDroneNode.type = 'sawtooth';
    this.rallyDroneNode.frequency.value = 110;
    this.rallyDroneGain = this.ctx.createGain();
    this.rallyDroneGain.gain.value = 0;
    const rallyFilter = this.ctx.createBiquadFilter();
    rallyFilter.type = 'lowpass';
    rallyFilter.frequency.value = 400;
    this.rallyDroneNode.connect(rallyFilter);
    rallyFilter.connect(this.rallyDroneGain);
    this.rallyDroneGain.connect(this.musicGain);
    this.rallyDroneNode.start();
  }

  /** Update rally intensity drone volume (0-1 range) */
  setRallyIntensity(intensity: number) {
    if (!this.rallyDroneGain || !this.ctx) return;
    const vol = Math.min(0.08, intensity * 0.08);
    this.rallyDroneGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
  }

  private playSFX(freq: number, type: OscillatorType, duration: number, volume = 0.3) {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume * this.sfxVolume;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume = 0.15, filterFreq = 2000) {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() - 0.5) * 2;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume * this.sfxVolume;
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);
    source.start();
  }

  private playArpeggio(notes: number[], type: OscillatorType = 'sine', noteLen = 0.1, volume = 0.2) {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = this.ctx!.createGain();
      gain.gain.value = 0;
      gain.gain.setValueAtTime(volume * this.sfxVolume, this.ctx!.currentTime + i * noteLen);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + (i + 1) * noteLen);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(this.ctx!.currentTime + i * noteLen);
      osc.stop(this.ctx!.currentTime + (i + 1) * noteLen + 0.05);
    });
  }

  playClick() { this.playSFX(800, 'square', 0.05, 0.15); }

  playServe() {
    this.init();
    this.playNoise(0.15, 0.2, 3000);
    this.playSFX(440, 'sine', 0.15, 0.25);
  }

  playBump() {
    this.playSFX(220, 'triangle', 0.12, 0.2);
    this.playNoise(0.08, 0.1, 1500);
  }

  playSet() {
    this.playSFX(523, 'sine', 0.1, 0.2);
    this.playSFX(659, 'sine', 0.08, 0.15);
  }

  playSpike() {
    this.init();
    this.playNoise(0.12, 0.3, 4000);
    this.playSFX(200, 'sawtooth', 0.15, 0.25);
    this.playSFX(100, 'sine', 0.2, 0.15);
  }

  playNetHit() {
    this.playSFX(150, 'triangle', 0.2, 0.15);
    this.playNoise(0.1, 0.08, 800);
  }

  playPointWon() {
    this.playArpeggio([523, 659, 784, 1047], 'sine', 0.1, 0.25);
  }

  playPointLost() {
    this.playArpeggio([400, 350, 300, 250], 'sawtooth', 0.12, 0.15);
  }

  playAce() {
    this.playArpeggio([523, 659, 784, 1047, 1319], 'sine', 0.08, 0.3);
    this.playNoise(0.3, 0.1, 5000);
  }

  playWin() {
    this.playArpeggio([523, 659, 784, 1047, 1319, 1568], 'sine', 0.12, 0.3);
  }

  playLose() {
    this.playArpeggio([400, 350, 300, 250, 200], 'sawtooth', 0.15, 0.2);
  }

  playCountdown() {
    this.init();
    // Ticks at 1s intervals
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.playSFX(600 + i * 100, 'square', 0.1, 0.2), i * 1000);
    }
    setTimeout(() => this.playSFX(1000, 'sine', 0.2, 0.3), 3000);
  }

  playGameStart() {
    this.playArpeggio([262, 330, 392, 523], 'sine', 0.08, 0.25);
  }

  playAchievement() {
    this.playArpeggio([523, 659, 784, 1047, 1319], 'triangle', 0.1, 0.25);
  }

  /** Crowd cheer burst — layered noise with filtered high-pass for crowd feel */
  playCrowdCheer(intensity = 0.5) {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const duration = 0.6 + intensity * 0.4;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Modulated noise for crowd-like texture
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      const env = Math.sin(Math.PI * t / duration); // bell curve envelope
      data[i] = (Math.random() - 0.5) * 2 * env * (0.8 + Math.sin(t * 30) * 0.2);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const hpFilter = this.ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 300;
    const lpFilter = this.ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.value = 3000;
    const gain = this.ctx.createGain();
    gain.gain.value = intensity * 0.12 * this.sfxVolume;
    source.connect(hpFilter);
    hpFilter.connect(lpFilter);
    lpFilter.connect(gain);
    gain.connect(this.sfxGain!);
    source.start();
  }

  /** Tournament victory fanfare — triumphant ascending sequence */
  playTournamentWin() {
    this.playArpeggio([262, 330, 392, 523, 659, 784, 1047, 1319], 'sine', 0.12, 0.35);
    setTimeout(() => {
      this.playArpeggio([523, 784, 1047, 1568], 'triangle', 0.15, 0.25);
      this.playCrowdCheer(1.0);
    }, 1000);
  }

  /** Impact thud for spikes and blocks */
  playImpact() {
    this.init();
    this.playSFX(80, 'sine', 0.15, 0.35);
    this.playSFX(60, 'sine', 0.2, 0.2);
  }
}
