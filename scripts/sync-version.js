import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const packageJsonPath = join(rootDir, 'package.json');
const cargoTomlPath = join(rootDir, 'src-tauri', 'Cargo.toml');
const cargoLockPath = join(rootDir, 'src-tauri', 'Cargo.lock');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const packageVersion = packageJson.version;
const cargoToml = readFileSync(cargoTomlPath, 'utf-8');
const cargoPackageName =
  cargoToml.match(/^name\s*=\s*"(.+)"$/m)?.[1] ?? packageJson.name;

const updatedCargoToml = cargoToml.replace(
  /^version\s*=\s*"(.+)"$/m,
  `version = "${packageVersion}"`
);

const cargoLock = existsSync(cargoLockPath)
  ? readFileSync(cargoLockPath, 'utf-8')
  : null;

const cargoLockPackageRegex = cargoLock
  ? new RegExp(
      `(\\[\\[package\\]\\]\\s*\\r?\\nname\\s*=\\s*"${escapeRegExp(
        cargoPackageName
      )}"\\s*\\r?\\n)version\\s*=\\s*"[^"]+"`
    )
  : null;

const updatedCargoLock =
  cargoLock && cargoLockPackageRegex
    ? cargoLock.replace(cargoLockPackageRegex, `$1version = "${packageVersion}"`)
    : cargoLock;

const cargoTomlChanged = updatedCargoToml !== cargoToml;
const cargoLockChanged = updatedCargoLock !== cargoLock;

if (cargoTomlChanged) {
  writeFileSync(cargoTomlPath, updatedCargoToml);
}

if (cargoLockChanged && updatedCargoLock !== null) {
  writeFileSync(cargoLockPath, updatedCargoLock);
}

if (!cargoTomlChanged && !cargoLockChanged) {
  console.log(`✅ Cargo.toml and Cargo.lock already match package.json: ${packageVersion}`);
  process.exit(0);
}

if (cargoTomlChanged && cargoLockChanged) {
  console.log(`✅ Synced Cargo.toml and Cargo.lock to ${packageVersion}`);
} else if (cargoTomlChanged) {
  console.log(`✅ Synced Cargo.toml version to ${packageVersion}`);
} else {
  console.log(`✅ Synced Cargo.lock version to ${packageVersion}`);
}