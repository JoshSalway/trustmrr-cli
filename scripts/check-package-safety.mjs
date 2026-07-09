import { readFileSync } from "node:fs";

const publishablePackages = ["packages/mcp/package.json", "packages/cli/package.json"];
const forbiddenLifecycleScripts = new Set(["preinstall", "install", "postinstall", "prepare"]);
const requiredFiles = ["dist", "src", "README.md"];

let failed = false;

for (const packagePath of publishablePackages) {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const label = `${pkg.name} (${packagePath})`;

  for (const scriptName of Object.keys(pkg.scripts ?? {})) {
    if (forbiddenLifecycleScripts.has(scriptName)) {
      console.error(`${label}: forbidden npm lifecycle script "${scriptName}" is present.`);
      failed = true;
    }
  }

  if (!pkg.name?.startsWith("@joshsalway/")) {
    console.error(`${label}: publishable package must use the @joshsalway scope.`);
    failed = true;
  }

  for (const file of requiredFiles) {
    if (!pkg.files?.includes(file)) {
      console.error(`${label}: package files must include "${file}" for auditability.`);
      failed = true;
    }
  }

  if (pkg.publishConfig?.access !== "public") {
    console.error(`${label}: publishConfig.access must be "public".`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `Checked ${publishablePackages.length} package manifests: no install-time lifecycle scripts; source and README files are included.`,
);
