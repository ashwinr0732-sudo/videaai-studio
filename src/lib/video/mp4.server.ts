/**
 * Server-side MP4 demux / concat / probe — pure JavaScript, no native binaries.
 *
 * The app's server runtime is a serverless Worker: `child_process` is a stub, so
 * the real `ffmpeg` / `ffprobe` executables cannot run here. This module does the
 * equivalent of `ffmpeg -f concat -c copy` and `ffprobe -show_streams` at the
 * container level:
 *
 *  - samples are copied byte-for-byte (stream copy) — there is no re-encoding,
 *    no scaling and no bitrate change, so nothing is re-compressed;
 *  - clips must agree on codec configuration (`stsd`), resolution and track
 *    layout, otherwise the concat is rejected instead of producing a broken file;
 *  - `probeMp4` reads the real bytes of the produced file (not the request
 *    parameters) to report duration, resolution, frame rate and codec.
 */

const u8 = (n: number) => n & 0xff;

function u32(n: number): Uint8Array {
  return new Uint8Array([u8(n >>> 24), u8(n >>> 16), u8(n >>> 8), u8(n)]);
}
function u16(n: number): Uint8Array {
  return new Uint8Array([u8(n >>> 8), u8(n)]);
}
function ascii(s: string): Uint8Array {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0xff));
}
function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const body = concatBytes(parts);
  return concatBytes([u32(body.length + 8), ascii(type), body]);
}

export class Mp4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp4Error";
  }
}

interface RawBox {
  type: string;
  dataStart: number;
  dataEnd: number;
}

function readBoxes(data: Uint8Array, start: number, end: number): RawBox[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: RawBox[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(data[at + 4]!, data[at + 5]!, data[at + 6]!, data[at + 7]!);
    let header = 8;
    if (size === 1) {
      // 64-bit largesize
      const hi = view.getUint32(at + 8);
      const lo = view.getUint32(at + 12);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) break;
    out.push({ type, dataStart: at + header, dataEnd: at + size });
    at += size;
  }
  return out;
}

function findBox(data: Uint8Array, parent: RawBox | null, type: string, end?: number) {
  const boxes = readBoxes(data, parent ? parent.dataStart : 0, parent ? parent.dataEnd : (end ?? data.length));
  return boxes.find((b) => b.type === type) ?? null;
}

function requireBox(data: Uint8Array, parent: RawBox | null, type: string, end?: number) {
  const found = findBox(data, parent, type, end);
  if (!found) throw new Mp4Error(`Malformed MP4: missing "${type}" box.`);
  return found;
}

export interface Sample {
  /** Index of the source buffer this sample's bytes live in. */
  source: number;
  offset: number;
  size: number;
  /** Decode duration in the track timescale. */
  delta: number;
  /** Composition offset in the track timescale. */
  cts: number;
  sync: boolean;
}

export interface Track {
  handler: "vide" | "soun";
  timescale: number;
  /** Raw `stsd` box bytes, copied verbatim so the codec config is preserved. */
  stsd: Uint8Array;
  codec: string;
  width: number;
  height: number;
  samples: Sample[];
}

function slice(data: Uint8Array, b: RawBox) {
  // Include the box header so the bytes can be re-emitted verbatim.
  return data.subarray(b.dataStart - 8, b.dataEnd);
}

