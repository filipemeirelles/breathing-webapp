import type { AudioSink } from './engine/breathEngine';
import type { Soundscape } from './types';

type AmbienceMode = 'breathing' | 'hold' | 'meditation';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let inhaleBuffer: AudioBuffer | null = null;
let noiseWhite: AudioBuffer | null = null;
let noiseBrown: AudioBuffer | null = null;

// Camadas do som de fundo ativo (fontes + ganhos controlados por setAmbience)
let bgSources: AudioScheduledSourceNode[] = [];
let bgLayerA: GainNode | null = null;
let bgLayerB: GainNode | null = null;
let activeSoundscape: Soundscape = 'none';

// Binaural: dois osciladores pan L/R; a diferença de frequência é a "batida"
let binauralL: OscillatorNode | null = null;
let binauralR: OscillatorNode | null = null;
let binauralGain: GainNode | null = null;

/** Fontes agendadas ainda não iniciadas, para cancelamento no stop(). */
const scheduledSources = new Map<AudioScheduledSourceNode, number>();

const BREATH_GAIN = 0.9;
/** playbackRate fora desta faixa soa artificial; além dela o som só termina antes. */
const MIN_RATE = 0.6;
const MAX_RATE = 1.4;

const BINAURAL_CARRIER_HZ = 200;
const BINAURAL_GAIN = 0.05;
/** Batida por fase: alpha na respiração ativa, theta na retenção/meditação. */
const BINAURAL_BEAT_HZ: Record<AmbienceMode, number> = {
  breathing: 10,
  hold: 6,
  meditation: 4.5,
};

/** Ganhos das duas camadas de cada paisagem sonora, por fase. */
const SOUNDSCAPE_LEVELS: Record<Exclude<Soundscape, 'none'>, Record<AmbienceMode, { a: number; b: number }>> = {
  breeze: {
    breathing: { a: 0.035, b: 0.045 },
    hold: { a: 0.018, b: 0.03 },
    meditation: { a: 0.01, b: 0.05 },
  },
  ocean: {
    breathing: { a: 0.12, b: 0.05 },
    hold: { a: 0.08, b: 0.04 },
    meditation: { a: 0.06, b: 0.05 },
  },
  rain: {
    breathing: { a: 0.05, b: 0.035 },
    hold: { a: 0.035, b: 0.025 },
    meditation: { a: 0.025, b: 0.03 },
  },
};

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

function track(source: AudioScheduledSourceNode, startTime: number) {
  scheduledSources.set(source, startTime);
  source.addEventListener('ended', () => scheduledSources.delete(source));
}

function makeNoiseBuffer(kind: 'white' | 'brown', seconds: number): AudioBuffer {
  const c = getCtx();
  const rate = c.sampleRate;
  const buf = c.createBuffer(1, Math.floor(rate * seconds), rate);
  const data = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buf;
}

function getWhiteNoise(): AudioBuffer {
  if (!noiseWhite) noiseWhite = makeNoiseBuffer('white', 8);
  return noiseWhite;
}

function getBrownNoise(): AudioBuffer {
  if (!noiseBrown) noiseBrown = makeNoiseBuffer('brown', 8);
  return noiseBrown;
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return getCtx().decodeAudioData(arrayBuffer);
}

export async function initAudio() {
  const c = getCtx();
  await c.resume();
  inhaleBuffer = await loadBuffer(`${import.meta.env.BASE_URL}inhale.ogg`);
}

export function setMuted(muted: boolean) {
  const c = getCtx();
  getMaster().gain.setTargetAtTime(muted ? 0 : 1, c.currentTime, 0.15);
}

