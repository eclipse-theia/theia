/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { DisposableCollection } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { EditorPreferenceChange, EditorPreferences } from '@theia/editor/lib/browser';
import { DiffUriHelper } from '@theia/editor/lib/browser/editor-utility';
import { inject, injectable } from 'inversify';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';

import { MonacoCommandServiceFactory } from './monaco-command-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoDiffEditor } from './monaco-diff-editor';
import { MonacoEditor } from './monaco-editor';
import { MonacoEditorModel } from './monaco-editor-model';
import { MonacoEditorService } from './monaco-editor-service';
import { MonacoQuickOpenService } from './monaco-quick-open-service';
import { MonacoTextModelService } from './monaco-text-model-service';
import { MonacoWorkspace } from './monaco-workspace';

import IEditorOverrideServices = monaco.editor.IEditorOverrideServices;

const monacoTheme = 'vs-dark';
monaco.editor.setTheme(monacoTheme);
document.body.classList.add(monacoTheme);

@injectable()
export class MonacoEditorProvider {

    constructor(
        @inject(MonacoEditorService) protected readonly editorService: MonacoEditorService,
        @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService,
        @inject(MonacoContextMenuService) protected readonly contextMenuService: MonacoContextMenuService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter,
        @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace,
        @inject(MonacoCommandServiceFactory) protected readonly commandServiceFactory: MonacoCommandServiceFactory,
        @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences,
        @inject(MonacoQuickOpenService) protected readonly quickOpenService: MonacoQuickOpenService
    ) { }

    protected async createReference(uri: URI, toDispose: DisposableCollection): Promise<MonacoEditorModel> {
        await this.editorPreferences.ready;

        const reference = await this.textModelService.createModelReference(uri);
        toDispose.push(reference);

        const model = reference.object;
        const textEditorModel = model.textEditorModel;
        textEditorModel.updateOptions(this.getModelOptions());

        return model;
    }

    protected createEditor(create: (n: HTMLDivElement, o: IEditorOverrideServices) => MonacoEditor, toDispose: DisposableCollection): MonacoEditor {
        const node = document.createElement('div');
        const commandService = this.commandServiceFactory();
        const { editorService, textModelService, contextMenuService } = this;
        const override = {
            editorService,
            textModelService,
            contextMenuService,
            commandService
        };

        const editor = create(node, override);

        toDispose.push(this.editorPreferences.onPreferenceChanged(e => this.updateOptions(e, editor)));
        editor.onDispose(() => toDispose.dispose());
        const standaloneCommandService = new monaco.services.StandaloneCommandService(editor.instantiationService);
        commandService.setDelegate(standaloneCommandService);
        this.installQuickOpenService(editor);

        return editor;
    }

    async get(uri: URI): Promise<MonacoEditor> {
        let editor: MonacoEditor;
        const toDispose = new DisposableCollection();

        if (!DiffUriHelper.isDiffUri(uri)) {
            const model = await this.createReference(uri, toDispose);

            editor = this.createEditor((node, override) => new MonacoEditor(
                uri, node, this.m2p, this.p2m, this.workspace, this.getEditorOptions(model), override
            ), toDispose);

        } else {
            const diffUri = DiffUriHelper.decode(uri);

            const originalModel = await this.createReference(new URI(diffUri.original), toDispose);
            const modifiedModel = await this.createReference(new URI(diffUri.modified), toDispose);

            editor = this.createEditor((node, override) => new MonacoDiffEditor(
                node,
                this.m2p,
                this.p2m,
                this.workspace,
                {
                    original: originalModel.textEditorModel,
                    modified: modifiedModel.textEditorModel
                },
                this.getDiffEditorOptions(),
                override
            ), toDispose);
        }

        return Promise.resolve(editor);
    }

    protected getModelOptions(): monaco.editor.ITextModelUpdateOptions {
        return {
            tabSize: this.editorPreferences["editor.tabSize"]
        };
    }

    protected getEditorOptions(model: MonacoEditorModel): MonacoEditor.IOptions | undefined {
        return {
            model: model.textEditorModel,
            wordWrap: 'off',
            folding: true,
            lineNumbers: this.editorPreferences["editor.lineNumbers"],
            renderWhitespace: this.editorPreferences["editor.renderWhitespace"],
            glyphMargin: true,
            readOnly: model.readOnly
        };
    }

    protected getDiffEditorOptions(): MonacoDiffEditor.IOptions {
        return {};
    }

    protected readonly modelOptions: {
        [name: string]: (keyof monaco.editor.ITextModelUpdateOptions | undefined)
    } = {
        'editor.tabSize': 'tabSize'
    };

    protected readonly editorOptions: {
        [name: string]: (keyof monaco.editor.IEditorOptions | undefined)
    } = {
        'editor.lineNumbers': 'lineNumbers',
        'editor.renderWhitespace': 'renderWhitespace'
    };

    protected updateOptions(change: EditorPreferenceChange, editor: MonacoEditor): void {
        const modelOption = this.modelOptions[change.preferenceName];
        if (modelOption) {
            const options: monaco.editor.ITextModelUpdateOptions = {};
            // tslint:disable-next-line:no-any
            options[modelOption] = change.newValue as any;
            editor.getControl().getModel().updateOptions(options);
        }

        const editorOption = this.editorOptions[change.preferenceName];
        if (editorOption) {
            const options: monaco.editor.IEditorOptions = {};
            options[editorOption] = change.newValue;
            editor.getControl().updateOptions(options);
        }
    }

    protected installQuickOpenService(editor: MonacoEditor | MonacoDiffEditor): void {
        const control = editor.getControl();
        const quickOpenController = control._contributions['editor.controller.quickOpenController'];
        quickOpenController.run = options => {
            const selection = control.getSelection();
            this.quickOpenService.internalOpen({
                ...options,
                onClose: canceled => {
                    quickOpenController.clearDecorations();

                    if (canceled && selection) {
                        control.setSelection(selection);
                        control.revealRangeInCenterIfOutsideViewport(selection);
                    }
                    editor.focus();
                }
            });
        };
    }

}
