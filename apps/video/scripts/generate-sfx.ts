import fs from "fs";
import path from "path";

const SAMPLE_RATE = 44100;

function createWavHeader(
  dataLength: number,
  sampleRate = SAMPLE_RATE,
  channels = 1,
  bitsPerSample = 16,
) {
  const buffer = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

function writeWav(filePath: string, samples: Float32Array) {
  const dataLength = samples.length * 2;
  const header = createWavHeader(dataLength);
  const pcmBuffer = Buffer.alloc(dataLength);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcmBuffer.writeInt16LE(Math.floor(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, pcmBuffer]));
  console.log(`Generated: ${filePath} (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
}

// 1. Tactile UI Click (35ms)
function generateClick() {
  const duration = 0.035;
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 220);
    const freq = 1200 - t * 15000;
    samples[i] = Math.sin(2 * Math.PI * Math.max(100, freq) * t) * env * 0.7;
  }
  return samples;
}

// 2. Mechanical Key Tap (30ms)
function generateKeyTap() {
  const duration = 0.03;
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 300);
    const noise = (Math.random() * 2 - 1) * 0.4;
    const tone = Math.sin(2 * Math.PI * 800 * t) * 0.6;
    samples[i] = (noise + tone) * env * 0.4;
  }
  return samples;
}

// 3. Smooth Whoosh Transition (0.5s)
function generateWhoosh() {
  const duration = 0.5;
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const env = Math.sin(Math.PI * t);
    const noise = Math.random() * 2 - 1;
    const fCenter = 200 + 1200 * Math.sin(Math.PI * t);
    const resonance = Math.sin(2 * Math.PI * fCenter * (i / SAMPLE_RATE));
    samples[i] = (noise * 0.3 + resonance * 0.7) * env * 0.5;
  }
  return samples;
}

// 4. Sub-bass Drop (1.5s)
function generateSubDrop() {
  const duration = 1.5;
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 3);
    const freq = 110 * Math.exp(-t * 2.2);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.85;
  }
  return samples;
}

// 5. Crystal Chime Success (1.2s)
function generateChime() {
  const duration = 1.2;
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  const freqs = [1046.5, 1318.5, 1567.98, 2093.0];
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 3.5);
    let val = 0;
    freqs.forEach((f, idx) => {
      val += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (2.5 + idx * 0.5));
    });
    samples[i] = (val / freqs.length) * env * 0.6;
  }
  return samples;
}

// 6. Ambient Electronic Synth Pad Loop (30.0s)
function generateAmbientSoundtrack() {
  const duration = 30.0;
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);

  const chordRoots = [
    { tStart: 0, tEnd: 7.5, root: 65.41 },
    { tStart: 7.5, tEnd: 15, root: 49.0 },
    { tStart: 15, tEnd: 22.5, root: 55.0 },
    { tStart: 22.5, tEnd: 30, root: 43.65 },
  ];

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const currentChord = chordRoots.find((c) => t >= c.tStart && t < c.tEnd) || chordRoots[3]!;
    const chordTime = t - currentChord.tStart;
    const chordEnvelope = Math.sin(Math.PI * (chordTime / 7.5));

    const f1 = currentChord.root;
    const f2 = currentChord.root * 1.5;
    const f3 = currentChord.root * 2.0;
    const f4 = currentChord.root * 2.25;

    const detune = Math.sin(t * 0.8) * 0.5;

    const s1 = Math.sin(2 * Math.PI * (f1 + detune) * t);
    const s2 = Math.sin(2 * Math.PI * (f2 - detune) * t) * 0.6;
    const s3 = Math.sin(2 * Math.PI * (f3 + detune * 1.5) * t) * 0.4;
    const s4 = Math.sin(2 * Math.PI * (f4 - detune * 0.8) * t) * 0.3;

    const pulse = Math.pow(Math.sin(2 * Math.PI * 2 * t), 4) * 0.15;
    const masterBuild = 0.4 + 0.6 * (t / 30.0);
    const masterFade = t > 28.5 ? Math.max(0, (30.0 - t) / 1.5) : 1;

    samples[i] = (s1 + s2 + s3 + s4 + pulse) * chordEnvelope * masterBuild * masterFade * 0.4;
  }
  return samples;
}

const outDir = path.resolve("public/sfx");
writeWav(path.join(outDir, "click.wav"), generateClick());
writeWav(path.join(outDir, "key-tap.wav"), generateKeyTap());
writeWav(path.join(outDir, "whoosh.wav"), generateWhoosh());
writeWav(path.join(outDir, "sub-drop.wav"), generateSubDrop());
writeWav(path.join(outDir, "chime.wav"), generateChime());
writeWav(path.join(outDir, "soundtrack.wav"), generateAmbientSoundtrack());
