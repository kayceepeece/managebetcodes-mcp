declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode: number;
  stdin: {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
    on(event: "end", listener: () => void): void;
  };
  stdout: {
    write(chunk: string): boolean;
  };
  stderr: {
    write(chunk: string): boolean;
  };
};

declare module "node:crypto" {
  export function randomUUID(): string;
}

declare const Buffer: {
  from(data: ArrayBuffer | Uint8Array): {
    toString(encoding: "base64"): string;
  };
};
