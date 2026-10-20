#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { pinWorkflowContent } from "./pinner";
import { formatVersionInfo, getVersionInfo } from "./version";

const program = new Command();
const versionInfo = getVersionInfo();

program
  .name("sha-pinner")
  .description(
    "Pin GitHub Actions `uses:` references to their full commit SHA for improved security.",
  )
  .version(versionInfo.version, "-V, --version", "output the version number")
  .option(
    "-v, --version-details",
    "display version details and repository links",
  )
  .on("option:version-details", () => {
    console.log(formatVersionInfo());
    process.exit(0);
  })
  .argument(
    "<files...>",
    "GitHub Actions workflow YAML file(s) to pin (or 'version' to display version details)",
  )
  .option(
    "-t, --token <token>",
    "GitHub personal access token (or set GITHUB_TOKEN env var)",
  )
  .option(
    "--dry-run",
    "Print the updated content to stdout instead of writing files",
    false,
  )
  .option("--no-fail-on-error", "Skip actions that cannot be resolved instead of failing")
  .action(
    async (
      files: string[],
      opts: {
        token?: string;
        dryRun: boolean;
        failOnError: boolean;
        versionDetails?: boolean;
      },
    ) => {
      if (
        opts.versionDetails ||
        (files.length === 1 && files[0] === "version")
      ) {
        console.log(formatVersionInfo());
        return;
      }

      const token = opts.token ?? process.env["GITHUB_TOKEN"];

    for (const file of files) {
      const filePath = path.resolve(file);

      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const originalContent = fs.readFileSync(filePath, "utf-8");

      try {
        const { content, results } = await pinWorkflowContent(
          originalContent,
          {
            token,
            onError: opts.failOnError
              ? undefined
              : (action, ref, err) => {
                  console.warn(
                    `  Warning: Could not resolve ${action}@${ref}: ${err.message}`,
                  );
                },
          },
        );

        if (opts.dryRun) {
          console.log(`--- ${file} ---`);
          console.log(content);
        } else {
          fs.writeFileSync(filePath, content, "utf-8");
          console.log(`Pinned: ${file}`);
        }

        for (const r of results) {
          if (r.alreadyPinned) {
            console.log(`  ${r.action}@${r.ref} – already pinned`);
          } else if (r.sha) {
            console.log(`  ${r.action}@${r.ref} → ${r.sha}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error processing ${file}: ${message}`);
        process.exit(1);
      }
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
