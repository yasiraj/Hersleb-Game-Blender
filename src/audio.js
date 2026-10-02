// All sounds are synthesized locally. No remote audio or autoplay is required.
export class HorrorAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.lastBeat = 0;
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
        data[i] = brown * 3.5;
      }
      const wind = this.context.createBufferSource();
      wind.buffer = this.noise;
      wind.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 550;
      this.windGain = this.context.createGain();
      this.windGain.gain.value = 0.11;
      wind.connect(filter).connect(this.windGain).connect(this.master);
      wind.start();
      [55, 82.41, 110.15].forEach((frequency, index) => {
        const drone = this.context.createOscillator();
        drone.type = 'sine';
        drone.frequency.value = frequency;
        const gain = this.context.createGain();
        gain.gain.value = 0.03 / (index + 1);
        drone.connect(gain).connect(this.master);
        drone.start();
      });
    }
    await this.context.resume();
    this.setEnabled(this.enabled);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.context) this.master.gain.setTargetAtTime(enabled ? 0.65 : 0, this.context.currentTime, 0.15);
  }

  tone(frequency, duration = 0.5, volume = 0.12, type = 'sine', delay = 0) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  noiseBurst(duration, volume, cutoff = 500) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + duration);
  }

  enemyStep(volume, pan = 0) {
    if (!this.context || !this.enabled || volume < 0.005) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(panner).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + 0.34);
    this.tone(48, 0.2, volume * 0.4);
  }

  event(event) {
    switch (event.type) {
      case 'footstep':
        this.noiseBurst(0.13, event.volume * 0.15, event.surface === 'street' ? 800 : 350);
        this.tone(83 + Math.random() * 15, 0.11, event.volume * 0.09);
        break;
      case 'warning':
        [294, 588, 883].forEach((f, i) => this.tone(f, 2.3, 0.035 / (i + 1), 'sine'));
        this.noiseBurst(0.6, 0.13, 1400);
        break;
      case 'collected':
        this.tone(523, 0.35, 0.045); this.tone(659, 0.6, 0.04, 'sine', 0.12);
        break;
      case 'breaker-on':
        this.noiseBurst(0.25, 0.35, 2300); this.tone(100, 0.7, 0.12, 'triangle');
        break;
      case 'gate-unlocked':
      case 'hide':
      case 'unhide':
        this.noiseBurst(0.45, 0.18, 650);
        break;
      case 'spotted':
        this.noiseBurst(0.8, 0.3, 1700); this.tone(65, 1.3, 0.2, 'sawtooth');
        break;
      case 'caught':
        this.noiseBurst(1.1, 0.42, 2200); this.tone(43, 1.8, 0.19, 'triangle');
        break;
      case 'escaped':
        [220, 330, 440].forEach(f => this.tone(f, 3.2, 0.05));
        break;
    }
  }

  update(threat, now) {
    if (!this.context || !this.enabled) return;
    if (threat > 0.25 && now - this.lastBeat > 1.15 - threat * 0.55) {
      this.tone(54, 0.17, threat * 0.15);
      this.tone(49, 0.16, threat * 0.11, 'sine', 0.18);
      this.lastBeat = now;
    }
  }
}
