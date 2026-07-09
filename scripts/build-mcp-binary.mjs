import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDir = join(root, "packages", "mcp");
const seaDir = join(packageDir, "dist-sea");
const binDir = join(packageDir, "dist-bin");
const platform = process.platform;
const arch = process.arch;
const exeSuffix = platform === "win32" ? ".exe" : "";
const binaryName = `trustmrr-mcp-${platform}-${arch}${exeSuffix}`;
const binaryPath = join(binDir, binaryName);

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: "inherit",
    env: process.env,
  });
}

function maybeRun(command, args, options = {}) {
  try {
    run(command, args, options);
  } catch {
    // Codesign is best-effort for local binary builds.
  }
}

rmSync(seaDir, { recursive: true, force: true });
rmSync(binDir, { recursive: true, force: true });
mkdirSync(seaDir, { recursive: true });
mkdirSync(binDir, { recursive: true });

run(
  "esbuild",
  [
    "src/index.ts",
    "--bundle",
    "--platform=node",
    "--target=node20",
    "--format=cjs",
    "--outfile=dist-sea/index.cjs",
  ],
  { cwd: packageDir },
);

writeFileSync(
  join(seaDir, "sea-config.json"),
  `${JSON.stringify(
    {
      main: "dist-sea/index.cjs",
      output: "dist-sea/sea-prep.blob",
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  )}\n`,
);

run(process.execPath, ["--experimental-sea-config", "dist-sea/sea-config.json"], {
  cwd: packageDir,
});

copyFileSync(process.execPath, binaryPath);
chmodSync(binaryPath, 0o755);

if (platform === "darwin") {
  maybeRun("codesign", ["--remove-signature", binaryPath]);
}

const postjectArgs = [
  binaryPath,
  "NODE_SEA_BLOB",
  join(seaDir, "sea-prep.blob"),
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
];

if (platform === "darwin") {
  postjectArgs.push("--macho-segment-name", "NODE_SEA");
}

run(platform === "win32" ? "postject.cmd" : "postject", postjectArgs);

if (platform === "darwin") {
  maybeRun("codesign", ["--sign", "-", binaryPath]);
}

console.log(`Built ${binaryPath}`);
