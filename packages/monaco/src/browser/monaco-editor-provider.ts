/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

// tslint:disable:no-any
import URI from '@theia/core/lib/common/uri';
import { EditorPreferenceChange, EditorPreferences, TextEditor, DiffNavigator } from '@theia/editor/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { inject, injectable } from 'inversify';
import { DisposableCollection } from '@theia/core/lib/common';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import { MonacoCommandServiceFactory } from './monaco-command-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoDiffEditor } from './monaco-diff-editor';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { MonacoEditor } from './monaco-editor';
import { MonacoEditorModel } from './monaco-editor-model';
import { MonacoEditorService } from './monaco-editor-service';
import { MonacoQuickOpenService } from './monaco-quick-open-service';
import { MonacoTextModelService } from './monaco-text-model-service';
import { MonacoWorkspace } from './monaco-workspace';

import IEditorOverrideServices = monaco.editor.IEditorOverrideServices;

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
        @inject(MonacoQuickOpenService) protected readonly quickOpenService: MonacoQuickOpenService,
        @inject(MonacoDiffNavigatorFactory) protected readonly diffNavigatorFactory: MonacoDiffNavigatorFactory,
    ) { }

    protected async getModel(uri: URI, toDispose: DisposableCollection): Promise<MonacoEditorModel> {
        const reference = await this.textModelService.createModelReference(uri);
        toDispose.push(reference);
        return reference.object;
    }

    async get(uri: URI): Promise<MonacoEditor> {
        await this.editorPreferences.ready;

        const commandService = this.commandServiceFactory();
        const { editorService, textModelService, contextMenuService } = this;
        const override = {
            editorService,
            textModelService,
            contextMenuService,
            commandService
        };

        const toDispose = new DisposableCollection();
        const editor = await this.createEditor(uri, override, toDispose);
        editor.onDispose(() => toDispose.dispose());

        const standaloneCommandService = new monaco.services.StandaloneCommandService(editor.instantiationService);
        commandService.setDelegate(standaloneCommandService);
        this.installQuickOpenService(editor);
        this.installReferencesController(editor);

        return editor;
    }

    protected createEditor(uri: URI, override: IEditorOverrideServices, toDispose: DisposableCollection): Promise<MonacoEditor> {
        if (DiffUris.isDiffUri(uri)) {
            return this.createMonacoDiffEditor(uri, override, toDispose);
        }
        return this.createMonacoEditor(uri, override, toDispose);
    }

    protected get preferencePrefixes(): string[] {
        return ['editor.'];
    }
    protected async createMonacoEditor(uri: URI, override: IEditorOverrideServices, toDispose: DisposableCollection): Promise<MonacoEditor> {
        const model = await this.getModel(uri, toDispose);
        const options = this.createMonacoEditorOptions(model);
        const editor = new MonacoEditor(uri, model, document.createElement('div'), this.m2p, this.p2m, options, override);
        toDispose.push(this.editorPreferences.onPreferenceChanged(event => this.updateMonacoEditorOptions(editor, event)));
        return editor;
    }
    protected createMonacoEditorOptions(model: MonacoEditorModel): MonacoEditor.IOptions {
        const options = this.createOptions(this.preferencePrefixes);
        options.model = model.textEditorModel;
        options.readOnly = model.readOnly;
        return options;
    }
    protected updateMonacoEditorOptions(editor: MonacoEditor, event: EditorPreferenceChange): void {
        const { preferenceName, newValue } = event;
        editor.getControl().updateOptions(this.setOption(preferenceName, newValue, this.preferencePrefixes));
    }

    protected get diffPreferencePrefixes(): string[] {
        return [...this.preferencePrefixes, 'diffEditor.'];
    }
    protected async createMonacoDiffEditor(uri: URI, override: IEditorOverrideServices, toDispose: DisposableCollection): Promise<MonacoDiffEditor> {
        const [original, modified] = DiffUris.decode(uri);

        const [originalModel, modifiedModel] = await Promise.all([this.getModel(original, toDispose), this.getModel(modified, toDispose)]);

        const options = this.createMonacoDiffEditorOptions(originalModel, modifiedModel);
        const editor = new MonacoDiffEditor(
            uri,
            document.createElement('div'),
            originalModel, modifiedModel,
            this.m2p, this.p2m,
            this.diffNavigatorFactory,
            options,
            override);
        toDispose.push(this.editorPreferences.onPreferenceChanged(event => this.updateMonacoDiffEditorOptions(editor, event)));
        return editor;
    }
    protected createMonacoDiffEditorOptions(original: MonacoEditorModel, modified: MonacoEditorModel): MonacoDiffEditor.IOptions {
        const options = this.createOptions(this.diffPreferencePrefixes);
        options.originalEditable = !original.readOnly;
        options.readOnly = modified.readOnly;
        return options;
    }
    protected updateMonacoDiffEditorOptions(editor: MonacoDiffEditor, event: EditorPreferenceChange): void {
        const { preferenceName, newValue } = event;
        editor.diffEditor.updateOptions(this.setOption(preferenceName, newValue, this.diffPreferencePrefixes));
    }

    protected createOptions(prefixes: string[]): { [name: string]: any } {
        return Object.keys(this.editorPreferences).reduce((options, preferenceName) => {
            const value = (<any>this.editorPreferences)[preferenceName];
            return this.setOption(preferenceName, value, prefixes, options);
        }, {});
    }

    protected setOption(preferenceName: string, value: any, prefixes: string[], options: { [name: string]: any } = {}) {
        const optionName = this.toOptionName(preferenceName, prefixes);
        this.doSetOption(options, value, optionName.split('.'));
        return options;
    }
    protected toOptionName(preferenceName: string, prefixes: string[]): string {
        for (const prefix of prefixes) {
            if (preferenceName.startsWith(prefix)) {
                return preferenceName.substr(prefix.length);
            }
        }
        return preferenceName;
    }
    protected doSetOption(obj: { [name: string]: any }, value: any, names: string[], idx: number = 0): void {
        const name = names[idx];
        if (!obj[name]) {
            if (names.length > (idx + 1)) {
                obj[name] = {};
                this.doSetOption(obj[name], value, names, (idx + 1));
            } else {
                obj[name] = value;
            }
        }
    }

    protected installQuickOpenService(editor: MonacoEditor): void {
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

    protected installReferencesController(editor: MonacoEditor): void {
        const control = editor.getControl();
        const referencesController = control._contributions['editor.contrib.referencesController'];
        referencesController._gotoReference = ref => {
            referencesController._widget.hide();

            referencesController._ignoreModelChangeEvent = true;
            const { uri, range } = ref;

            referencesController._editorService.openEditor({
                resource: uri,
                options: { selection: range }
            }).done(openedEditor => {
                referencesController._ignoreModelChangeEvent = false;
                if (!openedEditor) {
                    referencesController.closeWidget();
                    return;
                }
                if (openedEditor.getControl() !== control) {
                    const model = referencesController._model;
                    // to preserve the references model
                    referencesController._model = undefined;

                    // to preserve the active editor
                    const focus = control.focus;
                    control.focus = () => { };
                    referencesController.closeWidget();
                    control.focus = focus;

                    const modelPromise = Promise.resolve(model) as any;
                    modelPromise.cancel = () => { };
                    openedEditor.getControl()._contributions['editor.contrib.referencesController'].toggleWidget(range, modelPromise, {
                        getMetaTitle: m => m.references.length > 1 ? ` – ${m.references.length} references` : ''
                    });
                    return;
                }

                referencesController._widget.show(range);
                referencesController._widget.focus();

            }, (e: any) => {
                referencesController._ignoreModelChangeEvent = false;
                throw e;
            });
        };
    }

    getDiffNavigator(editor: TextEditor): DiffNavigator {
        if (editor instanceof MonacoDiffEditor) {
            return editor.diffNavigator;
        }
        return MonacoDiffNavigatorFactory.nullNavigator;
    }

}
