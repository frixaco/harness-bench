#!/usr/bin/env bun

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
hbench

Run the local hbench dashboard server.

Usage:
  hbench [--port <number>]

Options:
  -p, --port <number>   Override server port (default: Bun.serve defaults)
  -h, --help            Show this help message
`);
  process.exit(0);
}

const readPortArg = () => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--port") {
      return args[i + 1];
    }

    if (arg?.startsWith("--port=")) {
      return arg.slice("--port=".length);
    }
  }

  return null;
};

const normalizePort = (value) => {
  if (!value) return null;
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid port: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Port out of range: ${value}`);
  }

  return String(parsed);
};

const port = normalizePort(readPortArg());
if (port) {
  process.env.PORT = port;
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

process.chdir(`${import.meta.dir}/../dist`);

try {
  await import("../dist/index.js");
} catch (error) {
  if (
    error instanceof Error &&
    error.message.includes("Cannot find module '../dist/index.js'")
  ) {
    throw new Error(
      "Missing dist build. Run `bun run build` before starting production mode.",
      { cause: error },
    );
  }

  throw error;
}
