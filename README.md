# Change Iterator

A simple VSCode extension to navigate through changed files and changes within files using keyboard shortcuts.

## Features

- **Navigate through changes line-by-line** within and across files
- **Jump between changed files** quickly
- **Smart position tracking** - remembers where you are even when files are staged
- **Fresh Git state** - always shows current changes, no stale cache issues
- **Simple and lightweight** - minimal dependencies, fast performance

## Keyboard Shortcuts

| Command | Windows/Linux | macOS | Description |
|---------|---------------|-------|-------------|
| Next Change | `Ctrl+Alt+Down` | `Cmd+Alt+Down` | Go to the next changed line |
| Previous Change | `Ctrl+Alt+Up` | `Cmd+Alt+Up` | Go to the previous changed line |
| Next File | `Ctrl+Alt+Right` | `Cmd+Alt+Right` | Go to the first change in the next file |
| Previous File | `Ctrl+Alt+Left` | `Cmd+Alt+Left` | Go to the first change in the previous file |

## How It Works

### Smart Position Tracking

The extension solves common issues with change navigation:

1. **Skip files without going back**: If you skip file1 and file2, then stage file3, navigation continues from file4 (not back to file1)
2. **No stale state**: Cache updates before each navigation to reflect current Git status
3. **Position persistence**: Remembers your position even when files are staged or changes are resolved

### Example Workflow

```
Initial state: [file1, file2, file3, file4, file5]

1. Press Ctrl+Alt+Down → Navigate to file1:line5
2. Press Ctrl+Alt+Right → Skip to file2:line10
3. Press Ctrl+Alt+Right → Skip to file3:line15
4. Stage file3 (e.g., via Source Control panel)
5. Press Ctrl+Alt+Right → Navigate to file4:line20 ✓

✓ Correctly skips file1 and file2 that you already reviewed
✓ Doesn't jump back to previously skipped files
```

## Installation

### From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build
4. Press F5 in VSCode to launch Extension Development Host
5. Test the keyboard shortcuts in a Git repository

### From VSIX (Coming Soon)

Download the `.vsix` file and install via:
```bash
code --install-extension vscode-change-iterator-1.0.0.vsix
```

## Requirements

- VSCode 1.80.0 or higher
- Git repository with changes

## Architecture

```
src/
├── extension.ts       # Entry point, command registration
├── gitProvider.ts     # Git API integration
├── changeNavigator.ts # Core navigation logic with smart caching
└── types.ts          # TypeScript interfaces
```

### Key Design Principles

1. **Stateless queries** - Always fetch fresh data from Git
2. **Minimal state** - Only track current position (file + line)
3. **Smart positioning** - Resolve position intelligently after cache updates
4. **Fail gracefully** - Clear error messages, never crash

## Contributing

Issues and pull requests welcome!

## License

MIT
