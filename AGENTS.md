# AGENTS.md

Instructions and context for AI agents working on **ActionsSHAPinner**.

---

## 1. Project Overview

**ActionsSHAPinner** is a TypeScript-based CLI tool (`sha-pinner`) and npm library (`actionsshapinner`) that pins GitHub Actions `uses:` references to full 40-character commit SHAs for supply chain security, while preserving the human-readable ref as an inline comment:

```yaml
# Before
- uses: actions/checkout@v4

# After
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4
```

### Key Capabilities
- Resolves lightweight and annotated git tags to their underlying commit SHA.
- Resolves git branch names (e.g. `@main`) to their latest commit SHA.
- Leaves already pinned 40-character SHAs, local actions (`./path`), and Docker image actions (`docker://...`) intact.
- Preserves existing YAML file indentation, formatting, and inline comments.

---

## 2. Tech Stack & Environment

- **Runtime**: Node.js >= 20
- **Language**: TypeScript (targeting ES2020, CommonJS module output)
- **CLI Framework**: [Commander](https://github.com/tj/commander.js)
- **HTTP Client**: Native Node `fetch` (no Axios or external HTTP library)
- **Testing**: Jest with `ts-jest`
- **Package Management**: npm

---

## 3. Project Structure

```
├── .github/
│   ├── dependabot.yml       # Dependabot configuration for GitHub Actions & npm
│   └── workflows/
│       └── ci.yml           # GitHub Actions CI workflow (pinned to SHAs)
├── src/
│   ├── github-api.ts        # GitHub REST API client (ref -> SHA resolution)
│   ├── index.ts             # CLI entry point (sha-pinner command)
│   ├── lib.ts               # Programmatic library exports
│   ├── pinner.ts            # Core transformation logic & regex matching
│   └── tests/
│       ├── cli.test.ts        # End-to-end integration tests for CLI
│       ├── github-api.test.ts # Unit tests for GitHub API client
│       └── pinner.test.ts     # Unit tests for workflow transformer
├── dist/                    # Compiled JavaScript and TypeScript declarations
├── package.json             # Package configuration and scripts
├── tsconfig.json            # Base TypeScript configuration
├── tsconfig.build.json      # Build-specific TS configuration (excludes tests)
└── README.md                # User-facing documentation
```

---

## 4. Development Workflow & Commands

Always verify changes by building and running tests:

```bash
# Install dependencies
npm install

# Run the test suite
npm test

# Build TypeScript to dist/
npm run build

# Run CLI from source during development
npm start -- --help

# Run compiled CLI locally
node dist/index.js --help

# Run dry-run test on a workflow file
node dist/index.js --dry-run .github/workflows/ci.yml
```

---

## 5. Architectural & Implementation Notes

### Regex-Based Parsing vs. YAML AST
`src/pinner.ts` uses line-by-line regex matching (`USES_LINE_REGEX`) rather than a full YAML AST parser like `yaml` or `js-yaml`.
- **Reason**: Standard YAML parsers strip comments and reformat YAML structure on serialization. Line-by-line regex preserves original indentation, comments, and spacing.
- **Handling & Precision**:
  - Supports both unquoted (`uses: actions/checkout@v4`) and quoted (`uses: "actions/checkout@v4"` / `uses: 'actions/checkout@v4'`) action references.
  - Automatically detects YAML block scalar headers (`run: |`, `run: >`) and ignores lines inside multiline script blocks.
  - Applies replacements by direct line index rather than repeated string `split/join` to prevent unintended duplicate replacements.

### GitHub API & Authentication
- API calls use GitHub REST endpoints with modern API versioning (`X-GitHub-Api-Version: 2022-11-28`) and `Bearer ${token}` authorization:
  - Tags: `/repos/{owner}/{repo}/git/ref/tags/{ref}`
  - Annotated tag dereferencing: `/repos/{owner}/{repo}/git/tags/{sha}`
  - Branches: `/repos/{owner}/{repo}/git/ref/heads/{ref}`
- Unauthenticated requests are subject to GitHub's rate limit of 60 requests/hour per IP.
- When rate limited, the API client provides actionable error feedback advising the user to supply a `GITHUB_TOKEN`.
- A personal access token can be provided via `-t, --token` or the `GITHUB_TOKEN` environment variable.

### Dependencies Note
The package has zero runtime dependencies other than `commander`. Unused YAML packages have been pruned.

---

## 6. Guidelines for AI Agents

1. **Test Before and After**: Always run `npm test` and `npm run build` to verify clean compilation and passing tests.
2. **Mock Network Calls in Tests**: Never make real network requests in unit tests. Mock `global.fetch` or `resolveRefToSha`.
3. **Preserve Compatibility**: Keep the public API backwards compatible (`pinWorkflowContent`, `resolveRefToSha`, and their TypeScript types in `src/lib.ts`).
4. **Do Not Overwrite Workflows Carelessly**: Workflow files in `.github/workflows/` should remain pinned to commit SHAs with ref comments.
5. **Node.js Standards**: Ensure code remains compatible with Node >= 20. Rely on native built-in APIs (`fetch`, `crypto`, `fs/promises`) where appropriate.

