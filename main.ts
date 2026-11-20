#!/usr/bin/env node
/**
 * gta6-clipper-01 — make.fun entry point.
 *
 * One file, Node 22, standard library only, no network access at run time.
 *
 * Three ways to run it:
 *   - no arguments: grader mode. Hand the house the video address by
 *     copying VIDEO.json byte-for-byte into the output directory.
 *   - --check: sanity-check VIDEO.json and the cut list in CUT-SPEC.md.
 *   - --render: rebuild the vertical clip from the source footage and
 *     CUT-SPEC.md with ffmpeg, segment by segment, then concatenate.
 *
 * The clip itself is a vertical cut of Rockstar's GTA VI Trailer 2 with
 * burned-in text overlays, built for the "Clip GTA 6 for the most YouTube
 * views" bounty. Everything about the cut (which seconds, which words,
 * which sizes and colours) lives in CUT-SPEC.md, not in this file.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A YouTube address is one of: youtube.com/shorts/<id>,
// youtube.com/watch?v=<id>, or youtu.be/<id>. Anything else is treated
// as a placeholder: worth a warning, never worth failing the run.
const YOUTUBE_URL =
  /^https:\/\/(?:www\.youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)[A-Za-z0-9_-]+$/;

// Output frame geometry for the vertical clip.
const FRAME_W = 1080;
const FRAME_H = 1920;
// Height of the un-cropped source strip shown in the middle.
const STRIP_H = 608;
const FPS = 30;

// Background treatment: heavy blur plus a darkening pass so text stays readable.
const BLUR_SIGMA = 40;
const DARKEN = -0.18;

// Font used by every drawtext overlay unless the spec names another one.
const FALLBACK_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

// Encode used when the spec carries no revision override (the v1 settings).
const BASE_ENCODE = {
  crf: 20,
  preset: "veryfast",
  audioKbps: 128,
  file: "clip-final.mp4",
  sharpen: false,
} as const;

type Segment = {
  label: string;
  start: number;
  end: number;
  length: number;
};

type Overlay = {
  start: number;
  end: number;
  text: string;
  size: number;
  color: string;
  y: number;
  box: string;
  border: number;
};

type Encode = {
  crf: number;
  preset: string;
  audioKbps: number;
  file: string;
  sharpen: boolean;
};

type CutSpec = {
  footage: string;
  font: string;
  segments: Segment[];
  overlays: Overlay[];
  encode: Encode;
  total: number;
};

/** Parse a decimal that may use a comma, e.g. "18,07" -> 18.07. */
function commaNum(raw: string): number {
  return Number(raw.replace(",", "."));
}

/** Round to two decimals so float noise never leaks into times or prints. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Short, stable number formatting for ffmpeg arguments (6.63, not 6.6300000001). */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Escape text for a drawtext `text=` value: backslash, colon, comma,
 * quote and percent are all meaningful to the filter parser.
 */
function escapeText(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

/** Directory this bot lives in: env override, else the directory of this file. */
function botDir(): string {
  return process.env.MAKEFUN_BOT_DIR ?? dirname(fileURLToPath(import.meta.url));
}

/** Where grader output goes: env override, else <bot>/output. */
function outputDir(bot: string): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? join(bot, "output");
}

/**
 * Read VIDEO.json from the bot directory and pull out its url.
 * Throws when the file is missing, is not JSON, is not an object,
 * or has no string url.
 */
function readVideoJson(bot: string): { path: string; url: string } {
  const path = join(bot, "VIDEO.json");
  if (!existsSync(path)) {
    throw new Error(`VIDEO.json not found in ${bot}`);
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("VIDEO.json must be a JSON object");
  }
  const url = (parsed as Record<string, unknown>).url;
  if (typeof url !== "string") {
    throw new Error('VIDEO.json must have a string "url" field');
  }
  return { path, url };
}

/**
 * Read the encode override out of the spec's "## REVISI v2" section, if the
 * spec has one. Without that section the base (v1) settings apply.
 */
