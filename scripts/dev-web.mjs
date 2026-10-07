// `pnpm dev:web`: yerel sunucu (yalnızca /api) + Vite (HMR'li arayüz) birlikte (ADR 0009).
import { spawn } from "node:child_process";
import process from "node:process";

const apiPort = process.env.LBF_DEV_API_PORT ?? "8787";
const children = [
  spawn("pnpm", ["--filter", "@lbf/local-server", "start"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, LBF_PORT: apiPort, LBF_NO_UI: "1" },
  }),
  spawn("pnpm", ["--filter", "@lbf/desktop", "run", "dev"], { stdio: "inherit", shell: true, env: process.env }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(code);
}

for (const child of children) child.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
