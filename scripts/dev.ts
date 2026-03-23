import { spawn } from "bun";

const server = spawn(["bun", "--hot", "server/src/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env },
});

const builder = spawn(
  ["bun", "build", "--watch", "client/src/main.tsx", "--outdir", "client/dist", "--sourcemap=inline"],
  { stdout: "inherit", stderr: "inherit" }
);

const css = spawn(
  ["bunx", "tailwindcss", "--watch", "-i", "client/src/index.css", "-o", "client/dist/index.css"],
  { cwd: "client", stdout: "inherit", stderr: "inherit" }
);

process.on("SIGINT", () => {
  server.kill();
  builder.kill();
  css.kill();
  process.exit(0);
});

await Promise.all([server.exited, builder.exited, css.exited]);
