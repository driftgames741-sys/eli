import type { RadioStation, WeatherMode } from './types';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * 100% native Web Audio API Procedural Audio & FM Radio Synth Engine (zero external MP3s):
 * - Helicopter blade chop ("thump-thump-thump") + turbine whine scaled with RPM/climb
 * - Firefighting SFX (Bambi Bucket water scooping, pouring stream, fire steam sizzle)
 * - Weather SFX (storm rain ambience + rolling thunder rumble)
 * - Aviation Radio SFX (dispatch chime, emergency alarm, clicks, touchdown, impact)
 * - 3-Station Procedural FM Radio Synthesizer: CHILLWAVE FM, SYNTH 80s, LO-FI NIGHTS
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rotorGain: GainNode | null = null;
  private rotorFilter: BiquadFilterNode | null = null;
  private rotorLfo: OscillatorNode | null = null;
  private rotorLfoGain: GainNode | null = null;
  private turbineOsc: OscillatorNode | null = null;
  private turbineGain: GainNode | null = null;

  // Water, storm rain & howling cold blizzard wind continuous noise channels
  private waterGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private blizzardWindGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Phase 6: Soft mechanical rescue winch cable motor channel
  private winchOsc: OscillatorNode | null = null;
  private winchLfo: OscillatorNode | null = null;
  private winchGain: GainNode | null = null;

  // FM Radio synth bus & step sequencer
  private radioBus: GainNode | null = null;
  private radioStation: RadioStation = 'OFF';
  private radioTimerId: number | null = null;
  private radioStep = 0;

  private initialized = false;
  private muted = false;
  private masterVolume = 0.85;
  private radioVolume = 0.72;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.masterVolume * 0.45;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Shared pink-ish noise buffer for helicopter rotor chop & rain
      const bufferSize = ctx.sampleRate * 2;
      const pinkBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = pinkBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.045 * white) / 1.045;
        lastOut = output[i];
        output[i] *= 2.8;
      }
      this.noiseBuffer = pinkBuffer;

      // Helicopter main rotor thump channel
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = pinkBuffer;
      noiseSrc.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 170;
      filter.Q.value = 1.45;
      this.rotorFilter = filter;

      const rotorGain = ctx.createGain();
      rotorGain.gain.value = 0.07;
      this.rotorGain = rotorGain;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 11.2;
      this.rotorLfo = lfo;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.055;
      this.rotorLfoGain = lfoGain;

      lfo.connect(lfoGain);
      lfoGain.connect(rotorGain.gain);

      noiseSrc.connect(filter);
      filter.connect(rotorGain);
      rotorGain.connect(master);

      // Subtle turbine hum
      const turbineOsc = ctx.createOscillator();
      turbineOsc.type = 'triangle';
      turbineOsc.frequency.value = 340;
      this.turbineOsc = turbineOsc;

      const turbineFilter = ctx.createBiquadFilter();
      turbineFilter.type = 'bandpass';
      turbineFilter.frequency.value = 460;
      turbineFilter.Q.value = 2.2;

      const turbineGain = ctx.createGain();
      turbineGain.gain.value = 0.012;
      this.turbineGain = turbineGain;

      turbineOsc.connect(turbineFilter);
      turbineFilter.connect(turbineGain);
      turbineGain.connect(master);

      // White noise channel for Bambi Bucket water stream & fire steam sizzle
      const whiteBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const wData = whiteBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        wData[i] = Math.random() * 2 - 1;
      }

      const waterSrc = ctx.createBufferSource();
      waterSrc.buffer = whiteBuffer;
      waterSrc.loop = true;

      const waterFilter = ctx.createBiquadFilter();
      waterFilter.type = 'bandpass';
      waterFilter.frequency.value = 950;
      waterFilter.Q.value = 0.9;
      this.waterFilter = waterFilter;

      const waterGain = ctx.createGain();
      waterGain.gain.value = 0.0;
      this.waterGain = waterGain;

      waterSrc.connect(waterFilter);
      waterFilter.connect(waterGain);
      waterGain.connect(master);

      // Continuous Storm Rain ambient noise channel
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = whiteBuffer;
      rainSrc.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 1450;
      rainFilter.Q.value = 0.55;

      const rainGain = ctx.createGain();
      rainGain.gain.value = 0.0;
      this.rainGain = rainGain;

      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);

      // Continuous Howling Cold Arctic Wind channel for Blizzard & high Alpine peaks
      const windHowlSrc = ctx.createBufferSource();
      windHowlSrc.buffer = pinkBuffer;
      windHowlSrc.loop = true;

      const windHowlFilter = ctx.createBiquadFilter();
      windHowlFilter.type = 'bandpass';
      windHowlFilter.frequency.value = 390;
      windHowlFilter.Q.value = 5.4;

      const windHowlLfo = ctx.createOscillator();
      windHowlLfo.type = 'sine';
      windHowlLfo.frequency.value = 0.14;

      const windHowlLfoDepth = ctx.createGain();
      windHowlLfoDepth.gain.value = 165;
      windHowlLfo.connect(windHowlLfoDepth);
      windHowlLfoDepth.connect(windHowlFilter.frequency);

      const windBedFilter = ctx.createBiquadFilter();
      windBedFilter.type = 'lowpass';
      windBedFilter.frequency.value = 240;
      windBedFilter.Q.value = 1.1;

      const windHowlSubGain = ctx.createGain();
      windHowlSubGain.gain.value = 0.72;
      const windBedSubGain = ctx.createGain();
      windBedSubGain.gain.value = 0.42;

      const blizzardWindGain = ctx.createGain();
      blizzardWindGain.gain.value = 0.0;
      this.blizzardWindGain = blizzardWindGain;

      windHowlSrc.connect(windHowlFilter);
      windHowlFilter.connect(windHowlSubGain);
      windHowlSubGain.connect(blizzardWindGain);

      windHowlSrc.connect(windBedFilter);
      windBedFilter.connect(windBedSubGain);
      windBedSubGain.connect(blizzardWindGain);

      blizzardWindGain.connect(master);

      // Phase 6: Soft mechanical rescue winch motor (filtered electric hoist whir)
      const winchOsc = ctx.createOscillator();
      winchOsc.type = 'sawtooth';
      winchOsc.frequency.value = 220;
      this.winchOsc = winchOsc;

      const winchFilter = ctx.createBiquadFilter();
      winchFilter.type = 'bandpass';
      winchFilter.frequency.value = 460;
      winchFilter.Q.value = 2.6;

      const winchGain = ctx.createGain();
      winchGain.gain.value = 0.0;
      this.winchGain = winchGain;

      const winchLfo = ctx.createOscillator();
      winchLfo.type = 'sine';
      winchLfo.frequency.value = 15;
      this.winchLfo = winchLfo;

      const winchLfoDepth = ctx.createGain();
      winchLfoDepth.gain.value = 18;
      winchLfo.connect(winchLfoDepth);
      winchLfoDepth.connect(winchOsc.frequency);

      winchOsc.connect(winchFilter);
      winchFilter.connect(winchGain);
      winchGain.connect(master);

      // FM Radio synth stereo bus
      const radioBus = ctx.createGain();
      radioBus.gain.value = this.radioVolume * 0.34;
      radioBus.connect(master);
      this.radioBus = radioBus;

      noiseSrc.start();
      lfo.start();
      turbineOsc.start();
      waterSrc.start();
      rainSrc.start();
      windHowlSrc.start();
      windHowlLfo.start();
      winchOsc.start();
      winchLfo.start();

      this.initialized = true;

      // Start FM Radio scheduler if a station was already selected before unlock
      if (this.radioStation !== 'OFF') {
        this.restartRadioLoop();
      }
    } catch {
      // Gracefully ignore restricted audio contexts
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : this.masterVolume * 0.45,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterVolume > 0 && this.muted) {
      this.muted = false;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume * 0.45,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public getRadioVolume(): number {
    return this.radioVolume;
  }

  public setRadioVolume(vol: number): void {
    this.radioVolume = Math.max(0, Math.min(1, vol));
    if (this.radioBus && this.ctx) {
      this.radioBus.gain.setTargetAtTime(this.radioVolume * 0.34, this.ctx.currentTime, 0.04);
    }
  }

  public getRadioStation(): RadioStation {
    return this.radioStation;
  }

  public setRadioStation(station: RadioStation): void {
    this.radioStation = station;
    this.radioStep = 0;
    if (this.radioTimerId !== null) {
      window.clearInterval(this.radioTimerId);
      this.radioTimerId = null;
    }
    if (station !== 'OFF' && this.initialized) {
      this.restartRadioLoop();
    }
  }

  private restartRadioLoop(): void {
    if (this.radioTimerId !== null) {
      window.clearInterval(this.radioTimerId);
      this.radioTimerId = null;
    }
    if (this.radioStation === 'OFF' || !this.ctx || !this.radioBus) return;

    // 8th-note step intervals matched to each station's vibe
    const stepMs =
      this.radioStation === 'SYNTH_80S'
        ? 268 // ~112 BPM
        : this.radioStation === 'CHILLWAVE'
          ? 325 // ~92 BPM
          : 390; // ~77 BPM Lo-Fi Nights

    this.triggerRadioStep();
    this.radioTimerId = window.setInterval(() => {
      this.triggerRadioStep();
    }, stepMs);
  }

  private triggerRadioStep(): void {
    if (!this.ctx || !this.radioBus || this.muted || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const step = this.radioStep % 32;
    const bar = Math.floor(step / 8); // 0..3 (4-bar chord progression)
    const beatInBar = step % 8; // 0..7 (8th notes)

    if (this.radioStation === 'CHILLWAVE') {
      // Warm nostalgic maj7 progression: Fmaj7 -> G6 -> Em7 -> Am7
      const chords = [
        [53, 57, 60, 64],
        [55, 59, 62, 64],
        [52, 55, 59, 62],
        [45, 52, 55, 60],
      ];
      const bassNotes = [41, 43, 40, 45];
      const arpPattern = [0, 1, 2, 3, 2, 1, 3, 2];

      if (beatInBar === 0) {
        this.playSynthChord(chords[bar], now, 2.35, 'triangle', 0.09, 980);
        this.playSynthNote(bassNotes[bar], now, 1.9, 'sine', 0.14, 340);
      }
      // Gentle dreamy pluck arpeggio
      const arpNote = chords[bar][arpPattern[beatInBar]] + 12;
      this.playSynthNote(arpNote, now, 0.28, 'sine', 0.055, 1900);

      // Soft chill kick on 0 and 4
      if (beatInBar === 0 || beatInBar === 4) {
        this.playSoftKick(now, 0.12);
      }
    } else if (this.radioStation === 'SYNTH_80S') {
      // Driving retro-arcade synthwave: Am -> F -> C -> G
      const chords = [
        [57, 60, 64],
        [53, 57, 60],
        [48, 52, 55],
        [55, 59, 62],
      ];
      const bassRoot = [45, 41, 36, 43];
      const leadSeq = [69, 72, 76, 72, 71, 69, 67, 69];

      // Iconic pulsing 8th-note synth bass
      const oct = beatInBar % 2 === 1 ? 12 : 0;
      this.playSynthNote(bassRoot[bar] + oct, now, 0.21, 'sawtooth', 0.075, 520);

      if (beatInBar === 0) {
        this.playSynthChord(chords[bar], now, 1.85, 'sawtooth', 0.055, 1150);
      }
      if (beatInBar % 2 === 0) {
        this.playSynthNote(leadSeq[(bar * 2 + beatInBar / 2) % leadSeq.length], now, 0.34, 'triangle', 0.06, 2200);
      }
      if (beatInBar === 0 || beatInBar === 4) {
        this.playSoftKick(now, 0.16);
      }
      if (beatInBar === 2 || beatInBar === 6) {
        this.playSoftSnare(now, 0.07);
      }
    } else if (this.radioStation === 'LOFI_NIGHTS') {
      // Mellow nocturnal Rhodes/electric-piano jazz chords: Dm9 -> G13 -> Cmaj9 -> A7b9
      const chords = [
        [50, 53, 57, 60, 64],
        [43, 53, 57, 59, 64],
        [48, 52, 55, 59, 62],
        [45, 52, 55, 61],
      ];
      const bassRoot = [38, 43, 36, 45];

      if (beatInBar === 0 || beatInBar === 5) {
        const dur = beatInBar === 0 ? 1.8 : 0.95;
        this.playSynthChord(chords[bar], now, dur, 'sine', 0.085, 760);
      }
      if (beatInBar === 0) {
        this.playSynthNote(bassRoot[bar], now, 2.2, 'sine', 0.13, 280);
      }
      if (beatInBar === 0 || beatInBar === 3) {
        this.playSoftKick(now, 0.11);
      }
      if (beatInBar === 2 || beatInBar === 6) {
        this.playSoftSnare(now, 0.04);
      }
    }

    this.radioStep = (this.radioStep + 1) % 32;
  }

  private playSynthChord(
    midis: number[],
    startTime: number,
    duration: number,
    type: OscillatorType,
    vol: number,
    cutoff: number
  ): void {
    if (!this.ctx || !this.radioBus) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(vol, startTime + 0.08);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    filter.connect(env);
    env.connect(this.radioBus);

    for (const m of midis) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(midiToFreq(m), startTime);
      osc.connect(filter);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.04);
    }
  }

  private playSynthNote(
    midi: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    vol: number,
    cutoff: number
  ): void {
    if (!this.ctx || !this.radioBus) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(midiToFreq(midi), startTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(vol, startTime + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.radioBus);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  private playSoftKick(startTime: number, vol: number): void {
    if (!this.ctx || !this.radioBus) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, startTime);
    osc.frequency.exponentialRampToValueAtTime(42, startTime + 0.14);
    env.gain.setValueAtTime(vol, startTime);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.17);
    osc.connect(env);
    env.connect(this.radioBus);
    osc.start(startTime);
    osc.stop(startTime + 0.18);
  }

  private playSoftSnare(startTime: number, vol: number): void {
    if (!this.ctx || !this.radioBus || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(vol, startTime);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.11);

    src.connect(hp);
    hp.connect(env);
    env.connect(this.radioBus);
    src.start(startTime);
    src.stop(startTime + 0.12);
  }

  public updateFlightSound(rpmNorm: number, throttleLoad: number, active: boolean): void {
    if (
      !this.initialized ||
      !this.ctx ||
      !this.rotorLfo ||
      !this.rotorGain ||
      !this.rotorFilter ||
      !this.rotorLfoGain ||
      !this.turbineOsc ||
      !this.turbineGain
    ) {
      return;
    }
    const t = this.ctx.currentTime;
    const clampedRpm = Math.max(0.15, Math.min(1.2, rpmNorm));
    const scale = active ? 1 : 0.22;

    const chopFreq = 6.5 + clampedRpm * 11.2 + throttleLoad * 2.4;
    this.rotorLfo.frequency.setTargetAtTime(chopFreq, t, 0.08);

    const baseVol = (0.055 + clampedRpm * 0.125 + throttleLoad * 0.075) * scale;
    this.rotorGain.gain.setTargetAtTime(baseVol, t, 0.08);
    this.rotorLfoGain.gain.setTargetAtTime(baseVol * 0.72, t, 0.08);

    this.rotorFilter.frequency.setTargetAtTime(135 + clampedRpm * 165 + throttleLoad * 115, t, 0.08);
    this.turbineOsc.frequency.setTargetAtTime(240 + clampedRpm * 270 + throttleLoad * 65, t, 0.08);
    this.turbineGain.gain.setTargetAtTime((0.007 + clampedRpm * 0.015) * scale, t, 0.08);
  }

  public updateWaterSound(mode: 'none' | 'scoop' | 'dump' | 'steam'): void {
    if (!this.initialized || !this.ctx || !this.waterGain || !this.waterFilter) return;
    const t = this.ctx.currentTime;
    if (mode === 'none') {
      this.waterGain.gain.setTargetAtTime(0, t, 0.06);
      return;
    }
    if (mode === 'scoop') {
      this.waterFilter.frequency.setTargetAtTime(520, t, 0.06);
      this.waterGain.gain.setTargetAtTime(0.15, t, 0.06);
    } else if (mode === 'dump') {
      this.waterFilter.frequency.setTargetAtTime(1150, t, 0.05);
      this.waterGain.gain.setTargetAtTime(0.21, t, 0.05);
    } else if (mode === 'steam') {
      this.waterFilter.frequency.setTargetAtTime(2400, t, 0.04);
      this.waterGain.gain.setTargetAtTime(0.24, t, 0.04);
    }
  }

  public updateWeatherSound(
    weather: WeatherMode,
    active: boolean,
    alpineSnowFactor = 0
  ): void {
    if (!this.initialized || !this.ctx || !this.rainGain) return;
    const t = this.ctx.currentTime;
    const targetRainVol = weather === 'STORM' && active ? 0.165 : 0.0;
    this.rainGain.gain.setTargetAtTime(targetRainVol, t, 0.35);

    if (this.blizzardWindGain) {
      const targetWindVol = !active
        ? 0.0
        : weather === 'BLIZZARD'
          ? 0.145
          : alpineSnowFactor > 0.2
            ? Math.min(0.042, alpineSnowFactor * 0.045)
            : 0.0;
      this.blizzardWindGain.gain.setTargetAtTime(targetWindVol, t, 0.45);
    }
  }

  public updateWinchSound(mode: 'none' | 'lowering' | 'hoisting'): void {
    if (!this.initialized || !this.ctx || !this.winchGain || !this.winchOsc || !this.winchLfo) {
      return;
    }
    const t = this.ctx.currentTime;
    if (mode === 'none') {
      this.winchGain.gain.setTargetAtTime(0.0, t, 0.07);
      return;
    }
    if (mode === 'lowering') {
      this.winchOsc.frequency.setTargetAtTime(195, t, 0.08);
      this.winchLfo.frequency.setTargetAtTime(13, t, 0.08);
      this.winchGain.gain.setTargetAtTime(0.068, t, 0.07);
    } else {
      this.winchOsc.frequency.setTargetAtTime(265, t, 0.08);
      this.winchLfo.frequency.setTargetAtTime(18, t, 0.08);
      this.winchGain.gain.setTargetAtTime(0.082, t, 0.07);
    }
  }

  public playPoliceRadioComplete(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;

    // 1. Short police radio squelch static burst
    if (this.noiseBuffer) {
      const sqSrc = this.ctx.createBufferSource();
      sqSrc.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1850;
      bp.Q.value = 3.2;
      const sqGain = this.ctx.createGain();
      sqGain.gain.setValueAtTime(0.001, t);
      sqGain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      sqGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      sqSrc.connect(bp);
      bp.connect(sqGain);
      sqGain.connect(this.masterGain);
      sqSrc.start(t);
      sqSrc.stop(t + 0.18);
    }

    // 2. Classic crisp dual-tone police radio acknowledgment chirp ("10-4 suspect in custody")
    const tones = [
      { freq: 1180, start: t + 0.06, dur: 0.09 },
      { freq: 1520, start: t + 0.17, dur: 0.11 },
    ];
    for (const tone of tones) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(tone.freq, tone.start);
      g.gain.setValueAtTime(0.16, tone.start);
      g.gain.exponentialRampToValueAtTime(0.001, tone.start + tone.dur);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(tone.start);
      osc.stop(tone.start + tone.dur + 0.02);
    }

    // 3. Brief stylized patrol siren whoop
    const siren = this.ctx.createOscillator();
    const sGain = this.ctx.createGain();
    siren.type = 'sawtooth';
    const sFilter = this.ctx.createBiquadFilter();
    sFilter.type = 'lowpass';
    sFilter.frequency.value = 1400;

    siren.frequency.setValueAtTime(560, t + 0.3);
    siren.frequency.exponentialRampToValueAtTime(980, t + 0.52);
    siren.frequency.exponentialRampToValueAtTime(540, t + 0.74);
    sGain.gain.setValueAtTime(0.001, t + 0.3);
    sGain.gain.linearRampToValueAtTime(0.11, t + 0.35);
    sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.78);

    siren.connect(sFilter);
    sFilter.connect(sGain);
    sGain.connect(this.masterGain);
    siren.start(t + 0.3);
    siren.stop(t + 0.8);
  }

  public playThunder(distanceNorm = 0.45): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const t = this.ctx.currentTime;
    const d = Math.max(0, Math.min(1, distanceNorm));
    const closeness = 1 - d;

    // 1. Sharp electrical thunderclap crack for closer strikes
    if (closeness > 0.25) {
      const crackSrc = this.ctx.createBufferSource();
      crackSrc.buffer = this.noiseBuffer;
      const crackBp = this.ctx.createBiquadFilter();
      crackBp.type = 'bandpass';
      crackBp.frequency.setValueAtTime(480 + closeness * 540, t);
      crackBp.frequency.exponentialRampToValueAtTime(110, t + 0.42);
      crackBp.Q.value = 0.9;

      const crackEnv = this.ctx.createGain();
      crackEnv.gain.setValueAtTime(0.001, t);
      crackEnv.gain.linearRampToValueAtTime(0.32 + closeness * 0.34, t + 0.025);
      crackEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.52);

      crackSrc.connect(crackBp);
      crackBp.connect(crackEnv);
      crackEnv.connect(this.masterGain);
      crackSrc.start(t);
      crackSrc.stop(t + 0.55);
    }

    // 2. Deep low-pass rolling thunder rumble with secondary reverberation swell
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(170 + closeness * 130, t);
    lp.frequency.exponentialRampToValueAtTime(52, t + 3.0);
    lp.Q.value = 1.25;

    const peakVol = 0.42 + closeness * 0.32;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(peakVol, t + 0.11 + d * 0.16);
    env.gain.exponentialRampToValueAtTime(peakVol * 0.48, t + 0.72);
    env.gain.linearRampToValueAtTime(peakVol * 0.62, t + 1.05);
    env.gain.exponentialRampToValueAtTime(0.001, t + 3.2);

    src.connect(lp);
    lp.connect(env);
    env.connect(this.masterGain);
    src.start(t);
    src.stop(t + 3.3);
  }

  public playTouchdown(soft: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(soft ? 92 : 135, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + (soft ? 0.14 : 0.24));
    gain.gain.setValueAtTime(soft ? 0.28 : 0.52, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.16 : 0.28));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  public playImpact(severity: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120 + severity * 60, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.22);
    gain.gain.setValueAtTime(Math.min(0.65, 0.22 + severity * 0.35), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  public playChime(type: 'bonus' | 'radio' | 'click' | 'alarm'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;

    if (type === 'click') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, t);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.05);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.07);
      return;
    }

    const notes =
      type === 'bonus'
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === 'alarm'
          ? [880, 660, 880]
          : [740, 987.77];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type === 'alarm' ? 'triangle' : 'sine';
      const start = t + idx * 0.09;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(type === 'alarm' ? 0.2 : 0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  public dispose(): void {
    if (this.radioTimerId !== null) {
      window.clearInterval(this.radioTimerId);
      this.radioTimerId = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
