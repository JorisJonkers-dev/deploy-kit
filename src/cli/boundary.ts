// The one file that touches the process (docs/architecture.md#the-process-boundary):
// it performs what the CLI decided, and decides nothing.
import type { Outcome } from "./main.ts";

export function perform({ code, stdout, stderr }: Outcome): void {
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
