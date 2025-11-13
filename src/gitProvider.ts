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

      // Keep files in Source Control panel order (don't sort alphabetically!)
      // The order from workingTreeChanges matches the Source Control tree view
      return changedFiles;
    } catch (error) {
      console.error('Failed to get changed files:', error);
      return [];
    }
  }

  /**
   * Parse single-file diff output (for testing/backwards compatibility)
   */
  parseDiff(diffOutput: string): Change[] {
    // Single-file diffs don't have "diff --git" headers, just hunks
    // Parse them directly without expecting file headers
    const changes: Change[] = [];
    if (!diffOutput || diffOutput.trim() === '') {
      return changes;
    }

    const lines = diffOutput.split('\n');
    let currentLineNumber = 0;

    for (const line of lines) {
      // Parse hunk header: @@ -10,5 +10,7 @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        currentLineNumber = parseInt(hunkMatch[1], 10);
        continue;
      }

      // Skip non-change lines
      if (!line.startsWith('+') && !line.startsWith('-') && !line.startsWith(' ')) {
        continue;
      }

      // Process changes
      if (line.startsWith('+') && !line.startsWith('+++')) {
        changes.push({
          lineNumber: currentLineNumber,
          changeType: ChangeType.Addition
        });
        currentLineNumber++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        changes.push({
          lineNumber: currentLineNumber,
          changeType: ChangeType.Deletion
        });
      } else if (line.startsWith(' ')) {
        currentLineNumber++;
      }
    }

    return changes;
  }

  /**
   * Parse unified diff output into a map of file paths to changes
   */
  private parseUnifiedDiff(diffOutput: string): Map<string, Change[]> {
    const result = new Map<string, Change[]>();

    if (!diffOutput || diffOutput.trim() === '') {
      return result;
    }

    const lines = diffOutput.split('\n');
    let currentFile: string | null = null;
    let currentLineNumber = 0;
    let currentChanges: Change[] = [];

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
        currentLineNumber = 0;
        continue;
      }

      // Parse hunk header: @@ -10,5 +10,7 @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        currentLineNumber = parseInt(hunkMatch[1], 10);
        continue;
      }

      // Skip non-change lines
      if (!line.startsWith('+') && !line.startsWith('-') && !line.startsWith(' ')) {
        continue;
      }

      // Process changes
      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Addition
        currentChanges.push({
          lineNumber: currentLineNumber,
          changeType: ChangeType.Addition
        });
        currentLineNumber++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Deletion (don't increment line number)
        currentChanges.push({
          lineNumber: currentLineNumber,
          changeType: ChangeType.Deletion
        });
      } else if (line.startsWith(' ')) {
        // Context line (no change)
        currentLineNumber++;
      }
    }

    // Save last file's changes
    if (currentFile && currentChanges.length > 0) {
      result.set(currentFile, currentChanges);
    }

    return result;
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
