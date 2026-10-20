import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface VersionInfo {
  version: string;
  repoUrl: string;
  commitSha?: string;
  branch?: string;
  releaseTag?: string;
  releaseUrl?: string;
  commitUrl?: string;
  branchUrl?: string;
}

export function getVersionInfo(): VersionInfo {
  let version = "1.0.0";
  let repoUrl = "https://github.com/arvesv/ActionsSHAPinner";

  // 1. Try to read package.json
  try {
    const pkgPath = path.resolve(__dirname, "../package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.version) {
        version = pkg.version;
      }
      if (pkg.repository && typeof pkg.repository.url === "string") {
        repoUrl = pkg.repository.url
          .replace(/^git\+/, "")
          .replace(/\.git$/, "");
      }
    }
  } catch {
    // Ignore read errors
  }

  // 2. Try to read build-info.json if present
  let buildInfo: {
    version?: string;
    tag?: string;
    commit?: string;
    branch?: string;
  } = {};

  try {
    const buildInfoPath = path.resolve(__dirname, "build-info.json");
    if (fs.existsSync(buildInfoPath)) {
      buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
    }
  } catch {
    // Ignore read errors
  }

  if (buildInfo.version) {
    version = buildInfo.version;
  }

  // 3. Resolve commit SHA
  const envCommit =
    process.env["GIT_COMMIT_SHA"] ||
    process.env["GITHUB_SHA"] ||
    buildInfo.commit;

  let commitSha = envCommit?.trim() || undefined;

  // 4. Resolve branch
  const envBranch =
    process.env["GIT_BRANCH"] ||
    (process.env["GITHUB_REF_TYPE"] === "branch"
      ? process.env["GITHUB_REF_NAME"]
      : undefined) ||
    buildInfo.branch;

  let branch = envBranch?.trim() || undefined;

  // 5. Resolve tag
  const envTag =
    process.env["GIT_TAG"] ||
    (process.env["GITHUB_REF_TYPE"] === "tag"
      ? process.env["GITHUB_REF_NAME"]
      : undefined) ||
    buildInfo.tag;

  let releaseTag =
    envTag?.trim() || (version ? `v${version.replace(/^v/, "")}` : undefined);

  // If in git repo and missing commit or branch, query git safely
  if (!commitSha || !branch) {
    try {
      const remoteUrl = execSync("git remote get-url origin", {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      }).trim();

      if (/ActionsSHAPinner/i.test(remoteUrl)) {
        if (!commitSha) {
          commitSha = execSync("git rev-parse HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
            encoding: "utf-8",
          }).trim();
        }
        if (!branch) {
          const b = execSync("git rev-parse --abbrev-ref HEAD", {
            stdio: ["ignore", "pipe", "ignore"],
            encoding: "utf-8",
          }).trim();
          if (b && b !== "HEAD") {
            branch = b;
          }
        }
      }
    } catch {
      // Ignore git errors
    }
  }

  const effectiveBranch = branch || "latest";

  const releaseUrl = releaseTag
    ? `${repoUrl}/releases/tag/${releaseTag}`
    : undefined;
  const commitUrl = commitSha ? `${repoUrl}/commit/${commitSha}` : undefined;
  const branchUrl = effectiveBranch
    ? `${repoUrl}/tree/${effectiveBranch}`
    : undefined;

  return {
    version,
    repoUrl,
    commitSha,
    branch: effectiveBranch,
    releaseTag,
    releaseUrl,
    commitUrl,
    branchUrl,
  };
}

export function formatVersionInfo(): string {
  const info = getVersionInfo();
  const lines: string[] = [
    `sha-pinner ${info.version}`,
    `Repository:     ${info.repoUrl}`,
  ];

  if (info.releaseUrl) {
    lines.push(`Release:        ${info.releaseUrl}`);
  }
  if (info.commitUrl) {
    lines.push(`Commit:         ${info.commitUrl}`);
  }
  if (info.branchUrl) {
    lines.push(`Release Branch: ${info.branchUrl}`);
  }

  return lines.join("\n");
}
