import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChangeNavigator } from '../../changeNavigator';
import { MockGitProvider, createMockChangedFile } from '../mocks/mockGitProvider';
import { ChangeType } from '../../types';

/**
 * Integration tests that simulate real-world usage scenarios
 */
suite('Integration Test Suite', () => {
  let mockGit: MockGitProvider;
  let navigator: ChangeNavigator;

  setup(() => {
    mockGit = new MockGitProvider();
    navigator = new ChangeNavigator(mockGit as any);
  });

  teardown(() => {
    mockGit.clear();
  });

  test('Real-world scenario: Review and stage files progressively', async () => {
    // Setup: Working on a feature with 5 changed files
    mockGit.setChangedFiles([
      createMockChangedFile('src/types.ts', [{ line: 10 }, { line: 25 }]),
      createMockChangedFile('src/gitProvider.ts', [{ line: 50 }, { line: 75 }, { line: 100 }]),
      createMockChangedFile('src/changeNavigator.ts', [{ line: 150 }, { line: 200 }]),
      createMockChangedFile('src/extension.ts', [{ line: 30 }]),
      createMockChangedFile('README.md', [{ line: 5 }, { line: 10 }, { line: 15 }])
    ]);

    // User reviews types.ts
    await navigator.nextChange(); // types.ts:10
    await navigator.nextChange(); // types.ts:25

    // User is happy with types.ts, stages it
    mockGit.removeFile('file:///mock/repo/src/types.ts');

    // Continue to next file - should go to gitProvider.ts, NOT start over at types.ts
    await navigator.nextChange();

    let state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('gitProvider.ts'), 'Should continue to gitProvider.ts');
    assert.strictEqual(state.currentLine, 50);

    // Review all changes in gitProvider.ts
    await navigator.nextChange(); // line 75
    await navigator.nextChange(); // line 100

    // Stage gitProvider.ts too
    mockGit.removeFile(state.currentFileUri);

    // Continue - should go to changeNavigator.ts
    await navigator.nextChange();

    state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('changeNavigator.ts'), 'Should continue to changeNavigator.ts');
  });

  test('Real-world scenario: Skip unimportant files', async () => {
    mockGit.setChangedFiles([
      createMockChangedFile('important.ts', [{ line: 10 }]),
      createMockChangedFile('config.json', [{ line: 5 }]),
      createMockChangedFile('package-lock.json', [{ line: 100 }]),
      createMockChangedFile('critical.ts', [{ line: 50 }])
    ]);

    // Start reviewing
    await navigator.nextFile(); // important.ts
    await navigator.nextChange();

    let state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('important.ts'));

    // Skip to critical.ts using nextFile
    await navigator.nextFile(); // config.json
    await navigator.nextFile(); // package-lock.json
    await navigator.nextFile(); // critical.ts

    state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('critical.ts'));
    assert.strictEqual(state.currentLine, 50);

    // Stage critical.ts
    mockGit.removeFile(state.currentFileUri);

    // Continue - should go to important.ts (wrap around), NOT to skipped files
    await navigator.nextFile();

    state = (navigator as any).state;
    // Should wrap to important.ts since we're at the end
    assert.ok(state.currentFileUri?.includes('important.ts'));
  });

  test('Real-world scenario: Changes appear during review', async () => {
    // Initial state: 2 files
    mockGit.setChangedFiles([
      createMockChangedFile('file1.ts', [{ line: 10 }]),
      createMockChangedFile('file2.ts', [{ line: 20 }])
    ]);

    // Start reviewing
    await navigator.nextFile(); // file1

    // Meanwhile, new changes appear (e.g., auto-save, another branch merge)
    mockGit.setChangedFiles([
      createMockChangedFile('file1.ts', [{ line: 10 }]),
      createMockChangedFile('file1.5.ts', [{ line: 15 }]), // New file!
      createMockChangedFile('file2.ts', [{ line: 20 }])
    ]);

    // Continue navigation - should see the new file
    await navigator.nextFile(); // Should go to file1.5.ts

    const state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('file1.5.ts'), 'Should detect new file');
  });

  test('Real-world scenario: Partial staging of a file', async () => {
    // File with many changes
    mockGit.setChangedFiles([
      createMockChangedFile('bigFile.ts', [
        { line: 10 },
        { line: 50 },
        { line: 100 },
        { line: 150 },
        { line: 200 }
      ])
    ]);

    // Review first few changes
    await navigator.nextChange(); // line 10
    await navigator.nextChange(); // line 50
    await navigator.nextChange(); // line 100

    let state = (navigator as any).state;
    assert.strictEqual(state.currentLine, 100);

    // User stages only lines 10-100 (partial staging)
    // File still has changes at 150 and 200
    mockGit.updateFileChanges('file:///mock/repo/bigFile.ts', [
      { lineNumber: 150, changeType: ChangeType.Modification },
      { lineNumber: 200, changeType: ChangeType.Modification }
    ]);

    // Continue - should go to line 150
    await navigator.nextChange();

    state = (navigator as any).state;
    assert.strictEqual(state.currentLine, 150, 'Should continue to remaining changes in same file');
  });

  test('Real-world scenario: Complex navigation with staging', async () => {
    mockGit.setChangedFiles([
      createMockChangedFile('a.ts', [{ line: 1 }]),
      createMockChangedFile('b.ts', [{ line: 2 }]),
      createMockChangedFile('c.ts', [{ line: 3 }]),
      createMockChangedFile('d.ts', [{ line: 4 }]),
      createMockChangedFile('e.ts', [{ line: 5 }])
    ]);

    // Navigate: a -> b -> c
    await navigator.nextFile(); // a
    await navigator.nextFile(); // b
    await navigator.nextFile(); // c

    let state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('c.ts'));

    // Stage c
    mockGit.removeFile(state.currentFileUri);

    // Continue -> should go to d
    await navigator.nextFile();
    state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('d.ts'));

    // Go back
    await navigator.previousFile();
    state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('b.ts'), 'Should go back to b (c is staged)');

    // Stage b too
    mockGit.removeFile(state.currentFileUri);

    // Forward again -> should skip staged files and go to d
    await navigator.nextFile();
    state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('d.ts'), 'Should skip staged files');
  });

  test('Real-world scenario: All files staged except one', async () => {
    mockGit.setChangedFiles([
      createMockChangedFile('file1.ts', [{ line: 10 }]),
      createMockChangedFile('file2.ts', [{ line: 20 }]),
      createMockChangedFile('file3.ts', [{ line: 30 }])
    ]);

    // Navigate through files
    await navigator.nextFile(); // file1
    await navigator.nextFile(); // file2

    // Stage file1 and file3, leave file2
    mockGit.setChangedFiles([
      createMockChangedFile('file2.ts', [{ line: 20 }])
    ]);

    // Navigate - should stay on file2 or wrap to it
    await navigator.nextFile();

    const state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('file2.ts'), 'Should find the remaining file');
  });

  test('Real-world scenario: Fast iteration with keyboard shortcuts', async () => {
    mockGit.setChangedFiles([
      createMockChangedFile('file1.ts', [{ line: 10 }, { line: 20 }, { line: 30 }]),
      createMockChangedFile('file2.ts', [{ line: 40 }, { line: 50 }]),
      createMockChangedFile('file3.ts', [{ line: 60 }])
    ]);

    // Simulate rapid keyboard navigation
    await navigator.nextChange(); // file1:10
    await navigator.nextChange(); // file1:20
    await navigator.nextChange(); // file1:30
    await navigator.nextChange(); // file2:40 (crossed file boundary)

    let state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('file2.ts'));
    assert.strictEqual(state.currentLine, 40);

    // Jump to next file
    await navigator.nextFile(); // file3:60

    state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('file3.ts'));
    assert.strictEqual(state.currentLine, 60);

    // Go back rapidly
    await navigator.previousChange(); // Should go back to file2:50
    state = (navigator as any).state;
    assert.ok(state.currentFileUri?.includes('file2.ts'));
    assert.strictEqual(state.currentLine, 50);
  });

  test('Real-world scenario: Empty repository edge case', async () => {
    mockGit.setChangedFiles([]);

    // Try to navigate in empty repo
    await navigator.nextChange();
    await navigator.previousChange();
    await navigator.nextFile();
    await navigator.previousFile();

    // Should not crash
    const state = (navigator as any).state;
    assert.strictEqual(state.currentFileUri, null);
    assert.strictEqual(state.changedFiles.length, 0);
  });
});
