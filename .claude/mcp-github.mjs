import { spawn } from "node:child_process";

if (process.env.GITHUB_TOKEN && !process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_TOKEN;
}

const child = spawn("npx", ["-y", "@modelcontextprotocol/server-github"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
