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
import { OpenerService, OpenHandler } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TerminalWidget } from './base/terminal-widget';
import { FileUriLinkProvider } from './terminal-file-uri-link-provider';

disableJSDOM();

const expect = chai.expect;

class TestFileUriLinkProvider extends FileUriLinkProvider {
    readonly loggedErrors: string[] = [];
    readonly opened: string[] = [];
    readonly openedOptions: unknown[] = [];

    constructor(existingFiles: string[], directories: string[] = []) {
        super();
        const files = new Set(existingFiles);
        const dirs = new Set(directories.map(uri => new URI(uri).toString()));
        (this as unknown as { logger: ILogger }).logger = {
            error: (message: unknown) => { this.loggedErrors.push(String(message)); }
        } as unknown as ILogger;
        (this as unknown as { fileService: FileService }).fileService = {
            resolve: async (uri: URI) => {
                if (dirs.has(uri.toString())) {
                    return { isDirectory: true };
                }
                if (files.has(uri.toString())) {
                    return { isDirectory: false };
                }
                throw new Error('does not exist');
            }
        } as unknown as FileService;
        const opener: OpenHandler = {
            id: 'test',
            canHandle: () => 1,
            open: async (uri: URI, options?: unknown) => {
                this.opened.push(uri.toString());
                this.openedOptions.push(options);
                return undefined;
            }
        };
        (this as unknown as { openerService: OpenerService }).openerService = {
            getOpener: async () => opener,
            getOpeners: async () => [opener]
        } as unknown as OpenerService;
    }
}

const terminal = {} as unknown as TerminalWidget;

