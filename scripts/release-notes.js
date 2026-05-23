import { appendFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const packageJsonPath = join(rootDir, 'package.json');
const changelogPath = join(rootDir, 'CHANGELOG.md');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getReleaseNotes(version, changelog) {
  const normalizedChangelog = changelog.replace(/\r\n/g, '\n');
  const headingRegex = new RegExp(`^## \\[${escapeRegExp(version)}\\].*$`, 'm');
  const headingMatch = headingRegex.exec(normalizedChangelog);

  if (!headingMatch || headingMatch.index === undefined) {
    throw new Error(`Could not find CHANGELOG section for version ${version}.`);
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remainingChangelog = normalizedChangelog.slice(sectionStart);
  const nextHeadingIndex = remainingChangelog.search(/\n## .+/);
  const section = (
    nextHeadingIndex === -1
      ? remainingChangelog
      : remainingChangelog.slice(0, nextHeadingIndex)
  ).trim();

  if (!section) {
    throw new Error(`CHANGELOG section for version ${version} is empty.`);
  }

  return section;
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = process.env.RELEASE_NOTES_VERSION ?? packageJson.version;
const changelog = readFileSync(changelogPath, 'utf-8');
const releaseNotes = getReleaseNotes(version, changelog);

if (process.env.GITHUB_OUTPUT) {
  const outputName = process.env.RELEASE_NOTES_OUTPUT_NAME ?? 'release_body';
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${outputName}<<EOF\n${releaseNotes}\nEOF\n`
  );
  console.log(`✅ Extracted release notes for ${version}.`);
} else {
  process.stdout.write(`${releaseNotes}\n`);
}
