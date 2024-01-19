// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

function extensionKind(kind) {
    switch (kind) {
        case vscode.ExtensionKind.UI:
            return 'UI';
        case vscode.ExtensionKind.Workspace:
            return 'Workspace';
        default:
            return 'unknown';
    }
}

async function activate () {
    console.log('[GOTD-BE]', `Running version ${vscode.version} of the VS Code Extension API.`);
    console.log('[GOTD-BE]', `It looks like your shell is ${vscode.env.shell}.`);
    const myself = vscode.extensions.getExtension('<unpublished>.plugin-gotd');
    if (myself) {
        console.log('[GOTD-BE]', `And I am a(n) ${extensionKind(myself.extensionKind)} plugin installed at ${myself.extensionPath}.`);
    }
}

module.exports = {
    activate
};
