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
  private lastNavigatedUri: string | null = null; // Track our last programmatic navigation

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
    // Refresh cache first to get latest changes
    await this.refreshCacheIfNeeded();

    // Then detect manual selection with fresh data
    this.detectManualSelection();

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
    this.detectManualSelection();

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
    this.detectManualSelection();

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
    this.detectManualSelection();

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
   * Detect if user manually selected a file or line in the editor
   * MUST be called AFTER cache refresh to ensure accurate file list
   */
  private detectManualSelection(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }

    const activeUri = activeEditor.document.uri.toString();
    const activeLine = activeEditor.selection.active.line + 1; // Convert to 1-based

    // Check if the active file is in our changed files list
    const fileInList = this.state.changedFiles.find(
      f => f.uri.toString() === activeUri
    );

    if (!fileInList) {
      // Active file is not a changed file, ignore it
      return;
    }

    // If the active file is different from our current position
    if (activeUri !== this.state.currentFileUri) {
      // Check if this is the file we just navigated to (still loading)
      if (activeUri === this.lastNavigatedUri) {
        // This is our own navigation completing, not a manual selection
        this.state.currentFileUri = activeUri;
        this.state.currentLine = activeLine;
        return;
      }

      // User manually selected a different changed file, update position
      this.state.currentFileUri = activeUri;
      this.state.currentLine = activeLine;
      this.lastNavigatedUri = null;
    } else if (this.state.currentLine !== null && activeLine !== this.state.currentLine) {
      // Same file, but different line - user manually moved cursor
      // Don't update if this is our lastNavigatedUri (navigation still settling)
      if (activeUri !== this.lastNavigatedUri) {
        this.state.currentLine = activeLine;
      }
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

    // Remember the old file's position (index) in the list
    const oldFileIndex = oldFileUri
      ? this.state.changedFiles.findIndex(f => f.uri.toString() === oldFileUri)
      : -1;

    // Get fresh data from Git
    this.state.changedFiles = await this.gitProvider.getChangedFiles();
    this.state.lastCacheUpdate = Date.now();

    // Smart position adjustment
    if (oldFileUri) {
      const oldFileStillExists = this.state.changedFiles.find(
        f => f.uri.toString() === oldFileUri
      );

      if (!oldFileStillExists) {
        // File was staged/reverted, continue from the same position (index)
        this.adjustPositionAfterFileRemoved(oldFileIndex);
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
   * Uses the old file's index position to continue from the same spot
   */
  private adjustPositionAfterFileRemoved(oldFileIndex: number): void {
    if (this.state.changedFiles.length === 0) {
      // No files left
      this.state.currentFileUri = null;
      this.state.currentLine = null;
      return;
    }

    // Continue from the same index position (or closest available file)
    // If oldFileIndex was 2 and file at index 2 was removed,
    // we want to go to the NEW file at index 2 (which was previously at index 3)
    let targetFile: typeof this.state.changedFiles[0] | null = null;

    if (oldFileIndex >= 0 && oldFileIndex < this.state.changedFiles.length) {
      // There's a file at the same index position, use it
      targetFile = this.state.changedFiles[oldFileIndex];
    } else if (oldFileIndex >= this.state.changedFiles.length) {
      // Old file was at the end, wrap to beginning
      targetFile = this.state.changedFiles[0];
    } else {
      // Shouldn't happen, but default to first file
      targetFile = this.state.changedFiles[0];
    }

    // Set position to just before the first change in the target file
    // This way, findNextChange will return the first change in this file
    this.state.currentFileUri = targetFile.uri.toString();
    if (targetFile.changes.length > 0) {
      // Set currentLine to one less than the first change, so findNextChange finds it
      this.state.currentLine = targetFile.changes[0].lineNumber - 1;
    } else {
      this.state.currentLine = 0;
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

    // Check if we're positioned at a file but haven't navigated to it yet
    // This happens after staging - currentLine is set to just before first change
    const currentFile = this.state.changedFiles[currentIndex];
    if (currentFile.changes.length > 0 && this.state.currentLine !== null) {
      const firstChangeInFile = currentFile.changes[0].lineNumber;
      // If currentLine is before the first change, we haven't navigated to this file yet
      if (this.state.currentLine < firstChangeInFile) {
        return currentFile; // Return current file, don't advance
      }
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
      // Remember this URI as our programmatic navigation
      this.lastNavigatedUri = location.fileUri.toString();

      // Try to open diff view using Git extension command (like clicking in Source Control)
      try {
        await vscode.commands.executeCommand('git.openChange', location.fileUri);
      } catch {
        // Fallback to regular file open if git.openChange is not available
        await vscode.commands.executeCommand('vscode.open', location.fileUri);
      }

      // Wait a bit for the editor to open
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the active editor after opening
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const position = new vscode.Position(location.lineNumber - 1, 0); // Convert to 0-based
        const range = new vscode.Range(position, position);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
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
