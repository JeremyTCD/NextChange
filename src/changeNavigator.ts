import * as vscode from 'vscode';
import { GitProvider } from './gitProvider';
import { ChangedFile, NavigationState, ChangeLocation } from './types';

/**
 * Core navigation logic with smart caching and position tracking
 */
export class ChangeNavigator {
  private state: NavigationState;
  private gitProvider: GitProvider;
  private readonly CACHE_TTL = 0; // Always refresh to ensure fresh state

  constructor(gitProvider: GitProvider) {
    this.gitProvider = gitProvider;
    this.state = {
      currentFileUri: null,
      currentLine: null,
      changedFiles: [],
      lastCacheUpdate: 0
    };
  }

  /**
   * Navigate to the next change
   */
  async nextChange(): Promise<void> {
    await this.refreshCacheIfNeeded();

    if (this.state.changedFiles.length === 0) {
      vscode.window.showInformationMessage('No changes found');
      return;
    }

    const next = this.findNextChange();
    if (next) {
      await this.navigateTo(next);
      this.updatePosition(next);
    } else {
      vscode.window.showInformationMessage('No more changes');
    }
  }

  /**
   * Navigate to the previous change
   */
  async previousChange(): Promise<void> {
    await this.refreshCacheIfNeeded();

    if (this.state.changedFiles.length === 0) {
      vscode.window.showInformationMessage('No changes found');
      return;
    }

    const prev = this.findPreviousChange();
    if (prev) {
      await this.navigateTo(prev);
      this.updatePosition(prev);
    } else {
      vscode.window.showInformationMessage('No previous changes');
    }
  }

  /**
   * Navigate to the next changed file
   */
  async nextFile(): Promise<void> {
    await this.refreshCacheIfNeeded();

    if (this.state.changedFiles.length === 0) {
      vscode.window.showInformationMessage('No changed files found');
      return;
    }

    const nextFile = this.findNextFile();
    if (nextFile && nextFile.changes.length > 0) {
      const firstChange = nextFile.changes[0];
      const location: ChangeLocation = {
        fileUri: nextFile.uri,
        lineNumber: firstChange.lineNumber,
        change: firstChange
      };
      await this.navigateTo(location);
      this.updatePosition(location);
    } else {
      vscode.window.showInformationMessage('No more changed files');
    }
  }

  /**
   * Navigate to the previous changed file
   */
  async previousFile(): Promise<void> {
    await this.refreshCacheIfNeeded();

    if (this.state.changedFiles.length === 0) {
      vscode.window.showInformationMessage('No changed files found');
      return;
    }

    const prevFile = this.findPreviousFile();
    if (prevFile && prevFile.changes.length > 0) {
      const firstChange = prevFile.changes[0];
      const location: ChangeLocation = {
        fileUri: prevFile.uri,
        lineNumber: firstChange.lineNumber,
        change: firstChange
      };
      await this.navigateTo(location);
      this.updatePosition(location);
    } else {
      vscode.window.showInformationMessage('No previous changed files');
    }
  }

  /**
   * Refresh cache if stale (lazy refresh)
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.state.lastCacheUpdate > this.CACHE_TTL) {
      await this.refreshCache();
    }
  }

  /**
   * Refresh the cache and adjust position smartly
   */
  private async refreshCache(): Promise<void> {
    const oldFileUri = this.state.currentFileUri;
    const oldLine = this.state.currentLine;

    // Get fresh data from Git
    this.state.changedFiles = await this.gitProvider.getChangedFiles();
    this.state.lastCacheUpdate = Date.now();

    // Smart position adjustment
    if (oldFileUri) {
      const oldFileStillExists = this.state.changedFiles.find(
        f => f.uri.toString() === oldFileUri
      );

      if (!oldFileStillExists) {
        // File was staged/reverted, find next file after this position
        this.adjustPositionAfterFileRemoved(oldFileUri);
      } else if (oldLine !== null) {
        // File still exists, check if the specific line/change still exists
        const changeStillExists = oldFileStillExists.changes.some(
          c => c.lineNumber === oldLine
        );

        if (!changeStillExists) {
          // The specific change was resolved, move to next change in same file
          const nextChangeInFile = oldFileStillExists.changes.find(
            c => c.lineNumber > oldLine
          );

          if (!nextChangeInFile) {
            // No more changes in this file, prepare to move to next file
            this.state.currentLine = null;
          }
        }
      }
    }
  }

  /**
   * Adjust position when current file is removed from changes
   */
  private adjustPositionAfterFileRemoved(oldUri: string): void {
    // Find where the old file would have been in the sorted list
    const insertionPoint = this.state.changedFiles.findIndex(
      f => f.uri.toString() > oldUri
    );

    if (insertionPoint !== -1 && insertionPoint < this.state.changedFiles.length) {
      // Set position to the file that comes after
      this.state.currentFileUri = this.state.changedFiles[insertionPoint].uri.toString();
      this.state.currentLine = null; // Will start from first change in new file
    } else {
      // Was the last file, wrap to beginning or clear
      if (this.state.changedFiles.length > 0) {
        this.state.currentFileUri = this.state.changedFiles[0].uri.toString();
        this.state.currentLine = null;
      } else {
        this.state.currentFileUri = null;
        this.state.currentLine = null;
      }
    }
  }

