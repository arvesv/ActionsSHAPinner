const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const target = process.argv[2] || 'patch';
const cleanTarget = target.trim().replace(/^["']|["']$/g, '');

console.log(`🚀 Bumping version with target: "${cleanTarget}"...`);

// 1. Run npm version on root package.json
try {
  execSync(`npm version ${cleanTarget} --allow-same-version --no-git-tag-version`, { stdio: 'inherit' });
} catch (err) {
  console.error(`❌ Failed to bump root version using "npm version ${cleanTarget}":`, err.message);
  process.exit(1);
}

// 2. Read new version from package.json
const rootPkgPath = path.resolve('package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const rawVersion = rootPkg.version;
const tagVersion = `v${rawVersion}`;

console.log(`📦 Updated package.json version to ${rawVersion}`);

// 3. Write build-info.json
const buildInfoPath = path.resolve('src/build-info.json');
let commitSha = process.env.GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
if (!commitSha) {
  try {
    commitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    commitSha = '';
  }
}

let branchName = process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || '';
if (!branchName) {
  try {
    branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    branchName = 'latest';
  }
}

const buildInfo = {
  version: rawVersion,
  tag: tagVersion,
  commit: commitSha,
  branch: branchName || 'latest',
};

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n', 'utf8');
console.log(`✅ Generated src/build-info.json for ${tagVersion}`);

// 4. Write GitHub Actions outputs if running in CI
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${tagVersion}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `raw_version=${rawVersion}\n`);
}

console.log(`✨ Successfully bumped version to ${tagVersion} (${rawVersion})`);