function makeLoop(buffer: AudioBuffer): AudioBufferSourceNode {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

export function startBackground(soundscape: Soundscape = 'breeze', binaural = false) {
  const c = getCtx();
  const mg = getMaster();
  activeSoundscape = soundscape;

  if (soundscape !== 'none') {
    const levels = SOUNDSCAPE_LEVELS[soundscape].breathing;
    bgLayerA = c.createGain();
    bgLayerA.gain.value = levels.a;
    bgLayerA.connect(mg);
    bgLayerB = c.createGain();
    bgLayerB.gain.value = levels.b;
    bgLayerB.connect(mg);

    if (soundscape === 'breeze') {
      // Brisa: brown noise suave + drone 110Hz com vibrato lento (som original)
      const noise = makeLoop(getBrownNoise());
      noise.connect(bgLayerA);
      noise.start();

      const drone = c.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 110;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 1.2;
      lfo.connect(lfoGain);
      lfoGain.connect(drone.frequency);
      drone.connect(bgLayerB);
      drone.start();
      lfo.start();
      bgSources = [noise, drone, lfo];
    } else if (soundscape === 'ocean') {
      // Oceano: ondulação lenta (LFO no ganho) sobre brown noise filtrado,
      // mais uma camada grave contínua.
      const waves = makeLoop(getBrownNoise());
      const wavesLp = c.createBiquadFilter();
      wavesLp.type = 'lowpass';
      wavesLp.frequency.value = 520;
      const swell = c.createGain();
      swell.gain.value = 0.55;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoDepth = c.createGain();
      lfoDepth.gain.value = 0.45;
      lfo.connect(lfoDepth);
      lfoDepth.connect(swell.gain);
      waves.connect(wavesLp);
      wavesLp.connect(swell);
      swell.connect(bgLayerA);
      waves.start();
      lfo.start();

      const deep = makeLoop(getBrownNoise());
      const deepLp = c.createBiquadFilter();
      deepLp.type = 'lowpass';
      deepLp.frequency.value = 220;
      deep.connect(deepLp);
      deepLp.connect(bgLayerB);
      deep.start();
      bgSources = [waves, lfo, deep];
    } else {
      // Chuva: white noise em banda alta suave + corpo grave
      const patter = makeLoop(getWhiteNoise());
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 0.7;
      patter.connect(bp);
      bp.connect(bgLayerA);
      patter.start();

      const body = makeLoop(getBrownNoise());
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      body.connect(lp);
      lp.connect(bgLayerB);
      body.start();
      bgSources = [patter, body];
    }
  }

  if (binaural) {
    binauralGain = c.createGain();
    binauralGain.gain.value = 0;
    binauralGain.gain.setTargetAtTime(BINAURAL_GAIN, c.currentTime, 2);
    binauralGain.connect(mg);

    const beat = BINAURAL_BEAT_HZ.breathing;
    binauralL = c.createOscillator();
    binauralL.type = 'sine';
    binauralL.frequency.value = BINAURAL_CARRIER_HZ - beat / 2;
    binauralR = c.createOscillator();
    binauralR.type = 'sine';
    binauralR.frequency.value = BINAURAL_CARRIER_HZ + beat / 2;

    const panL = new StereoPannerNode(c, { pan: -1 });
    const panR = new StereoPannerNode(c, { pan: 1 });
    binauralL.connect(panL);
    panL.connect(binauralGain);
    binauralR.connect(panR);
    panR.connect(binauralGain);
    binauralL.start();
    binauralR.start();
  }
}

export function stopBackground() {
  const c = getCtx();
  const stopAt = c.currentTime + 0.35;
  bgLayerA?.gain.setTargetAtTime(0, c.currentTime, 0.1);
  bgLayerB?.gain.setTargetAtTime(0, c.currentTime, 0.1);
  binauralGain?.gain.setTargetAtTime(0, c.currentTime, 0.1);
  for (const src of bgSources) {
    try { src.stop(stopAt); } catch { /* already stopped */ }
  }
  for (const osc of [binauralL, binauralR]) {
    try { osc?.stop(stopAt); } catch { /* already stopped */ }
  }
  bgSources = [];
  bgLayerA = null;
  bgLayerB = null;
  binauralL = null;
  binauralR = null;
  binauralGain = null;
}

function setAmbience(mode: AmbienceMode, atTime: number) {
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  if (activeSoundscape !== 'none' && bgLayerA && bgLayerB) {
    const levels = SOUNDSCAPE_LEVELS[activeSoundscape][mode];
    bgLayerA.gain.setTargetAtTime(levels.a, t, 1.5);
    bgLayerB.gain.setTargetAtTime(levels.b, t, 1.5);
  }
  if (binauralL && binauralR) {
    const beat = BINAURAL_BEAT_HZ[mode];
    binauralL.frequency.setTargetAtTime(BINAURAL_CARRIER_HZ - beat / 2, t, 3);
    binauralR.frequency.setTargetAtTime(BINAURAL_CARRIER_HZ + beat / 2, t, 3);
  }
}

/**
 * Inspiração: gravação real esticada/comprimida via playbackRate (limitado)
 * com envelope que termina exatamente no fim da fase.
 */
function scheduleInhale(atTime: number, durationSec: number) {
  const c = getCtx();
  if (!inhaleBuffer) return;

  const t = Math.max(atTime, c.currentTime);
  const end = t + durationSec;

  const source = c.createBufferSource();
  source.buffer = inhaleBuffer;
  source.playbackRate.value = Math.min(MAX_RATE, Math.max(MIN_RATE, inhaleBuffer.duration / durationSec));

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(BREATH_GAIN, t + 0.005);
  gain.gain.setValueAtTime(BREATH_GAIN, Math.max(t + 0.005, end - 0.15));
  gain.gain.linearRampToValueAtTime(0.0001, end);

  source.connect(gain);
  gain.connect(getMaster());
  source.start(t);
  source.stop(end + 0.05);
  track(source, t);
}

/**
 * Expiração sintetizada: sopro de ruído com filtro descendo ao longo da fase.
 * Escala a qualquer ritmo sem os artefatos de esticar uma gravação.
 */
function scheduleSynthExhale(atTime: number, durationSec: number) {
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  const end = t + durationSec;

  const source = c.createBufferSource();
  source.buffer = getWhiteNoise();
  // Offset aleatório no buffer para cada expiração soar levemente diferente
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = source.buffer.duration;

  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 150;

  // O "sopro": passa-baixa caindo de ~1400Hz para ~380Hz durante a fase
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(380, end);

  // Leve corpo "de boca" em torno de 480Hz
  const formant = c.createBiquadFilter();
  formant.type = 'peaking';
  formant.frequency.value = 480;
  formant.Q.value = 1.1;
  formant.gain.value = 5;

  const gain = c.createGain();
  const attack = Math.min(0.35, durationSec * 0.15);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.55, t + attack);
  gain.gain.setTargetAtTime(0.2, t + attack, durationSec * 0.35);
  gain.gain.setValueAtTime(0.2, Math.max(t + attack, end - 0.2));
  gain.gain.linearRampToValueAtTime(0.0001, end);

  source.connect(hp);
  hp.connect(lp);
  lp.connect(formant);
  formant.connect(gain);
  gain.connect(getMaster());
  source.start(t, Math.random() * 4);
  source.stop(end + 0.05);
  track(source, t);
}

