import { resolveRefToSha, GitHubApiOptions } from "./github-api";

/**
 * Matches `uses: owner/repo@ref` or `uses: owner/repo/sub/path@ref` in YAML.
 *
 * Capture groups:
 *   1 – leading whitespace before "uses:"
 *   2 – owner
 *   3 – repo (including any sub-path, e.g. "actions/aws-credentials/sub")
 *   4 – ref (tag, branch, or SHA)
 *   5 – optional existing inline comment (e.g. "  # v3")
 */
const USES_REGEX =
  /^(\s*-?\s*uses:\s+)([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_./-]+)@([^\s#]+)((?:\s+#.*)?)$/gm;

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

  // Collect all matches first so we can resolve SHAs in parallel
  const matches: {
    fullMatch: string;
    prefix: string;
    owner: string;
    repoPath: string;
    ref: string;
    existingComment: string;
  }[] = [];

  let m: RegExpExecArray | null;
  const regex = new RegExp(USES_REGEX.source, USES_REGEX.flags);
  while ((m = regex.exec(content)) !== null) {
    matches.push({
      fullMatch: m[0],
      prefix: m[1],
      owner: m[2],
      repoPath: m[3],
      ref: m[4],
      existingComment: m[5],
    });
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

  // Build replacement map (fullMatch → newLine)
  const replacements = new Map<string, string>();
  for (let i = 0; i < matches.length; i++) {
    const r = resolved[i];
    if (!r) continue;
    const { fullMatch, prefix, owner, repoPath, ref } = matches[i];
    const newLine = `${prefix}${owner}/${repoPath}@${r.sha}  # ${ref}`;
    replacements.set(fullMatch, newLine);
  }

  // Apply replacements (preserve original line endings)
  let output = content;
  for (const [original, replacement] of replacements) {
    output = output.split(original).join(replacement);
  }

  return { content: output, results };
}
