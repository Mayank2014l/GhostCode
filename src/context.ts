import * as path from 'path';
import * as vscode from 'vscode';
import { GemCompleteConfig } from './config';
import { redactSecrets } from './redact';

export interface CompletionContext {
  readonly prefix: string;
  readonly suffix: string;
  readonly languageId: string;
  readonly fileName: string;
  readonly otherTabSnippets?: readonly TabSnippet[];
}

export interface TabSnippet {
  readonly fileName: string;
  readonly languageId: string;
  readonly content: string;
}

export interface TriggerEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
}

/**
 * Checks whether a given file path matches any glob pattern in the exclusion list.
 */
export function matchesExcludeGlob(filePath: string, patterns: readonly string[]): boolean {
  if (!filePath || patterns.length === 0) {
    return false;
  }

  // Normalize path separators to forward slash
  const normalizedPath = filePath.replace(/\\/g, '/');
  const baseName = path.basename(filePath);

  for (const pattern of patterns) {
    const regex = globToRegExp(pattern);
    if (regex.test(normalizedPath) || regex.test(baseName)) {
      return true;
    }
  }

  return false;
}

/**
 * Converts a simple glob pattern to a safe RegExp.
 */
export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/');
  let regexStr = '^';

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (!char) {
      continue;
    }
    if (char === '*' && normalized[i + 1] === '*') {
      // ** matches any directory/file sequence
      regexStr += '.*';
      i++;
      if (normalized[i + 1] === '/') {
        // Skip subsequent slash if present
        i++;
        regexStr += '(?:/.*)?';
      }
    } else if (char === '*') {
      // * matches any character within a single path segment
      regexStr += '[^/]*';
    } else if (char === '?') {
      regexStr += '[^/]';
    } else if (['.', '+', '(', ')', '[', ']', '{', '}', '^', '$', '|', '\\'].includes(char)) {
      regexStr += `\\${char}`;
    } else {
      regexStr += char;
    }
  }

  regexStr += '$';
  return new RegExp(regexStr, 'i');
}

/**
 * Evaluates whether the current cursor position and document are eligible for triggering an AI completion.
 */
export function checkTriggerEligibility(
  document: vscode.TextDocument,
  _position: vscode.Position,
  config: GemCompleteConfig
): TriggerEligibility {
  // 1. Language check
  if (config.disabledLanguages.includes(document.languageId)) {
    return { eligible: false, reason: `Language "${document.languageId}" is disabled` };
  }

  // 2. Exclude globs check
  const filePath = document.uri.fsPath || document.fileName;
  if (matchesExcludeGlob(filePath, config.excludeGlobs)) {
    return { eligible: false, reason: 'File matches an exclusion glob' };
  }

  // 3. File size check
  const fullText = document.getText();
  const maxBytes = config.maxFileSizeKB * 1024;
  if (fullText.length > maxBytes) {
    return { eligible: false, reason: `File size (${fullText.length} chars) exceeds limit (${maxBytes} bytes)` };
  }

  return { eligible: true };
}

/**
 * Builds the redacted prefix and suffix context around the cursor.
 */
export function buildCompletionContext(
  document: vscode.TextDocument,
  position: vscode.Position,
  config: GemCompleteConfig
): CompletionContext {
  const fullText = document.getText();
  const cursorOffset = document.offsetAt(position);

  const rawPrefix = fullText.slice(0, cursorOffset);
  const rawSuffix = fullText.slice(cursorOffset);

  // Take tail of prefix up to maxPrefixChars
  const truncatedPrefix = rawPrefix.length > config.maxPrefixChars
    ? rawPrefix.slice(-config.maxPrefixChars)
    : rawPrefix;

  // Take head of suffix up to maxSuffixChars
  const truncatedSuffix = rawSuffix.length > config.maxSuffixChars
    ? rawSuffix.slice(0, config.maxSuffixChars)
    : rawSuffix;

  // Redact secrets from context
  const redactedPrefix = redactSecrets(truncatedPrefix, config.customRedactionPatterns);
  const redactedSuffix = redactSecrets(truncatedSuffix, config.customRedactionPatterns);

  // Optionally include snippets from other open tabs
  let otherTabSnippets: TabSnippet[] | undefined;
  if (config.includeOtherOpenTabs) {
    otherTabSnippets = getOtherOpenTabSnippets(document, config);
  }

  const fileName = path.basename(document.fileName || 'file');

  return {
    prefix: redactedPrefix,
    suffix: redactedSuffix,
    languageId: document.languageId,
    fileName,
    otherTabSnippets,
  };
}

/**
 * Collects short snippets from other open editor tabs, respecting exclusions and redactions.
 */
function getOtherOpenTabSnippets(
  activeDocument: vscode.TextDocument,
  config: GemCompleteConfig
): TabSnippet[] {
  const snippets: TabSnippet[] = [];
  const maxTabs = 3;
  const maxSnippetChars = 400;

  for (const doc of vscode.workspace.textDocuments) {
    if (doc.uri.toString() === activeDocument.uri.toString()) {
      continue;
    }
    if (doc.isClosed || config.disabledLanguages.includes(doc.languageId)) {
      continue;
    }

    const docPath = doc.uri.fsPath || doc.fileName;
    if (matchesExcludeGlob(docPath, config.excludeGlobs)) {
      continue;
    }

    const text = doc.getText();
    if (text.trim().length === 0 || text.length > config.maxFileSizeKB * 1024) {
      continue;
    }

    const truncated = text.slice(0, maxSnippetChars);
    const redacted = redactSecrets(truncated, config.customRedactionPatterns);

    snippets.push({
      fileName: path.basename(doc.fileName || 'file'),
      languageId: doc.languageId,
      content: redacted,
    });

    if (snippets.length >= maxTabs) {
      break;
    }
  }

  return snippets;
}
