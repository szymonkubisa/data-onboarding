/**
 * Turns the promo recording into files for the README and for posting.
 *
 *   pnpm promo && pnpm promo:encode
 *
 * Needs ffmpeg on PATH. Reads what e2e/promo.spec.ts recorded and writes:
 *   docs/promo/demo.mp4  full walkthrough, H.264, plays everywhere (LinkedIn, X, Slack)
 *   docs/promo/demo.gif  smaller and a little faster, plays inline in the README
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const SOURCE = "test-results/promo-video/demo.webm";
const META = "test-results/promo-video/meta.json";
const OUT = "docs/promo";

// The recording starts on a blank page while the app loads; the spec notes when the intro begins.
const { trimStart = 0 } = JSON.parse(readFileSync(META, "utf8"));

function ffmpeg(output, args) {
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-y", "-ss", trimStart.toFixed(2), "-i", SOURCE, ...args, output],
    { stdio: "inherit" },
  );
  const mb = (statSync(output).size / 1024 / 1024).toFixed(1);
  console.log(`${output}  ${mb} MB`);
}

ffmpeg(`${OUT}/demo.mp4`, [
  ...["-c:v", "libx264", "-preset", "slow", "-crf", "23", "-tune", "animation"],
  ...["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"],
]);

ffmpeg(`${OUT}/demo.gif`, [
  "-vf",
  [
    "setpts=PTS/1.25",
    "fps=10",
    "scale=960:-1:flags=lanczos",
    "split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
  ].join(","),
  ...["-loop", "0"],
]);
