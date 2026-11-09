// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { UntitledResource, UntitledResourceResolver, URI } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';
import { CodeWrapper } from './code-part-renderer.js';
import { CodeWrapperEditors } from './code-wrapper-editors.js';

disableJSDOM();

interface FakeEditor {
    editor: SimpleMonacoEditor;
    disposed: boolean;
}

function fakeEditor(): FakeEditor {
    const fake: FakeEditor = { editor: undefined!, disposed: false };
    fake.editor = {
        document: { textEditorModel: { setValue: () => { } } },
        getControl: () => ({ onContextMenu: () => ({ dispose: () => { } }) }),
        resizeToFit: () => { },
        dispose: () => { fake.disposed = true; }
    } as unknown as SimpleMonacoEditor;
    return fake;
}

describe('CodeWrapper', () => {

    let container: HTMLElement;
    let root: Root;
    let resource: Deferred<UntitledResource>;
    let resourceDisposed: boolean;
    let editorRequests: HTMLElement[];
    let editor: Deferred<SimpleMonacoEditor>;

    const untitledResourceResolver = {
        createUntitledResource: () => resource.promise
    } as unknown as UntitledResourceResolver;

    const editorProvider = {
        createSimpleInline: (_uri: URI, node: HTMLElement) => {
            editorRequests.push(node);
            return editor.promise;
        }
    } as unknown as MonacoEditorProvider;

    const render = () => flushSync(() => root.render(
        <CodeWrapper
            content='const a = 1;'
            language='.ts'
            untitledResourceResolver={untitledResourceResolver}
            editorProvider={editorProvider}
            contextMenuCallback={() => { }}
        />
    ));

    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        resource = new Deferred();
        resourceDisposed = false;
        editorRequests = [];
        editor = new Deferred();
    });

    afterEach(() => {
        container.remove();
    });

    const resolveResource = () => resource.resolve({
        uri: new URI('untitled:/Untitled-test.ts'),
        dispose: () => { resourceDisposed = true; }
    } as unknown as UntitledResource);

    it('disposes the editor when the code block is unmounted', async () => {
        render();
        const element = container.querySelector(`.${CodeWrapperEditors.CLASS}`)!;
        resolveResource();
        await settle();
        const fake = fakeEditor();
        editor.resolve(fake.editor);
        await settle();
        expect(CodeWrapperEditors.get(element)).to.equal(fake.editor);

        flushSync(() => root.unmount());

        expect(fake.disposed).to.be.true;
        expect(CodeWrapperEditors.get(element)).to.be.undefined;
    });

    it('disposes an editor that is created after the code block is unmounted', async () => {
        render();
        const element = container.querySelector(`.${CodeWrapperEditors.CLASS}`)!;
        resolveResource();
        await settle();
        expect(editorRequests).to.have.length(1);

        flushSync(() => root.unmount());
        const fake = fakeEditor();
        editor.resolve(fake.editor);
        await settle();

        expect(fake.disposed).to.be.true;
        expect(CodeWrapperEditors.get(element)).to.be.undefined;
    });

    it('does not create an editor when the code block is unmounted before its resource exists', async () => {
        render();

        flushSync(() => root.unmount());
        resolveResource();
        await settle();

        expect(editorRequests).to.have.length(0);
        expect(resourceDisposed).to.be.true;
    });
});
