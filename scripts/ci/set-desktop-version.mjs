import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error(`Not a version: ${version}`);
  process.exit(1);
}

const confPath = "desktop/src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);

const cargoPath = "desktop/src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);

console.log(`Desktop version set to ${version}`);
