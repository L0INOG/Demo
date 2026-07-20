/**
 * Version management script for Tactical Range Demo.
 *
 * Usage:
 *   node version.js              — show current version
 *   node version.js bump         — auto-increment minor (1.0 → 1.1)
 *   node version.js set 2.0      — manually set major version
 *
 * Rules:
 *   - Minor version increments by 1 each bump (1.0 → 1.1 → … → 1.99)
 *   - Major version ONLY changes when explicitly set (not auto)
 *   - Package.json version stays in sync
 */

const fs = require('fs');
const path = require('path');

const PKG_PATH = path.join(__dirname, 'package.json');
const LOG_PATH = path.join(__dirname, 'CHANGELOG.md');

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function writePkg(pkg) {
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

function parseVersion(v) {
  const parts = v.split('.').map(Number);
  if (parts.length < 2) throw new Error(`Invalid version: ${v}`);
  return { major: parts[0], minor: parts[1] || 0 };
}

function formatVersion(major, minor) {
  return `v${major}.${minor}`;
}

function prependChangelog(version) {
  const date = new Date().toISOString().split('T')[0];
  const entry = `\n## ${version} (${date})\n\n### Changes\n- \n`;

  let content = fs.readFileSync(LOG_PATH, 'utf8');
  // Insert after the version history header line
  const marker = '## Version History\n';
  const idx = content.indexOf(marker);
  if (idx === -1) {
    console.error('Could not find "## Version History" in CHANGELOG.md');
    return;
  }
  const insertAt = idx + marker.length;
  content = content.slice(0, insertAt) + entry + content.slice(insertAt);
  fs.writeFileSync(LOG_PATH, content);
}

// ── Main ──

const cmd = process.argv[2];
const pkg = readPkg();
const current = parseVersion(pkg.version);

if (cmd === 'bump') {
  const next = formatVersion(current.major, current.minor + 1);
  pkg.version = `${current.major}.${current.minor + 1}.0`;
  writePkg(pkg);
  prependChangelog(next);
  console.log(`Bumped: ${formatVersion(current.major, current.minor)} → ${next}`);
  console.log('Edit CHANGELOG.md to fill in the changes.');
} else if (cmd === 'set') {
  const target = process.argv[3];
  if (!target) { console.error('Usage: node version.js set <major.minor>'); process.exit(1); }
  const v = parseVersion(target);
  pkg.version = `${v.major}.${v.minor}.0`;
  writePkg(pkg);
  prependChangelog(formatVersion(v.major, v.minor));
  console.log(`Set: ${formatVersion(current.major, current.minor)} → ${formatVersion(v.major, v.minor)}`);
} else {
  console.log(`Current version: ${formatVersion(current.major, current.minor)}`);
  console.log('Usage: node version.js [bump|set <major.minor>]');
}
