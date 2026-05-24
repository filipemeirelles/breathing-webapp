let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let bgNoise: AudioBufferSourceNode | null = null;
let bgDrone: OscillatorNode | null = null;
let bgDroneLfo: OscillatorNode | null = null;
let breathOsc: OscillatorNode | null = null;

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

export function initAudio() {
  getCtx().resume();
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

// Plays a tone that rises on inhale (A3→E4) and falls on exhale (E4→A3)
export function playBreathTone(type: 'inhale' | 'exhale') {
  const c = getCtx();
  const duration = 1.85;

  try { breathOsc?.stop(); } catch { /* ignore */ }

  const fromHz = type === 'inhale' ? 220 : 330;
  const toHz   = type === 'inhale' ? 330 : 220;

  breathOsc = c.createOscillator();
  const gain = c.createGain();

  breathOsc.type = 'sine';
  breathOsc.frequency.setValueAtTime(fromHz, c.currentTime);
  breathOsc.frequency.linearRampToValueAtTime(toHz, c.currentTime + duration);

  // Soft envelope: quick fade in, sustain, fade out
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.09, c.currentTime + 0.12);
  gain.gain.setValueAtTime(0.09, c.currentTime + duration - 0.25);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + duration);

  breathOsc.connect(gain);
  gain.connect(getMaster());

  breathOsc.start(c.currentTime);
  breathOsc.stop(c.currentTime + duration);
}

export function stopBreathTone() {
  try { breathOsc?.stop(); } catch { /* ignore */ }
  breathOsc = null;
}
