import assert from "node:assert/strict";
import { describe, test } from "node:test";
import path from "node:path";
import { localDemoCommand } from "../scripts/local-demo.mjs";

describe("local demo platform launcher", () => {
  const scriptDir = path.join("C:", "magic-crm", "scripts");

  test("uses PowerShell on Windows and preserves arguments", () => {
    const target = localDemoCommand("win32", ["--setup-only", "--open-feishu"], scriptDir);
    assert.equal(target.command, "powershell.exe");
    assert.deepEqual(target.args.slice(0, 5), ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]);
    assert.equal(target.args[5], path.join(scriptDir, "local-demo.ps1"));
    assert.deepEqual(target.args.slice(6), ["--setup-only", "--open-feishu"]);
  });

  test("uses Bash on macOS and Linux", () => {
    for (const platform of ["darwin", "linux"]) {
      const target = localDemoCommand(platform, ["--check"], "/project/scripts");
      assert.equal(target.command, "bash");
      assert.deepEqual(target.args, [path.join("/project/scripts", "local-demo.sh"), "--check"]);
    }
  });
});
