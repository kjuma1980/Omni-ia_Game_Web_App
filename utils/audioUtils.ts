
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let offset = 0;
  let pos = 0;

  setUint32(0x46464952);
  setUint32(length - 8);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArr], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};

export function decodeBase64ToUint8Array(base64: string) {
  try {
    let cleanBase64 = base64.trim();
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

    const binaryString = atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decode error:", e);
    return new Uint8Array(0);
  }
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  try {
    const bufferCopy = data.buffer.slice(0);
    return await ctx.decodeAudioData(bufferCopy);
  } catch (e) {
    console.warn("Native decode failed, attempting fallback for RAW PCM...");
    const evenLength = data.length % 2 === 0 ? data.length : data.length - 1;
    const dataInt16 = new Int16Array(evenLength / 2);
    for (let i = 0; i < dataInt16.length; i++) {
      dataInt16[i] = (data[i * 2 + 1] << 8) | data[i * 2];
    }
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  }
}

/**
 * Applies voice effects based on the selected voice entity.
 * Centralizes all audio processing for playback and offline rendering.
 */
export function applyVoiceEffects(
  ctx: BaseAudioContext, 
  source: AudioBufferSourceNode, 
  selectedVoice: string, 
  monsterLevel: number,
  additionalSources: AudioScheduledSourceNode[],
  voiceSpeed: number = 1.0
): AudioNode {
  let finalNode: AudioNode = source;

  // Usamos el valor directo de voiceSpeed sin factores de corrección para respetar la velocidad y tono nativos del audio generado.
  source.playbackRate.value = voiceSpeed;

  if (selectedVoice === 'Villainous Dark') {
    source.detune.value += -300;
    const eq = ctx.createBiquadFilter();
    eq.type = 'lowshelf';
    eq.frequency.value = 300;
    eq.gain.value = 5;
    finalNode.connect(eq);
    finalNode = eq;
  } else if (selectedVoice === 'Wise Elder') {
    source.detune.value += -180;
    source.playbackRate.value *= 0.92;
    const eq = ctx.createBiquadFilter();
    eq.type = 'lowshelf';
    eq.frequency.value = 250;
    eq.gain.value = 3;
    finalNode.connect(eq);
    finalNode = eq;
  } else if (selectedVoice === 'Young Adventurer') {
    source.detune.value += 150;
    source.playbackRate.value *= 1.08;
  } else if (selectedVoice === 'Robot/AI') {
    // Metallic Ring Modulation + Comb Filter
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;
    
    const ringGain = ctx.createGain();
    ringGain.gain.value = 0;
    osc.connect(ringGain.gain);
    osc.start(0);
    additionalSources.push(osc);

    finalNode.connect(ringGain);

    const delay = ctx.createDelay();
    delay.delayTime.value = 0.015;
    const fb = ctx.createGain();
    fb.gain.value = 0.6;
    ringGain.connect(delay);
    delay.connect(fb);
    fb.connect(delay);

    const mix = ctx.createGain();
    mix.gain.value = 1.0;
    ringGain.connect(mix);
    
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    delay.connect(wet);
    wet.connect(mix);

    finalNode = mix;
  } else if (selectedVoice === 'Mystical Entity') {
    source.detune.value += -400;
    
    const delay1 = ctx.createDelay();
    delay1.delayTime.value = 0.08;
    const delay2 = ctx.createDelay();
    delay2.delayTime.value = 0.15;

    const fb = ctx.createGain();
    fb.gain.value = 0.4;
    delay1.connect(fb);
    fb.connect(delay2);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1000;

    finalNode.connect(delay1);
    finalNode.connect(delay2);
    
    delay1.connect(highpass);
    delay2.connect(highpass);

    const mix = ctx.createGain();
    mix.gain.value = 1.0;
    finalNode.connect(mix);

    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.7;
    highpass.connect(wetGain);
    wetGain.connect(mix);

    finalNode = mix;
  } else if (selectedVoice === 'Duende Male') {
    source.detune.value += 500;
    source.playbackRate.value *= 1.1;
    const eq = ctx.createBiquadFilter();
    eq.type = 'peaking';
    eq.frequency.value = 2500;
    eq.gain.value = 3;
    finalNode.connect(eq);
    finalNode = eq;
  } else if (selectedVoice === 'Duende Female') {
    source.detune.value += 600;
    source.playbackRate.value *= 1.15;
    const eq = ctx.createBiquadFilter();
    eq.type = 'peaking';
    eq.frequency.value = 3000;
    eq.gain.value = 4;
    finalNode.connect(eq);
    finalNode = eq;
  } else if (selectedVoice === 'Little Boy') {
    source.detune.value += 700;
    source.playbackRate.value *= 0.88;
    const eq = ctx.createBiquadFilter();
    eq.type = 'peaking';
    eq.frequency.value = 3500;
    eq.gain.value = 3;
    finalNode.connect(eq);
    finalNode = eq;
  } else if (selectedVoice === 'Little Girl') {
    source.detune.value += 800;
    source.playbackRate.value *= 0.85;
    const eq = ctx.createBiquadFilter();
    eq.type = 'peaking';
    eq.frequency.value = 4000;
    eq.gain.value = 4;
    finalNode.connect(eq);
    finalNode = eq;
  }

  // Global Monster effect (stacks on top of entity effects)
  if (monsterLevel > 0.05) {
    source.detune.value -= (monsterLevel * 600);
    source.playbackRate.value *= (1.0 - (monsterLevel * 0.15));

    const delay = ctx.createDelay();
    delay.delayTime.value = 0.03 + (monsterLevel * 0.02);
    const delayGain = ctx.createGain();
    delayGain.gain.value = monsterLevel * 0.6;
    finalNode.connect(delay);
    delay.connect(delayGain);

    const lowPass = ctx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 4000 - (monsterLevel * 2500);

    finalNode.connect(lowPass);
    delayGain.connect(lowPass);

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 250;
    lowShelf.gain.value = monsterLevel * 10;

    lowPass.connect(lowShelf);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.25;

    lowShelf.connect(compressor);
    finalNode = compressor;
  }

  return finalNode;
}

// Voices that require special audio processing effects
export const VOICES_WITH_EFFECTS = [
  'Villainous Dark',
  'Wise Elder',
  'Young Adventurer',
  'Robot/AI',
  'Mystical Entity',
  'Duende Male',
  'Duende Female',
  'Little Boy',
  'Little Girl',
];