function scheduleBreath(type: 'inhale' | 'exhale', atTime: number, durationSec: number) {
  if (type === 'inhale') scheduleInhale(atTime, durationSec);
  else scheduleSynthExhale(atTime, durationSec);
}

/** Gongo sintetizado: parciais levemente inarmônicas com decaimento longo. */
function scheduleGong(atTime: number) {
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  const partials = [
    { freq: 110, gain: 0.5 },
    { freq: 220.6, gain: 0.25 },
    { freq: 331.9, gain: 0.14 },
    { freq: 494.3, gain: 0.08 },
  ];

  const out = c.createGain();
  out.gain.value = 0.55;
  out.connect(getMaster());

  for (const p of partials) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = p.freq;

    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);

    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 5.2);
    track(osc, t);
  }
}

/** Sino curto e suave para marcar transições. */
function scheduleChime(atTime: number) {
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  const partials = [
    { freq: 880, gain: 0.12 },
    { freq: 1318.5, gain: 0.05 },
  ];
  for (const p of partials) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = p.freq;

    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

    osc.connect(g);
    g.connect(getMaster());
    osc.start(t);
    osc.stop(t + 1.3);
    track(osc, t);
  }
}

/** Cancela apenas fontes ainda não iniciadas; as em curso tocam até o fim. */
function cancelScheduled() {
  const c = getCtx();
  const now = c.currentTime;
  for (const [source, startTime] of scheduledSources) {
    if (startTime > now + 0.05) {
      try { source.stop(); } catch { /* ignore */ }
      scheduledSources.delete(source);
    }
  }
}

/**
 * Observa mudanças de estado do AudioContext (ex.: suspensão pelo SO ao
 * bloquear a tela). Retorna a função de unsubscribe.
 */
export function onAudioStateChange(cb: (state: AudioContextState) => void): () => void {
  const c = getCtx();
  const handler = () => cb(c.state);
  c.addEventListener('statechange', handler);
  return () => c.removeEventListener('statechange', handler);
}

export function getAudioSink(): AudioSink {
  const c = getCtx();
  return {
    now: () => c.currentTime,
    scheduleBreath,
    scheduleGong,
    scheduleChime,
    setAmbience,
    cancelScheduled,
    suspend: () => c.suspend(),
    resume: () => c.resume(),
  };
}
