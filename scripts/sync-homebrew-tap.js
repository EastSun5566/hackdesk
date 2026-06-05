import { createHash } from 'crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import { pathToFileURL } from 'url';

const DEFAULT_SOURCE_REPO = 'EastSun5566/hackdesk';
const DEFAULT_TAP_REPO = 'EastSun5566/homebrew-hackdesk';
const DEFAULT_CASK_PATH = 'homebrew-hackdesk/Casks/hackdesk.rb';
const GITHUB_API_URL = 'https://api.github.com';
const USER_AGENT = 'hackdesk-homebrew-tap-sync';

const HELP_TEXT = `Usage: node scripts/sync-homebrew-tap.js --release-tag <tag> [options]

Options:
  --source-repo <owner/repo>   Source repository that owns the GitHub release.
                               Default: ${DEFAULT_SOURCE_REPO}
  --tap-repo <owner/repo>      Homebrew tap repository slug.
                               Default: ${DEFAULT_TAP_REPO}
  --cask-path <path>           Path to Casks/hackdesk.rb inside a checked-out tap repo.
                               Default: ${DEFAULT_CASK_PATH}
  --github-token <token>       Token used to read release metadata and assets.
                               Defaults to GITHUB_TOKEN / GH_TOKEN when present.
  --help                       Show this help message.
`;

function consumeOption(argv, index) {
  const currentArg = argv[index];
  const equalSignIndex = currentArg.indexOf('=');

  if (equalSignIndex !== -1) {
    return {
      consumed: 0,
      value: currentArg.slice(equalSignIndex + 1),
    };
  }

  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${currentArg}.`);
  }

  return {
    consumed: 1,
    value,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    caskPath: DEFAULT_CASK_PATH,
    sourceRepo: DEFAULT_SOURCE_REPO,
    tapRepo: DEFAULT_TAP_REPO,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--release-tag' || arg.startsWith('--release-tag=')) {
      const { consumed, value } = consumeOption(argv, index);
      options.releaseTag = value;
      index += consumed;
      continue;
    }

    if (arg === '--source-repo' || arg.startsWith('--source-repo=')) {
      const { consumed, value } = consumeOption(argv, index);
      options.sourceRepo = value;
      index += consumed;
      continue;
    }

    if (arg === '--tap-repo' || arg.startsWith('--tap-repo=')) {
      const { consumed, value } = consumeOption(argv, index);
      options.tapRepo = value;
      index += consumed;
      continue;
    }

    if (arg === '--cask-path' || arg.startsWith('--cask-path=')) {
      const { consumed, value } = consumeOption(argv, index);
      options.caskPath = value;
      index += consumed;
      continue;
    }

    if (arg === '--github-token' || arg.startsWith('--github-token=')) {
      const { consumed, value } = consumeOption(argv, index);
      options.githubToken = value;
      index += consumed;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseRepoSlug(repoSlug, label = 'repository') {
  const match = /^(?<owner>[^/]+)\/(?<repo>[^/]+)$/.exec(repoSlug);

  if (!match?.groups) {
    throw new Error(`Expected ${label} in the form owner/repo, received "${repoSlug}".`);
  }

  return match.groups;
}

export function getReleaseTag(tagOrVersion) {
  if (!tagOrVersion) {
    throw new Error('A release tag or version is required.');
  }

  if (tagOrVersion.startsWith('hackdesk-v') || tagOrVersion.startsWith('v')) {
    return tagOrVersion;
  }

  return `v${tagOrVersion}`;
}

export function getReleaseVersion(tagName) {
  if (!tagName) {
    throw new Error('A release tag is required.');
  }

  if (tagName.startsWith('hackdesk-v')) {
    return tagName.slice('hackdesk-v'.length);
  }

  if (tagName.startsWith('v')) {
    return tagName.slice(1);
  }

  return tagName;
}

function createGlobalPattern(pattern) {
  return new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  );
}

function replaceSingleMatch(source, pattern, replacement, description) {
  const matches = [...source.matchAll(createGlobalPattern(pattern))];

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${description} match in the Homebrew cask, found ${matches.length}.`
    );
  }

  return source.replace(pattern, replacement);
}

export function updateCaskContent(content, { version, armSha256, intelSha256 }) {
  let updatedContent = replaceSingleMatch(
    content,
    /^(\s*version\s+")([^"]+)(")/m,
    `$1${version}$3`,
    'version'
  );

  updatedContent = replaceSingleMatch(
    updatedContent,
    /(sha256\s+arm:\s+")([^"]+)(",)/m,
    `$1${armSha256}$3`,
    'arm sha256'
  );

  updatedContent = replaceSingleMatch(
    updatedContent,
    /^(\s*intel:\s+")([^"]+)(")/m,
    `$1${intelSha256}$3`,
    'intel sha256'
  );

  return updatedContent;
}