describe('FileUriLinkProvider', () => {

    it('should linkify and open a POSIX file:// URL that resolves to a file', async () => {
        const uri = 'file:///home/user/project/file.ts';
        const provider = new TestFileUriLinkProvider([uri]);
        const links = await provider.provideLinks(`open ${uri} now`, terminal);
        expect(links).to.have.lengthOf(1);
        expect(links[0].startIndex).to.equal('open '.length);
        expect(links[0].length).to.equal(uri.length);
        expect(provider.loggedErrors).to.deep.equal([]);
        await links[0].handle();
        expect(provider.opened).to.deep.equal([new URI(uri).toString()]);
    });

    it('should linkify a Windows drive file:// URL', async () => {
        const uri = 'file:///C:/Users/dev/file.ts';
        const provider = new TestFileUriLinkProvider([new URI(uri).toString()]);
        const links = await provider.provideLinks(`see ${uri}`, terminal);
        expect(links).to.have.lengthOf(1);
        expect(provider.loggedErrors).to.deep.equal([]);
    });

    it('should linkify a UNC file:// URL with an authority', async () => {
        const uri = 'file://server/share/file.ts';
        const provider = new TestFileUriLinkProvider([new URI(uri).toString()]);
        const links = await provider.provideLinks(uri, terminal);
        expect(links).to.have.lengthOf(1);
        expect(provider.loggedErrors).to.deep.equal([]);
    });

    it('should not produce a link for a file:// URL that does not resolve, without throwing or logging', async () => {
        const provider = new TestFileUriLinkProvider([]);
        const links = await provider.provideLinks('open file:///home/user/missing.ts now', terminal);
        expect(links).to.deep.equal([]);
        expect(provider.loggedErrors).to.deep.equal([]);
    });

    it('should ignore http(s) URLs', async () => {
        const provider = new TestFileUriLinkProvider([]);
        const links = await provider.provideLinks('see https://example.com/path for details', terminal);
        expect(links).to.deep.equal([]);
    });

    it('should trim trailing sentence punctuation from the matched URL', async () => {
        const uri = 'file:///home/user/project/file.ts';
        const provider = new TestFileUriLinkProvider([uri]);
        const links = await provider.provideLinks(`the file is ${uri}.`, terminal);
        expect(links).to.have.lengthOf(1);
        expect(links[0].length).to.equal(uri.length);
    });

    it('should open at the given line and column for a file://…:line:column suffix', async () => {
        const uri = 'file:///home/user/project/file.ts';
        const provider = new TestFileUriLinkProvider([uri]);
        const match = `${uri}:10:5`;
        const links = await provider.provideLinks(`error at ${match}`, terminal);
        expect(links).to.have.lengthOf(1);
        // The whole `file://…:10:5` is clickable, but the URI drops the position suffix.
        expect(links[0].length).to.equal(match.length);
        await links[0].handle();
        expect(provider.opened).to.deep.equal([new URI(uri).toString()]);
        // one-based `10:5` becomes a zero-based editor position.
        expect(provider.openedOptions).to.deep.equal([{ selection: { start: { line: 9, character: 4 } } }]);
    });

    it('should open at the given line with a file://…:line suffix (no column)', async () => {
        const uri = 'file:///home/user/project/file.ts';
        const provider = new TestFileUriLinkProvider([uri]);
        const links = await provider.provideLinks(`${uri}:42`, terminal);
        expect(links).to.have.lengthOf(1);
        await links[0].handle();
        expect(provider.opened).to.deep.equal([new URI(uri).toString()]);
        expect(provider.openedOptions).to.deep.equal([{ selection: { start: { line: 41, character: 0 } } }]);
    });

    it('should keep the Windows drive colon and still apply a trailing position', async () => {
        const uri = 'file:///C:/Users/dev/file.ts';
        const provider = new TestFileUriLinkProvider([new URI(uri).toString()]);
        const links = await provider.provideLinks(`${uri}:7:3`, terminal);
        expect(links).to.have.lengthOf(1);
        await links[0].handle();
        expect(provider.opened).to.deep.equal([new URI(uri).toString()]);
        expect(provider.openedOptions).to.deep.equal([{ selection: { start: { line: 6, character: 2 } } }]);
    });

    it('should clamp a zero line/column to the first position', async () => {
        const uri = 'file:///home/user/project/file.ts';
        const provider = new TestFileUriLinkProvider([uri]);
        const links = await provider.provideLinks(`${uri}:0`, terminal);
        expect(links).to.have.lengthOf(1);
        await links[0].handle();
        expect(provider.openedOptions).to.deep.equal([{ selection: { start: { line: 0, character: 0 } } }]);
    });

    it('should not produce a link for a file:// URL that resolves to a directory', async () => {
        const uri = 'file:///home/user/project';
        const provider = new TestFileUriLinkProvider([], [uri]);
        const links = await provider.provideLinks(`open ${uri} now`, terminal);
        expect(links).to.deep.equal([]);
        expect(provider.loggedErrors).to.deep.equal([]);
    });

    it('should linkify every file:// URL on a line at the correct offsets', async () => {
        const a = 'file:///home/user/a.ts';
        const b = 'file:///home/user/b.ts';
        const provider = new TestFileUriLinkProvider([a, b]);
        const line = `first ${a} then ${b}`;
        const links = await provider.provideLinks(line, terminal);
        expect(links).to.have.lengthOf(2);
        expect(links.map(link => link.startIndex)).to.deep.equal([line.indexOf(a), line.indexOf(b)]);
        expect(links.map(link => line.substr(link.startIndex, link.length))).to.deep.equal([a, b]);
    });

    it('should not leak regex state across concurrent invocations', async () => {
        const a = 'file:///home/user/a.ts';
        const b = 'file:///home/user/b.ts';
        const provider = new TestFileUriLinkProvider([a, b]);
        const [linksA, linksB] = await Promise.all([
            provider.provideLinks(`x ${a}`, terminal),
            provider.provideLinks(b, terminal)
        ]);
        expect(linksA.map(link => link.length)).to.deep.equal([a.length]);
        expect(linksB.map(link => link.length)).to.deep.equal([b.length]);
    });
});