/** Demux one MP4 file into per-track sample tables. */
export function demuxMp4(data: Uint8Array, source: number): Track[] {
  const moov = requireBox(data, null, "moov");
  const traks = readBoxes(data, moov.dataStart, moov.dataEnd).filter((b) => b.type === "trak");
  if (traks.length === 0) throw new Mp4Error("Malformed MP4: no tracks.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tracks: Track[] = [];

  for (const trak of traks) {
    const mdia = requireBox(data, trak, "mdia");
    const mdhd = requireBox(data, mdia, "mdhd");
    const mdhdVersion = data[mdhd.dataStart]!;
    const timescale =
      mdhdVersion === 1 ? view.getUint32(mdhd.dataStart + 20) : view.getUint32(mdhd.dataStart + 12);

    const hdlr = requireBox(data, mdia, "hdlr");
    const handlerType = String.fromCharCode(
      data[hdlr.dataStart + 8]!,
      data[hdlr.dataStart + 9]!,
      data[hdlr.dataStart + 10]!,
      data[hdlr.dataStart + 11]!,
    );
    if (handlerType !== "vide" && handlerType !== "soun") continue;

    const minf = requireBox(data, mdia, "minf");
    const stbl = requireBox(data, minf, "stbl");
    const stsdBox = requireBox(data, stbl, "stsd");
    const entries = readBoxes(data, stsdBox.dataStart + 8, stsdBox.dataEnd);
    const entry = entries[0];
    if (!entry) throw new Mp4Error("Malformed MP4: empty sample description.");
    const codec = entry.type;
    let width = 0;
    let height = 0;
    if (handlerType === "vide") {
      width = view.getUint16(entry.dataStart + 24);
      height = view.getUint16(entry.dataStart + 26);
    }

    // --- time-to-sample -----------------------------------------------------
    const stts = requireBox(data, stbl, "stts");
    const sttsCount = view.getUint32(stts.dataStart + 4);
    const deltas: number[] = [];
    for (let i = 0; i < sttsCount; i++) {
      const at = stts.dataStart + 8 + i * 8;
      const count = view.getUint32(at);
      const delta = view.getUint32(at + 4);
      for (let k = 0; k < count; k++) deltas.push(delta);
    }

    // --- composition offsets ------------------------------------------------
    const ctts = findBox(data, stbl, "ctts");
    const ctsList: number[] = [];
    if (ctts) {
      const version = data[ctts.dataStart]!;
      const count = view.getUint32(ctts.dataStart + 4);
      for (let i = 0; i < count; i++) {
        const at = ctts.dataStart + 8 + i * 8;
        const n = view.getUint32(at);
        const off = version === 1 ? view.getInt32(at + 4) : view.getUint32(at + 4);
        for (let k = 0; k < n; k++) ctsList.push(off);
      }
    }

    // --- sizes --------------------------------------------------------------
    const stsz = requireBox(data, stbl, "stsz");
    const uniformSize = view.getUint32(stsz.dataStart + 4);
    const sampleCount = view.getUint32(stsz.dataStart + 8);
    const sizes: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      sizes.push(uniformSize !== 0 ? uniformSize : view.getUint32(stsz.dataStart + 12 + i * 4));
    }

    // --- chunk mapping ------------------------------------------------------
    const stsc = requireBox(data, stbl, "stsc");
    const stscCount = view.getUint32(stsc.dataStart + 4);
    const stscEntries: { firstChunk: number; perChunk: number }[] = [];
    for (let i = 0; i < stscCount; i++) {
      const at = stsc.dataStart + 8 + i * 12;
      stscEntries.push({ firstChunk: view.getUint32(at), perChunk: view.getUint32(at + 4) });
    }

    const stco = findBox(data, stbl, "stco");
    const co64 = stco ? null : findBox(data, stbl, "co64");
    if (!stco && !co64) throw new Mp4Error("Malformed MP4: missing chunk offsets.");
    const chunkOffsets: number[] = [];
    if (stco) {
      const n = view.getUint32(stco.dataStart + 4);
      for (let i = 0; i < n; i++) chunkOffsets.push(view.getUint32(stco.dataStart + 8 + i * 4));
    } else if (co64) {
      const n = view.getUint32(co64.dataStart + 4);
      for (let i = 0; i < n; i++) {
        const at = co64.dataStart + 8 + i * 8;
        chunkOffsets.push(view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4));
      }
    }

    // --- sync samples -------------------------------------------------------
    const stss = findBox(data, stbl, "stss");
    const syncSet = new Set<number>();
    if (stss) {
      const n = view.getUint32(stss.dataStart + 4);
      for (let i = 0; i < n; i++) syncSet.add(view.getUint32(stss.dataStart + 8 + i * 4));
    }

    // --- walk chunks into a flat sample list --------------------------------
    const samples: Sample[] = [];
    let sampleIndex = 0;
    for (let chunk = 0; chunk < chunkOffsets.length && sampleIndex < sampleCount; chunk++) {
      let perChunk = stscEntries[0]?.perChunk ?? 1;
      for (const e of stscEntries) if (chunk + 1 >= e.firstChunk) perChunk = e.perChunk;
      let offset = chunkOffsets[chunk]!;
      for (let k = 0; k < perChunk && sampleIndex < sampleCount; k++, sampleIndex++) {
        const size = sizes[sampleIndex]!;
        samples.push({
          source,
          offset,
          size,
          delta: deltas[sampleIndex] ?? deltas[deltas.length - 1] ?? 0,
          cts: ctsList[sampleIndex] ?? 0,
          sync: stss ? syncSet.has(sampleIndex + 1) : true,
        });
        offset += size;
      }
    }

    tracks.push({
      handler: handlerType,
      timescale,
      stsd: slice(data, stsdBox),
      codec,
      width,
      height,
      samples,
    });
  }

  if (!tracks.some((t) => t.handler === "vide")) throw new Mp4Error("MP4 has no video track.");
  return tracks;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const MOVIE_TIMESCALE = 1000;
