/** Where a gate writes: stdout for what it found, stderr for failures. */
export interface GateOutput {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/** The process's own streams, for a gate started as a command. */
export const processOutput: GateOutput = {
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
};
