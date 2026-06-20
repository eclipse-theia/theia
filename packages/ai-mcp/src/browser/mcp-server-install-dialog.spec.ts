// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// Another spec in this package may have already set the configuration; mocha loads all
// specs into one process and `set` throws if called twice, so guard it.
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { DialogError } from '@theia/core/lib/browser/dialogs';
import { MCPServerInstallDialog, MCPServerInstallDialogOptions } from './mcp-server-install-dialog';

// Balance the import-time enable; the suite re-enables JSDOM around its own tests so it
// is robust to other specs in the package toggling the shared JSDOM globals.
disableJSDOM();

/** Exposes the protected validation hook and token field so we can assert on them directly. */
class TestInstallDialog extends MCPServerInstallDialog {
    setToken(token: string): void {
        this.serverAuthToken = token;
    }
    runValidation(): DialogError {
        return this.isValid(this.value, 'open') as DialogError;
    }
}

function dialog(options: Partial<MCPServerInstallDialogOptions> = {}): TestInstallDialog {
    return new TestInstallDialog({ name: 'example', ...options });
}

describe('MCPServerInstallDialog.isValid', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('accepts any input when the server does not require an auth token', () => {
        const d = dialog({ requireAuthToken: false });
        expect(d.runValidation()).to.equal('');
    });

    it('rejects an empty token when the server requires one', () => {
        const d = dialog({ requireAuthToken: true });
        expect(d.runValidation()).to.match(/auth token is required/i);
    });

    it('rejects a whitespace-only token when the server requires one', () => {
        const d = dialog({ requireAuthToken: true });
        d.setToken('   ');
        expect(d.runValidation()).to.match(/auth token is required/i);
    });

    it('accepts a non-empty token when the server requires one', () => {
        const d = dialog({ requireAuthToken: true });
        d.setToken('real-token');
        expect(d.runValidation()).to.equal('');
    });
});
