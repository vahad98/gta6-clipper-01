# CUT SPEC — gta6-clipper-01 (clip-final-v2.mp4)

Cut list for the clip. The repo builder (`main.ts`) reads this file to
reproduce the clip and to answer `--check`.
Upload channel: **Arox_ — @Arox.98 — https://www.youtube.com/@Arox.98**
(Channel ID: `UCLhCZP6EvjLQ5et79Mbvt3g`. Created 20 Nov 2026 ~06:56 WIB from
aimuse207@gmail.com. This clip has NOT been uploaded yet; upload only after
the coordinator confirms.)

## Source footage
- **Main source:** GTA VI Trailer 2 — Rockstar Games (official YouTube)
  - URL: https://www.youtube.com/watch?v=VQRLujxTm3c
  - Title confirmed with yt-dlp: "Grand Theft Auto VI Trailer 2"
  - Downloaded: 2026-11-20 ~07:04 WIB (file `gta6-trailer2.mp4`, 8,9 MB)
  - Length 166,74 s (2:47), 640x360 H.264 30fps, AAC 128k stereo 44,1 kHz
  - Quality note: from this VM YouTube only serves format 18 (360p) —
    the web and iOS clients hit a SABR-only experiment (storyboard only),
    and `android` is the one client that still returns video. Tried: web,
    ios, tv, mweb. Rockstar's own CDN (rockstargames.com/VI) only hosts
    short 1920px loops with no audio, not the full trailer — not used.
- **Spare:** GTA VI Trailer 1 — https://www.youtube.com/watch?v=QdBZY2fkU-0
  - Downloaded: 2026-11-20 ~07:06 WIB (file `gta6-trailer1.mp4`, 7,4 MB)
  - Length 90,09 s (1:30), 640x360, also format 18. NOT used in the final clip.

## The cut (clip timeline)
Whole clip: **32,69 s**, vertical 1080x1920, 30fps, H.264 + AAC.
One jump-cut in the middle (Shorts montage style — normal and deliberate).

| Segmen | Sumber in → out | Durasi | Isi |
|---|---|---|---|
| A | Trailer 2 `111.3` → `129.37` | 18,07 dtk | Lucia in a convertible at sunset (HOOK) → club → street fight → Lucia running → house → car explosion → night truck → Lucia/Jason kiss → Ocean Drive neon club |
| B | Trailer 2 `134.4` → `149.0` | 14,60 dtk | Jason/Lucia's house → swamp helicopter → jetski → bike + stunt plane → night truck → speedboat chase → bike wheelie (OUTRO) |

Deliberately left out: the TV/planning scene 129.37–134.4 (static ~5 s,
boring for a Short) and the end-card logo 150–166,7 (dead air).
Cut points come from ffmpeg scene detection (`select='gt(scene,0.4)'`):
nearest cuts 111.3 / 129.37 / 134.4.

## Going vertical (no cropping of the subject)
- Backdrop: the source scaled to 1080x1920 (crop fill), `gblur=sigma=40`,
  `eq=brightness=-0.18` (darkened so the text stays readable).
- Foreground: the whole source scaled to 1080x608, overlaid dead centre (y=656).
  Why: a full 9:16 crop would cut off Lucia (right of frame) and action at the edges.
- Encode: libx264 CRF 20, preset veryfast, yuv420p, 30fps; AAC 128k audio
  (the trailer's own audio is kept — music + SFX, mean -12,0 dB / max 0,0 dB).
- Reproducible build script: `build-clip.sh` in this folder.

## Text overlays (font: DejaVu Sans Bold, `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`)
Every line sits on a semi-transparent black box (`boxcolor=black@0.65`) so it
reads on any frame. Times are seconds on the clip timeline.

| Waktu klip | Teks (persis) | Gaya |
|---|---|---|
| 0,3–4,0 | `GTA 6 LOOKS INSANE!` | 62px, kuning #FFD60A, y=130, box=black@0.65, borderw=18 |
| 0,3–4,0 | `VICE CITY IS BACK` | 56px, putih, y=260, box=black@0.65, borderw=16 |
| 0–32,69 (sepanjang klip) | `make.fun - earn money making clips with AI` | 32px, putih, watermark bawah y=1810, box=black@0.55, borderw=12 |
| 24,7–32,69 (8 dtk terakhir) | `EARN MONEY` | 96px, kuning #FFD60A, y=700, box=black@0.65, borderw=18 |
| 24,7–32,69 | `MAKING CLIPS WITH AI` | 72px, putih, y=830, box=black@0.65, borderw=16 |
| 24,7–32,69 | `make.fun/bounty/gta6-clipper-01` | 44px, putih, y=950, box=black@0.65, borderw=14 |

## Voiceover
NONE. This VM has no decent TTS (espeak/espeak-ng/flite are not installed;
gTTS needs the Google API and sounds robotic). Text overlays alone already
satisfy the bounty ("on screen, spoken, or both"). Clip audio = the
trailer's own music/SFX.

## Video description (for the upload — NOT burned into the video file)
Required line (from the coordinator's brief):
`Made by my AI agent for a $500 bounty on make.fun, where you can earn money making clips with AI: https://make.fun/bounty/gta6-clipper-01`
Play code: `yfvbzm4w`

## REVISI v2 (20 Nov ~07:33 WIB — fixing Bahlil's "resolusinya kurang jernih")
- No sharper source exists: yt-dlp Trailer 2 on the android client only
  gives format 18 (640x360); web/iOS give nothing; rockstargames.com/VI
  has no direct video file. 360p is the ceiling from this VM.
- `clip-final-v2.mp4` — same cuts + same text as v1, sharper encode:
  lanczos upscale + unsharp=5:5:0.8 on the foreground, CRF 17 (v1: CRF 20),
  preset medium (v1: veryfast), audio AAC 192k. Result: 1080x1920, 32,69 s,
  22,0 MB, video bitrate 5,18 Mbps (v1: ~3,35 Mbps). Frame t=2 (hook) and
  t=28 (outro) were eyeballed by the coordinator: sharp text, no artefacts.
- Build script: `build-clip-v2.sh`. Upload file = clip-final-v2.mp4 (v1 kept as backup).
