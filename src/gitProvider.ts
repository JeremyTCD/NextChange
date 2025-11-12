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
   * Get all changed files (working tree + index changes)
   */
  async getChangedFiles(): Promise<ChangedFile[]> {
    const repo = this.getRepository();
    if (!repo) {
      return [];
    }

    const changedFiles: ChangedFile[] = [];
    const seenUris = new Set<string>();

    // Get working tree changes (unstaged)
    for (const change of repo.state.workingTreeChanges) {
      const uriString = change.uri.toString();
      if (!seenUris.has(uriString)) {
        seenUris.add(uriString);

        const status = this.mapStatus(change.status);
        const changes = await this.getFileChanges(change.uri, repo);

        if (changes.length > 0) {
          changedFiles.push({
            uri: change.uri,
            status,
            changes
          });
        }
      }
    }

    // Get index changes (staged) - some users might want to review these too
    for (const change of repo.state.indexChanges) {
      const uriString = change.uri.toString();
      if (!seenUris.has(uriString)) {
        seenUris.add(uriString);

        const status = this.mapStatus(change.status);
        const changes = await this.getFileChanges(change.uri, repo);

        if (changes.length > 0) {
          changedFiles.push({
            uri: change.uri,
            status,
            changes
          });
        }
      }
    }

    // Sort files by URI for consistent ordering
    changedFiles.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath));

    return changedFiles;
  }

  /**
   * Get changes (line numbers) for a specific file
   */
  private async getFileChanges(uri: vscode.Uri, repo: any): Promise<Change[]> {
    try {
      const repoPath = repo.rootUri.fsPath;
      const filePath = uri.fsPath;
      const relativePath = filePath.replace(repoPath + '/', '');

      // Get diff for the file
      const { stdout } = await exec(
        `git diff HEAD "${relativePath}"`,
        { cwd: repoPath }
      );

      return this.parseDiff(stdout);
    } catch (error) {
      // File might be new or deleted
      return this.handleSpecialCases(uri);
    }
  }

  /**
   * Parse git diff output to extract changed line numbers
   */
  private parseDiff(diffOutput: string): Change[] {
    const changes: Change[] = [];
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

      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Addition
        changes.push({
          lineNumber: currentLineNumber,
          changeType: ChangeType.Addition
        });
        currentLineNumber++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Deletion (don't increment line number)
        changes.push({
          lineNumber: currentLineNumber,
          changeType: ChangeType.Deletion
        });
      } else if (line.startsWith(' ')) {
        // Context line (no change)
        currentLineNumber++;
      }
    }

    return changes;
  }

  /**
   * Handle special cases like new or deleted files
   */
  private async handleSpecialCases(uri: vscode.Uri): Promise<Change[]> {
    try {
      // For new files, mark line 1 as an addition
      const document = await vscode.workspace.openTextDocument(uri);
      return [{
        lineNumber: 1,
        changeType: ChangeType.Addition
      }];
    } catch {
      // For deleted files, return empty
      return [];
    }
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
