import type { AudioSink } from './engine/breathEngine';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let bgNoise: AudioBufferSourceNode | null = null;
let bgDrone: OscillatorNode | null = null;
let bgDroneLfo: OscillatorNode | null = null;
let bgNoiseGain: GainNode | null = null;
let bgDroneGain: GainNode | null = null;

let inhaleBuffer: AudioBuffer | null = null;
let exhaleBuffer: AudioBuffer | null = null;

/** Fontes agendadas ainda não iniciadas, para cancelamento no stop(). */
const scheduledSources = new Map<AudioScheduledSourceNode, number>();

const BREATH_GAIN = 0.9;
/** playbackRate fora desta faixa soa artificial; além dela o som só termina antes. */
const MIN_RATE = 0.6;
const MAX_RATE = 1.4;

const AMBIENCE_LEVELS: Record<'breathing' | 'hold' | 'meditation', { noise: number; drone: number }> = {
  breathing: { noise: 0.035, drone: 0.045 },
  hold: { noise: 0.018, drone: 0.03 },
  meditation: { noise: 0.01, drone: 0.05 },
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

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return getCtx().decodeAudioData(arrayBuffer);
}

export async function initAudio() {
  const c = getCtx();
  await c.resume();

  const base = import.meta.env.BASE_URL;
  [inhaleBuffer, exhaleBuffer] = await Promise.all([
    loadBuffer(`${base}inhale.ogg`),
    loadBuffer(`${base}exhale.ogg`),
  ]);
}

export function setMuted(muted: boolean) {
  const c = getCtx();
  getMaster().gain.setTargetAtTime(muted ? 0 : 1, c.currentTime, 0.15);
}

export function startBackground() {
  const c = getCtx();
  const mg = getMaster();

  // Brown noise — looping buffer of 5 seconds
  const rate = c.sampleRate;
  const buf = c.createBuffer(1, rate * 5, rate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.5;
  }

  bgNoise = c.createBufferSource();
  bgNoise.buffer = buf;
  bgNoise.loop = true;

  bgNoiseGain = c.createGain();
  bgNoiseGain.gain.value = AMBIENCE_LEVELS.breathing.noise;
  bgNoise.connect(bgNoiseGain);
  bgNoiseGain.connect(mg);
  bgNoise.start();

  // Soft drone at A2 (110 Hz) with slow vibrato
  bgDrone = c.createOscillator();
  bgDrone.type = 'sine';
  bgDrone.frequency.value = 110;

  bgDroneLfo = c.createOscillator();
  bgDroneLfo.frequency.value = 0.12;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 1.2;
  bgDroneLfo.connect(lfoGain);
  lfoGain.connect(bgDrone.frequency);

  bgDroneGain = c.createGain();
  bgDroneGain.gain.value = AMBIENCE_LEVELS.breathing.drone;
  bgDrone.connect(bgDroneGain);
  bgDroneGain.connect(mg);

  bgDrone.start();
  bgDroneLfo.start();
}

export function stopBackground() {
  const c = getCtx();
  const stopAt = c.currentTime + 0.35;
  bgNoiseGain?.gain.setTargetAtTime(0, c.currentTime, 0.1);
  bgDroneGain?.gain.setTargetAtTime(0, c.currentTime, 0.1);
  try { bgNoise?.stop(stopAt); } catch { /* already stopped */ }
  try { bgDrone?.stop(stopAt); } catch { /* already stopped */ }
  try { bgDroneLfo?.stop(stopAt); } catch { /* already stopped */ }
  bgNoise = null;
  bgDrone = null;
  bgDroneLfo = null;
  bgNoiseGain = null;
  bgDroneGain = null;
}

function setAmbience(mode: 'breathing' | 'hold' | 'meditation', atTime: number) {
  const c = getCtx();
  const t = Math.max(atTime, c.currentTime);
  const levels = AMBIENCE_LEVELS[mode];
  bgNoiseGain?.gain.setTargetAtTime(levels.noise, t, 1.5);
  bgDroneGain?.gain.setTargetAtTime(levels.drone, t, 1.5);
}

/**
 * Agenda o som de respiração no relógio de áudio, esticado/comprimido via
 * playbackRate (limitado) para cobrir a duração da fase, com envelope de
 * ganho que termina exatamente no fim da fase.
 */
function scheduleBreath(type: 'inhale' | 'exhale', atTime: number, durationSec: number) {
  const c = getCtx();
  const buffer = type === 'inhale' ? inhaleBuffer : exhaleBuffer;
  if (!buffer) return;

  const t = Math.max(atTime, c.currentTime);
  const end = t + durationSec;

  const source = c.createBufferSource();
  source.buffer = buffer;
  const rate = Math.min(MAX_RATE, Math.max(MIN_RATE, buffer.duration / durationSec));
  source.playbackRate.value = rate;

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
