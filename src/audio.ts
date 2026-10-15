import type { AudioSink } from './engine/breathEngine';
import type { Soundscape } from './types';

/**
 * Grafo de áudio:
 *
 *   respiração ─┐
 *   sinos/gongo ┼─► guideBus ─┐
 *               └─► reverb ───┼─► master (mute) ─► limiter ─► saída
 *   paisagem/binaural ─► ambienceBus (volume do fundo) ─┘
 *
 * Tudo é sintetizado aqui, exceto a inspiração (gravação real). As
 * paisagens não usam timers: só LFOs e loops, então suspender o
 * AudioContext (pausa) congela o som inteiro de forma atômica.
 */

type AmbienceMode = 'breathing' | 'hold' | 'meditation';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let guideBus: GainNode | null = null;
let ambienceBus: GainNode | null = null;
let reverbSend: GainNode | null = null;

let inhaleBuffer: AudioBuffer | null = null;
const noiseCache = new Map<NoiseKind, AudioBuffer>();

// Camadas da paisagem ativa (fontes + ganhos controlados por setAmbience)
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

const BREATH_GAIN = 0.85;
/** playbackRate fora desta faixa soa artificial; além dela o som só termina antes. */
const MIN_RATE = 0.6;
const MAX_RATE = 1.4;

const BINAURAL_CARRIER_HZ = 200;
/** Baixo de propósito: é um tom fixo e contínuo, fica marcante mesmo suave. */
const BINAURAL_GAIN = 0.022;
/** Batida por fase: alpha na respiração ativa, theta na retenção/meditação. */
const BINAURAL_BEAT_HZ: Record<AmbienceMode, number> = {
  breathing: 10,
  hold: 6,
  meditation: 4.5,
};

/**
 * Ganhos das duas camadas de cada paisagem, por fase. Na retenção o fundo
 * recua para o silêncio ficar mais presente; na meditação a camada tonal
 * (B) cresce.
 */
const SOUNDSCAPE_LEVELS: Record<Exclude<Soundscape, 'none'>, Record<AmbienceMode, { a: number; b: number }>> = {
  breeze: {
    breathing: { a: 0.32, b: 0.05 },
    hold: { a: 0.18, b: 0.035 },
    meditation: { a: 0.12, b: 0.07 },
  },
  ocean: {
    breathing: { a: 0.5, b: 0.22 },
    hold: { a: 0.32, b: 0.16 },
    meditation: { a: 0.26, b: 0.2 },
  },
  rain: {
    breathing: { a: 0.26, b: 0.3 },
    hold: { a: 0.17, b: 0.21 },
    meditation: { a: 0.13, b: 0.21 },
  },
  // O pad tem 8 osciladores + reverb: ganhos bem menores para soar no
  // mesmo nível percebido das outras paisagens (medido em RMS).
  drone: {
    breathing: { a: 0.035, b: 0.04 },
    hold: { a: 0.025, b: 0.025 },
    meditation: { a: 0.045, b: 0.03 },
  },
};

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'playback' });
    buildGraph(ctx);
  }
  return ctx;
}

function buildGraph(c: AudioContext) {
  // Limitador suave: protege contra picos quando gongo + fundo + respiração somam.
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(c.destination);

  masterGain = c.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(limiter);

  guideBus = c.createGain();
  guideBus.connect(masterGain);

  ambienceBus = c.createGain();
  ambienceBus.gain.value = 0.7;
  ambienceBus.connect(masterGain);

  const convolver = c.createConvolver();
  convolver.buffer = makeImpulse(c, 3.6, 2.4);
  const reverbReturn = c.createGain();
  reverbReturn.gain.value = 0.55;
  reverbSend = c.createGain();
  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(masterGain);
}

