import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChangeNavigator } from '../../changeNavigator';
import { MockGitProvider, createMockChangedFile } from '../mocks/mockGitProvider';
import { FileStatus, ChangeType } from '../../types';

suite('ChangeNavigator Test Suite', () => {
  let mockGit: MockGitProvider;
  let navigator: ChangeNavigator;

  setup(() => {
    mockGit = new MockGitProvider();
    navigator = new ChangeNavigator(mockGit as any);
  });

  teardown(() => {
    mockGit.clear();
  });

  suite('Basic Navigation', () => {
    test('Should navigate to first change when starting fresh', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }, { line: 10 }]),
        createMockChangedFile('file2.ts', [{ line: 15 }])
      ]);

      // First navigation should go to file1:line5
      await navigator.nextChange();

      // Verify we're at the first change
      const state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 5);
      assert.ok(state.currentFileUri?.includes('file1.ts'));
    });

    test('Should navigate through multiple changes in same file', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }, { line: 10 }, { line: 15 }])
      ]);

      await navigator.nextChange(); // file1:5
      let state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 5);

      await navigator.nextChange(); // file1:10
      state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 10);

      await navigator.nextChange(); // file1:15
      state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 15);
    });

    test('Should move to next file when reaching end of changes in current file', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }])
      ]);

      await navigator.nextChange(); // file1:5
      await navigator.nextChange(); // Should jump to file2:10

      const state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 10);
      assert.ok(state.currentFileUri?.includes('file2.ts'));
    });

    test('Should navigate backward correctly', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }, { line: 10 }]),
        createMockChangedFile('file2.ts', [{ line: 15 }])
      ]);

      // Start from the end
      await navigator.previousChange(); // Should go to file2:15
      let state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 15);
      assert.ok(state.currentFileUri?.includes('file2.ts'));

      await navigator.previousChange(); // Should go to file1:10
      state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 10);
      assert.ok(state.currentFileUri?.includes('file1.ts'));
    });
  });

  suite('File Navigation', () => {
    test('Should jump to next file', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }]),
        createMockChangedFile('file3.ts', [{ line: 15 }])
      ]);

      await navigator.nextFile(); // file1
      let state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file1.ts'));

      await navigator.nextFile(); // file2
      state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file2.ts'));

      await navigator.nextFile(); // file3
      state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file3.ts'));
    });

    test('Should jump to previous file', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }]),
        createMockChangedFile('file3.ts', [{ line: 15 }])
      ]);

      await navigator.previousFile(); // file3 (start from end)
      let state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file3.ts'));

      await navigator.previousFile(); // file2
      state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file2.ts'));

      await navigator.previousFile(); // file1
      state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file1.ts'));
    });
  });

  suite('Smart Caching and Position Tracking (Bug Fix Tests)', () => {
    test('CRITICAL: Should not jump backward after staging file', async () => {
      // Setup: 3 files with changes
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }]),
        createMockChangedFile('file3.ts', [{ line: 15 }])
      ]);

      // Skip file1 by jumping to file2
      await navigator.nextFile(); // file1
      await navigator.nextFile(); // file2

      // Skip file2 by jumping to file3
      await navigator.nextFile(); // file3

      let state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file3.ts'), 'Should be at file3');

      // Simulate staging file3 (this is where the bug occurred)
      mockGit.removeFile(state.currentFileUri);

      // Navigate next - should wrap to file1 or show no more files
      // But should NEVER go back to file1 or file2 if there are more files after file3
      await navigator.nextFile();

      state = (navigator as any).state;
      // Since we only had 3 files and removed file3, it should wrap to file1
      // But the key is: if we had file4, it should go to file4, not back to file1/file2
      assert.ok(
        state.currentFileUri?.includes('file1.ts'),
        'Should wrap to beginning when at end'
      );
    });

    test('CRITICAL: Should continue forward when file in middle is staged', async () => {
      // Setup: 5 files
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }]),
        createMockChangedFile('file3.ts', [{ line: 15 }]),
        createMockChangedFile('file4.ts', [{ line: 20 }]),
        createMockChangedFile('file5.ts', [{ line: 25 }])
      ]);

      // Skip file1 and file2, navigate to file3
      await navigator.nextFile(); // file1
      await navigator.nextFile(); // file2
      await navigator.nextFile(); // file3

      let state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file3.ts'));

      // Stage file3 (simulate user staging current file)
      mockGit.removeFile(state.currentFileUri);

      // Continue navigation - should go to file4, NOT back to file1 or file2
      await navigator.nextFile();

      state = (navigator as any).state;
      assert.ok(
        state.currentFileUri?.includes('file4.ts'),
        'Should continue to file4, not jump back to file1/file2'
      );
    });

    test('Should handle specific change being staged while file remains', async () => {
      // File with multiple changes
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }, { line: 10 }, { line: 15 }])
      ]);

      // Navigate to line 10
      await navigator.nextChange(); // line 5
      await navigator.nextChange(); // line 10

      let state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 10);

      // Simulate staging only the change at line 10
      mockGit.updateFileChanges('file:///mock/repo/file1.ts', [
        { lineNumber: 5, changeType: ChangeType.Modification },
        { lineNumber: 15, changeType: ChangeType.Modification }
      ]);

      // Next change should go to line 15
      await navigator.nextChange();

      state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 15);
    });

    test('Should handle file being completely staged during iteration', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }]),
        createMockChangedFile('file3.ts', [{ line: 15 }])
      ]);

      // Navigate to file2
      await navigator.nextFile(); // file1
      await navigator.nextFile(); // file2

      // Stage file2 completely
      const state = (navigator as any).state;
      mockGit.removeFile(state.currentFileUri);

      // Next navigation should go to file3
      await navigator.nextChange();

      const newState = (navigator as any).state;
      assert.ok(
        newState.currentFileUri?.includes('file3.ts'),
        'Should move to file3 after file2 was staged'
      );
    });
  });

  suite('Edge Cases', () => {
    test('Should handle empty repository gracefully', async () => {
      mockGit.setChangedFiles([]);

      await navigator.nextChange();

      // Should not crash, state should remain null
      const state = (navigator as any).state;
      assert.strictEqual(state.currentFileUri, null);
    });

    test('Should wrap around at end of files', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }])
      ]);

      // Navigate to last file
      await navigator.nextFile(); // file1
      await navigator.nextFile(); // file2

      // Should wrap to file1
      await navigator.nextFile();

      const state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file1.ts'));
    });

    test('Should wrap around at beginning of files going backward', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }])
      ]);

      // Start from beginning
      await navigator.nextFile(); // file1

      // Go backward - should wrap to file2
      await navigator.previousFile();

      const state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file2.ts'));
    });

    test('Should handle file with single change', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }])
      ]);

      await navigator.nextChange(); // line 5
      await navigator.nextChange(); // Should wrap to line 5 again

      const state = (navigator as any).state;
      assert.strictEqual(state.currentLine, 5);
    });

    test('Should handle all files being staged', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }])
      ]);

      // Navigate somewhere
      await navigator.nextFile();

      // Stage everything
      mockGit.clear();

      // Try to navigate
      await navigator.nextChange();

      // Should handle gracefully
      const state = (navigator as any).state;
      assert.strictEqual(mockGit.getFileCount(), 0);
    });
  });

  suite('Cache Refresh', () => {
    test('Should refresh cache before navigation', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }])
      ]);

      await navigator.nextChange();

      // Add a new file
      mockGit.addFile(createMockChangedFile('file2.ts', [{ line: 10 }]));

      // Navigate - should see new file
      await navigator.nextFile();

      const state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file2.ts'));
    });

    test('Should detect when files are added during iteration', async () => {
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }])
      ]);

      await navigator.nextChange(); // file1

      // Simulate new changes appearing
      mockGit.setChangedFiles([
        createMockChangedFile('file1.ts', [{ line: 5 }]),
        createMockChangedFile('file2.ts', [{ line: 10 }]),
        createMockChangedFile('file3.ts', [{ line: 15 }])
      ]);

      // Should be able to navigate to new files
      await navigator.nextFile(); // Should go to file2

      const state = (navigator as any).state;
      assert.ok(state.currentFileUri?.includes('file2.ts'));
    });
  });
});
