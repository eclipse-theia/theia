// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
exports.activate = function (context) {

    let currentPanel = undefined;

    context.subscriptions.push(
        vscode.commands.registerCommand('secondary-window-test.openPanel', () => {
            if (currentPanel) {
                currentPanel.reveal(vscode.ViewColumn.One);
                return;
            }

            currentPanel = vscode.window.createWebviewPanel(
                'secondaryWindowTest',
                'Secondary Window Test',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            currentPanel.webview.html = getWebviewContent();

            currentPanel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'showNotification': {
                            const result = await vscode.window.showInformationMessage(
                                'Notification from Secondary Window Test!',
                                'OK', 'Cancel'
                            );
                            currentPanel.webview.postMessage({
                                command: 'result',
                                action: 'showNotification',
                                value: result || '(dismissed)'
                            });
                            break;
                        }
                        case 'showInputBox': {
                            const input = await vscode.window.showInputBox({
                                prompt: 'Enter some text (Secondary Window Test)',
                                placeHolder: 'Type here...'
                            });
                            currentPanel.webview.postMessage({
                                command: 'result',
                                action: 'showInputBox',
                                value: input !== undefined ? input : '(cancelled)'
                            });
                            break;
                        }
                        case 'showQuickPick': {
                            const picked = await vscode.window.showQuickPick(
                                ['Option A', 'Option B', 'Option C'],
                                { placeHolder: 'Pick an option (Secondary Window Test)' }
                            );
                            currentPanel.webview.postMessage({
                                command: 'result',
                                action: 'showQuickPick',
                                value: picked || '(cancelled)'
                            });
                            break;
                        }
                    }
                },
                undefined,
                context.subscriptions
            );

            currentPanel.onDidDispose(
                () => { currentPanel = undefined; },
                undefined,
                context.subscriptions
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('secondary-window-test.toolbarAction', () => {
            vscode.window.showInformationMessage('Toolbar action triggered!');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('secondary-window-test.showDialog', async () => {
            const choice = await vscode.window.showWarningMessage(
                'This is a warning dialog from Secondary Window Test.',
                'Confirm', 'Cancel'
            );
            vscode.window.showInformationMessage('Dialog result: ' + (choice || '(dismissed)'));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('secondary-window-test.toggleColors', () => {
            if (currentPanel) {
                currentPanel.webview.postMessage({ command: 'toggleColors' });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('secondary-window-test.saveFile', async () => {
            const uri = await vscode.window.showSaveDialog({
                saveLabel: 'Save Test File',
                filters: { 'Text Files': ['txt'], 'All Files': ['*'] }
            });
            if (uri) {
                vscode.window.showInformationMessage('Save dialog selected: ' + uri.fsPath);
            } else {
                vscode.window.showInformationMessage('Save dialog was cancelled.');
            }
        })
    );
};

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secondary Window Test</title>
    <style>
        body {
            font-family: var(--vscode-font-family, sans-serif);
            color: var(--vscode-foreground, #ccc);
            background-color: var(--vscode-editor-background, #1e1e1e);
            padding: 20px;
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 0.5em;
        }
        p {
            margin-bottom: 1em;
            line-height: 1.5;
        }
        .button-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 300px;
        }
        button {
            padding: 8px 16px;
            border: 1px solid var(--vscode-button-border, transparent);
            background-color: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            cursor: pointer;
            font-size: 13px;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground, #1177bb);
        }
        #status {
            margin-top: 20px;
            padding: 10px;
            border: 1px solid var(--vscode-panel-border, #444);
            background-color: var(--vscode-editor-inactiveSelectionBackground, #264f78);
            border-radius: 4px;
            min-height: 40px;
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
        }
    </style>
</head>
<body>
    <h1>Secondary Window Test Panel</h1>
    <p>
        Use this panel to test menus, toolbars, and dialogs in secondary windows.<br>
        Right-click the tab and select <strong>"Move to Secondary Window"</strong> to extract this panel,
        then verify the toolbar buttons, context menu, and the buttons below all work correctly.
    </p>

    <div class="button-group">
        <button id="btnNotification">Show Notification</button>
        <button id="btnInputBox">Show Input Box</button>
        <button id="btnQuickPick">Show Quick Pick</button>
        <button id="btnToggleColors">Toggle Colors</button>
        </div>

    <h3>Results</h3>
    <div id="status">Waiting for interactions...</div>

    <script>
        const vscode = acquireVsCodeApi();
        const status = document.getElementById('status');

        function appendStatus(text) {
            status.textContent += '\\n' + text;
            status.scrollTop = status.scrollHeight;
        }

        document.getElementById('btnNotification').addEventListener('click', () => {
            appendStatus('> Requesting notification...');
            vscode.postMessage({ command: 'showNotification' });
        });

        document.getElementById('btnInputBox').addEventListener('click', () => {
            appendStatus('> Requesting input box...');
            vscode.postMessage({ command: 'showInputBox' });
        });

        document.getElementById('btnQuickPick').addEventListener('click', () => {
            appendStatus('> Requesting quick pick...');
            vscode.postMessage({ command: 'showQuickPick' });
        });

        document.getElementById('btnToggleColors').addEventListener('click', () => {
            toggleColors();
        });

        function toggleColors() {
            const existing = document.getElementById('custom-theme');
            if (existing) {
                existing.remove();
                appendStatus('> Colors reverted');
            } else {
                const style = document.createElement('style');
                style.id = 'custom-theme';
                style.textContent =
                    'body { background-color: #1a3a2a !important; color: #a8e6cf !important; } ' +
                    'button { background-color: #6b4c9a !important; color: #f0e6ff !important; } ' +
                    'button:hover { background-color: #7d5fb2 !important; } ' +
                    '#status { background-color: #2a1a3a !important; border-color: #6b4c9a !important; }';
                document.head.appendChild(style);
                appendStatus('> Colors toggled');
            }
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'result') {
                appendStatus('< ' + message.action + ': ' + message.value);
            } else if (message.command === 'toggleColors') {
                toggleColors();
            }
        });
    </script>
</body>
</html>`;
}
