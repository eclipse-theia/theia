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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { NavigatorFileClipboard } from './navigator-file-clipboard';

disableJSDOM();

describe('NavigatorFileClipboard', () => {

    let jsdomCleanup: () => void;
    let clipboard: NavigatorFileClipboard;
    let onDidWriteTextEmitter: Emitter<string>;

    before(() => {
        jsdomCleanup = enableJSDOM();
    });
    after(() => {
        jsdomCleanup();
    });

    function createClipboard(clipboardService: ClipboardService): NavigatorFileClipboard {
        const container = new Container();
        container.bind(ClipboardService).toConstantValue(clipboardService);
        container.bind(NavigatorFileClipboard).toSelf().inSingletonScope();
        return container.get(NavigatorFileClipboard);
    }

    beforeEach(() => {
        onDidWriteTextEmitter = new Emitter<string>();
        clipboard = createClipboard({
            readText: async () => '',
            writeText: async () => undefined,
            onDidWriteText: onDidWriteTextEmitter.event
        });
    });

    it('should return undefined when nothing was copied', () => {
        expect(clipboard.get()).to.be.undefined;
    });

    it('should return the copied text', () => {
        clipboard.set('file:///workspace/a.txt');
        expect(clipboard.get()).to.equal('file:///workspace/a.txt');
    });

    it('should treat empty text as unset', () => {
        clipboard.set('');
        expect(clipboard.get()).to.be.undefined;
    });

    it('should keep the content when set during a copy event', () => {
        // simulates the navigator updating the clipboard within its own copy listener
        const listener = () => clipboard.set('file:///workspace/a.txt');
        document.addEventListener('copy', listener);
        try {
            document.body.dispatchEvent(new window.Event('copy', { bubbles: true }));
        } finally {
            document.removeEventListener('copy', listener);
        }
        expect(clipboard.get()).to.equal('file:///workspace/a.txt');
    });

    it('should clear the content when something else is copied', () => {
        clipboard.set('file:///workspace/a.txt');
        document.body.dispatchEvent(new window.Event('copy', { bubbles: true }));
        expect(clipboard.get()).to.be.undefined;
    });

    it('should clear the content when something else is cut', () => {
        clipboard.set('file:///workspace/a.txt');
        document.body.dispatchEvent(new window.Event('cut', { bubbles: true }));
        expect(clipboard.get()).to.be.undefined;
    });

    it('should clear the content when text is written through the clipboard service', () => {
        // e.g. Copy Path writes via ClipboardService.writeText, which dispatches no DOM copy event
        clipboard.set('file:///workspace/a.txt');
        onDidWriteTextEmitter.fire('/workspace/b.txt');
        expect(clipboard.get()).to.be.undefined;
    });

    it('should work with a clipboard service lacking the optional write event', () => {
        clipboard = createClipboard({
            readText: async () => '',
            writeText: async () => undefined
        });
        clipboard.set('file:///workspace/a.txt');
        expect(clipboard.get()).to.equal('file:///workspace/a.txt');
    });
});