/** Resposta ao impulso de uma sala ampla: ruído estéreo com decaimento exponencial. */
function makeImpulse(c: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  const preDelay = Math.floor(rate * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = preDelay; i < len; i++) {
      const t = (i - preDelay) / (len - preDelay);
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

function getGuide(): GainNode {
  getCtx();
  return guideBus!;
}

function getAmbience(): GainNode {
  getCtx();
  return ambienceBus!;
}

function getReverb(): GainNode {
  getCtx();
  return reverbSend!;
}

function track(source: AudioScheduledSourceNode, startTime: number) {
  scheduledSources.set(source, startTime);
  source.addEventListener('ended', () => scheduledSources.delete(source));
}

type NoiseKind = 'white' | 'pink' | 'brown';

/** Gera `n` amostras de um ruído colorido, com estado próprio por canal. */
function noiseSamples(kind: NoiseKind, n: number): Float32Array {
  const out = new Float32Array(n);
  if (kind === 'white') {
    for (let i = 0; i < n; i++) out[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Filtro de Paul Kellet: ruído rosa (-3dB/oitava), bem mais natural que o branco.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
  }
  return out;
}

/**
 * Buffer estéreo de ruído que dá a volta sem clique: o fim é misturado
 * (equal-power) com a continuação do sinal, então amostra final e inicial
 * se encaixam.
 */
function getNoise(kind: NoiseKind): AudioBuffer {
  const cached = noiseCache.get(kind);
  if (cached) return cached;
  const c = getCtx();
  const rate = c.sampleRate;
  const len = Math.floor(rate * 10);
  const fade = Math.floor(rate * 0.5);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const raw = noiseSamples(kind, len + fade);
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = raw[i];
    for (let i = 0; i < fade; i++) {
      const x = i / fade;
      data[i] = raw[i] * Math.sin((x * Math.PI) / 2) + raw[len + i] * Math.cos((x * Math.PI) / 2);
    }
  }
  noiseCache.set(kind, buf);
  return buf;
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return getCtx().decodeAudioData(arrayBuffer);
}

export async function initAudio() {
  const c = getCtx();
  await c.resume();
  if (!inhaleBuffer) inhaleBuffer = await loadBuffer(`${import.meta.env.BASE_URL}inhale.ogg`);
}

export function setMuted(muted: boolean) {
  const c = getCtx();
  getMaster().gain.setTargetAtTime(muted ? 0 : 1, c.currentTime, 0.15);
}

/** Volume do som de fundo (0–1), com curva perceptual. */
export function setAmbienceVolume(volume: number) {
  const c = getCtx();
  const v = Math.max(0, Math.min(1, volume));
  getAmbience().gain.setTargetAtTime(v * v * 1.4, c.currentTime, 0.1);
}

function makeLoop(kind: NoiseKind): AudioBufferSourceNode {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = getNoise(kind);
  src.loop = true;
  return src;
}

function lfo(freq: number, depth: number, target: AudioParam): OscillatorNode {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = depth;
  osc.connect(g);
  g.connect(target);
  return osc;
}

function filter(type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = getCtx().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function chain(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

function buildBreeze(a: GainNode, b: GainNode): AudioScheduledSourceNode[] {
  const c = getCtx();
  // Vento: ruído marrom num passa-banda que "sopra" com dois LFOs lentos
  const wind = makeLoop('brown');
  const bp = filter('bandpass', 420, 0.6);
  const gust = c.createGain();
  gust.gain.value = 0.75;
  chain(wind, bp, gust, a);
  const sweep1 = lfo(0.05, 160, bp.frequency);
  const sweep2 = lfo(0.13, 70, bp.frequency);
  const swell = lfo(0.07, 0.25, gust.gain);

  // Drone grave original (110Hz) + quinta, com vibrato lento
  const tones: OscillatorNode[] = [];
  for (const [freq, level] of [[110, 1], [165, 0.35]] as const) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = level;
    chain(osc, g, b);
    tones.push(osc, lfo(0.11, 1.1, osc.frequency));
  }
  return [wind, sweep1, sweep2, swell, ...tones];
}

function buildOcean(a: GainNode, b: GainNode): AudioScheduledSourceNode[] {
  const c = getCtx();
  // Ondas: dois LFOs de períodos incomensuráveis (≈9s e ≈14s) modulam volume
  // e brilho juntos, então nenhuma onda soa igual à anterior.
  const surf = makeLoop('pink');
  const lp = filter('lowpass', 700, 0.5);
  const swell = c.createGain();
  swell.gain.value = 0.5;
  chain(surf, lp, swell, a);
  const w1 = lfo(0.11, 0.28, swell.gain);
  const w2 = lfo(0.071, 0.2, swell.gain);
  const b1 = lfo(0.11, 380, lp.frequency);
  const b2 = lfo(0.071, 220, lp.frequency);

  // Ronco grave contínuo do mar ao fundo
  const deep = makeLoop('brown');
  const deepLp = filter('lowpass', 180);
  chain(deep, deepLp, b);
  return [surf, w1, w2, b1, b2, deep];
}

function buildRain(a: GainNode, b: GainNode): AudioScheduledSourceNode[] {
  // Chuva: ruído rosa em banda alta (gotas) + corpo médio-grave (telhado)
  const patter = makeLoop('pink');
  const hp = filter('highpass', 1200);
  const shelf = filter('lowpass', 7000);
  chain(patter, hp, shelf, a);

  const body = makeLoop('pink');
  const lp = filter('lowpass', 650);
  const hp2 = filter('highpass', 90);
  chain(body, hp2, lp, b);
  const drift = lfo(0.04, 120, lp.frequency);
  return [patter, body, drift];
}

function buildDrone(a: GainNode, b: GainNode): AudioScheduledSourceNode[] {
  const c = getCtx();
  // Ressonância: pad de tigela tibetana em 136,1Hz ("om"), parciais com
  // leve desafinação para batimento lento, passando pelo reverb.
  const sources: AudioScheduledSourceNode[] = [];
  const pad = c.createGain();
  pad.gain.value = 1;
  pad.connect(a);
  // Reverb próprio, dentro da camada: assim o volume do fundo e as
  // transições de fase também controlam a cauda.
  const room = c.createConvolver();
  room.buffer = makeImpulse(c, 4, 2.2);
  const wet = c.createGain();
  wet.gain.value = 0.6;
  chain(pad, room, wet, a);
  const base = 136.1;
  for (const [ratio, level] of [[1, 1], [1.5, 0.35], [2, 0.4], [3, 0.12]] as const) {
    for (const detune of [-1.5, 1.5]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      osc.detune.value = detune * ratio;
      const g = c.createGain();
      g.gain.value = level * 0.5;
      chain(osc, g, pad);
      sources.push(osc);
    }
  }
  sources.push(lfo(0.05, 0.25, pad.gain));

  // Ar suave por trás
  const air = makeLoop('pink');
  const lp = filter('lowpass', 900);
  chain(air, lp, b);
  sources.push(air);
  return sources;
}

export function startBackground(soundscape: Soundscape = 'breeze', binaural = false, volume = 0.7) {
  const c = getCtx();
  const bus = getAmbience();
  setAmbienceVolume(volume);
  activeSoundscape = soundscape;

  if (soundscape !== 'none') {
    const levels = SOUNDSCAPE_LEVELS[soundscape].breathing;
    // Entra com fade-in de ~2s em vez de começar de supetão
    bgLayerA = c.createGain();
    bgLayerA.gain.value = 0;
    bgLayerA.gain.setTargetAtTime(levels.a, c.currentTime, 0.7);
    bgLayerA.connect(bus);
    bgLayerB = c.createGain();
    bgLayerB.gain.value = 0;
    bgLayerB.gain.setTargetAtTime(levels.b, c.currentTime, 0.7);
    bgLayerB.connect(bus);

    const builders = { breeze: buildBreeze, ocean: buildOcean, rain: buildRain, drone: buildDrone };
    bgSources = builders[soundscape](bgLayerA, bgLayerB);
    for (const src of bgSources) src.start();
  }

  if (binaural) {
    binauralGain = c.createGain();
    binauralGain.gain.value = 0;
    binauralGain.gain.setTargetAtTime(BINAURAL_GAIN, c.currentTime, 2);
    binauralGain.connect(bus);

    const beat = BINAURAL_BEAT_HZ.breathing;
    binauralL = c.createOscillator();
    binauralL.type = 'sine';
    binauralL.frequency.value = BINAURAL_CARRIER_HZ - beat / 2;
    binauralR = c.createOscillator();
    binauralR.type = 'sine';
    binauralR.frequency.value = BINAURAL_CARRIER_HZ + beat / 2;

    const panL = new StereoPannerNode(c, { pan: -1 });
    const panR = new StereoPannerNode(c, { pan: 1 });
    chain(binauralL, panL, binauralGain);
    chain(binauralR, panR, binauralGain);
    binauralL.start();
    binauralR.start();
  }
}

export function stopBackground() {
  const c = getCtx();
  const stopAt = c.currentTime + 0.6;
  bgLayerA?.gain.setTargetAtTime(0, c.currentTime, 0.15);
  bgLayerB?.gain.setTargetAtTime(0, c.currentTime, 0.15);
  binauralGain?.gain.setTargetAtTime(0, c.currentTime, 0.15);
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
  activeSoundscape = 'none';
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

  // Tira o chiado agudo da gravação, deixando-a mais quente e próxima
  const warm = filter('lowpass', 5200, 0.5);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(BREATH_GAIN, t + 0.04);
  gain.gain.setValueAtTime(BREATH_GAIN, Math.max(t + 0.04, end - 0.18));
  gain.gain.linearRampToValueAtTime(0.0001, end);

  chain(source, warm, gain, getGuide());
  source.start(t);
  source.stop(end + 0.05);
  track(source, t);
}

/**
 * Expiração sintetizada: sopro de ruído rosa estéreo com o filtro descendo
 * ao longo da fase. Escala a qualquer ritmo sem os artefatos de esticar
 * uma gravação.
 */
function scheduleSynthExhale(atTime: number, durationSec: number) {
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  const end = t + durationSec;

  const source = c.createBufferSource();
  source.buffer = getNoise('pink');
  source.loop = true;

  const hp = filter('highpass', 160);

  // O "sopro": passa-baixa caindo de ~1800Hz para ~420Hz durante a fase
  const lp = filter('lowpass', 1800, 0.6);
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(420, end);

  // Corpo "de boca" em torno de 520Hz, também descendo levemente
  const formant = c.createBiquadFilter();
  formant.type = 'peaking';
  formant.Q.value = 1.2;
  formant.gain.value = 6;
  formant.frequency.setValueAtTime(620, t);
  formant.frequency.exponentialRampToValueAtTime(440, end);

  const gain = c.createGain();
  const peak = 1.1;
  const attack = Math.min(0.3, durationSec * 0.14);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.setTargetAtTime(peak * 0.4, t + attack, durationSec * 0.35);
  gain.gain.setValueAtTime(peak * 0.4, Math.max(t + attack, end - 0.22));
  gain.gain.linearRampToValueAtTime(0.0001, end);

  chain(source, hp, lp, formant, gain, getGuide());
  source.start(t, Math.random() * 8);
  source.stop(end + 0.05);
  track(source, t);
}

function scheduleBreath(type: 'inhale' | 'exhale', atTime: number, durationSec: number) {
  if (type === 'inhale') scheduleInhale(atTime, durationSec);
  else scheduleSynthExhale(atTime, durationSec);
}

interface BellPartial {
  ratio: number;
  gain: number;
  decay: number;
}

/**
 * Corpo ressonante (sino/tigela): cada parcial em par levemente
 * desafinado (batimento natural), decaimento próprio e envio ao reverb.
 */
function strike(atTime: number, fundamental: number, partials: BellPartial[], level: number, reverb: number) {
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  const out = c.createGain();
  out.gain.value = level;
  out.connect(getGuide());
  const send = c.createGain();
  send.gain.value = reverb;
  out.connect(send);
  send.connect(getReverb());

  for (const p of partials) {
    for (const detune of [-0.4, 0.4]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = fundamental * p.ratio + detune * p.ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p.gain / 2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
      chain(osc, g, out);
      osc.start(t);
      osc.stop(t + p.decay + 0.05);
      track(osc, t);
    }
  }
}

/** Gongo/tigela grave para abrir e fechar a meditação. */
function scheduleGong(atTime: number) {
  strike(atTime, 110, [
    { ratio: 1, gain: 0.55, decay: 9 },
    { ratio: 2.76, gain: 0.22, decay: 6 },
    { ratio: 5.4, gain: 0.09, decay: 3.5 },
    { ratio: 8.93, gain: 0.04, decay: 2 },
  ], 0.6, 0.8);
}

/** Sino curto e cristalino para marcar transições. */
function scheduleChime(atTime: number) {
  strike(atTime, 880, [
    { ratio: 1, gain: 0.16, decay: 2.6 },
    { ratio: 2.32, gain: 0.06, decay: 1.4 },
    { ratio: 4.25, gain: 0.025, decay: 0.7 },
  ], 0.9, 0.6);
}

/** Bipe de contagem regressiva: "toc" suave; o último é um sino mais aberto. */
function scheduleTick(atTime: number, final: boolean) {
  if (final) {
    strike(atTime, 1174.7, [
      { ratio: 1, gain: 0.07, decay: 0.9 },
      { ratio: 2.32, gain: 0.02, decay: 0.4 },
    ], 1, 0.4);
    return;
  }
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(820, t);
  osc.frequency.exponentialRampToValueAtTime(620, t + 0.08);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  chain(osc, g, getGuide());
  osc.start(t);
  osc.stop(t + 0.16);
  track(osc, t);
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
 * bloquear a tela; "interrupted" no Safari). Retorna a função de unsubscribe.
 */
export function onAudioStateChange(cb: (state: string) => void): () => void {
  const c = getCtx();
  const handler = () => cb(c.state);
  c.addEventListener('statechange', handler);
  return () => c.removeEventListener('statechange', handler);
}

/** Prévia curta de uma paisagem na tela de configuração. */
let previewTimer: number | null = null;
export function previewSoundscape(soundscape: Soundscape, volume: number) {
  if (previewTimer !== null) clearTimeout(previewTimer);
  stopBackground();
  if (soundscape === 'none') return;
  void getCtx().resume();
  startBackground(soundscape, false, volume);
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    stopBackground();
  }, 3500);
}

export function stopPreview() {
  if (previewTimer === null) return;
  clearTimeout(previewTimer);
  previewTimer = null;
  stopBackground();
}

export function getAudioSink(): AudioSink {
  const c = getCtx();
  return {
    now: () => c.currentTime,
    scheduleBreath,
    scheduleGong,
    scheduleChime,
    scheduleTick,
    setAmbience,
    cancelScheduled,
    suspend: () => c.suspend(),
    resume: () => c.resume(),
  };
}
