import { resolveRefToSha, GitHubApiOptions } from "./github-api";

/**
 * Matches `uses: owner/repo@ref` or `uses: owner/repo/sub/path@ref` in YAML.
 * Supports both unquoted and quoted action references (e.g. `uses: "actions/checkout@v4"`).
 *
 * Capture groups:
 *   1 – leading whitespace before "uses:" (and dash if present)
 *   2 – optional opening quote (", ', or empty)
 *   3 – owner
 *   4 – repo (including any sub-path, e.g. "actions/aws-credentials/sub")
 *   5 – ref (tag, branch, or SHA)
 *   6 – optional existing inline comment (e.g. "  # v3")
 */
const USES_LINE_REGEX =
  /^(\s*-?\s*uses:\s+)(['"]?)([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_./-]+)@([^\s#'"]+)\2((?:\s+#.*)?)$/;

/** Regex matching YAML block scalar indicators (e.g. `run: |`, `run: >-`, `- run: |`). */
const BLOCK_SCALAR_HEADER_REGEX = /:\s*[|>][+-]?[0-9]?(?:\s+#.*)?$/;

/** A SHA that is already 40 hex characters – considered already pinned. */
const FULL_SHA_REGEX = /^[0-9a-f]{40}$/i;

export interface PinResult {
  action: string;
  ref: string;
  sha: string;
  alreadyPinned: boolean;
}

export interface PinOptions extends GitHubApiOptions {
  /**
   * Called when an action cannot be resolved (e.g., rate-limit, 404).
   * If provided, the line is left unchanged and the callback is invoked.
   * If not provided, the error is re-thrown.
   */
  onError?: (action: string, ref: string, error: Error) => void;
}

/**
 * Takes the text content of a GitHub Actions YAML workflow file and returns
 * an updated version where every `uses: owner/repo@ref` line has its `ref`
 * replaced with the corresponding full commit SHA. The original ref is
 * preserved as an inline comment.
 *
 * Local actions (`uses: ./path`) and Docker image refs
 * (`uses: docker://image`) are left untouched.
 * Actions already pinned to a full 40-char SHA are also left untouched.
 */
export async function pinWorkflowContent(
  content: string,
  options: PinOptions = {},
): Promise<{ content: string; results: PinResult[] }> {
  const results: PinResult[] = [];
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);

  interface MatchInfo {
    lineIndex: number;
    prefix: string;
    quote: string;
    owner: string;
    repoPath: string;
    ref: string;
    existingComment: string;
  }

  const matches: MatchInfo[] = [];

  let blockScalarIndent: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (blockScalarIndent !== null) {
      if (line.trim().length === 0) {
        // Blank lines inside a block scalar are preserved as part of the block
        continue;
      }
      const lineIndent = (line.match(/^(\s*)/)?.[1] ?? "").length;
      if (lineIndent > blockScalarIndent) {
        // Still inside multiline block scalar (e.g., shell script in `run: |`)
        continue;
      }
      // Block scalar has ended
      blockScalarIndent = null;
    }

    if (BLOCK_SCALAR_HEADER_REGEX.test(line)) {
      const keyCol = line.match(/^(\s*(?:-\s+)?)/)?.[0].length ?? 0;
      blockScalarIndent = keyCol;
      continue;
    }

    const m = USES_LINE_REGEX.exec(line);
    if (m) {
      matches.push({
        lineIndex: i,
        prefix: m[1],
        quote: m[2],
        owner: m[3],
        repoPath: m[4],
        ref: m[5],
        existingComment: m[6],
      });
    }
  }

  // Resolve SHAs in parallel
  const resolved = await Promise.all(
    matches.map(async (match) => {
      const { owner, repoPath, ref } = match;
      // repo is the first path segment; sub-paths are part of the action path
      const repo = repoPath.split("/")[0];
      const action = `${owner}/${repoPath}`;

      if (FULL_SHA_REGEX.test(ref)) {
        results.push({ action, ref, sha: ref, alreadyPinned: true });
        return null; // no replacement needed
      }

      try {
        const sha = await resolveRefToSha(owner, repo, ref, options);
        results.push({ action, ref, sha, alreadyPinned: false });
        return { ...match, sha };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (options.onError) {
          options.onError(action, ref, error);
          results.push({ action, ref, sha: "", alreadyPinned: false });
          return null;
        }
        throw error;
      }
    }),
  );

  // Apply replacements directly by line index
  for (let i = 0; i < matches.length; i++) {
    const r = resolved[i];
    if (!r) continue;
    const { lineIndex, prefix, quote, owner, repoPath, ref } = matches[i];
    lines[lineIndex] = `${prefix}${quote}${owner}/${repoPath}@${r.sha}${quote}  # ${ref}`;
  }

  return { content: lines.join(eol), results };
}
