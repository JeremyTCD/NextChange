import * as vscode from 'vscode';
import { ChangedFile, FileStatus, Change, ChangeType } from '../../types';

/**
 * Mock Git Provider for testing
 */
export class MockGitProvider {
  private changedFiles: ChangedFile[] = [];
  private changeListeners: Array<() => void> = [];

  constructor(initialFiles: ChangedFile[] = []) {
    this.changedFiles = initialFiles;
  }

  /**
   * Get all changed files (simulates GitProvider.getChangedFiles)
   */
  async getChangedFiles(): Promise<ChangedFile[]> {
    return [...this.changedFiles]; // Return copy to prevent external mutations
  }

  /**
   * Set the changed files (for testing different states)
   */
  setChangedFiles(files: ChangedFile[]): void {
    this.changedFiles = files;
    this.notifyListeners();
  }

  /**
   * Remove a file from the list (simulates staging)
   */
  removeFile(uriString: string): void {
    this.changedFiles = this.changedFiles.filter(
      f => f.uri.toString() !== uriString
    );
    this.notifyListeners();
  }

  /**
   * Add a file to the list
   */
  addFile(file: ChangedFile): void {
    this.changedFiles.push(file);
    this.changedFiles.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath));
    this.notifyListeners();
  }

  /**
   * Update changes for a specific file
   */
  updateFileChanges(uriString: string, changes: Change[]): void {
    const file = this.changedFiles.find(f => f.uri.toString() === uriString);
    if (file) {
      file.changes = changes;
      this.notifyListeners();
    }
  }

  /**
   * Listen for repository changes (simulates GitProvider.onDidChangeRepository)
   */
  onDidChangeRepository(callback: () => void): vscode.Disposable {
    this.changeListeners.push(callback);
    return {
      dispose: () => {
        const index = this.changeListeners.indexOf(callback);
        if (index > -1) {
          this.changeListeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    this.changeListeners.forEach(listener => listener());
  }

  /**
   * Clear all files (simulates staging everything)
   */
  clear(): void {
    this.changedFiles = [];
    this.notifyListeners();
  }

  /**
   * Get current file count
   */
  getFileCount(): number {
    return this.changedFiles.length;
  }
}

/**
 * Helper function to create a mock URI
 */
export function createMockUri(path: string): vscode.Uri {
  return vscode.Uri.file(`/mock/repo/${path}`);
}

/**
 * Helper function to create a mock changed file
 */
export function createMockChangedFile(
  path: string,
  changes: Array<{ line: number; type?: ChangeType }>,
  status: FileStatus = FileStatus.Modified
): ChangedFile {
  return {
    uri: createMockUri(path),
    status,
    changes: changes.map(c => ({
      lineNumber: c.line,
      changeType: c.type || ChangeType.Modification
    }))
  };
}
