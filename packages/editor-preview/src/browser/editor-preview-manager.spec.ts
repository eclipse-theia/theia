/********************************************************************************
 * Copyright (C) 2018 Google and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// This file is strictly for testing; disable no-any so we can mock out objects not under test
// disable no-unused-expression for chai.
/* eslint-disable no-unused-expressions, @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJsDom = enableJSDOM();

import URI from '@theia/core/lib/common/uri';
import { Container } from '@theia/core/shared/inversify';
import { EditorPreviewManager } from './editor-preview-manager';
import { EditorPreviewWidget } from './editor-preview-widget';
import { EditorPreviewWidgetFactory } from './editor-preview-factory';
import { OpenHandler, PreferenceService, PreferenceServiceImpl } from '@theia/core/lib/browser';
import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as previewFrontEndModule from './editor-preview-frontend-module';

const mockEditorWidget = sinon.createStubInstance(EditorWidget);
sinon.stub(mockEditorWidget, 'id').get(() => 'mockEditorWidget');

const mockPreviewWidget = sinon.createStubInstance(EditorPreviewWidget);
sinon.stub(mockPreviewWidget, 'id').get(() => 'mockPreviewWidget');
sinon.stub(mockPreviewWidget, 'disposed').get(() => ({ connect: () => 1 }));
let onPinnedListeners: Function[] = [];
sinon.stub(mockPreviewWidget, 'onPinned').get(() => (fn: Function) => onPinnedListeners.push(fn));

const mockEditorManager = sinon.createStubInstance(EditorManager);
mockEditorManager.getOrCreateByUri = sinon.stub().returns(mockEditorWidget);

const mockWidgetManager = sinon.createStubInstance(WidgetManager);
let onCreateListeners: Function[] = [];
mockWidgetManager.onDidCreateWidget = sinon.stub().callsFake((fn: Function) => onCreateListeners.push(fn));
(mockWidgetManager.getOrCreateWidget as sinon.SinonStub).returns(mockPreviewWidget);

const mockShell = sinon.createStubInstance(ApplicationShell) as ApplicationShell;

const mockPreference = sinon.createStubInstance(PreferenceServiceImpl);
mockPreference.onPreferencesChanged = sinon.stub().returns({ dispose: () => { } });

let testContainer: Container;

before(() => {
    testContainer = new Container();
    // Mock out injected dependencies.
    testContainer.bind(EditorManager).toDynamicValue(ctx => mockEditorManager);
    testContainer.bind(WidgetManager).toDynamicValue(ctx => mockWidgetManager);
    testContainer.bind(ApplicationShell).toConstantValue(mockShell);
    testContainer.bind(PreferenceService).toDynamicValue(ctx => mockPreference);

    testContainer.load(previewFrontEndModule.default);
});

after(() => {
    disableJsDom();
});

describe('editor-preview-manager', () => {
    let previewManager: EditorPreviewManager;

    beforeEach(() => {
        previewManager = testContainer.get<EditorPreviewManager>(OpenHandler);
        sinon.stub(previewManager as any, 'onActive').resolves();
        sinon.stub(previewManager as any, 'onReveal').resolves();
    });
    afterEach(() => {
        onCreateListeners = [];
        onPinnedListeners = [];
    });

    it('should handle preview requests if editor.enablePreview enabled', async () => {
        (mockPreference.get as sinon.SinonStub).returns(true);
        expect(await previewManager.canHandle(new URI(), { preview: true })).to.be.greaterThan(0);
    });
    it('should not handle preview requests if editor.enablePreview disabled', async () => {
        (mockPreference.get as sinon.SinonStub).returns(false);
        expect(await previewManager.canHandle(new URI(), { preview: true })).to.equal(0);
    });
    it('should not handle requests that are not preview or currently being previewed', async () => {
        expect(await previewManager.canHandle(new URI())).to.equal(0);
    });
    it('should create a preview editor and replace where required.', async () => {
        const w = await previewManager.open(new URI(), { preview: true });
        expect(w instanceof EditorPreviewWidget).to.be.true;
        expect((w as any).replaceEditorWidget.calledOnce).to.be.false;

        // Replace the EditorWidget with another open call to an editor that doesn't exist.
        const afterReplace = await previewManager.open(new URI(), { preview: true });
        expect((afterReplace as any).replaceEditorWidget.calledOnce).to.be.true;

        // Ensure the same preview widget was re-used.
        expect(w).to.equal(afterReplace);
    });
    it('Should return an existing editor on preview request', async () => {
        // Activate existing editor
        mockEditorManager.getByUri.returns(mockEditorWidget);
        mockEditorManager.open.returns(mockEditorWidget);
        expect(await previewManager.open(new URI(), {})).to.equal(mockEditorWidget);

        // Activate existing preview
        mockEditorWidget.parent = mockPreviewWidget;
        expect(await previewManager.open(new URI(), { preview: true })).to.equal(mockPreviewWidget);
        // Ensure it is not pinned.
        expect((mockPreviewWidget.pinEditorWidget as sinon.SinonStub).calledOnce).to.be.false;

        // Pin existing preview
        expect(await previewManager.open(new URI(), {})).to.equal(mockPreviewWidget);
        expect((mockPreviewWidget.pinEditorWidget as sinon.SinonStub).calledOnce).to.be.true;
    });
    it('should should transition the editor to permanent on pin events.', async () => {
        // Fake creation call.
        // eslint-disable-next-line no-unsanitized/method
        await onCreateListeners.pop()!({ factoryId: EditorPreviewWidgetFactory.ID, widget: mockPreviewWidget });
        // Fake pinned call
        // eslint-disable-next-line no-unsanitized/method
        onPinnedListeners.pop()!({ preview: mockPreviewWidget, editorWidget: mockEditorWidget });

        expect(mockPreviewWidget.dispose.calledOnce).to.be.true;
        expect(mockEditorWidget.close.calledOnce).to.be.false;
        expect(mockEditorWidget.dispose.calledOnce).to.be.false;
    });

});
