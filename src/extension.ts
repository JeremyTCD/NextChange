import * as vscode from 'vscode';
import { GitProvider } from './gitProvider';
import { ChangeNavigator } from './changeNavigator';

let navigator: ChangeNavigator | undefined;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Change Iterator extension is now active');

  try {
    // Initialize Git provider
    const gitProvider = new GitProvider();
    navigator = new ChangeNavigator(gitProvider);

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('changeIterator.nextChange', async () => {
        if (navigator) {
          await navigator.nextChange();
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('changeIterator.previousChange', async () => {
        if (navigator) {
          await navigator.previousChange();
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('changeIterator.nextFile', async () => {
        if (navigator) {
          await navigator.nextFile();
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('changeIterator.previousFile', async () => {
        if (navigator) {
          await navigator.previousFile();
        }
      })
    );

    vscode.window.showInformationMessage('Change Iterator ready!');
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to activate Change Iterator: ${error}`);
  }
}

/**
 * Deactivate the extension
 */
export function deactivate() {
  navigator = undefined;
}
