import packageJson from '../package.json' with { type: 'json' };

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  console.error(`Invalid package version: ${packageJson.version}`);
  process.exit(1);
}

console.log(`Package version: ${packageJson.version}`);
