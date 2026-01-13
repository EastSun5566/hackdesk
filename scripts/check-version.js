import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const packageJson = JSON.parse(
  readFileSync(join(rootDir, 'package.json'), 'utf-8')
);

const cargoToml = readFileSync(
  join(rootDir, 'src-tauri', 'Cargo.toml'),
  'utf-8'
);

const cargoVersion = cargoToml.match(/^version\s*=\s*"(.+)"$/m)?.[1];

if (packageJson.version !== cargoVersion) {
  console.error('❌ Version mismatch detected!');
  console.error(`   package.json: ${packageJson.version}`);
  console.error(`   Cargo.toml:   ${cargoVersion}`);
  console.error('\nPlease ensure both files have the same version number.');
  process.exit(1);
}

console.log(`✅ Versions match: ${packageJson.version}`);
