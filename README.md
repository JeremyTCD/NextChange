# Change Iterator

A simple VSCode extension to navigate through changed files and changes within files using keyboard shortcuts.

## Features

- **Navigate through changes line-by-line** within and across files
- **Jump between changed files** quickly
- **Smart position tracking** - remembers where you are even when files are staged
- **Fresh Git state** - always shows current changes, no stale cache issues
- **Simple and lightweight** - minimal dependencies, fast performance

## Keyboard Shortcuts

| Command | Shortcut | Description |
|---------|----------|-------------|
| Next Change | `Alt+Z` | Go to the next changed line |
| Previous Change | `Alt+A` | Go to the previous changed line |
| Next File | `Ctrl+Alt+Z` | Go to the first change in the next file |
| Previous File | `Ctrl+Alt+A` | Go to the first change in the previous file |

## How It Works

### Smart Position Tracking

The extension solves common issues with change navigation:

1. **Skip files without going back**: If you skip file1 and file2, then stage file3, navigation continues from file4 (not back to file1)
2. **No stale state**: Cache updates before each navigation to reflect current Git status
3. **Position persistence**: Remembers your position even when files are staged or changes are resolved

### Example Workflow

```
Initial state: [file1, file2, file3, file4, file5]

1. Press Alt+Z → Navigate to file1:line5
2. Press Ctrl+Alt+Z → Skip to file2:line10
3. Press Ctrl+Alt+Z → Skip to file3:line15
4. Stage file3 (e.g., via Source Control panel)
5. Press Ctrl+Alt+Z → Navigate to file4:line20 ✓

✓ Correctly skips file1 and file2 that you already reviewed
✓ Doesn't jump back to previously skipped files
```

## Installation

### Option 1: Install from VSIX (Easiest - Recommended)

The extension is packaged as a `.vsix` file ready for installation:

1. Download `vscode-change-iterator-1.0.0.vsix` from this repository
2. Install it in VSCode:

**Via Command Line:**
```bash
code --install-extension vscode-change-iterator-1.0.0.vsix
```

**Via VSCode UI:**
1. Open VSCode
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Install from VSIX"
4. Select the downloaded `.vsix` file

**Via Extensions View:**
1. Open Extensions view (`Ctrl+Shift+X`)
2. Click the `...` menu (top-right)
3. Select "Install from VSIX..."
4. Select the downloaded `.vsix` file

3. Reload VSCode when prompted
4. The shortcuts are now active! Open a Git repository and try `Alt+Z`

### Option 2: VSCode Marketplace (Public Distribution)

To publish this extension to the VSCode Marketplace (so users can install via "Install Extension" search):

**Prerequisites:**
1. Create a Microsoft account (if you don't have one)
2. Create an Azure DevOps organization at https://dev.azure.com
3. Create a Personal Access Token (PAT):
   - Go to Azure DevOps → User Settings → Personal Access Tokens
   - Create token with **Marketplace (Acquire, Manage)** scope
4. Create a publisher:
   ```bash
   vsce create-publisher YourPublisherName
   ```

**Publishing:**
```bash
# Login with your PAT
vsce login YourPublisherName

# Publish the extension
vsce publish

# Or publish a specific version
vsce publish 1.0.0
```

**After publishing:**
- Extension will be available at: `https://marketplace.visualstudio.com/items?itemName=YourPublisherName.vscode-change-iterator`
- Users can install via: Extensions view → Search "Change Iterator"

**Important Notes:**
- First publish takes ~5-10 minutes for review
- Updates are usually instant
- You need to update the `publisher` field in `package.json` to match your publisher name

### Option 3: From Source (Development)

For development or customization:

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build
4. Press F5 in VSCode to launch Extension Development Host
5. Test the keyboard shortcuts in a Git repository

## Requirements

- VSCode 1.80.0 or higher
- Git repository with changes

## Architecture

```
src/
├── extension.ts       # Entry point, command registration
├── gitProvider.ts     # Git API integration
├── changeNavigator.ts # Core navigation logic with smart caching
├── types.ts          # TypeScript interfaces
└── test/
    ├── mocks/         # Mock implementations for testing
    └── suite/         # Test suites
        ├── changeNavigator.test.ts  # Core navigation tests
        ├── gitProvider.test.ts      # Git diff parsing tests
        └── integration.test.ts      # End-to-end scenarios
```

### Key Design Principles

1. **Stateless queries** - Always fetch fresh data from Git
2. **Minimal state** - Only track current position (file + line)
3. **Smart positioning** - Resolve position intelligently after cache updates
4. **Fail gracefully** - Clear error messages, never crash

## Testing

The extension includes comprehensive automated tests:

### Running Tests

```bash
# Compile the code
npm run compile

# Run tests (downloads VSCode and runs tests in it)
npm test
```

### Test Coverage

- **Unit Tests (gitProvider.test.ts)**: Tests Git diff parsing, status mapping, and line number tracking
- **Unit Tests (changeNavigator.test.ts)**: Tests core navigation logic, smart caching, and position tracking
  - ✓ Critical: Verifies the bug fix for position tracking after staging files
  - ✓ Tests wrapping at file boundaries
  - ✓ Tests cache refresh and position resolution
- **Integration Tests (integration.test.ts)**: Real-world usage scenarios
  - Progressive file review and staging
  - Skipping unimportant files
  - Partial file staging
  - Complex navigation patterns

### Test Philosophy

- **Mock Git state** for predictable, fast tests
- **Test the bug fix** explicitly (no jumping backward after staging)
- **Cover edge cases** (empty repo, single file, all files staged, etc.)

## Contributing

Issues and pull requests welcome!

## License

MIT
