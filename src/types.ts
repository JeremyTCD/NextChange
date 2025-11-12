import * as vscode from 'vscode';

/**
 * Represents a file with changes from Git
 */
export interface ChangedFile {
  uri: vscode.Uri;
  status: FileStatus;
  changes: Change[];
}

/**
 * Git file status
 */
export enum FileStatus {
  Modified = 'modified',
  Added = 'added',
  Deleted = 'deleted',
  Untracked = 'untracked',
  Renamed = 'renamed'
}

/**
 * Represents a change within a file (hunk)
 */
export interface Change {
  lineNumber: number;    // The line number where the change starts
  changeType: ChangeType;
}

/**
 * Type of change
 */
export enum ChangeType {
  Addition = 'addition',
  Deletion = 'deletion',
  Modification = 'modification'
}

/**
 * Navigation state tracking
 */
export interface NavigationState {
  // Current position
  currentFileUri: string | null;
  currentLine: number | null;

  // Cache
  changedFiles: ChangedFile[];
  lastCacheUpdate: number;
}

/**
 * A specific location in a changed file
 */
export interface ChangeLocation {
  fileUri: vscode.Uri;
  lineNumber: number;
  change: Change;
}
