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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { ApplicationProps } from '@theia/application-package/lib/application-props';
FrontendApplicationConfigProvider.set({
    ...ApplicationProps.DEFAULT.frontend.config
});

import { Container } from '@theia/core/shared/inversify';
import { WidgetFactory, WidgetManager } from '@theia/core/lib/browser';
import { EditorWidget, EditorManager } from '@theia/editor/lib/browser';
import { EditorPreviewWidgetFactory, EditorPreviewWidgetOptions } from './editor-preview-factory';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as previewFrontEndModule from './editor-preview-frontend-module';

const mockEditorWidget = sinon.createStubInstance(EditorWidget);
const mockEditorManager = {
    getOrCreateByUri: () => { }
};
const getOrCreateStub = sinon.stub(mockEditorManager, 'getOrCreateByUri').returns(mockEditorWidget);

let testContainer: Container;

before(() => {
    testContainer = new Container();
    // Mock out injected dependencies.
    testContainer.bind(WidgetManager).toDynamicValue(ctx => ({} as any));
    testContainer.bind(EditorManager).toDynamicValue(ctx => (mockEditorManager as any));
    testContainer.load(previewFrontEndModule.default);
});

after(() => {
    disableJsDom();
});

describe('editor-preview-factory', () => {
    let widgetFactory: EditorPreviewWidgetFactory;

    beforeEach(() => {
        widgetFactory = testContainer.get<EditorPreviewWidgetFactory>(WidgetFactory);
        getOrCreateStub.resetHistory();
    });

    it('should create a new editor widget via editor manager if same session', async () => {
        const opts: EditorPreviewWidgetOptions = {
            kind: 'editor-preview-widget',
            id: '1',
            initialUri: 'file://a/b/c',
            session: EditorPreviewWidgetFactory.sessionId
        };
        const widget = await widgetFactory.createWidget(opts);
        expect((mockEditorManager.getOrCreateByUri as sinon.SinonStub).calledOnce).to.be.true;
        expect(widget.id).to.equal(opts.id);
        expect(widget.editorWidget).to.equal(mockEditorWidget);
    });

    it('should not create a widget if restoring from previous session', async () => {
        const opts: EditorPreviewWidgetOptions = {
            kind: 'editor-preview-widget',
            id: '2',
            initialUri: 'file://a/b/c',
            session: 'session-mismatch'
        };
        const widget = await widgetFactory.createWidget(opts);
        expect((mockEditorManager.getOrCreateByUri as sinon.SinonStub).called).to.be.false;
        expect(widget.id).to.equal(opts.id);
        expect(widget.editorWidget).to.be.undefined;
    });
});
