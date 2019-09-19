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
import { DisposableCollection, deepClone } from '@theia/core/lib/common';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter, TextDocumentSaveReason } from 'monaco-languageclient';
import { MonacoCommandServiceFactory } from './monaco-command-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoDiffEditor } from './monaco-diff-editor';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { MonacoEditor, MonacoEditorServices } from './monaco-editor';
import { MonacoEditorModel, WillSaveMonacoModelEvent } from './monaco-editor-model';
import { MonacoEditorService } from './monaco-editor-service';
import { MonacoQuickOpenService } from './monaco-quick-open-service';
import { MonacoTextModelService } from './monaco-text-model-service';
import { MonacoWorkspace } from './monaco-workspace';
import { MonacoBulkEditService } from './monaco-bulk-edit-service';

import IEditorOverrideServices = monaco.editor.IEditorOverrideServices;
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { OS } from '@theia/core';

@injectable()
export class MonacoEditorProvider {

    @inject(MonacoBulkEditService)
    protected readonly bulkEditService: MonacoBulkEditService;

    @inject(MonacoEditorServices)
    protected readonly services: MonacoEditorServices;

    private isWindowsBackend: boolean = false;

    constructor(
        @inject(MonacoEditorService) protected readonly codeEditorService: MonacoEditorService,
        @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService,
        @inject(MonacoContextMenuService) protected readonly contextMenuService: MonacoContextMenuService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter,
        @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace,
        @inject(MonacoCommandServiceFactory) protected readonly commandServiceFactory: MonacoCommandServiceFactory,
        @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences,
        @inject(MonacoQuickOpenService) protected readonly quickOpenService: MonacoQuickOpenService,
        @inject(MonacoDiffNavigatorFactory) protected readonly diffNavigatorFactory: MonacoDiffNavigatorFactory,
        @inject(ApplicationServer) protected readonly applicationServer: ApplicationServer,
        @inject(monaco.contextKeyService.ContextKeyService) protected readonly contextKeyService: monaco.contextKeyService.ContextKeyService
    ) {
        const staticServices = monaco.services.StaticServices;
        const init = staticServices.init.bind(monaco.services.StaticServices);
        this.applicationServer.getBackendOS().then(os => {
            this.isWindowsBackend = os === OS.Type.Windows;
        });

        if (staticServices.resourcePropertiesService) {
            // tslint:disable-next-line:no-any
            const original = staticServices.resourcePropertiesService.get() as any;
            original.getEOL = () => {
                const eol = this.editorPreferences['files.eol'];
                if (eol) {
                    if (eol !== 'auto') {
                        return eol;
                    }
                }
                return this.isWindowsBackend ? '\r\n' : '\n';
            };
        }
        monaco.services.StaticServices.init = o => {
            const result = init(o);
            result[0].set(monaco.services.ICodeEditorService, codeEditorService);
            return result;
        };
    }

    protected async getModel(uri: URI, toDispose: DisposableCollection): Promise<MonacoEditorModel> {
        const reference = await this.textModelService.createModelReference(uri);
        toDispose.push(reference);
        return reference.object;
    }

    async get(uri: URI): Promise<MonacoEditor> {
        await this.editorPreferences.ready;
        return this.doCreateEditor((override, toDispose) => this.createEditor(uri, override, toDispose));
    }

