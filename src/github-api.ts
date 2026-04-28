export interface GitHubApiOptions {
  token?: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

async function fetchGitHub(
  url: string,
  token?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "ActionsSHAPinner/1.0",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new GitHubApiError(
      `GitHub API error: ${response.status} ${response.statusText} for ${url}`,
      response.status,
    );
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Resolves a GitHub Actions ref (tag or branch name) to the corresponding
 * commit SHA. Handles both lightweight and annotated tags.
 *
 * @param owner - Repository owner (e.g., "actions")
 * @param repo  - Repository name (e.g., "checkout")
 * @param ref   - Git ref (e.g., "v3", "main", or a commit SHA)
 * @param options - Optional API options (e.g., token)
 * @returns The commit SHA string
 */
export async function resolveRefToSha(
  owner: string,
  repo: string,
  ref: string,
  options: GitHubApiOptions = {},
): Promise<string> {
  // If ref already looks like a full SHA (40 hex chars), return as-is
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    return ref;
  }

  // Try resolving as a tag first, then as a branch
  const candidates = [
    `https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${ref}`,
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${ref}`,
  ];

  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const data = await fetchGitHub(url, options.token);
      const object = data["object"] as
        | { sha: string; type: string }
        | undefined;
      if (!object?.sha) {
        continue;
      }

      // For annotated tags, dereference to the commit SHA
      if (object.type === "tag") {
        const tagData = await fetchGitHub(
          `https://api.github.com/repos/${owner}/${repo}/git/tags/${object.sha}`,
          options.token,
        );
        const tagObject = tagData["object"] as
          | { sha: string }
          | undefined;
        if (tagObject?.sha) {
          return tagObject.sha;
        }
      }

      return object.sha;
    } catch (err) {
      if (err instanceof GitHubApiError && err.statusCode === 404) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw (
    lastError ??
    new Error(`Could not resolve ref '${ref}' for ${owner}/${repo}`)
  );
}