function parseEncode(markdown: string): Encode {
  const at = markdown.indexOf("## REVISI v2");
  if (at < 0) {
    return { ...BASE_ENCODE };
  }
  const section = markdown.slice(at);
  const crf = section.match(/CRF\s+(\d+)/);
  const preset = section.match(/preset\s+([A-Za-z]+)/);
  const audio = section.match(/AAC\s+(\d+)\s*k/);
  const file = section.match(/(clip-final-v2\.mp4)/);
  const unsharp = section.match(/unsharp\s*=\s*([\d:.]+)/);
  return {
    crf: crf ? Number(crf[1]) : BASE_ENCODE.crf,
    preset: preset ? preset[1] : BASE_ENCODE.preset,
    audioKbps: audio ? Number(audio[1]) : BASE_ENCODE.audioKbps,
    file: file ? file[1] : BASE_ENCODE.file,
    sharpen: /lanczos/i.test(section) && unsharp !== null,
  };
}

/**
 * Parse a CUT-SPEC.md document into the cut it describes:
 *   - footage: first `(file `*.mp4`)` mention (the main source).
 *   - font: first backticked `.ttf` path, else the DejaVu fallback.
 *   - segments: table rows whose source cell reads
 *     `Trailer N `start` → `end``.
 *   - overlays: table rows whose first cell is a clip-time range
 *     like `0,3–4,0`, with the text in backticks and the style
 *     (`62px, #FFD60A, y=130, box=..., borderw=...`) in the next cell.
 *   - encode: the REVISI v2 override, or the base settings.
 */
function parseCutSpec(markdown: string): CutSpec {
  let footage = "";
  let font: string | null = null;
  const segments: Segment[] = [];
  const overlays: Overlay[] = [];

  for (const line of markdown.split("\n")) {
    if (!footage) {
      const found = line.match(/file\s+`([^`]*\.mp4)`/);
      if (found) footage = found[1];
    }
    if (font === null) {
      const found = line.match(/`([^`]*\.ttf)`/);
      if (found) font = found[1];
    }
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 4) continue;

    const seg = cells[2].match(
      /Trailer\s+\d+\s+`([\d,.]+)`\s*(?:→|->)\s*`([\d,.]+)`/,
    );
    if (seg) {
      const start = commaNum(seg[1]);
      const end = commaNum(seg[2]);
      segments.push({ label: cells[1], start, end, length: round2(end - start) });
      continue;
    }

    const span = cells[1].match(/^([\d,.]+)\s*[–—-]\s*([\d,.]+)/);
    const text = cells[2].match(/^`([^`]*)`$/);
    if (span && text) {
      const style = cells[3];
      const size = style.match(/(\d+)\s*px/);
      const hex = style.match(/#([0-9A-Fa-f]{6})/);
      const y = style.match(/y\s*=\s*(\d+)/);
      const box = style.match(/box\s*=\s*([^,]+)/);
      const border = style.match(/borderw\s*=\s*(\d+)/);
      overlays.push({
        start: commaNum(span[1]),
        end: commaNum(span[2]),
        text: text[1],
        size: size ? Number(size[1]) : 32,
        color: hex ? `#${hex[1]}` : "#FFFFFF",
        y: y ? Number(y[1]) : 100,
        box: box ? box[1].trim() : "black@0.65",
        border: border ? Number(border[1]) : 12,
      });
    }
  }

  const total = round2(segments.reduce((sum, seg) => sum + seg.length, 0));
  return {
    footage,
    font: font ?? FALLBACK_FONT,
    segments,
    overlays,
    encode: parseEncode(markdown),
    total,
  };
}

/**
 * Grader mode (default, no arguments): copy VIDEO.json byte-for-byte
 * into the output directory and exit 0. A non-YouTube url only earns a
 * stderr warning; the copy still happens and the run still succeeds.
 */