  /**
   * Find the next change from current position
   */
  private findNextChange(): ChangeLocation | null {
    if (this.state.changedFiles.length === 0) {
      return null;
    }

    // If no current position, start from the beginning
    if (!this.state.currentFileUri || this.state.currentLine === null) {
      const firstFile = this.state.changedFiles[0];
      const firstChange = firstFile.changes[0];
      return {
        fileUri: firstFile.uri,
        lineNumber: firstChange.lineNumber,
        change: firstChange
      };
    }

    // Find current file
    const currentFileIndex = this.state.changedFiles.findIndex(
      f => f.uri.toString() === this.state.currentFileUri
    );

    if (currentFileIndex === -1) {
      // Current file not found, start from beginning
      const firstFile = this.state.changedFiles[0];
      const firstChange = firstFile.changes[0];
      return {
        fileUri: firstFile.uri,
        lineNumber: firstChange.lineNumber,
        change: firstChange
      };
    }

    const currentFile = this.state.changedFiles[currentFileIndex];

    // Look for next change in current file
    const nextChangeInFile = currentFile.changes.find(
      c => c.lineNumber > this.state.currentLine!
    );

    if (nextChangeInFile) {
      return {
        fileUri: currentFile.uri,
        lineNumber: nextChangeInFile.lineNumber,
        change: nextChangeInFile
      };
    }

    // No more changes in current file, move to next file
    const nextFileIndex = (currentFileIndex + 1) % this.state.changedFiles.length;
    const nextFile = this.state.changedFiles[nextFileIndex];

    if (nextFile.changes.length > 0) {
      const firstChange = nextFile.changes[0];
      return {
        fileUri: nextFile.uri,
        lineNumber: firstChange.lineNumber,
        change: firstChange
      };
    }

    return null;
  }

  /**
   * Find the previous change from current position
   */
  private findPreviousChange(): ChangeLocation | null {
    if (this.state.changedFiles.length === 0) {
      return null;
    }

    // If no current position, start from the end
    if (!this.state.currentFileUri || this.state.currentLine === null) {
      const lastFile = this.state.changedFiles[this.state.changedFiles.length - 1];
      const lastChange = lastFile.changes[lastFile.changes.length - 1];
      return {
        fileUri: lastFile.uri,
        lineNumber: lastChange.lineNumber,
        change: lastChange
      };
    }

    // Find current file
    const currentFileIndex = this.state.changedFiles.findIndex(
      f => f.uri.toString() === this.state.currentFileUri
    );

    if (currentFileIndex === -1) {
      // Current file not found, start from end
      const lastFile = this.state.changedFiles[this.state.changedFiles.length - 1];
      const lastChange = lastFile.changes[lastFile.changes.length - 1];
      return {
        fileUri: lastFile.uri,
        lineNumber: lastChange.lineNumber,
        change: lastChange
      };
    }

    const currentFile = this.state.changedFiles[currentFileIndex];

    // Look for previous change in current file
    const previousChanges = currentFile.changes.filter(
      c => c.lineNumber < this.state.currentLine!
    );

    if (previousChanges.length > 0) {
      const prevChange = previousChanges[previousChanges.length - 1];
      return {
        fileUri: currentFile.uri,
        lineNumber: prevChange.lineNumber,
        change: prevChange
      };
    }

    // No previous changes in current file, move to previous file
    const prevFileIndex = currentFileIndex === 0
      ? this.state.changedFiles.length - 1
      : currentFileIndex - 1;
    const prevFile = this.state.changedFiles[prevFileIndex];

    if (prevFile.changes.length > 0) {
      const lastChange = prevFile.changes[prevFile.changes.length - 1];
      return {
        fileUri: prevFile.uri,
        lineNumber: lastChange.lineNumber,
        change: lastChange
      };
    }

    return null;
  }

  /**
   * Find the next file from current position
   */
  private findNextFile(): ChangedFile | null {
    if (this.state.changedFiles.length === 0) {
      return null;
    }

    if (!this.state.currentFileUri) {
      return this.state.changedFiles[0];
    }

    const currentIndex = this.state.changedFiles.findIndex(
      f => f.uri.toString() === this.state.currentFileUri
    );

    if (currentIndex === -1) {
      return this.state.changedFiles[0];
    }

    const nextIndex = (currentIndex + 1) % this.state.changedFiles.length;
    return this.state.changedFiles[nextIndex];
  }

  /**
   * Find the previous file from current position
   */
  private findPreviousFile(): ChangedFile | null {
    if (this.state.changedFiles.length === 0) {
      return null;
    }

    if (!this.state.currentFileUri) {
      return this.state.changedFiles[this.state.changedFiles.length - 1];
    }

    const currentIndex = this.state.changedFiles.findIndex(
      f => f.uri.toString() === this.state.currentFileUri
    );

    if (currentIndex === -1) {
      return this.state.changedFiles[this.state.changedFiles.length - 1];
    }

    const prevIndex = currentIndex === 0
      ? this.state.changedFiles.length - 1
      : currentIndex - 1;
    return this.state.changedFiles[prevIndex];
  }

  /**
   * Navigate to a specific location
   */
  private async navigateTo(location: ChangeLocation): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(location.fileUri);
      const editor = await vscode.window.showTextDocument(document);

      const position = new vscode.Position(location.lineNumber - 1, 0); // Convert to 0-based
      const range = new vscode.Range(position, position);

      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to navigate: ${error}`);
    }
  }

  /**
   * Update the current position
   */
  private updatePosition(location: ChangeLocation): void {
    this.state.currentFileUri = location.fileUri.toString();
    this.state.currentLine = location.lineNumber;
  }
}
