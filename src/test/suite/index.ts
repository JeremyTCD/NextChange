import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000
  });

  const testsRoot = path.resolve(__dirname, '..');

  try {
    // Find all test files recursively
    const files = findTestFiles(testsRoot);

    // Add files to the test suite
    files.forEach((f: string) => mocha.addFile(f));

    // Run the mocha test
    return new Promise<void>((resolve, reject) => {
      try {
        mocha.run((failures: number) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  } catch (err) {
    console.error('Failed to find test files:', err);
    throw err;
  }
}

function findTestFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}
