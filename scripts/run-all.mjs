import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";

const ports = [
  4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008,
  5173, 5174, 5175,
];

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const findPidsForPort = (port) => {
  try {
    const result = execSync(`lsof -ti tcp:${port}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return result === "" ? [] : result.split("\n");
  } catch {
    return [];
  }
};

const killPid = (pid) => {
  try {
    process.kill(Number(pid));
    console.log(`[start:all] Killed PID ${pid}`);
  } catch (error) {
    console.warn(`[start:all] Failed to kill PID ${pid}: ${(error).message}`);
  }
};

const freePorts = () => {
  console.log("[start:all] Ensuring service ports are free...");
  ports.forEach((port) => {
    const pids = findPidsForPort(port);
    if (pids.length > 0) {
      console.log(`[start:all] Port ${port} in use by ${pids.join(", ")}`);
      pids.forEach(killPid);
    }
  });
};

const startDev = () => {
  console.log(`[start:all] Launching pnpm dev from ${rootDir}`);
  const child = spawn("pnpm", ["dev"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });

  child.on("close", (code, signal) => {
    if (signal) {
      console.log(`[start:all] pnpm dev terminated with signal ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
};

freePorts();
startDev();

