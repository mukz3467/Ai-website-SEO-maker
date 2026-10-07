import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Universal full-stack entry point for ZyvenSEO AI.
 * Handles dual execution environments:
 * 1. tsx runtime ('dev' script / 'tsx server.ts'): directly loads src/server/app.ts
 * 2. Node.js runtime ('node server.ts'): automatically boots with --import tsx
 */
const isTsx =
  Boolean(process.env.TSX_ACTIVE) ||
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  Boolean((process as any)[Symbol.for('tsx')]);

if (!isTsx) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, TSX_ACTIVE: '1' },
    }
  );
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
} else {
  await import('./src/server/app');
}
