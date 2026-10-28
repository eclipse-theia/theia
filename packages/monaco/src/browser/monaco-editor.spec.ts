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
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Disposable, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import type { MonacoEditor as MonacoEditorType, MonacoEditorServices } from './monaco-editor';
import type { MonacoEditorModel } from './monaco-editor-model';
import type { MonacoDiffEditor as MonacoDiffEditorType } from './monaco-diff-editor';
import type { MonacoToProtocolConverter as MonacoToProtocolConverterType } from './monaco-to-protocol-converter';
import type { ProtocolToMonacoConverter as ProtocolToMonacoConverterType } from './protocol-to-monaco-converter';

disableJSDOM();

describe('MonacoEditor visibility', () => {
    let MonacoEditor: typeof MonacoEditorType;
    let MonacoDiffEditor: typeof MonacoDiffEditorType;
    let MonacoToProtocolConverter: typeof MonacoToProtocolConverterType;
    let ProtocolToMonacoConverter: typeof ProtocolToMonacoConverterType;

    before(async () => {
        disableJSDOM = enableJSDOM();
        // Initialize baseline services before editor imports register additional services requiring browser CSS globals.
        StandaloneServices.get(IInstantiationService);
        ({ MonacoEditor } = await import('./monaco-editor'));
        ({ MonacoDiffEditor } = await import('./monaco-diff-editor'));
        ({ MonacoToProtocolConverter } = await import('./monaco-to-protocol-converter'));
        ({ ProtocolToMonacoConverter } = await import('./protocol-to-monaco-converter'));
    });
    after(() => disableJSDOM());

    const model = {
        validatePosition: (position: object) => position,
        getLineContent: () => '\tfoo',
        getOptions: () => ({ tabSize: 4 })
    };
    const viewState = {
        cursorState: [{ inSelectionMode: false, selectionStart: { lineNumber: 1, column: 3 }, position: { lineNumber: 1, column: 3 } }]
    };
    let editor: MonacoEditorType;
    let control: ReturnType<typeof createControl>;

    const createControl = (initiallyAttached = true) => {
        let currentModel: object | undefined = initiallyAttached ? model : undefined;
        return {
            createContextKey: sinon.spy(),
            setModel: sinon.spy((value: object | undefined) => currentModel = value),
            getModel: () => currentModel,
            getPosition: () => currentModel ? { lineNumber: 1, column: 1 } : undefined,
            getVisibleColumnFromPosition: sinon.stub().returns(1),
            saveViewState: sinon.stub().returns(viewState),
            restoreViewState: sinon.spy(),
            focus: sinon.spy(),
            render: sinon.spy()
        };
    };

    beforeEach(() => {
        control = createControl();
        editor = new class extends MonacoEditor {
            constructor() {
                super(new URI('file:///test.ts'), {
                    textEditorModel: model,
                    onDidChangeReadOnly: Event.None,
                    onDidChangeEncoding: Event.None
                } as unknown as MonacoEditorModel, document.createElement('div'), {
                    m2p: new MonacoToProtocolConverter(),
                    p2m: new ProtocolToMonacoConverter()
                } as unknown as MonacoEditorServices);
            }

            protected override create(): Disposable {
                this.editor = control as unknown as typeof this.editor;
                return Disposable.NULL;
            }

            protected override addHandlers(): void { }
        }();
    });
    afterEach(() => editor.dispose());

    it('should detach on hide and restore the model and view state without focusing on show', () => {
        expect(editor.detachModelOnHide).to.be.true;
        editor.handleVisibilityChanged(false);
        expect(control.saveViewState.calledOnce).to.be.true;
        expect(control.setModel.calledOnce).to.be.true;
        expect(control.getModel()).to.not.exist;
        expect(control.focus.called).to.be.false;

        editor.handleVisibilityChanged(true);
        expect(control.setModel.secondCall.calledWithExactly(model)).to.be.true;
        expect(control.restoreViewState.calledOnceWithExactly(viewState)).to.be.true;
        expect(control.focus.called).to.be.false;
        expect(control.setModel.secondCall.calledBefore(control.restoreViewState.firstCall)).to.be.true;
    });

    it('should read the cursor and its visible column from the saved view state and the document while hidden', () => {
        editor.handleVisibilityChanged(false);
        const cursor = editor.cursor;
        expect(cursor).to.deep.equal({ line: 0, character: 2 });
        // the tab before the cursor takes up 4 columns
        expect(editor.getVisibleColumn(cursor)).to.equal(6);
        expect(control.getVisibleColumnFromPosition.called).to.be.false;
    });

    it('should retain the model and view state without focusing when opting out', () => {
        editor.detachModelOnHide = false;
        for (let index = 0; index < 2; index++) {
            editor.handleVisibilityChanged(false);
            expect(control.getModel()).to.equal(model);
            editor.handleVisibilityChanged(true);
        }
        expect(control.setModel.called).to.be.false;
        expect(control.saveViewState.called).to.be.false;
        expect(control.restoreViewState.called).to.be.false;
        expect(control.focus.called).to.be.false;
    });

    it('should stage and unstage a hidden editor for preview without focusing it', () => {
        editor.handleVisibilityChanged(false);
        editor.stageForPreview();
        expect(control.getModel()).to.equal(model);
        expect(control.restoreViewState.calledOnceWithExactly(viewState)).to.be.true;
        expect(control.render.calledOnceWithExactly(true)).to.be.true;
        editor.unstagePreview();
        expect(control.getModel()).to.not.exist;
        expect(control.saveViewState.calledTwice).to.be.true;
        expect(control.focus.called).to.be.false;
    });

    it('should keep the model attached when showing an editor staged for preview', () => {
        editor.handleVisibilityChanged(false);
        editor.stageForPreview();
        editor.handleVisibilityChanged(true);
        editor.unstagePreview();
        expect(control.getModel()).to.equal(model);
        expect(control.setModel.callCount).to.equal(3);
        expect(control.focus.called).to.be.false;
    });

    it('should not stage or unstage an attached model when opting out', () => {
        editor.detachModelOnHide = false;
        editor.handleVisibilityChanged(false);
        editor.stageForPreview();
        editor.unstagePreview();
        expect(control.getModel()).to.equal(model);
        expect(control.setModel.called).to.be.false;
        expect(control.saveViewState.called).to.be.false;
        expect(control.restoreViewState.called).to.be.false;
        expect(control.render.called).to.be.false;
    });

    it('should reveal the first diff only on the initial show by default', () => {
        const diffControl = { ...control, revealFirstDiff: sinon.spy() };
        const diffEditor = Object.assign(Object.create(MonacoDiffEditor.prototype) as MonacoDiffEditorType, {
            _diffEditor: diffControl,
            diffEditorModel: model,
            detachModelOnHide: true
        });
        diffEditor.handleVisibilityChanged(true);
        expect(diffControl.revealFirstDiff.calledOnce).to.be.true;
        diffEditor.handleVisibilityChanged(false);
        diffEditor.handleVisibilityChanged(true);
        expect(diffControl.revealFirstDiff.calledOnce).to.be.true;
        expect(control.setModel.callCount).to.equal(3);
        expect(control.restoreViewState.secondCall.calledWithExactly(viewState)).to.be.true;
    });

    it('should initially attach a model-less diff editor without focusing when opting out', () => {
        const diffControl = { ...createControl(false), revealFirstDiff: sinon.spy() };
        const diffEditor = Object.assign(Object.create(MonacoDiffEditor.prototype) as MonacoDiffEditorType, {
            _diffEditor: diffControl,
            diffEditorModel: model,
            detachModelOnHide: false
        });
        expect(diffControl.getModel()).to.be.undefined;
        diffEditor.handleVisibilityChanged(true);
        expect(diffControl.getModel()).to.equal(model);
        expect(diffControl.setModel.calledOnceWithExactly(model)).to.be.true;

        for (let index = 0; index < 2; index++) {
            diffEditor.handleVisibilityChanged(false);
            expect(diffControl.getModel()).to.equal(model);
            diffEditor.handleVisibilityChanged(true);
        }
        expect(diffControl.setModel.calledOnceWithExactly(model)).to.be.true;
        expect(diffControl.saveViewState.called).to.be.false;
        expect(diffControl.restoreViewState.called).to.be.false;
        expect(diffControl.revealFirstDiff.called).to.be.false;
        expect(diffControl.focus.called).to.be.false;
    });

    it('should not reveal the first diff on each show when opting out', () => {
        const diffControl = { ...control, revealFirstDiff: sinon.spy() };
        const diffEditor = Object.assign(Object.create(MonacoDiffEditor.prototype) as MonacoDiffEditorType, {
            _diffEditor: diffControl,
            diffEditorModel: model,
            detachModelOnHide: false
        });
        diffEditor.handleVisibilityChanged(false);
        diffEditor.handleVisibilityChanged(true);
        diffEditor.handleVisibilityChanged(false);
        diffEditor.handleVisibilityChanged(true);
        expect(diffControl.revealFirstDiff.called).to.be.false;
        expect(control.setModel.called).to.be.false;
        expect(control.restoreViewState.called).to.be.false;
    });
});
