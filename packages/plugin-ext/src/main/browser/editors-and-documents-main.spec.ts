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
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Emitter, URI } from '@theia/core';
import { BaseWidget, Navigatable, Saveable, SaveableSource, Widget } from '@theia/core/lib/browser';
import { SaveableService } from '@theia/core/lib/browser/saveable-service';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { EncodingRegistry } from '@theia/core/lib/browser/encoding-registry';
import { NotebookCellEditorService, NotebookEditorWidgetService } from '@theia/notebook/lib/browser';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { interfaces } from '@theia/core/shared/inversify';
import { URI as CodeURI } from '@theia/core/shared/vscode-uri';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { EditorModelService } from './text-editor-model-service';
import { TabsMainImpl } from './tabs/tabs-main';
import { RPCProtocol } from '../../common/rpc-protocol';
import { EditorsAndDocumentsDelta } from '../../common/plugin-api-rpc';
import { EditorsAndDocumentsExtImpl } from '../../plugin/editors-and-documents';

disableJSDOM();

class TestSaveable implements Saveable {
    dirty = true;
    readonly onDirtyChanged = new Emitter<void>().event;
    readonly onContentChanged = new Emitter<void>().event;
    saveCount = 0;

    async save(): Promise<void> {
        this.saveCount++;
        this.dirty = false;
    }
}

/** Navigatable to the resource, but with nothing to save. */
class TestNavigatableWidget extends BaseWidget implements Navigatable {
    constructor(private readonly uri: URI) {
        super();
    }

    getResourceUri(): URI {
        return this.uri;
    }

    createMoveToUri(): URI {
        return this.uri;
    }
}

/** Stands in for a `CustomEditorWidget`: saveable and navigatable, but not an `EditorWidget`. */
class TestSaveableWidget extends TestNavigatableWidget implements SaveableSource {
    readonly saveable = new TestSaveable();
}

function createEditorsAndDocumentsMain(
    editor: EditorWidget | undefined,
    widgets: Widget[]
): EditorsAndDocumentsMain {
    // Bypass the constructor's RPC/container wiring: `save` and `saveAs` only touch the
    // editor manager, the shell and the saveable service.
    const main = Object.create(EditorsAndDocumentsMain.prototype) as EditorsAndDocumentsMain;
    const fields = main as unknown as Record<string, unknown>;
    fields.editorManager = { getByUri: async () => editor } as unknown as EditorManager;
    fields.shell = { widgets };
    fields.saveResourceService = new SaveableService();
    return main;
}

describe('EditorsAndDocumentsMain#save', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const uri = new URI('custom-editor:/some/resource?viewType=test');

    it('saves a saveable widget that the editor manager does not know', async () => {
        const widget = new TestSaveableWidget(uri);
        const main = createEditorsAndDocumentsMain(undefined, [widget]);

        const saved = await main.save(uri);

        expect(widget.saveable.saveCount).to.equal(1);
        expect(saved?.toString()).to.equal(uri.toString());
    });

    it('prefers the text editor when the editor manager has one', async () => {
        const editor = new TestSaveableWidget(uri);
        const custom = new TestSaveableWidget(uri);
        const main = createEditorsAndDocumentsMain(editor as unknown as EditorWidget, [custom]);

        await main.save(uri);

        expect(editor.saveable.saveCount).to.equal(1);
        expect(custom.saveable.saveCount).to.equal(0);
    });

    it('leaves widgets bound to another resource alone', async () => {
        const other = new TestSaveableWidget(new URI('custom-editor:/other/resource'));
        const main = createEditorsAndDocumentsMain(undefined, [other]);

        const saved = await main.save(uri);

        expect(other.saveable.saveCount).to.equal(0);
        expect(saved).to.be.undefined;
    });

    it('ignores a widget that is navigatable to the resource but not saveable', async () => {
        const main = createEditorsAndDocumentsMain(undefined, [new TestNavigatableWidget(uri)]);

        expect(await main.save(uri)).to.be.undefined;
    });

    it('resolves saveAs through the same fallback', async () => {
        const widget = new TestSaveableWidget(uri);
        const main = createEditorsAndDocumentsMain(undefined, [widget]);
        const saveAsTargets: Widget[] = [];
        // `SaveableService.canSaveAs` is unconditionally false on the base class, so the
        // service is stubbed to reach the `saveAs` branch at all.
        (main as unknown as Record<string, unknown>).saveResourceService = {
            canSaveAs: (candidate: Widget) => candidate === widget,
            saveAs: async (target: Widget) => { saveAsTargets.push(target); return uri; }
        };

        const saved = await main.saveAs(uri);

        expect(saveAsTargets).to.deep.equal([widget]);
        expect(saved?.toString()).to.equal(uri.toString());
    });
});