const MATRIX = concatBytes([
  u32(0x00010000), u32(0), u32(0),
  u32(0), u32(0x00010000), u32(0),
  u32(0), u32(0), u32(0x40000000),
]);

function buildTrak(track: Track, trackId: number, chunkOffsets: number[]): Uint8Array {
  const total = track.samples.reduce((sum, s) => sum + s.delta, 0);
  const movieDuration = Math.round((total / track.timescale) * MOVIE_TIMESCALE);

  const tkhd = box(
    "tkhd",
    u32(0x00000007),
    u32(0),
    u32(0),
    u32(trackId),
    u32(0),
    u32(movieDuration),
    u32(0),
    u32(0),
    u16(0),
    u16(0),
    u16(track.handler === "soun" ? 0x0100 : 0),
    u16(0),
    MATRIX,
    u32(track.width << 16),
    u32(track.height << 16),
  );

  const mdhd = box("mdhd", u32(0), u32(0), u32(0), u32(track.timescale), u32(total), u16(0x55c4), u16(0));
  const hdlr = box(
    "hdlr",
    u32(0),
    u32(0),
    ascii(track.handler),
    u32(0),
    u32(0),
    u32(0),
    ascii(track.handler === "vide" ? "VideoHandler" : "SoundHandler"),
    new Uint8Array([0]),
  );
  const mediaHeader =
    track.handler === "vide"
      ? box("vmhd", u32(0x00000001), u16(0), u16(0), u16(0), u16(0))
      : box("smhd", u32(0), u16(0), u16(0));
  const dinf = box("dinf", box("dref", u32(0), u32(1), box("url ", u32(0x00000001))));

  // stts — run-length encode identical deltas.
  const sttsRuns: [number, number][] = [];
  for (const s of track.samples) {
    const last = sttsRuns[sttsRuns.length - 1];
    if (last && last[1] === s.delta) last[0]++;
    else sttsRuns.push([1, s.delta]);
  }
  const stts = box("stts", u32(0), u32(sttsRuns.length), ...sttsRuns.map(([c, d]) => concatBytes([u32(c), u32(d)])));

  const needsCtts = track.samples.some((s) => s.cts !== 0);
  const cttsRuns: [number, number][] = [];
  if (needsCtts) {
    for (const s of track.samples) {
      const last = cttsRuns[cttsRuns.length - 1];
      if (last && last[1] === s.cts) last[0]++;
      else cttsRuns.push([1, s.cts]);
    }
  }
  const ctts = needsCtts
    ? box("ctts", u32(0), u32(cttsRuns.length), ...cttsRuns.map(([c, o]) => concatBytes([u32(c), u32(o)])))
    : new Uint8Array(0);

  const syncIndexes = track.samples
    .map((s, i) => (s.sync ? i + 1 : 0))
    .filter((n): n is number => n > 0);
  const stss =
    track.handler === "vide" && syncIndexes.length !== track.samples.length
      ? box("stss", u32(0), u32(syncIndexes.length), ...syncIndexes.map(u32))
      : new Uint8Array(0);

  // One sample per chunk keeps the mapping trivial and lossless.
  const stsc = box("stsc", u32(0), u32(1), u32(1), u32(1), u32(1));
  const stsz = box("stsz", u32(0), u32(0), u32(track.samples.length), ...track.samples.map((s) => u32(s.size)));
  const stco = box("stco", u32(0), u32(chunkOffsets.length), ...chunkOffsets.map(u32));

  const stbl = box("stbl", track.stsd, stts, ctts, stss, stsc, stsz, stco);
  const minf = box("minf", mediaHeader, dinf, stbl);
  const mdia = box("mdia", mdhd, hdlr, minf);
  return box("trak", tkhd, mdia);
}

export interface ConcatResult {
  data: Uint8Array;
  probe: Mp4Probe;
}

export interface Mp4Probe {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  sizeBytes: number;
  trackCount: number;
}

/**
 * Concatenate MP4 clips into a single MP4 without re-encoding.
 * All clips must share codec configuration, resolution and track layout.
 */
