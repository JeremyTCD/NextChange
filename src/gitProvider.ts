import * as vscode from 'vscode';
import * as cp from 'child_process';
import { promisify } from 'util';
import { ChangedFile, FileStatus, Change, ChangeType } from './types';

const exec = promisify(cp.exec);

/**
 * Git provider that interfaces with VSCode's Git extension
 */
export class GitProvider {
  private gitExtension: any;
  private git: any;

  constructor() {
    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) {
      throw new Error('Git extension not found');
    }

    this.gitExtension = extension.exports;
    const gitApi = this.gitExtension.getAPI(1);
    this.git = gitApi;
  }

  /**
   * Get the current Git repository
   */
  private getRepository() {
    if (this.git.repositories.length === 0) {
      return null;
    }
    return this.git.repositories[0];
  }

  /**
   * Get all changed files (ONLY unstaged/working tree changes)
   */
  async getChangedFiles(): Promise<ChangedFile[]> {
    const repo = this.getRepository();
    if (!repo) {
      return [];
    }

    // ONLY get working tree changes (unstaged) - NOT staged files
    const workingTreeChanges = repo.state.workingTreeChanges;

    if (workingTreeChanges.length === 0) {
      return [];
    }

    try {
      const repoPath = repo.rootUri.fsPath;

      // Get diff for ALL files in ONE git command for maximum performance
      const { stdout } = await exec('git diff', { cwd: repoPath });

      // Parse the unified diff to extract changes per file
      const diffsByFile = this.parseUnifiedDiff(stdout);

      // Build changed files list
      const changedFiles: ChangedFile[] = [];

      for (const change of workingTreeChanges) {
        const status = this.mapStatus(change.status);
        const relativePath = change.uri.fsPath
          .replace(repoPath + '/', '')
          .replace(/\\/g, '/');

        // Get changes for this file from the unified diff
        const changes = diffsByFile.get(relativePath) || [];

        // Always include ALL files from workingTreeChanges to maintain tree order
        // If we don't have parsed changes, provide a default change at line 1
        changedFiles.push({
          uri: change.uri,
          status,
          changes: changes.length > 0 ? changes : [{
            lineNumber: 1,
            changeType: ChangeType.Modification
          }]
        });
      }

      // Sort files to match Source Control panel's tree view order
      // Tree view uses depth-first traversal with alphabetical sorting at each level
      return this.sortFilesTreeViewOrder(changedFiles);
    } catch (error) {
      console.error('Failed to get changed files:', error);
      return [];
    }
  }

  /**
   * Parse single-file diff output (for testing/backwards compatibility)
   * Returns one Change object per hunk, not per line
   */
  parseDiff(diffOutput: string): Change[] {
    const changes: Change[] = [];
    if (!diffOutput || diffOutput.trim() === '') {
      return changes;
    }

    const lines = diffOutput.split('\n');

    for (const line of lines) {
      // Parse hunk header: @@ -10,5 +10,7 @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        const hunkStartLine = parseInt(hunkMatch[1], 10);

        // Create a single Change object for this entire hunk
        changes.push({
          lineNumber: hunkStartLine,
          changeType: ChangeType.Modification
        });
      }
    }

    return changes;
  }

  /**
   * Parse unified diff output into a map of file paths to changes (hunks)
   * Each "change" represents a hunk (continuous block of changes), not individual lines
   */
  private parseUnifiedDiff(diffOutput: string): Map<string, Change[]> {
    const result = new Map<string, Change[]>();

    if (!diffOutput || diffOutput.trim() === '') {
      return result;
    }

    const lines = diffOutput.split('\n');
    let currentFile: string | null = null;
    let currentChanges: Change[] = [];
    let inHunk = false;
    let hunkStartLine = 0;

    for (const line of lines) {
      // Check for file header: diff --git a/path b/path
      const fileMatch = line.match(/^diff --git a\/(.*) b\//);
      if (fileMatch) {
        // Save previous file's changes
        if (currentFile && currentChanges.length > 0) {
          result.set(currentFile, currentChanges);
        }

        // Start new file
        currentFile = fileMatch[1];
        currentChanges = [];
        inHunk = false;
        continue;
      }

      // Parse hunk header: @@ -10,5 +10,7 @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        hunkStartLine = parseInt(hunkMatch[1], 10);
        inHunk = true;

        // Create a single Change object for this entire hunk
        // Use Modification as a general type since hunks can contain additions, deletions, or both
        currentChanges.push({
          lineNumber: hunkStartLine,
          changeType: ChangeType.Modification
        });
        continue;
      }

      // Track when we exit a hunk (encounter a non-hunk line after being in a hunk)
      if (inHunk && !line.startsWith('+') && !line.startsWith('-') && !line.startsWith(' ')) {
        inHunk = false;
      }
    }

    // Save last file's changes
    if (currentFile && currentChanges.length > 0) {
      result.set(currentFile, currentChanges);
    }

    return result;
  }

  /**
   * Sort files to match VSCode's Source Control tree view order
   * Tree view uses depth-first traversal where:
   * - At each directory level, subdirectories come BEFORE files
   * - Both subdirectories and files are sorted alphabetically within their group
   */
  private sortFilesTreeViewOrder(files: ChangedFile[]): ChangedFile[] {
    return files.sort((a, b) => {
      const pathA = a.uri.fsPath;
      const pathB = b.uri.fsPath;

      // Split paths into segments for comparison
      const segmentsA = pathA.split(/[/\\]/).filter(s => s.length > 0);
      const segmentsB = pathB.split(/[/\\]/).filter(s => s.length > 0);

      // Compare segment by segment (depth-first tree order)
      const minLength = Math.min(segmentsA.length, segmentsB.length);

      for (let i = 0; i < minLength; i++) {
        // Determine if each segment represents a file or directory
        // Last segment = file, any other segment = directory
        const aIsFile = (i === segmentsA.length - 1);
        const bIsFile = (i === segmentsB.length - 1);

        // If one is a directory and one is a file at this level
        if (aIsFile !== bIsFile) {
          // Directories come BEFORE files in tree view
          return aIsFile ? 1 : -1;
        }

        // Both are files or both are directories - compare alphabetically
        const comparison = segmentsA[i].localeCompare(segmentsB[i], undefined, {
          numeric: true,
          sensitivity: 'base'
        });

        if (comparison !== 0) {
          return comparison;
        }
      }

      // If all common segments are equal, shorter path comes first
      // This shouldn't happen in practice since we handled directory vs file above
      return segmentsA.length - segmentsB.length;
    });
  }

  /**
   * Map Git status to our FileStatus enum
   */
  private mapStatus(status: number): FileStatus {
    // VSCode Git status codes
    // 0: INDEX_MODIFIED
    // 1: INDEX_ADDED
    // 2: INDEX_DELETED
    // 3: INDEX_RENAMED
    // 4: INDEX_COPIED
    // 5: MODIFIED
    // 6: DELETED
    // 7: UNTRACKED
    // 8: IGNORED
    // 9: INTENT_TO_ADD

    switch (status) {
      case 1:
      case 7:
      case 9:
        return FileStatus.Added;
      case 2:
      case 6:
        return FileStatus.Deleted;
      case 3:
        return FileStatus.Renamed;
      case 0:
      case 5:
      default:
        return FileStatus.Modified;
    }
  }

  /**
   * Listen for Git repository changes
   */
  onDidChangeRepository(callback: () => void): vscode.Disposable {
    const repo = this.getRepository();
    if (!repo) {
      return { dispose: () => {} };
    }

    return repo.state.onDidChange(callback);
  }
}
