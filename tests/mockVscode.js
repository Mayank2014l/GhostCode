const Module = require('module');
const originalLoad = Module._load;

const mockVscode = {
  window: {
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    createStatusBarItem: () => ({
      show: () => {},
      hide: () => {},
      dispose: () => {},
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
    }),
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
      clear: () => {},
    }),
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key, defaultVal) => defaultVal,
      update: async () => {},
    }),
    textDocuments: [],
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => {},
  },
  languages: {
    registerInlineCompletionItemProvider: () => ({ dispose: () => {} }),
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  Range: class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  Position: class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  InlineCompletionItem: class InlineCompletionItem {
    constructor(insertText, range) {
      this.insertText = insertText;
      this.range = range;
    }
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  Uri: {
    parse: (str) => ({ toString: () => str }),
    file: (str) => ({ fsPath: str, toString: () => str }),
  },
  ThemeColor: class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  },
};

Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalLoad.apply(this, arguments);
};

module.exports = mockVscode;