function createModel(uri: CodeURI, content: string): MonacoEditorModel {
    const event = new Emitter<never>().event;
    return {
        textEditorModel: {
            uri,
            getVersionId: () => 1,
            getLinesContent: () => [content],
            getEOL: () => '\n',
            onDidChangeLanguage: event
        },
        getLanguageId: () => 'json',
        languageId: 'json',
        dirty: false,
        getEncoding: () => 'utf8',
        onDidSaveModel: event,
        onModelWillSaveModel: event,
        onDirtyChanged: event,
        onDidChangeEncoding: event
    } as unknown as MonacoEditorModel;
}

describe('EditorsAndDocumentsMain document synchronization', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const uri = CodeURI.parse('user-storage:/user/settings.json');

    it('replaces a document whose model is disposed and immediately reopened', () => {
        const ext = new EditorsAndDocumentsExtImpl();
        (ext as unknown as Record<string, unknown>).rpc = { getProxy: () => ({}) };
        const errors: unknown[] = [];
        const proxy = {
            $acceptEditorsAndDocumentsDelta: (delta: EditorsAndDocumentsDelta) => {
                try {
                    ext.acceptEditorsAndDocumentsDelta(delta);
                } catch (e) {
                    errors.push(e);
                }
            }
        };

        const models = new Set<MonacoEditorModel>();
        const created = new Emitter<MonacoEditorModel>();
        const closed = new Emitter<MonacoEditorModel>();
        const modelService = new EditorModelService(
            { get models(): MonacoEditorModel[] { return Array.from(models); }, onDidCreate: created.event } as unknown as MonacoTextModelService,
            { onDidCloseTextDocument: closed.event } as unknown as MonacoWorkspace
        );
        const services = new Map<interfaces.ServiceIdentifier, unknown>([
            [EditorManager, { onCreated: new Emitter().event, onCurrentEditorChanged: new Emitter().event, all: [], currentEditor: undefined }],
            [EditorModelService, modelService],
            [SaveableService, {}],
            [EncodingRegistry, { getEncodingForResource: () => 'utf8' }],
            [NotebookCellEditorService, { onDidChangeCellEditors: new Emitter().event, allCellEditors: [], getActiveCell: () => undefined }],
            [NotebookEditorWidgetService, { onDidChangeCurrentEditor: new Emitter().event }]
        ]);
        const container = { get: (id: interfaces.ServiceIdentifier) => services.get(id) } as interfaces.Container;
        const rpc = { getProxy: () => proxy } as unknown as RPCProtocol;
        const main = new EditorsAndDocumentsMain(rpc, container, {} as TabsMainImpl);
        main.listen();

        const first = createModel(uri, 'first');
        models.add(first);
        created.fire(first);

        // Mirrors `MonacoTextModelService`, which drops a model before its close event fires.
        models.delete(first);
        closed.fire(first);
        const second = createModel(uri, 'second');
        models.add(second);
        created.fire(second);

        expect(errors).to.be.empty;
        expect(ext.getDocument(uri.toString())?.document.getText()).to.equal('second');
        main.dispose();
    });
});
