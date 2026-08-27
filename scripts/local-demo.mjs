import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function localDemoCommand(platform, args = [], scriptDir = SCRIPT_DIR) {
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptDir, "local-demo.ps1"), ...args],
    };
  }
  return {
    command: "bash",
    args: [path.join(scriptDir, "local-demo.sh"), ...args],
  };
}

export function runLocalDemo(platform = process.platform, args = process.argv.slice(2)) {
  const target = localDemoCommand(platform, args);
  const result = spawnSync(target.command, target.args, { cwd: path.resolve(SCRIPT_DIR, ".."), stdio: "inherit" });
  if (result.error) {
    console.error(`Unable to start the local setup: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  process.exitCode = runLocalDemo();
}
