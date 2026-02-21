import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const svgPath = resolve(root, 'src-tauri', 'logo.svg');

async function assertExists(path) {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`File not found: ${path}`);
  }
}

function runTauriIcon(inputPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const command = process.platform === 'win32'
      ? `npx tauri icon "${inputPath}"`
      : `npx tauri icon '${inputPath}'`;
    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (err) => rejectPromise(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`tauri icon failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  await assertExists(svgPath);
  await runTauriIcon(svgPath);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