    protected async doCreateEditor(factory: (override: IEditorOverrideServices, toDispose: DisposableCollection) => Promise<MonacoEditor>): Promise<MonacoEditor> {
        const commandService = this.commandServiceFactory();
        const contextKeyService = this.contextKeyService.createScoped();
        const { codeEditorService, textModelService, contextMenuService } = this;
        const IWorkspaceEditService = this.bulkEditService;
        const toDispose = new DisposableCollection();
        const editor = await factory({
            codeEditorService,
            textModelService,
            contextMenuService,
            commandService,
            IWorkspaceEditService,
            contextKeyService
        }, toDispose);
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
        const editor = new MonacoEditor(uri, model, document.createElement('div'), this.services, options, override);
        toDispose.push(this.editorPreferences.onPreferenceChanged(event => {
            if (event.affects(uri.toString(), model.languageId)) {
                this.updateMonacoEditorOptions(editor, event);
            }
        }));
        toDispose.push(editor.onLanguageChanged(() => this.updateMonacoEditorOptions(editor)));
        editor.document.onWillSaveModel(event => event.waitUntil(this.formatOnSave(editor, event)));
        return editor;
    }
    protected createMonacoEditorOptions(model: MonacoEditorModel): MonacoEditor.IOptions {
        const options = this.createOptions(this.preferencePrefixes, model.uri, model.languageId);
        options.model = model.textEditorModel;
        options.readOnly = model.readOnly;
        return options;
    }
    protected updateMonacoEditorOptions(editor: MonacoEditor, event?: EditorPreferenceChange): void {
        if (event) {
            const preferenceName = event.preferenceName;
            const overrideIdentifier = editor.document.languageId;
            const newValue = this.editorPreferences.get({ preferenceName, overrideIdentifier }, undefined, editor.uri.toString());
            editor.getControl().updateOptions(this.setOption(preferenceName, newValue, this.preferencePrefixes));
        } else {
            const options = this.createMonacoEditorOptions(editor.document);
            delete options.model;
            editor.getControl().updateOptions(options);
        }
    }

