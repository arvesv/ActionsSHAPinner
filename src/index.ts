#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { pinWorkflowContent } from "./pinner";

const program = new Command();

program
  .name("sha-pinner")
  .description(
    "Pin GitHub Actions `uses:` references to their full commit SHA for improved security.",
  )
  .version("1.0.0")
  .argument("<files...>", "GitHub Actions workflow YAML file(s) to pin")
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
  .action(async (files: string[], opts: { token?: string; dryRun: boolean; failOnError: boolean }) => {
    const token = opts.token ?? process.env["GITHUB_TOKEN"];

    let hasError = false;

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
                  hasError = true;
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

    if (hasError) {
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
