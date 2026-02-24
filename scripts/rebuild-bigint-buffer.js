const { existsSync } = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const bindingPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "bigint-buffer",
  "build",
  "Release",
  "bigint_buffer.node",
);

if (existsSync(bindingPath)) {
  process.exit(0);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCmd,
  ["rebuild", "bigint-buffer", "--build-from-source"],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  console.log(
    "bigint-buffer rebuild failed; continuing with JS fallback.",
  );
}
