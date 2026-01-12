import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

function getPackageVersion(): string {
  try {
    const pkgPath = resolve(__dirname, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getGitSha(): string {
  try {
    const output = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] });
    return String(output).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(getPackageVersion()),
    "import.meta.env.VITE_GIT_SHA": JSON.stringify(getGitSha())
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001"
    }
  }
});
