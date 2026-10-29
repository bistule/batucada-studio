import { INSTRUMENTS } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private isMutedMap: Map<string, boolean> = new Map();
  private volumeMap: Map<string, number> = new Map();
  private soloKey: string | null = null;
  private isPlaying = false;
  private currentStep = 0;
  private totalSteps = 16;
  private bpm = 100;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private latencyCompensationSec = 0;
  private metronomeMode: 'off' | 'measure' | 'phrase' = 'off';
  private metronomeVolume = 0.5; // Default metronome volume
  private stepCallback?: (step: number) => void;
  public startTime = 0;
  public currentPatternStartTime = 0;
  private currentPatternTimeSignature = 4;

  public setMetronomeMode(mode: 'off' | 'measure' | 'phrase') {
    this.metronomeMode = mode;
  }

  public setMetronomeVolume(vol: number) {
    this.metronomeVolume = Math.max(0, Math.min(1.5, vol));
  }

  public getMetronomeVolume(): number {
    return this.metronomeVolume;
  }

  constructor() {
    INSTRUMENTS.forEach(i => {
      this.volumeMap.set(i.key, 1.0);
      this.isMutedMap.set(i.key, false);
    });
    // Defaults with realistic mix
    this.volumeMap.set('re', 1.5);
    this.volumeMap.set('ta', 1.3);
    this.volumeMap.set('sn', 1.2);
  }

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public async preloadAllStrokes() {
    this.init();
    for (const inst of INSTRUMENTS) {
      for (const stroke of inst.strokes) {
        this.loadBuffer(inst.key, stroke);
      }
    }
  }

  public async loadBuffer(instKey: string, stroke: string): Promise<AudioBuffer | null> {
    if (!stroke || stroke === ' ') return null;
    const hex = stroke.charCodeAt(0).toString(16);
    const filename = `${instKey}_${hex}.mp3`;

    if (this.buffers.has(filename)) {
      return this.buffers.get(filename)!;
    }

    try {
      this.init();
      // Try absolute path first, then relative fallback
      let res = await fetch(`/audio/${filename}`);
      if (!res.ok) {
        res = await fetch(`audio/${filename}`);
      }
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await this.ctx!.decodeAudioData(arrayBuf);
      this.buffers.set(filename, audioBuf);
      return audioBuf;
    } catch {
      return null;
    }
  }

  public playStroke(instKey: string, stroke: string, time = 0, gainMultiplier = 1.0) {
    if (!stroke || stroke === ' ') return;
    this.init();

    // Check mute & solo
    if (this.isMutedMap.get(instKey)) return;
    if (this.soloKey !== null && this.soloKey !== instKey) return;

    const baseVol = this.volumeMap.get(instKey) ?? 1.0;
    const effectiveVol = baseVol * gainMultiplier;
    if (effectiveVol <= 0.001) return;

    this.loadBuffer(instKey, stroke).then(buffer => {
      if (!buffer || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = effectiveVol;

      src.connect(gain);
      gain.connect(this.ctx.destination);

      const startTime = Math.max(this.ctx.currentTime, time);
      src.start(startTime);
    });
  }

  public playClick(time: number, isFirstBeat = false) {
    if (!this.ctx || this.metronomeVolume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Bois / Cloche percutante bien distincte pour le 1er temps (accent aigu et tranchant) vs autres temps (plus doux)
    osc.type = isFirstBeat ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isFirstBeat ? 2200 : 950, time);
    // Légère descente de fréquence type 'woodblock / rim click'
    osc.frequency.exponentialRampToValueAtTime(isFirstBeat ? 1400 : 600, time + 0.035);

    const targetGain = (isFirstBeat ? 0.75 : 0.35) * this.metronomeVolume;
    gain.gain.setValueAtTime(targetGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.04);
  }

  public setVolume(instKey: string, val: number) {
    this.volumeMap.set(instKey, val);
  }

  public getVolume(instKey: string): number {
    return this.volumeMap.get(instKey) ?? 1.0;
  }

  public toggleMute(instKey: string): boolean {
    const next = !this.isMutedMap.get(instKey);
    this.isMutedMap.set(instKey, next);
    return next;
  }

  public isMuted(instKey: string): boolean {
    return !!this.isMutedMap.get(instKey);
  }

  public setSolo(instKey: string | null) {
    this.soloKey = instKey;
  }

  public getSolo(): string | null {
    return this.soloKey;
  }

  public setBpm(val: number) {
    this.bpm = Math.max(40, Math.min(260, val));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setLatencyCompensation(ms: number) {
    this.latencyCompensationSec = Math.max(0, ms) / 1000.0;
  }

  public getStepsPerBeat(timeSignature = 4): number {
    // Dans la nomenclature RoR & Batucada Studio :
    // timeSignature est le nombre de subdivisions par temps/pulsation :
    // - time = 4  : 4/4 binaire (4 doubles-croches par temps, 16 pas par mesure de 4 temps)
    // - time = 3  : 6/8 ternaire (3 croches par temps ternaire/noire pointée, 6 pas par mesure de 2 temps)
    // - time = 6  : 3/4 (2 pas par temps, 6 pas par mesure de 3 temps, ou 6 pas par temps)
    // - time = 12 : 4/4 triolets haute résolution (12 pas par temps, 48 pas par mesure)
    // - time = 2  : 2/4 (2 ou 4 pas par temps)
    // - time = 8  : 4/4 étendu (8 pas par temps)
    return timeSignature || 4;
  }

  public getPlaybackProgress(timeSignature?: number): number {
    if (!this.isPlaying || !this.ctx) return 0;
    const effectiveTimeSig = timeSignature ?? this.currentPatternTimeSignature;
    const stepsPerBeat = this.getStepsPerBeat(effectiveTimeSig);
    const secondsPerStep = (60.0 / this.bpm) / stepsPerBeat;
    if (secondsPerStep <= 0) return 0;
    const baseTime = this.currentPatternStartTime || (this.startTime + 0.05);
    const elapsed = this.ctx.currentTime - baseTime + this.latencyCompensationSec;
    return elapsed / secondsPerStep;
  }

  public getCurrentTime(): number {
    return this.ctx?.currentTime || 0;
  }

  public getSecondsPerStep(timeSignature = 4): number {
    const stepsPerBeat = this.getStepsPerBeat(timeSignature);
    return (60.0 / this.bpm) / stepsPerBeat;
  }

  public start(
    tracks: Record<string, string>,
    length: number,
    volumeHack?: Record<number, number> | Record<string, Record<number, number>>,
    onStep?: (step: number) => void,
    timeSignature = 4,
    onLoopEnd?: () => { tracks: Record<string, string>; length: number; timeSignature?: number; volumeHack?: any } | void
  ) {
    this.init();
    this.stop();
    this.isPlaying = true;
    this.totalSteps = length || 16;
    this.currentStep = 0;
    this.stepCallback = onStep;

    this.startTime = this.ctx!.currentTime;
    this.nextNoteTime = this.ctx!.currentTime + 0.05;
    this.currentPatternStartTime = this.nextNoteTime;
    this.currentPatternTimeSignature = timeSignature;

    let currentTracks = tracks;
    let currentVolumeHack = volumeHack;

    let stepsPerBeat = this.getStepsPerBeat(timeSignature);

    const scheduler = () => {
      while (this.nextNoteTime < this.ctx!.currentTime + 0.1) {
        const stepToSchedule = this.currentStep % this.totalSteps;
        const noteTime = this.nextNoteTime;

        // UI callback with latency adjustment
        const delayMs = Math.max(0, (noteTime - this.ctx!.currentTime - this.latencyCompensationSec) * 1000);
        setTimeout(() => {
          if (this.isPlaying && this.stepCallback) {
            this.stepCallback(stepToSchedule);
          }
        }, delayMs);

        // Schedule all instruments for this step
        for (const [key, track] of Object.entries(currentTracks)) {
          const stroke = track[stepToSchedule];
          if (stroke && stroke !== ' ') {
            let gainMult = 1.0;
            if (currentVolumeHack) {
              if (typeof (currentVolumeHack as Record<number, number>)[stepToSchedule] === 'number') {
                gainMult = (currentVolumeHack as Record<number, number>)[stepToSchedule];
              } else if ((currentVolumeHack as Record<string, Record<number, number>>)[key]?.[stepToSchedule] !== undefined) {
                gainMult = (currentVolumeHack as Record<string, Record<number, number>>)[key][stepToSchedule];
              }
            }
            this.playStroke(key, stroke, noteTime, gainMult);
          }
        }

        // Metronome modes:
        // En 6/8 (time = 3) : 2 temps ternaires par mesure de 6 pas (stepsPerBeat=3, 2 temps = 6 pas)
        // En 3/4 (time = 6) : 3 temps binaires par mesure de 6 pas (stepsPerBeat=2, 3 temps = 6 pas)
        // En 4/4 ternaire (time = 12) : 4 temps ternaires par mesure de 12 pas (stepsPerBeat=3, 4 temps = 12 pas)
        // En 2/4 (time = 2) : 2 temps binaires par mesure (stepsPerBeat=2 ou 4)
        // En 4/4 binaire (time = 4) : 4 temps de 4 doubles-croches par mesure (16 pas = 4 clics)
        let stepsPerMeasure = stepsPerBeat * 4;
        if (timeSignature === 3) {
          stepsPerMeasure = 6; // 2 temps ternaires de 3 pas = 6 pas par mesure de 6/8
        } else if (timeSignature === 6) {
          stepsPerMeasure = 6; // 3 temps binaires de 2 pas = 6 pas par mesure de 3/4
        } else if (timeSignature === 12) {
          stepsPerMeasure = 48; // 4/4 triolets = 4 temps de 12 pas = 48 pas par mesure
        } else if (timeSignature === 2) {
          stepsPerMeasure = stepsPerBeat * 2;
        } else if (timeSignature === 8) {
          stepsPerMeasure = 32;
        }

        if (this.metronomeMode === 'measure') {
          if (stepToSchedule % stepsPerBeat === 0) {
            const isFirstBeat = (stepToSchedule === 0 || stepToSchedule % stepsPerMeasure === 0);
            this.playClick(noteTime, isFirstBeat);
          }
        } else if (this.metronomeMode === 'phrase') {
          if (stepToSchedule === 0) {
            this.playClick(noteTime, true);
          } else if (stepToSchedule % stepsPerBeat === 0) {
            this.playClick(noteTime, false);
          }
        }

        // Advance step duration according to ternary (3 steps per beat) vs binary (4 steps per beat)
        const secondsPerStep = (60.0 / this.bpm) / stepsPerBeat;
        this.nextNoteTime += secondsPerStep;
        this.currentStep++;

        // Seamless Live Pattern Transition at loop boundary without audio hiccup
        if (stepToSchedule === this.totalSteps - 1 && onLoopEnd) {
          const nextPatternData = onLoopEnd();
          if (nextPatternData) {
            currentTracks = nextPatternData.tracks;
            this.totalSteps = nextPatternData.length || 16;
            this.currentStep = 0;
            currentVolumeHack = nextPatternData.volumeHack;
            this.currentPatternStartTime = this.nextNoteTime;
            if (nextPatternData.timeSignature) {
              timeSignature = nextPatternData.timeSignature;
              this.currentPatternTimeSignature = timeSignature;
              stepsPerBeat = this.getStepsPerBeat(timeSignature);
            }
          }
        }
      }

      if (this.isPlaying) {
        this.timer = window.setTimeout(scheduler, 25);
      }
    };

    scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audio = new SoundEngine();