export function selectMacosDmgAssets(assets, version) {
  const expectedAssets = {
    arm: `HackDesk_${version}_aarch64.dmg`,
    intel: `HackDesk_${version}_x64.dmg`,
  };
  const resolvedAssets = {
    arm: assets.find((asset) => asset.name === expectedAssets.arm),
    intel: assets.find((asset) => asset.name === expectedAssets.intel),
  };

  if (resolvedAssets.arm && resolvedAssets.intel) {
    return resolvedAssets;
  }

  const availableAssets = assets.map((asset) => asset.name).join(', ') || '(none)';
  throw new Error(
    `Missing macOS DMG assets for ${version}. Expected ${expectedAssets.arm} and ${expectedAssets.intel}. Available assets: ${availableAssets}`
  );
}

function buildHeaders({ accept = 'application/vnd.github+json', token } = {}) {
  const headers = {
    'Accept': accept,
    'User-Agent': USER_AGENT,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchGitHubJson(url, token) {
  const response = await fetch(url, {
    headers: buildHeaders({ token }),
    redirect: 'follow',
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `GitHub request failed for ${url} (${response.status} ${response.statusText}): ${responseBody.slice(0, 500)}`
    );
  }

  return response.json();
}

async function downloadReleaseAsset(asset, token) {
  const requestUrl = token && asset.url ? asset.url : asset.browser_download_url;
  const headers = token && asset.url
    ? buildHeaders({ accept: 'application/octet-stream', token })
    : buildHeaders({ accept: 'application/octet-stream' });
  const response = await fetch(requestUrl, {
    headers,
    redirect: 'follow',
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Asset download failed for ${asset.name} (${response.status} ${response.statusText}): ${responseBody.slice(0, 500)}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function checksumReleaseAsset(asset, token) {
  const assetBuffer = await downloadReleaseAsset(asset, token);
  return createHash('sha256').update(assetBuffer).digest('hex');
}

function setGitHubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function emitOutputs(outputs) {
  for (const [name, value] of Object.entries(outputs)) {
    setGitHubOutput(name, value);
  }
}

function buildBranchName(releaseTag) {
  return `automation/homebrew-tap-${releaseTag.replace(/[^A-Za-z0-9._/-]+/g, '-')}`;
}

export async function syncHomebrewTap({
  caskPath = DEFAULT_CASK_PATH,
  githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
  releaseTag,
  sourceRepo = DEFAULT_SOURCE_REPO,
  tapRepo = DEFAULT_TAP_REPO,
}) {
  const resolvedReleaseTag = getReleaseTag(releaseTag);
  const { owner, repo } = parseRepoSlug(sourceRepo, 'source repository');
  const release = await fetchGitHubJson(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(resolvedReleaseTag)}`,
    githubToken
  );
  const version = getReleaseVersion(release.tag_name);
  const releaseAssets = selectMacosDmgAssets(release.assets ?? [], version);

  console.log(`ℹ️ Fetching DMG checksums for ${release.tag_name}...`);
  const [armSha256, intelSha256] = await Promise.all([
    checksumReleaseAsset(releaseAssets.arm, githubToken),
    checksumReleaseAsset(releaseAssets.intel, githubToken),
  ]);

  const resolvedCaskPath = resolve(caskPath);
  const existingContent = readFileSync(resolvedCaskPath, 'utf-8');
  const updatedContent = updateCaskContent(existingContent, {
    armSha256,
    intelSha256,
    version,
  });
  const changed = existingContent !== updatedContent;

  if (changed) {
    writeFileSync(resolvedCaskPath, updatedContent);
  }

  const outputs = {
    arm_sha256: armSha256,
    branch_name: buildBranchName(release.tag_name),
    changed: String(changed),
    commit_message: `chore(homebrew): sync hackdesk to ${release.tag_name}`,
    intel_sha256: intelSha256,
    pr_title: `chore(homebrew): sync hackdesk to ${release.tag_name}`,
    release_tag: release.tag_name,
    release_url: release.html_url,
    tap_repo: tapRepo,
    version,
  };

  emitOutputs(outputs);

  if (changed) {
    console.log(`✅ Updated ${basename(resolvedCaskPath)} to ${release.tag_name}.`);
  } else {
    console.log(`ℹ️ ${basename(resolvedCaskPath)} already matches ${release.tag_name}.`);
  }

  return outputs;
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (!options.releaseTag) {
    throw new Error('Missing required --release-tag option.');
  }

  await syncHomebrewTap(options);
}

const isEntryPoint = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? `❌ Homebrew tap sync failed: ${error.message}`
        : '❌ Homebrew tap sync failed.'
    );
    process.exit(1);
  });
}
