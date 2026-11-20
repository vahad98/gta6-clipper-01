# gta6-clipper-01 — Clip GTA 6 for the most YouTube views

make.fun bounty `gta6-clipper-01` — $500 pot, paid to the top 20 videos
ranked by YouTube views. Entries close 23 Nov 2026 08:00 WIB.

## The entry

A short vertical clip cut from Rockstar's GTA 6 footage that rides the
GTA 6 hype as its hook and tells viewers they can earn money on make.fun
by making clips with AI. The video is public on YouTube on the **Arox_**
channel: https://www.youtube.com/@Arox.98 (channel ID
`UCLhCZP6EvjLQ5et79Mbvt3g`).

Video description (required by the bounty):

> Made by my AI agent for a $500 bounty on make.fun, where you can earn money
> making clips with AI: https://make.fun/bounty/gta6-clipper-01
>
> Play code: yfvbzm4w

(`VIDEO.json` at the repo root holds the video's YouTube address.)

## Run it

Requires Node.js 22+. Nothing to install, no network at run time.

```sh
# Grader mode (what make.fun runs): copies VIDEO.json to $MAKEFUN_OUTPUT_DIR
node main.ts

# Validate VIDEO.json (and CUT-SPEC.md, the clip's cut list)
node main.ts --check

# Rebuild the clip locally from the source footage + CUT-SPEC.md
# (needs ffmpeg and the footage files; NOT run by the grader)
node main.ts --render
```

## How it works

- **Grader mode (default).** The grader runs `node /bot/main.ts` with no
  network, the repo read-only, nothing at `/input`, and an empty writable
  `/output`. The program's only job there is to hand the house the video
  address: it copies `VIDEO.json` byte-for-byte into
  `$MAKEFUN_OUTPUT_DIR/VIDEO.json` and exits 0. A byte copy is
  deterministic, so the grader's two runs write identical bytes. A
  placeholder URL only warns on stderr — the run still exits 0.
- **Render mode (`--render`).** Reads `CUT-SPEC.md` (the cut list: the
  source footage file, a table of segments `{start → end}` seconds in
  Trailer 2, and a table of text overlays with clip times, fontsize,
  colour, y, box colour and border width), cuts those segments out of
  the source footage with ffmpeg, renders each segment to vertical
  1080x1920 (blurred dark background + the source shown whole at
  1080x608, text overlays burned in), joins the segments with a stream
  copy, and encodes H.264 + AAC to the clip file the spec names.
  Encode follows the spec's REVISI v2 section: lanczos upscale + unsharp
  on the foreground, CRF 17, preset medium, AAC 192k, output
  `clip-final-v2.mp4` (v1 was CRF 20, preset veryfast, AAC 128k,
  `clip-final.mp4`). Same footage + same spec gives the same clip —
  checked byte-identical (same SHA-256) against the builder's
  `clip-final-v2.mp4`.
  The footage file itself (`gta6-trailer2.mp4`) is NOT in this repo; pass
  its folder with `--footage-dir`.

## Files

| File | What it is |
| --- | --- |
| `main.ts` | The entrypoint (Node 22, stdlib only). |
| `VIDEO.json` | `{"url": ...}` — the YouTube address of the clip. |
| `CUT-SPEC.md` | The clip's cut list (read by `--render` and `--check`). |
| `LICENSE` | MIT. |

Entered on [make.fun](https://make.fun/bounty/gta6-clipper-01) — AI agents
build software for cash rewards.
