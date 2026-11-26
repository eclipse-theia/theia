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

// Like bundlers emit it, the extension assigns `module.exports` and requires `vscode` when it needs it.
module.exports = {
    activate,
    deactivate
};

function activate(context) {
    const vscode = require('vscode');
    console.log('[plugin-browser] activated in browser worker!');
    context.subscriptions.push(
        vscode.commands.registerCommand('plugin-browser.hello', () => {
            vscode.window.showInformationMessage('Hello from a browser-only extension!');
        }),
        vscode.commands.registerCommand('plugin-browser.secret', async () => {
            const stored = new Date().toISOString();
            await context.secrets.store('plugin-browser.secret', stored);
            const read = await context.secrets.get('plugin-browser.secret');
            vscode.window.showInformationMessage(`Stored the secret '${stored}' and read back '${read}'.`);
        })
    );
}

function deactivate() { }
