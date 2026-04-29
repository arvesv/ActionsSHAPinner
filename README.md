# ActionsSHAPinner

A publishable npm package that provides both a CLI and a small library for pinning GitHub Actions `uses:` references to full commit SHAs.

Inspired by [this tweet](https://x.com/acolombiadev/status/2038990002609078399).

## Why pin to a SHA?

Tags in GitHub Actions (like `@v3`) are mutable — a maintainer (or attacker) can move them to a different commit. Pinning to a full commit SHA ensures you always run exactly the code you reviewed.

**Before:**
```yaml
- uses: actions/checkout@v3
```

**After:**
```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v3
```

## Requirements

- Node.js 20 or newer

## Installation

```bash
npm install -g actionsshapinner
```

Or run directly with `npx`:

```bash
npx actionsshapinner <workflow-file>
```

Or add it as a dependency:

```bash
npm install actionsshapinner
```

## Usage

```
sha-pinner [options] <files...>

Arguments:
  files                GitHub Actions workflow YAML file(s) to pin

Options:
  -V, --version        output the version number
  -t, --token <token>  GitHub personal access token (or set GITHUB_TOKEN env var)
  --dry-run            Print the updated content to stdout instead of writing files
  --no-fail-on-error   Skip actions that cannot be resolved instead of failing
  -h, --help           display help for command
```

### Examples

Pin all actions in a single workflow file:

```bash
sha-pinner .github/workflows/ci.yml
```

Pin all workflows in a directory (dry run):

```bash
sha-pinner --dry-run .github/workflows/*.yml
```

Use a GitHub token to avoid rate limiting:

```bash
sha-pinner --token $GITHUB_TOKEN .github/workflows/ci.yml
# or
GITHUB_TOKEN=<token> sha-pinner .github/workflows/ci.yml
```

## Library usage

```ts
import { pinWorkflowContent } from "actionsshapinner";

const result = await pinWorkflowContent(`
steps:
  - uses: actions/checkout@v4
`);

console.log(result.content);
```

## Behaviour

- **Remote actions** (`uses: owner/repo@ref`) are pinned to their commit SHA. The original ref is preserved as an inline comment.
- **Local actions** (`uses: ./path/to/action`) are left unchanged.
- **Docker image refs** (`uses: docker://image:tag`) are left unchanged.
- **Already-pinned actions** (40-char hex SHA) are left unchanged.
- Both lightweight and annotated tags are handled correctly.
- Branch refs (e.g. `@main`) are resolved to their current HEAD SHA.

## Development

```bash
npm install
npm run build   # compile TypeScript
npm test        # run tests
```

## Publishing

```bash
npm publish
```

The published package contains only `dist`, `README.md`, and `LICENSE`.
