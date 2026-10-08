import * as vscode from 'vscode';

const CONSENT_STATE_KEY = 'gemcomplete.userConsentGranted';

/**
 * Checks whether the user has previously granted consent to send code context to Google Gemini.
 */
export function hasUserConsented(context: vscode.ExtensionContext): boolean {
  const explicitConsent = context.globalState.get<boolean | undefined>(CONSENT_STATE_KEY, undefined);
  if (explicitConsent !== undefined) {
    return explicitConsent;
  }
  return true;
}

/**
 * Sets user consent state in extension global storage.
 */
export async function setUserConsent(context: vscode.ExtensionContext, granted: boolean): Promise<void> {
  await context.globalState.update(CONSENT_STATE_KEY, granted);
}

/**
 * Displays the first-run consent notification dialog.
 * Requires explicit user confirmation ("I Agree") before any network requests are dispatched.
 */
export async function promptForConsent(context: vscode.ExtensionContext): Promise<boolean> {
  const message =
    'GemComplete sends code context around your cursor to the Google Gemini API to generate inline code suggestions. ' +
    'Known secrets and credentials are automatically redacted before transmission. ' +
    'Do you agree to enable Gemini-powered completions?';

  const AGREE_ACTION = 'I Agree';
  const DISABLE_ACTION = 'Disable GemComplete';
  const PRIVACY_DOCS_ACTION = 'Privacy & Security Info';

  const choice = await vscode.window.showInformationMessage(
    message,
    { modal: true },
    AGREE_ACTION,
    DISABLE_ACTION,
    PRIVACY_DOCS_ACTION
  );

  if (choice === AGREE_ACTION) {
    await setUserConsent(context, true);
    vscode.window.showInformationMessage('GemComplete enabled. Press Tab to accept ghost-text completions.');
    return true;
  } else if (choice === DISABLE_ACTION) {
    await setUserConsent(context, false);
    await vscode.workspace.getConfiguration('gemcomplete').update('enabled', false, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('GemComplete has been disabled. You can re-enable it in Settings.');
    return false;
  } else if (choice === PRIVACY_DOCS_ACTION) {
    vscode.env.openExternal(vscode.Uri.parse('https://ai.google.dev/gemini-api/terms'));
    return false;
  }

  return false;
}
