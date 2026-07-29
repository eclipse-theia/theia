// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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
const disableJSDOM = enableJSDOM();
// Importing the provider pulls in xterm, which probes a canvas 2d context on load; JSDOM has no
// canvas backend, so stub it out to keep this spec runnable without the native `canvas` package.
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => undefined;

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import * as chai from 'chai';
import { ILogger } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { TerminalWidget } from './base/terminal-widget';
import { FileLinkProvider } from './terminal-file-link-provider';

disableJSDOM();

const expect = chai.expect;

class TestFileLinkProvider extends FileLinkProvider {
    readonly loggedErrors: string[] = [];

    constructor() {
        super();
        (this as unknown as { logger: ILogger }).logger = {
            error: (message: unknown) => { this.loggedErrors.push(String(message)); }
        } as unknown as ILogger;
    }

    exposeToURI(match: string, cwd: URI): Promise<URI | undefined> {
        return this.toURI(match, cwd);
    }
}

function terminalWithCwd(cwd: URI): TerminalWidget {
    return { lastCwd: cwd } as unknown as TerminalWidget;
}

describe('FileLinkProvider', () => {

    const cwd = new URI('file:///home/user/project');

    describe('#toURI', () => {

        it('should skip a URL authority path beginning with "//" instead of throwing', async () => {
            const provider = new TestFileLinkProvider();
            // The '//host/path' the file-path regex matches from a printed URL (its ':' is excluded).
            expect(await provider.exposeToURI('//juliahub.com/products/dyad', cwd)).to.equal(undefined);
            expect(await provider.exposeToURI('//github.com/DyadLang/DyadIssues', cwd)).to.equal(undefined);
        });

        it('should still resolve a genuine absolute local path', async () => {
            const provider = new TestFileLinkProvider();
            const uri = await provider.exposeToURI('/home/user/project/file.ts', cwd);
            expect(uri).to.not.equal(undefined);
            expect(uri!.path.toString()).to.equal('/home/user/project/file.ts');
        });
    });

    describe('#provideLinks', () => {

        it('should not produce a file link or log an error for a printed URL', async () => {
            const provider = new TestFileLinkProvider();
            const links = await provider.provideLinks('see https://juliahub.com/products/dyad for details', terminalWithCwd(cwd));
            expect(links).to.deep.equal([]);
            expect(provider.loggedErrors).to.deep.equal([]);
        });

        it('should not throw or log for a printed file:// URL', async () => {
            const provider = new TestFileLinkProvider();
            // ':' is excluded, so a file:// URL survives as a '///path' candidate the guard skips;
            // it is not linkified here today. Documents the no-throw behavior — making file:// links
            // clickable would be a separate feature.
            const links = await provider.provideLinks('open file:///home/user/project/file.ts now', terminalWithCwd(cwd));
            expect(links).to.deep.equal([]);
            expect(provider.loggedErrors).to.deep.equal([]);
        });
    });
});
