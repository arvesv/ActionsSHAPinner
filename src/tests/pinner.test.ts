import { pinWorkflowContent } from "../pinner";

// Mock the github-api module
jest.mock("../github-api", () => ({
  resolveRefToSha: jest.fn(),
  GitHubApiError: class GitHubApiError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { resolveRefToSha } from "../github-api";
const mockResolveRefToSha = resolveRefToSha as jest.MockedFunction<
  typeof resolveRefToSha
>;

describe("pinWorkflowContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("replaces a simple action tag with its SHA", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "abc123def456abc123def456abc123def456abc1",
    );

    const input = `
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
`;

    const { content, results } = await pinWorkflowContent(input);

    expect(content).toContain(
      "uses: actions/checkout@abc123def456abc123def456abc123def456abc1  # v3",
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      action: "actions/checkout",
      ref: "v3",
      sha: "abc123def456abc123def456abc123def456abc1",
      alreadyPinned: false,
    });
  });

  it("replaces multiple actions", async () => {
    mockResolveRefToSha
      .mockResolvedValueOnce("aaa0000000000000000000000000000000000001")
      .mockResolvedValueOnce("bbb0000000000000000000000000000000000002");

    const input = `
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-node@v4
`;

    const { content, results } = await pinWorkflowContent(input);

    expect(content).toContain(
      "uses: actions/checkout@aaa0000000000000000000000000000000000001  # v3",
    );
    expect(content).toContain(
      "uses: actions/setup-node@bbb0000000000000000000000000000000000002  # v4",
    );
    expect(results).toHaveLength(2);
  });

  it("skips actions already pinned to a full SHA", async () => {
    const sha = "abc123def456abc123def456abc123def456abc1";
    const input = `
steps:
  - uses: actions/checkout@${sha}
`;

    const { content, results } = await pinWorkflowContent(input);

    expect(mockResolveRefToSha).not.toHaveBeenCalled();
    expect(content).toContain(`uses: actions/checkout@${sha}`);
    expect(results[0].alreadyPinned).toBe(true);
  });

  it("does not modify local actions (uses: ./path)", async () => {
    const input = `
steps:
  - uses: ./my-local-action
`;

    const { content } = await pinWorkflowContent(input);

    expect(mockResolveRefToSha).not.toHaveBeenCalled();
    expect(content).toBe(input);
  });

  it("does not modify docker image refs", async () => {
    const input = `
steps:
  - uses: docker://alpine:3.14
`;

    const { content } = await pinWorkflowContent(input);

    expect(mockResolveRefToSha).not.toHaveBeenCalled();
    expect(content).toBe(input);
  });

  it("handles actions with sub-paths (e.g., owner/repo/sub@v1)", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "ccc0000000000000000000000000000000000003",
    );

    const input = `
steps:
  - uses: aws-actions/configure-aws-credentials/action@v4
`;

    const { content } = await pinWorkflowContent(input);

    expect(content).toContain(
      "uses: aws-actions/configure-aws-credentials/action@ccc0000000000000000000000000000000000003  # v4",
    );
    // Should resolve using just the repo part
    expect(mockResolveRefToSha).toHaveBeenCalledWith(
      "aws-actions",
      "configure-aws-credentials",
      "v4",
      {},
    );
  });

  it("passes the token to resolveRefToSha", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "ddd0000000000000000000000000000000000004",
    );

    const input = `
steps:
  - uses: actions/checkout@v3
`;

    await pinWorkflowContent(input, { token: "mytoken" });

    expect(mockResolveRefToSha).toHaveBeenCalledWith(
      "actions",
      "checkout",
      "v3",
      { token: "mytoken" },
    );
  });

  it("calls onError and skips the line when resolution fails", async () => {
    mockResolveRefToSha.mockRejectedValue(new Error("Not found"));

    const onError = jest.fn();
    const input = `
steps:
  - uses: actions/checkout@v3
`;

    const { content } = await pinWorkflowContent(input, { onError });

    expect(onError).toHaveBeenCalledWith(
      "actions/checkout",
      "v3",
      expect.any(Error),
    );
    // Line should be unchanged
    expect(content).toContain("uses: actions/checkout@v3");
  });

  it("throws when resolution fails and no onError handler is provided", async () => {
    mockResolveRefToSha.mockRejectedValue(new Error("API error"));

    const input = `
steps:
  - uses: actions/checkout@v3
`;

    await expect(pinWorkflowContent(input)).rejects.toThrow("API error");
  });

  it("preserves existing inline comments when replacing", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "eee0000000000000000000000000000000000005",
    );

    const input = `
steps:
  - uses: actions/checkout@v3 # pinned
`;

    const { content } = await pinWorkflowContent(input);

    // The existing comment is replaced with the new SHA comment
    expect(content).toContain(
      "uses: actions/checkout@eee0000000000000000000000000000000000005  # v3",
    );
  });

  it("preserves overall file formatting and indentation", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "fff0000000000000000000000000000000000006",
    );

    const input = `name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
      - run: echo hello
`;

    const { content } = await pinWorkflowContent(input);

    expect(content).toContain("name: CI");
    expect(content).toContain("runs-on: ubuntu-latest");
    expect(content).toContain("        uses: actions/checkout@fff");
    expect(content).toContain("      - run: echo hello");
  });

  it("handles branch refs (e.g. @main)", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "aaa1111111111111111111111111111111111111",
    );

    const input = `
steps:
  - uses: actions/checkout@main
`;

    const { content } = await pinWorkflowContent(input);

    expect(content).toContain(
      "uses: actions/checkout@aaa1111111111111111111111111111111111111  # main",
    );
  });

  it("handles double-quoted actions", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "111222333444555666777888999000aaabbbccc1",
    );

    const input = `
steps:
  - uses: "actions/checkout@v4"
`;

    const { content, results } = await pinWorkflowContent(input);

    expect(content).toContain(
      'uses: "actions/checkout@111222333444555666777888999000aaabbbccc1"  # v4',
    );
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("actions/checkout");
  });

  it("handles single-quoted actions", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "222333444555666777888999000aaabbbcccddd2",
    );

    const input = `
steps:
  - uses: 'actions/checkout@v4'
`;

    const { content, results } = await pinWorkflowContent(input);

    expect(content).toContain(
      "uses: 'actions/checkout@222333444555666777888999000aaabbbcccddd2'  # v4",
    );
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("actions/checkout");
  });

  it("ignores uses: strings inside multiline run blocks", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "333444555666777888999000aaabbbcccdddeee3",
    );

    const input = `
steps:
  - name: Run script with echo
    run: |
      echo "Example:"
      uses: fake/script@v1
  - name: Real step
    uses: actions/checkout@v4
`;

    const { content, results } = await pinWorkflowContent(input);

    // fake/script should not have been touched
    expect(content).toContain('      uses: fake/script@v1');
    expect(content).toContain(
      "uses: actions/checkout@333444555666777888999000aaabbbcccdddeee3  # v4",
    );
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("actions/checkout");
  });

  it("preserves CRLF line endings", async () => {
    mockResolveRefToSha.mockResolvedValue(
      "444555666777888999000aaabbbcccdddeeefff4",
    );

    const input = "steps:\r\n  - uses: actions/checkout@v4\r\n";
    const { content } = await pinWorkflowContent(input);

    expect(content).toContain("\r\n");
    expect(content).not.toMatch(/[^\r]\n/);
  });
});
