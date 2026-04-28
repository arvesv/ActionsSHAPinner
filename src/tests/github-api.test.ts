import { resolveRefToSha, GitHubApiError } from "../github-api";

// Mock the global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeResponse(
  data: unknown,
  status = 200,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    json: async () => data,
  } as unknown as Response;
}

describe("resolveRefToSha", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the SHA directly when ref is already a full 40-char SHA", async () => {
    const sha = "abc123def456abc123def456abc123def456abc1";
    const result = await resolveRefToSha("actions", "checkout", sha);
    expect(result).toBe(sha);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves a lightweight tag to its commit SHA", async () => {
    const sha = "abc123def456abc123def456abc123def456abc1";
    mockFetch.mockResolvedValue(
      makeResponse({
        ref: "refs/tags/v3",
        object: { sha, type: "commit" },
      }),
    );

    const result = await resolveRefToSha("actions", "checkout", "v3");
    expect(result).toBe(sha);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/actions/checkout/git/ref/tags/v3",
      expect.any(Object),
    );
  });

  it("dereferences an annotated tag to its commit SHA", async () => {
    const tagSha = "tag0000000000000000000000000000000000001";
    const commitSha = "commit000000000000000000000000000000001";

    mockFetch
      .mockResolvedValueOnce(
        makeResponse({
          ref: "refs/tags/v3",
          object: { sha: tagSha, type: "tag" },
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          tag: "v3",
          object: { sha: commitSha, type: "commit" },
        }),
      );

    const result = await resolveRefToSha("actions", "checkout", "v3");
    expect(result).toBe(commitSha);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `https://api.github.com/repos/actions/checkout/git/tags/${tagSha}`,
      expect.any(Object),
    );
  });

  it("falls back to branch resolution when tag is not found", async () => {
    const sha = "branch00000000000000000000000000000000001";
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 404))
      .mockResolvedValueOnce(
        makeResponse({
          ref: "refs/heads/main",
          object: { sha, type: "commit" },
        }),
      );

    const result = await resolveRefToSha("actions", "checkout", "main");
    expect(result).toBe(sha);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws GitHubApiError when both tag and branch lookups fail", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 404))
      .mockResolvedValueOnce(makeResponse({}, 404));

    await expect(
      resolveRefToSha("actions", "nonexistent", "v999"),
    ).rejects.toThrow(GitHubApiError);
  });

  it("passes Authorization header when token is provided", async () => {
    const sha = "abc123def456abc123def456abc123def456abc1";
    mockFetch.mockResolvedValue(
      makeResponse({
        object: { sha, type: "commit" },
      }),
    );

    await resolveRefToSha("actions", "checkout", "v3", { token: "mytoken" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "token mytoken",
        }),
      }),
    );
  });

  it("re-throws non-404 API errors", async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 500));

    await expect(
      resolveRefToSha("actions", "checkout", "v3"),
    ).rejects.toThrow(GitHubApiError);
  });
});
