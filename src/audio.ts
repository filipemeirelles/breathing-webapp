let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let bgNoise: AudioBufferSourceNode | null = null;
let bgDrone: OscillatorNode | null = null;
let bgDroneLfo: OscillatorNode | null = null;
let breathSource: AudioBufferSourceNode | null = null;

let inhaleBuffer: AudioBuffer | null = null;
let exhaleBuffer: AudioBuffer | null = null;

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

  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.035;
  bgNoise.connect(noiseGain);
  noiseGain.connect(mg);
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

  const droneGain = c.createGain();
  droneGain.gain.value = 0.045;
  bgDrone.connect(droneGain);
  droneGain.connect(mg);

  bgDrone.start();
  bgDroneLfo.start();
}

export function stopBackground() {
  try { bgNoise?.stop(); } catch { /* already stopped */ }
  try { bgDrone?.stop(); } catch { /* already stopped */ }
  try { bgDroneLfo?.stop(); } catch { /* already stopped */ }
  bgNoise = null;
  bgDrone = null;
  bgDroneLfo = null;
}

export function playBreathTone(type: 'inhale' | 'exhale') {
  const c = getCtx();
  const buffer = type === 'inhale' ? inhaleBuffer : exhaleBuffer;

  try { breathSource?.stop(); } catch { /* ignore */ }
  breathSource = null;

  if (!buffer) return;

  const source = c.createBufferSource();
  source.buffer = buffer;

  const gain = c.createGain();
  gain.gain.value = 0.9;

  source.connect(gain);
  gain.connect(getMaster());
  source.start(c.currentTime);

  breathSource = source;
}

export function stopBreathTone() {
  try { breathSource?.stop(); } catch { /* ignore */ }
  breathSource = null;
}
