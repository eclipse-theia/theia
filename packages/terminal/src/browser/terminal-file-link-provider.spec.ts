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
import { ILogger, OS, QuickInputService } from '@theia/core';
import { OpenHandler, OpenerService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TerminalWidget } from './base/terminal-widget';
import { FileLinkProvider, LocalFileLinkProvider } from './terminal-file-link-provider';

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

class TestLocalFileLinkProvider extends LocalFileLinkProvider {
    readonly opened: string[] = [];
    readonly quickInputRequests: string[] = [];

    constructor(workspaceRoot: URI, existingFile: URI) {
        super();
        (this as unknown as { logger: ILogger }).logger = {
            error: (message: unknown) => { this.loggedErrors.push(String(message)); }
        } as unknown as ILogger;
        (this as unknown as { workspaceService: WorkspaceService }).workspaceService = {
            tryGetRoots: () => [{ resource: workspaceRoot }]
        } as unknown as WorkspaceService;
        (this as unknown as { searchService: FileSearchService }).searchService = {
            find: async () => []
        } as unknown as FileSearchService;
        (this as unknown as { fileService: FileService }).fileService = {
            resolve: async (uri: URI) => {
                if (uri.isEqual(existingFile)) {
                    return { isDirectory: false };
                }
                throw new Error('does not exist');
            }
        } as unknown as FileService;
        const opener: OpenHandler = {
            id: 'test',
            canHandle: () => 1,
            open: async (uri: URI) => {
                this.opened.push(uri.toString());
                return undefined;
            }
        };
        (this as unknown as { openerService: OpenerService }).openerService = {
            getOpener: async () => opener
        } as unknown as OpenerService;
        (this as unknown as { quickInputService: QuickInputService }).quickInputService = {
            open: (match: string) => { this.quickInputRequests.push(match); }
        } as unknown as QuickInputService;
    }

    readonly loggedErrors: string[] = [];
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

        it('should open an existing absolute workspace path instead of Quick Input', async () => {
            const workspaceRoot = URI.fromFilePath(OS.backend.isWindows ? 'C:\\workspace' : '/workspace');
            const fileUri = workspaceRoot.resolve('src/file.ts');
            const absolutePath = fileUri.path.fsPath();
            const provider = new TestLocalFileLinkProvider(workspaceRoot, fileUri);
            const links = await provider.provideLinks(`open ${absolutePath}`, terminalWithCwd(workspaceRoot));

            expect(links).to.have.lengthOf(1);
            await links[0].handle();

            expect(provider.opened).to.deep.equal([fileUri.toString()]);
            expect(provider.quickInputRequests).to.deep.equal([]);
        });
    });
});
