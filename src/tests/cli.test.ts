import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const CLI_PATH = path.resolve(__dirname, "../index.ts");

function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["-r", "ts-node/register", CLI_PATH, ...args],
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error && error.code !== undefined ? (error.code as number) : 0,
        });
      },
    );
  });
}

describe("CLI (sha-pinner)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sha-pinner-cli-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("outputs version with --version", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("1.0.0");
  });

  it("outputs help with --help", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: sha-pinner [options] <files...>");
    expect(stdout).toContain("--no-fail-on-error");
  });

  it("exits with error when file does not exist", async () => {
    const nonExistent = path.join(tmpDir, "does-not-exist.yml");
    const { stderr, exitCode } = await runCli([nonExistent]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain(`Error: File not found: ${nonExistent}`);
  });

  it("dry-run prints output without modifying the file", async () => {
    const filePath = path.join(tmpDir, "workflow.yml");
    const original =
      "steps:\n  - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4\n";
    fs.writeFileSync(filePath, original, "utf-8");

    const { stdout, exitCode } = await runCli(["--dry-run", filePath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`--- ${filePath} ---`);
    expect(stdout).toContain("already pinned");
    // File content must be untouched
    expect(fs.readFileSync(filePath, "utf-8")).toBe(original);
  });

  it("updates file on disk when not dry-run", async () => {
    const filePath = path.join(tmpDir, "workflow.yml");
    const original =
      "steps:\n  - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4\n";
    fs.writeFileSync(filePath, original, "utf-8");

    const { stdout, exitCode } = await runCli([filePath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`Pinned: ${filePath}`);
    expect(stdout).toContain("already pinned");
  });

  it("exits with code 0 and logs warning when unresolvable action has --no-fail-on-error", async () => {
    const filePath = path.join(tmpDir, "workflow.yml");
    const content =
      "steps:\n  - uses: non-existent-owner-00000/non-existent-repo-00000@v1\n";
    fs.writeFileSync(filePath, content, "utf-8");

    const { stdout, stderr, exitCode } = await runCli([
      "--dry-run",
      "--no-fail-on-error",
      filePath,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Warning: Could not resolve");
    expect(stdout).toContain("non-existent-owner-00000/non-existent-repo-00000@v1");
  });

  it("exits with code 1 when unresolvable action fails without --no-fail-on-error", async () => {
    const filePath = path.join(tmpDir, "workflow.yml");
    const content =
      "steps:\n  - uses: non-existent-owner-00000/non-existent-repo-00000@v1\n";
    fs.writeFileSync(filePath, content, "utf-8");

    const { stderr, exitCode } = await runCli(["--dry-run", filePath]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`Error processing ${filePath}`);
  });
});

