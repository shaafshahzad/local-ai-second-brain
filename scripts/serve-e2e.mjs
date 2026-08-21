import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

for (const [command, args] of [
  ["bun", ["run", "test:e2e:prepare"]],
  ["bun", ["run", "build"]],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const standaloneRoot = path.join(root, ".next", "standalone");
const standaloneStatic = path.join(standaloneRoot, ".next", "static");
const standalonePublic = path.join(standaloneRoot, "public");

fs.rmSync(standaloneStatic, { recursive: true, force: true });
fs.rmSync(standalonePublic, { recursive: true, force: true });
fs.cpSync(path.join(root, ".next", "static"), standaloneStatic, { recursive: true });
fs.cpSync(path.join(root, "public"), standalonePublic, { recursive: true });

const server = spawn(process.execPath, [path.join(standaloneRoot, "server.js")], {
  cwd: standaloneRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: "3100",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