function runGrader(): number {
  const bot = botDir();
  const { path, url } = readVideoJson(bot);
  if (!YOUTUBE_URL.test(url)) {
    console.error(`warning: VIDEO.json url is not a YouTube address: ${url}`);
  }
  const out = outputDir(bot);
  mkdirSync(out, { recursive: true });
  copyFileSync(path, join(out, "VIDEO.json"));
  return 0;
}

/**
 * --check: validate VIDEO.json (must exist, parse, carry a string url)
 * and, when CUT-SPEC.md is present, report what it describes.
 * Exit 0 when everything is fine, 1 when something is invalid.
 */
function runCheck(): number {
  const bot = botDir();
  let url: string;
  try {
    url = readVideoJson(bot).url;
  } catch (err) {
    console.error(
      `VIDEO.json: INVALID — ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
  console.log(`VIDEO.json: ${url}`);
  console.log(`YouTube URL: ${YOUTUBE_URL.test(url) ? "OK" : "placeholder"}`);

  const specPath = join(bot, "CUT-SPEC.md");
  if (!existsSync(specPath)) {
    console.log("CUT-SPEC.md: not present");
    console.log("check: OK");
    return 0;
  }
  try {
    const spec = parseCutSpec(readFileSync(specPath, "utf8"));
    console.log(
      `CUT-SPEC.md: ${spec.segments.length} segments, ${spec.overlays.length} overlays, total ${spec.total.toFixed(2)}s`,
    );
    if (spec.segments.length === 0 || !spec.footage) {
      console.error("CUT-SPEC.md: INVALID — no segments or no footage file");
      return 1;
    }
  } catch (err) {
    console.error(
      `CUT-SPEC.md: INVALID — ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
  console.log("check: OK");
  return 0;
}

function printUsage(): void {
  console.log(`Usage:
  node main.ts                                   grader mode: copy VIDEO.json to the output dir
  node main.ts --check                           validate VIDEO.json and CUT-SPEC.md
  node main.ts --render [--spec FILE] [--footage-dir DIR] [--out FILE]
                                                 rebuild the clip from footage + CUT-SPEC.md
  node main.ts --help                            show this help`);
}

type RenderOptions = {
  specFile: string;
  footageDir: string;
  outFile: string | null;
};

/** Read --render flags: --spec, --footage-dir, --out (all optional). */
function parseRenderArgs(args: string[]): RenderOptions {
  const bot = botDir();
  const opts: RenderOptions = {
    specFile: join(bot, "CUT-SPEC.md"),
    footageDir: bot,
    outFile: null,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const take = (): string => {
      const value = args[++i];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === "--spec") opts.specFile = take();
    else if (arg === "--footage-dir") opts.footageDir = take();
    else if (arg === "--out") opts.outFile = take();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** Run one ffmpeg command, streaming its output, and fail loudly on error. */
function runFfmpeg(args: string[]): void {
  const res = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`ffmpeg exited with code ${res.status}`);
  }
}

/**
 * Build the filter graph for one segment.
 *
 * The picture is two layers: the source scaled up to fill the 1080x1920
 * frame, cropped, heavily blurred and darkened as a backdrop; and the
 * source shown whole as a 1080x608 strip centred on top of it. Text
 * overlays are burned in with drawtext afterwards. Each overlay's
 * clip-time window is translated into this segment's local clock: an
 * overlay covering the whole segment gets no enable window, any other
 * gets a between(t, …) window clamped to the segment.
 */
function segmentFilter(spec: CutSpec, seg: Segment, clipStart: number): string {
  const backdrop =
    `[0:v]scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase,` +
    `crop=${FRAME_W}:${FRAME_H},gblur=sigma=${BLUR_SIGMA},` +
    `eq=brightness=${DARKEN}[bg]`;
  const stripScale = spec.encode.sharpen
    ? `scale=${FRAME_W}:${STRIP_H}:flags=lanczos,unsharp=5:5:0.8`
    : `scale=${FRAME_W}:${STRIP_H}`;
  const strip = `[0:v]${stripScale}[fg]`;
  const stack = `[bg][fg]overlay=(W-w)/2:(H-h)/2[stacked]`;

  const draws: string[] = [];
  for (const ov of spec.overlays) {
    const localStart = ov.start - clipStart;
    const localEnd = ov.end - clipStart;
    if (localEnd <= 0 || localStart >= seg.length) continue;
    let draw =
      `drawtext=fontfile=${spec.font}:fontsize=${ov.size}:fontcolor=${ov.color}` +
      `:box=1:boxcolor=${ov.box}:boxborderw=${ov.border}` +
      `:x=(w-text_w)/2:y=${ov.y}:text='${escapeText(ov.text)}'`;
    if (!(localStart <= 0 && localEnd >= seg.length)) {
      draw += `:enable='between(t,${fmt(Math.max(0, localStart))},${fmt(Math.min(seg.length, localEnd))})'`;
    }
    draws.push(draw);
  }
  const tail = draws.length > 0 ? `${draws.join(",")},` : "";
  return `${backdrop};${strip};${stack};[stacked]${tail}format=yuv420p,fps=${FPS}[v]`;
}

/** Render one segment of the clip to its own mp4 file. */
function renderSegment(
  spec: CutSpec,
  seg: Segment,
  clipStart: number,
  footage: string,
  segFile: string,
): void {
  runFfmpeg([
    "-y",
    "-ss",
    fmt(seg.start),
    "-i",
    footage,
    "-t",
    fmt(seg.length),
    "-filter_complex",
    segmentFilter(spec, seg, clipStart),
    "-map",
    "[v]",
    "-map",
    "0:a",
    "-c:v",
    "libx264",
    "-crf",
    String(spec.encode.crf),
    "-preset",
    spec.encode.preset,
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-c:a",
    "aac",
    "-b:a",
    `${spec.encode.audioKbps}k`,
    segFile,
  ]);
}

/**
 * --render: rebuild the clip from the footage file and CUT-SPEC.md.
 * Each segment is rendered on its own, then the parts are joined with
 * a stream-copy concat so the encode is done exactly once.
 */
function runRender(opts: RenderOptions): number {
  const spec = parseCutSpec(readFileSync(opts.specFile, "utf8"));
  if (spec.segments.length === 0) {
    throw new Error(`no segments found in ${opts.specFile}`);
  }
  if (!spec.footage) {
    throw new Error(`no footage file named in ${opts.specFile}`);
  }
  const footage = join(opts.footageDir, spec.footage);
  if (!existsSync(footage)) {
    throw new Error(`footage not found: ${footage}`);
  }
  const outFile = opts.outFile ?? join(botDir(), spec.encode.file);
  const work = mkdtempSync(join(tmpdir(), "clipper-"));
  try {
    const parts: string[] = [];
    let clipStart = 0;
    spec.segments.forEach((seg, i) => {
      const segFile = join(work, `seg${i}.mp4`);
      console.log(
        `segment ${seg.label}: ${fmt(seg.start)} -> ${fmt(seg.end)} (${fmt(seg.length)}s)`,
      );
      renderSegment(spec, seg, clipStart, footage, segFile);
      parts.push(segFile);
      clipStart = round2(clipStart + seg.length);
    });
    const listFile = join(work, "concat.txt");
    writeFileSync(
      listFile,
      parts.map((part) => `file '${part}'`).join("\n") + "\n",
    );
    runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      outFile,
    ]);
    console.log(`wrote ${outFile}`);
    return 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main(argv: string[]): number {
  const [first, ...rest] = argv;
  if (first === undefined) return runGrader();
  if (first === "--help" || first === "-h") {
    printUsage();
    return 0;
  }
  if (first === "--check") return runCheck();
  if (first === "--render") return runRender(parseRenderArgs(rest));
  console.error(`unknown argument: ${first}`);
  printUsage();
  return 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