export function concatMp4(clips: Uint8Array[]): ConcatResult {
  if (clips.length === 0) throw new Mp4Error("Nothing to stitch.");
  const perClip = clips.map((clip, i) => demuxMp4(clip, i));

  const first = perClip[0]!;
  const kinds: ("vide" | "soun")[] = ["vide", "soun"];
  const merged: Track[] = [];

  for (const kind of kinds) {
    const base = first.find((t) => t.handler === kind);
    if (!base) continue;
    const samples: Sample[] = [];
    for (let i = 0; i < perClip.length; i++) {
      const track = perClip[i]!.find((t) => t.handler === kind);
      if (!track) {
        throw new Mp4Error(
          `Scene ${i + 1} has no ${kind === "vide" ? "video" : "audio"} track; clips cannot be stitched losslessly.`,
        );
      }
      if (kind === "vide" && (track.width !== base.width || track.height !== base.height)) {
        throw new Mp4Error(
          `Scene ${i + 1} resolution (${track.width}x${track.height}) does not match scene 1 (${base.width}x${base.height}).`,
        );
      }
      if (!sameBytes(track.stsd, base.stsd)) {
        throw new Mp4Error(
          `Scene ${i + 1} uses a different ${kind === "vide" ? "video" : "audio"} codec configuration than scene 1.`,
        );
      }
      const scale = track.timescale === base.timescale ? 1 : base.timescale / track.timescale;
      for (const s of track.samples) {
        samples.push(
          scale === 1
            ? s
            : { ...s, delta: Math.round(s.delta * scale), cts: Math.round(s.cts * scale) },
        );
      }
    }
    merged.push({ ...base, samples });
  }

  // Sample payload is copied verbatim; only the container tables are rebuilt.
  const mdatBody: Uint8Array[] = [];
  const offsetsPerTrack: number[][] = [];
  let cursor = 0;
  for (const track of merged) {
    const offsets: number[] = [];
    for (const s of track.samples) {
      offsets.push(cursor);
      mdatBody.push(clips[s.source]!.subarray(s.offset, s.offset + s.size));
      cursor += s.size;
    }
    offsetsPerTrack.push(offsets);
  }

  const ftyp = box("ftyp", ascii("isom"), u32(0x200), ascii("isom"), ascii("iso2"), ascii("avc1"), ascii("mp41"));

  const build = (mdatBase: number) => {
    const longest = Math.max(
      ...merged.map((t) => t.samples.reduce((sum, s) => sum + s.delta, 0) / t.timescale),
    );
    const mvhd = box(
      "mvhd",
      u32(0), u32(0), u32(0),
      u32(MOVIE_TIMESCALE),
      u32(Math.round(longest * MOVIE_TIMESCALE)),
      u32(0x00010000),
      u16(0x0100), u16(0),
      u32(0), u32(0),
      MATRIX,
      ...Array.from({ length: 6 }, () => u32(0)),
      u32(merged.length + 1),
    );
    const traks = merged.map((track, i) =>
      buildTrak(track, i + 1, offsetsPerTrack[i]!.map((o) => o + mdatBase)),
    );
    return box("moov", mvhd, ...traks);
  };

  // Two passes: sizes are offset-independent, so the second pass only fixes offsets.
  const provisional = build(0);
  const mdatBase = ftyp.length + provisional.length + 8;
  const moov = build(mdatBase);
  const mdat = concatBytes([u32(cursor + 8), ascii("mdat"), ...mdatBody]);
  const data = concatBytes([ftyp, moov, mdat]);

  return { data, probe: probeMp4(data) };
}

/** Read real duration / resolution / frame rate / codec back out of MP4 bytes. */
export function probeMp4(data: Uint8Array): Mp4Probe {
  const tracks = demuxMp4(data, 0);
  const video = tracks.find((t) => t.handler === "vide")!;
  const audio = tracks.find((t) => t.handler === "soun") ?? null;
  const durationSeconds =
    video.samples.reduce((sum, s) => sum + s.delta, 0) / video.timescale;
  const fps = durationSeconds > 0 ? video.samples.length / durationSeconds : 0;
  return {
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    width: video.width,
    height: video.height,
    fps: Math.round(fps * 100) / 100,
    videoCodec: video.codec,
    audioCodec: audio?.codec ?? null,
    sizeBytes: data.length,
    trackCount: tracks.length,
  };
}
