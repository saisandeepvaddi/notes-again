import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PYTHON_VERSION = "3.14";
const WITHOUT = ["firebase-admin", "fastapi-cli"];

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(desktop, "..");
const backend = join(root, "backend");
const frontendDist = join(root, "frontend", "dist", "client");
const out = join(desktop, "build");
const windows = process.platform === "win32";

const run = (command, args, options = {}) =>
  (
    execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      ...options,
    }) ?? ""
  ).trim();

if (!existsSync(join(frontendDist, "index.html"))) {
  throw new Error("Build the frontend first: pnpm --dir ../frontend build");
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const findPython = () => {
  try {
    return run("uv", [
      "python",
      "find",
      "--managed-python",
      "--system",
      "--no-project",
      PYTHON_VERSION,
    ]);
  } catch {
    return null;
  }
};
let pythonExe = findPython();
if (!pythonExe) {
  run("uv", ["python", "install", PYTHON_VERSION], { stdio: "inherit" });
  pythonExe = findPython();
}
const pythonHome = run(pythonExe, ["-c", "import sys; print(sys.base_prefix)"]);
const pythonOut = join(out, "python");
cpSync(pythonHome, pythonOut, { recursive: true, dereference: true });

const stdlib = windows ? join(pythonOut, "Lib") : join(pythonOut, "lib", `python${PYTHON_VERSION}`);
const unused = [
  join(stdlib, "test"),
  join(stdlib, "idlelib"),
  join(stdlib, "tkinter"),
  join(stdlib, "turtledemo"),
  join(stdlib, "ensurepip"),
  join(stdlib, "pydoc_data"),
  join(stdlib, "site-packages"),
  join(pythonOut, "BUILD"),
  join(pythonOut, "include"),
  join(pythonOut, "share"),
  join(pythonOut, "tcl"),
  join(pythonOut, "lib", "pkgconfig"),
];
for (const path of unused) {
  rmSync(path, { recursive: true, force: true });
}
const libDir = join(pythonOut, windows ? "." : "lib");
for (const name of readdirSync(libDir)) {
  const tclTk = /^(lib)?(tcl|tk|itcl|thread)\d/i.test(name) || /^_?tk/i.test(name);
  const unusedLibpython = process.platform === "darwin" && /^libpython.*\.dylib$/.test(name);
  if (tclTk || unusedLibpython) {
    rmSync(join(libDir, name), { recursive: true, force: true });
  }
}

let bundledPython = join(pythonOut, "python.exe");
if (!windows) {
  const bin = join(pythonOut, "bin");
  bundledPython = join(bin, "python3");
  const interpreter = join(out, "python3");
  cpSync(join(bin, `python${PYTHON_VERSION}`), interpreter, { dereference: true });
  rmSync(bin, { recursive: true, force: true });
  mkdirSync(bin);
  renameSync(interpreter, bundledPython);
}
const leftoverLinks = readdirSync(pythonOut, { recursive: true }).filter((path) =>
  lstatSync(join(pythonOut, path)).isSymbolicLink(),
);
if (leftoverLinks.length > 0) {
  throw new Error(`The bundled Python still has symlinks: ${leftoverLinks.join(", ")}`);
}

const requirements = join(out, "requirements.txt");
run(
  "uv",
  [
    "export",
    "--no-dev",
    "--no-hashes",
    "--no-emit-project",
    "--frozen",
    ...WITHOUT.flatMap((name) => ["--prune", name]),
    "-o",
    requirements,
  ],
  { cwd: backend },
);
const sitePackages = join(out, "site-packages");
run(
  "uv",
  ["pip", "install", "--python", bundledPython, "--target", sitePackages, "-r", requirements],
  { stdio: "inherit" },
);

const skipped = new Set([".venv", "tests", "__pycache__", ".pytest_cache", ".ruff_cache"]);
cpSync(backend, join(out, "backend"), {
  recursive: true,
  filter: (source) => {
    const parts = relative(backend, source).split(sep);
    if (parts.some((part) => skipped.has(part))) {
      return false;
    }
    return !/\.(db|db-wal|db-shm)$/.test(basename(source));
  },
});

cpSync(frontendDist, join(out, "frontend"), { recursive: true });

run(
  bundledPython,
  [
    "-m",
    "compileall",
    "-q",
    "--invalidation-mode",
    "unchecked-hash",
    join(out, "backend"),
    sitePackages,
    stdlib,
  ],
  { stdio: "inherit" },
);

console.log(
  `Bundled Python ${PYTHON_VERSION}, the backend and the SPA into ${relative(root, out)}`,
);
