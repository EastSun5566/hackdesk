import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const packageJsonPath = join(rootDir, 'package.json');
const cargoTomlPath = join(rootDir, 'src-tauri', 'Cargo.toml');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const packageVersion = packageJson.version;
const cargoToml = readFileSync(cargoTomlPath, 'utf-8');

const updatedCargoToml = cargoToml.replace(
  /^version\s*=\s*"(.+)"$/m,
  `version = "${packageVersion}"`
);

if (updatedCargoToml === cargoToml) {
  console.log(`✅ Cargo.toml already matches package.json: ${packageVersion}`);
  process.exit(0);
}

writeFileSync(cargoTomlPath, updatedCargoToml);
console.log(`✅ Synced Cargo.toml version to ${packageVersion}`);