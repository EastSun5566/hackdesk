import { describe, expect, it } from 'vitest';

import {
  getReleaseTag,
  getReleaseVersion,
  selectMacosDmgAssets,
  updateCaskContent,
} from './sync-homebrew-tap.js';

const sampleCask = `cask "hackdesk" do
  arch arm: "aarch64", intel: "x64"

  version "0.1.0"
  sha256 arm:   "old-arm-sha",
         intel: "old-intel-sha"

  url "https://github.com/EastSun5566/hackdesk/releases/download/v#{version}/HackDesk_#{version}_#{arch}.dmg",
      verified: "github.com/EastSun5566/hackdesk/"

  name "HackDesk"
  desc "Hackable HackMD desktop application"
  homepage "https://hackdesk.eastsun.me/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true

  app "HackDesk.app"
end
`;

describe('getReleaseTag', () => {
  it('adds a v prefix when only a version is provided', () => {
    expect(getReleaseTag('0.1.5')).toBe('v0.1.5');
  });

  it('keeps existing release tags unchanged', () => {
    expect(getReleaseTag('v0.1.5')).toBe('v0.1.5');
    expect(getReleaseTag('hackdesk-v0.0.7')).toBe('hackdesk-v0.0.7');
  });
});

describe('getReleaseVersion', () => {
  it('strips supported release tag prefixes', () => {
    expect(getReleaseVersion('v0.1.5')).toBe('0.1.5');
    expect(getReleaseVersion('hackdesk-v0.0.7')).toBe('0.0.7');
  });
});

describe('selectMacosDmgAssets', () => {
  it('finds both macOS dmg assets for the requested version', () => {
    const assets = selectMacosDmgAssets(
      [
        {
          name: 'HackDesk_0.1.5_aarch64.dmg',
        },
        {
          name: 'HackDesk_0.1.5_x64.dmg',
        },
      ],
      '0.1.5'
    );

    expect(assets.arm.name).toBe('HackDesk_0.1.5_aarch64.dmg');
    expect(assets.intel.name).toBe('HackDesk_0.1.5_x64.dmg');
  });

  it('throws when either architecture is missing', () => {
    expect(() =>
      selectMacosDmgAssets(
        [
          {
            name: 'HackDesk_0.1.5_x64.dmg',
          },
        ],
        '0.1.5'
      )
    ).toThrow(/Missing macOS DMG assets/);
  });
});

describe('updateCaskContent', () => {
  it('updates the version and both architecture checksums', () => {
    const updated = updateCaskContent(sampleCask, {
      version: '0.1.5',
      armSha256: 'new-arm-sha',
      intelSha256: 'new-intel-sha',
    });

    expect(updated).toContain('version "0.1.5"');
    expect(updated).toContain('sha256 arm:   "new-arm-sha",');
    expect(updated).toContain('         intel: "new-intel-sha"');
    expect(updated).toContain(
      'HackDesk_#{version}_#{arch}.dmg",\n      verified: "github.com/EastSun5566/hackdesk/"'
    );
  });
});