    protected async formatOnSave(editor: MonacoEditor, event: WillSaveMonacoModelEvent): Promise<monaco.editor.IIdentifiedSingleEditOperation[]> {
        if (event.reason !== TextDocumentSaveReason.Manual) {
            return [];
        }
        const overrideIdentifier = editor.document.languageId;
        const uri = editor.uri.toString();
        const formatOnSave = this.editorPreferences.get({ preferenceName: 'editor.formatOnSave', overrideIdentifier }, undefined, uri)!;
        if (!formatOnSave) {
            return [];
        }
        const formatOnSaveTimeout = this.editorPreferences.get({ preferenceName: 'editor.formatOnSaveTimeout', overrideIdentifier }, undefined, uri)!;
        await Promise.race([
            new Promise(reject => setTimeout(() => reject(new Error(`Aborted format on save after ${formatOnSaveTimeout}ms`)), formatOnSaveTimeout)),
            await editor.commandService.executeCommand('monaco.editor.action.formatDocument')
        ]);
        return [];
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
            this.services,
            this.diffNavigatorFactory,
            options,
            override);
        toDispose.push(this.editorPreferences.onPreferenceChanged(event => {
            const originalFileUri = original.withoutQuery().withScheme('file').toString();
            if (event.affects(originalFileUri, editor.document.languageId)) {
                this.updateMonacoDiffEditorOptions(editor, event, originalFileUri);
            }
        }));
        toDispose.push(editor.onLanguageChanged(() => this.updateMonacoDiffEditorOptions(editor)));
        return editor;
    }
    protected createMonacoDiffEditorOptions(original: MonacoEditorModel, modified: MonacoEditorModel): MonacoDiffEditor.IOptions {
        const options = this.createOptions(this.diffPreferencePrefixes, modified.uri, modified.languageId);
        options.originalEditable = !original.readOnly;
        options.readOnly = modified.readOnly;
        return options;
    }
    protected updateMonacoDiffEditorOptions(editor: MonacoDiffEditor, event?: EditorPreferenceChange, resourceUri?: string): void {
        if (event) {
            const preferenceName = event.preferenceName;
            const overrideIdentifier = editor.document.languageId;
            const newValue = this.editorPreferences.get({ preferenceName, overrideIdentifier }, undefined, resourceUri);
            editor.diffEditor.updateOptions(this.setOption(preferenceName, newValue, this.diffPreferencePrefixes));
        } else {
            const options = this.createMonacoDiffEditorOptions(editor.originalModel, editor.modifiedModel);
            editor.diffEditor.updateOptions(options);
        }
    }

    /** @deprecated always pass a language as an overrideIdentifier */
    protected createOptions(prefixes: string[], uri: string): { [name: string]: any };
    protected createOptions(prefixes: string[], uri: string, overrideIdentifier: string): { [name: string]: any };
    protected createOptions(prefixes: string[], uri: string, overrideIdentifier?: string): { [name: string]: any } {
        return Object.keys(this.editorPreferences).reduce((options, preferenceName) => {
            const value = (<any>this.editorPreferences).get({ preferenceName, overrideIdentifier }, undefined, uri);
            return this.setOption(preferenceName, deepClone(value), prefixes, options);
        }, {});
    }

    protected setOption(preferenceName: string, value: any, prefixes: string[], options: { [name: string]: any } = {}): {
        [name: string]: any;
    } {
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
            const range = monaco.Range.lift(ref.range).collapseToStart();

            // prerse the model that it does not get disposed if an editor preview replaces an editor
            const model = referencesController._model;
            referencesController._model = undefined;

            referencesController._editorService.openCodeEditor({
                resource: ref.uri,
                options: { selection: range }
            }, control).then(openedEditor => {
                referencesController._model = model;
                referencesController._ignoreModelChangeEvent = false;
                if (!openedEditor) {
                    referencesController.closeWidget();
                    return;
                }
                if (openedEditor !== control) {
                    // preserve the model that it does not get disposed in `referencesController.closeWidget`
                    referencesController._model = undefined;

                    // to preserve the active editor
                    const focus = control.focus;
                    control.focus = () => { };
                    referencesController.closeWidget();
                    control.focus = focus;

                    const modelPromise = Promise.resolve(model) as any;
                    modelPromise.cancel = () => { };
                    openedEditor._contributions['editor.contrib.referencesController'].toggleWidget(range, modelPromise, {
                        getMetaTitle: m => m.references.length > 1 ? ` – ${m.references.length} references` : ''
                    });
                    return;
                }

                if (referencesController._widget) {
                    referencesController._widget.show(range);
                    referencesController._widget.focus();
                }

            }, (e: any) => {
                referencesController._ignoreModelChangeEvent = false;
                monaco.error.onUnexpectedError(e);
            });
        };
    }

    getDiffNavigator(editor: TextEditor): DiffNavigator {
        if (editor instanceof MonacoDiffEditor) {
            return editor.diffNavigator;
        }
        return MonacoDiffNavigatorFactory.nullNavigator;
    }

    async createInline(uri: URI, node: HTMLElement, options?: MonacoEditor.IOptions): Promise<MonacoEditor> {
        return this.doCreateEditor(async (override, toDispose) => {
            override.contextMenuService = {
                showContextMenu: () => {/* no-op*/ }
            };
            const document = new MonacoEditorModel({
                uri,
                readContents: async () => '',
                dispose: () => { }
            }, this.m2p, this.p2m);
            toDispose.push(document);
            const model = (await document.load()).textEditorModel;
            return new MonacoEditor(
                uri,
                document,
                node,
                this.services,
                Object.assign({
                    model,
                    isSimpleWidget: true,
                    autoSizing: false,
                    minHeight: 1,
                    maxHeight: 1
                }, MonacoEditorProvider.inlineOptions, options),
                override
            );
        });
    }

    static inlineOptions: monaco.editor.IEditorConstructionOptions = {
        wordWrap: 'on',
        overviewRulerLanes: 0,
        glyphMargin: false,
        lineNumbers: 'off',
        folding: false,
        selectOnLineNumbers: false,
        hideCursorInOverviewRuler: true,
        selectionHighlight: false,
        scrollbar: {
            horizontal: 'hidden'
        },
        lineDecorationsWidth: 0,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        fixedOverflowWidgets: true,
        acceptSuggestionOnEnter: 'smart',
        minimap: {
            enabled: false
        }
    };

}
