import * as assert from 'assert';
import { GitProvider } from '../../gitProvider';
import { FileStatus, ChangeType } from '../../types';

suite('GitProvider Test Suite', () => {
  suite('Diff Parsing', () => {
    test('Should parse simple addition', () => {
      const diffOutput = `
diff --git a/file.ts b/file.ts
index 123..456 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
 line 2
+new line 3
 line 3
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].lineNumber, 3);
      assert.strictEqual(changes[0].changeType, ChangeType.Addition);
    });

    test('Should parse simple deletion', () => {
      const diffOutput = `
diff --git a/file.ts b/file.ts
index 123..456 100644
--- a/file.ts
+++ b/file.ts
@@ -1,4 +1,3 @@
 line 1
 line 2
-deleted line
 line 3
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].lineNumber, 3);
      assert.strictEqual(changes[0].changeType, ChangeType.Deletion);
    });

    test('Should parse multiple changes', () => {
      const diffOutput = `
diff --git a/file.ts b/file.ts
index 123..456 100644
--- a/file.ts
+++ b/file.ts
@@ -1,5 +1,6 @@
 line 1
+added line 2
 line 2
 line 3
-deleted line 4
 line 5
+added line 6
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 3);

      // First addition at line 2
      assert.strictEqual(changes[0].lineNumber, 2);
      assert.strictEqual(changes[0].changeType, ChangeType.Addition);

      // Deletion at line 5 (after the addition)
      assert.strictEqual(changes[1].lineNumber, 5);
      assert.strictEqual(changes[1].changeType, ChangeType.Deletion);

      // Second addition
      assert.strictEqual(changes[2].lineNumber, 5);
      assert.strictEqual(changes[2].changeType, ChangeType.Addition);
    });

    test('Should parse multiple hunks', () => {
      const diffOutput = `
diff --git a/file.ts b/file.ts
index 123..456 100644
--- a/file.ts
+++ b/file.ts
@@ -5,3 +5,4 @@
 line 5
 line 6
+added at line 7
@@ -20,3 +21,4 @@
 line 20
 line 21
+added at line 22
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 2);

      assert.strictEqual(changes[0].lineNumber, 7);
      assert.strictEqual(changes[0].changeType, ChangeType.Addition);

      assert.strictEqual(changes[1].lineNumber, 22);
      assert.strictEqual(changes[1].changeType, ChangeType.Addition);
    });

    test('Should handle empty diff', () => {
      const diffOutput = '';

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 0);
    });

    test('Should ignore diff header lines', () => {
      const diffOutput = `
diff --git a/file.ts b/file.ts
index 123..456 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
+added line
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      // Should only have the actual addition, not the --- or +++ header lines
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].changeType, ChangeType.Addition);
    });

    test('Should correctly track line numbers across context lines', () => {
      const diffOutput = `
@@ -10,7 +10,8 @@
 line 10
 line 11
 line 12
+added at 13
 line 13
 line 14
 line 15
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].lineNumber, 13);
    });
  });

  suite('Tree View Sorting', () => {
    test('Should sort files in depth-first tree order', () => {
      const gitProvider = new GitProvider() as any;

      // Create mock ChangedFile objects with different path depths
      const files = [
        { uri: { fsPath: '/repo/src/utils/deep/file.ts' } },
        { uri: { fsPath: '/repo/README.md' } },
        { uri: { fsPath: '/repo/src/App.tsx' } },
        { uri: { fsPath: '/repo/src/components/Button.tsx' } },
        { uri: { fsPath: '/repo/test/App.test.tsx' } },
        { uri: { fsPath: '/repo/src/utils/helpers.ts' } }
      ];

      const sorted = gitProvider.sortFilesTreeViewOrder(files);

      // Expected tree view order (depth-first, directories before files at each level):
      // src/components/Button.tsx (src/components/ directory first)
      // src/utils/deep/file.ts (src/utils/deep/ directory)
      // src/utils/helpers.ts (src/utils/ files after subdirs)
      // src/App.tsx (src/ files after subdirs)
      // test/App.test.tsx (test/ directory)
      // README.md (root files last)

      assert.ok(sorted[0].uri.fsPath.includes('src/components/Button.tsx'));
      assert.ok(sorted[1].uri.fsPath.includes('src/utils/deep/file.ts'));
      assert.ok(sorted[2].uri.fsPath.includes('src/utils/helpers.ts'));
      assert.ok(sorted[3].uri.fsPath.includes('src/App.tsx'));
      assert.ok(sorted[4].uri.fsPath.includes('test/App.test.tsx'));
      assert.ok(sorted[5].uri.fsPath.includes('README.md'));
    });

    test('Should sort files alphabetically within same directory', () => {
      const gitProvider = new GitProvider() as any;

      const files = [
        { uri: { fsPath: '/repo/zebra.ts' } },
        { uri: { fsPath: '/repo/apple.ts' } },
        { uri: { fsPath: '/repo/middle.ts' } }
      ];

      const sorted = gitProvider.sortFilesTreeViewOrder(files);

      assert.ok(sorted[0].uri.fsPath.includes('apple.ts'));
      assert.ok(sorted[1].uri.fsPath.includes('middle.ts'));
      assert.ok(sorted[2].uri.fsPath.includes('zebra.ts'));
    });

    test('Should handle numeric sorting correctly', () => {
      const gitProvider = new GitProvider() as any;

      const files = [
        { uri: { fsPath: '/repo/file10.ts' } },
        { uri: { fsPath: '/repo/file2.ts' } },
        { uri: { fsPath: '/repo/file1.ts' } }
      ];

      const sorted = gitProvider.sortFilesTreeViewOrder(files);

      // Numeric sorting: file1 < file2 < file10 (not file1 < file10 < file2)
      assert.ok(sorted[0].uri.fsPath.includes('file1.ts'));
      assert.ok(sorted[1].uri.fsPath.includes('file2.ts'));
      assert.ok(sorted[2].uri.fsPath.includes('file10.ts'));
    });

    test('Should place subdirectories before files with same prefix', () => {
      const gitProvider = new GitProvider() as any;

      const files = [
        { uri: { fsPath: '/repo/test.ts' } },
        { uri: { fsPath: '/repo/test/utils/helper.ts' } }
      ];

      const sorted = gitProvider.sortFilesTreeViewOrder(files);

      // test/ directory should come before test.ts file
      assert.ok(sorted[0].uri.fsPath.includes('test/utils/helper.ts'));
      assert.ok(sorted[1].uri.fsPath.includes('test.ts'));
    });

    test('Should handle complex nested structure (user reported case)', () => {
      const gitProvider = new GitProvider() as any;

      // User's actual structure:
      // scripts/index/index.ts
      // scripts/index/main.ts
      // scripts/rendering/renderables/shapRenderables/SquareRenderable.ts
      // scripts/rendering/renderables/shapRenderables/CircleRenderable.ts
      // scripts/rendering/renderables/Renderable.ts
      // scripts/rendering/Buffers.ts

      const files = [
        { uri: { fsPath: '/repo/scripts/rendering/Buffers.ts' } },
        { uri: { fsPath: '/repo/scripts/index/index.ts' } },
        { uri: { fsPath: '/repo/scripts/rendering/renderables/Renderable.ts' } },
        { uri: { fsPath: '/repo/scripts/index/main.ts' } },
        { uri: { fsPath: '/repo/scripts/rendering/renderables/shapRenderables/SquareRenderable.ts' } },
        { uri: { fsPath: '/repo/scripts/rendering/renderables/shapRenderables/CircleRenderable.ts' } }
      ];

      const sorted = gitProvider.sortFilesTreeViewOrder(files);

      // Expected order: directories before files at each level
      // 1. scripts/index/index.ts (index/ comes before rendering/ alphabetically)
      // 2. scripts/index/main.ts
      // 3. scripts/rendering/renderables/shapRenderables/CircleRenderable.ts (deepest dir first)
      // 4. scripts/rendering/renderables/shapRenderables/SquareRenderable.ts
      // 5. scripts/rendering/renderables/Renderable.ts (files after subdirs)
      // 6. scripts/rendering/Buffers.ts (files after subdirs)

      assert.ok(sorted[0].uri.fsPath.includes('scripts/index/index.ts'));
      assert.ok(sorted[1].uri.fsPath.includes('scripts/index/main.ts'));
      assert.ok(sorted[2].uri.fsPath.includes('shapRenderables/CircleRenderable.ts'));
      assert.ok(sorted[3].uri.fsPath.includes('shapRenderables/SquareRenderable.ts'));
      assert.ok(sorted[4].uri.fsPath.includes('renderables/Renderable.ts'));
      assert.ok(sorted[5].uri.fsPath.includes('rendering/Buffers.ts'));
    });
  });

  suite('Status Mapping', () => {
    test('Should map INDEX_ADDED to Added', () => {
      const gitProvider = new GitProvider();
      const status = (gitProvider as any).mapStatus(1);
      assert.strictEqual(status, FileStatus.Added);
    });

    test('Should map MODIFIED to Modified', () => {
      const gitProvider = new GitProvider();
      const status = (gitProvider as any).mapStatus(5);
      assert.strictEqual(status, FileStatus.Modified);
    });

    test('Should map DELETED to Deleted', () => {
      const gitProvider = new GitProvider();
      const status = (gitProvider as any).mapStatus(6);
      assert.strictEqual(status, FileStatus.Deleted);
    });

    test('Should map UNTRACKED to Added', () => {
      const gitProvider = new GitProvider();
      const status = (gitProvider as any).mapStatus(7);
      assert.strictEqual(status, FileStatus.Added);
    });

    test('Should map RENAMED to Renamed', () => {
      const gitProvider = new GitProvider();
      const status = (gitProvider as any).mapStatus(3);
      assert.strictEqual(status, FileStatus.Renamed);
    });
  });

  suite('Line Number Tracking', () => {
    test('Should correctly increment line numbers for additions', () => {
      const diffOutput = `
@@ -1,3 +1,5 @@
 line 1
+added line 2
+added line 3
 line 2
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].lineNumber, 2);
      assert.strictEqual(changes[1].lineNumber, 3);
    });

    test('Should not increment line numbers for deletions', () => {
      const diffOutput = `
@@ -1,5 +1,3 @@
 line 1
-deleted line 2
-deleted line 3
 line 4
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 2);
      // Both deletions at the same line number since we don't move forward for deletions
      assert.strictEqual(changes[0].lineNumber, 2);
      assert.strictEqual(changes[1].lineNumber, 2);
    });

    test('Should handle mix of additions, deletions, and context', () => {
      const diffOutput = `
@@ -10,6 +10,7 @@
 line 10
 line 11
+added at 12
 line 12
-deleted at 13
 line 13
 line 14
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 2);

      // Addition at line 12
      assert.strictEqual(changes[0].lineNumber, 12);
      assert.strictEqual(changes[0].changeType, ChangeType.Addition);

      // Deletion at line 13 (after addition moved us forward)
      assert.strictEqual(changes[1].lineNumber, 13);
      assert.strictEqual(changes[1].changeType, ChangeType.Deletion);
    });
  });

  suite('Hunk Header Parsing', () => {
    test('Should parse simple hunk header', () => {
      const diffOutput = `
@@ -10,5 +10,7 @@
+added line
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      // Should start at line 10
      assert.strictEqual(changes[0].lineNumber, 10);
    });

    test('Should parse hunk header without count', () => {
      const diffOutput = `
@@ -10 +10,2 @@
+added line 1
+added line 2
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].lineNumber, 10);
      assert.strictEqual(changes[1].lineNumber, 11);
    });

    test('Should handle multiple hunk headers correctly', () => {
      const diffOutput = `
@@ -5,2 +5,3 @@
+added at 5
@@ -100,2 +101,3 @@
+added at 101
`;

      const gitProvider = new GitProvider();
      const changes = (gitProvider as any).parseDiff(diffOutput);

      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].lineNumber, 5);
      assert.strictEqual(changes[1].lineNumber, 101);
    });
  });
});
