import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const forge = process.env.FORGE_BIN ?? join(homedir(), ".foundry", "bin", "forge.exe");

execFileSync(forge, ["build"], { stdio: "inherit" });
