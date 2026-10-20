import { formatVersionInfo, getVersionInfo } from "../version";

describe("version module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("retrieves version info with default repo and release links", () => {
    const info = getVersionInfo();
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.repoUrl).toBe("https://github.com/arvesv/ActionsSHAPinner");
    expect(info.releaseTag).toBe(`v${info.version}`);
    expect(info.releaseUrl).toBe(
      `https://github.com/arvesv/ActionsSHAPinner/releases/tag/v${info.version}`,
    );
    expect(info.branchUrl).toContain("https://github.com/arvesv/ActionsSHAPinner/tree/");
  });

  it("respects environment variable overrides for git commit and branch", () => {
    process.env["GIT_COMMIT_SHA"] = "1111222233334444555566667777888899990000";
    process.env["GIT_BRANCH"] = "latest";
    process.env["GIT_TAG"] = "v2.0.0";

    const info = getVersionInfo();
    expect(info.commitSha).toBe("1111222233334444555566667777888899990000");
    expect(info.commitUrl).toBe(
      "https://github.com/arvesv/ActionsSHAPinner/commit/1111222233334444555566667777888899990000",
    );
    expect(info.branch).toBe("latest");
    expect(info.branchUrl).toBe(
      "https://github.com/arvesv/ActionsSHAPinner/tree/latest",
    );
    expect(info.releaseTag).toBe("v2.0.0");
    expect(info.releaseUrl).toBe(
      "https://github.com/arvesv/ActionsSHAPinner/releases/tag/v2.0.0",
    );
  });

  it("formats version information with all relevant links", () => {
    process.env["GIT_COMMIT_SHA"] = "abcdef1234567890abcdef1234567890abcdef12";
    process.env["GIT_BRANCH"] = "master";

    const formatted = formatVersionInfo();
    expect(formatted).toContain("sha-pinner");
    expect(formatted).toContain("Repository:     https://github.com/arvesv/ActionsSHAPinner");
    expect(formatted).toContain("Release:        https://github.com/arvesv/ActionsSHAPinner/releases/tag/v");
    expect(formatted).toContain(
      "Commit:         https://github.com/arvesv/ActionsSHAPinner/commit/abcdef1234567890abcdef1234567890abcdef12",
    );
    expect(formatted).toContain(
      "Release Branch: https://github.com/arvesv/ActionsSHAPinner/tree/master",
    );
  });
});
