// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */
import URI from '@theia/core/lib/common/uri';
import { EditorPreferenceChange, EditorPreferences, TextEditor, DiffNavigator } from '@theia/editor/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { DisposableCollection, deepClone, Disposable } from '@theia/core/lib/common';
import { TextDocumentSaveReason } from '@theia/core/shared/vscode-languageserver-protocol';
import { MonacoCommandServiceFactory } from './monaco-command-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoDiffEditor } from './monaco-diff-editor';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { EditorServiceOverrides, MonacoEditor, MonacoEditorServices } from './monaco-editor';
import { MonacoEditorModel, WillSaveMonacoModelEvent } from './monaco-editor-model';
import { MonacoEditorService } from './monaco-editor-service';
import { MonacoTextModelService } from './monaco-text-model-service';
import { MonacoWorkspace } from './monaco-workspace';
import { MonacoBulkEditService } from './monaco-bulk-edit-service';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { ContributionProvider } from '@theia/core';
import { KeybindingRegistry, OpenerService, open, WidgetOpenerOptions, FormatType } from '@theia/core/lib/browser';
import { MonacoResolvedKeybinding } from './monaco-resolved-keybinding';
import { HttpOpenHandlerOptions } from '@theia/core/lib/browser/http-open-handler';
import { MonacoToProtocolConverter } from './monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';
import { FileSystemPreferences } from '@theia/filesystem/lib/browser';
import { MonacoQuickInputImplementation } from './monaco-quick-input-service';
import { ContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/browser/contextKeyService';
import * as monaco from '@theia/monaco-editor-core';
import { OpenerService as MonacoOpenerService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/openerService';
import { StandaloneCommandService, StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '@theia/monaco-editor-core/esm/vs/platform/opener/common/opener';
import { SimpleKeybinding } from '@theia/monaco-editor-core/esm/vs/base/common/keybindings';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from '@theia/monaco-editor-core/esm/vs/platform/keybinding/common/keybinding';
import { timeoutReject } from '@theia/core/lib/common/promise-util';
import { ITextModelService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import { IContextMenuService } from '@theia/monaco-editor-core/esm/vs/platform/contextview/browser/contextView';
import { IBulkEditService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { IQuickInputService } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickInput';
import { ICommandService } from '@theia/monaco-editor-core/esm/vs/platform/commands/common/commands';

export const MonacoEditorFactory = Symbol('MonacoEditorFactory');
export interface MonacoEditorFactory {
    readonly scheme: string;
    create(model: MonacoEditorModel, defaultOptions: MonacoEditor.IOptions, defaultOverrides: EditorServiceOverrides): MonacoEditor;
}

@injectable()
export class MonacoEditorProvider {

    @inject(ContributionProvider)
    @named(MonacoEditorFactory)
    protected readonly factories: ContributionProvider<MonacoEditorFactory>;

    @inject(MonacoBulkEditService)
    protected readonly bulkEditService: MonacoBulkEditService;

    @inject(MonacoEditorServices)
    protected readonly services: MonacoEditorServices;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(FileSystemPreferences)
    protected readonly filePreferences: FileSystemPreferences;

    @inject(MonacoQuickInputImplementation)
    protected readonly quickInputService: MonacoQuickInputImplementation;

    protected _current: MonacoEditor | undefined;
    /**
     * Returns the last focused MonacoEditor.
     * It takes into account inline editors as well.
     * If you are interested only in standalone editors then use `MonacoEditor.getCurrent(EditorManager)`
     */
    get current(): MonacoEditor | undefined {
        return this._current;
    }

    constructor(
        @inject(MonacoEditorService) protected readonly codeEditorService: MonacoEditorService,
        @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService,
        @inject(MonacoContextMenuService) protected readonly contextMenuService: MonacoContextMenuService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter,
        @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace,
        @inject(MonacoCommandServiceFactory) protected readonly commandServiceFactory: MonacoCommandServiceFactory,
        @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences,
        @inject(MonacoDiffNavigatorFactory) protected readonly diffNavigatorFactory: MonacoDiffNavigatorFactory,
        /** @deprecated since 1.6.0 */
        @inject(ApplicationServer) protected readonly applicationServer: ApplicationServer,
        @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService
    ) {
        StandaloneServices.initialize({
            [ICodeEditorService.toString()]: codeEditorService,
        });
    }

    protected async getModel(uri: URI, toDispose: DisposableCollection): Promise<MonacoEditorModel> {
        const reference = await this.textModelService.createModelReference(uri);
        // if document is invalid makes sure that all events from underlying resource are processed before throwing invalid model
        if (!reference.object.valid) {
            await reference.object.sync();
        }
        if (!reference.object.valid) {
            reference.dispose();
            throw Object.assign(new Error(`'${uri.toString()}' is invalid`), { code: 'MODEL_IS_INVALID' });
        }
        toDispose.push(reference);
        return reference.object;
    }

    async get(uri: URI): Promise<MonacoEditor> {
        await this.editorPreferences.ready;
        return this.doCreateEditor(uri, (override, toDispose) => this.createEditor(uri, override, toDispose));
    }

    protected async doCreateEditor(uri: URI, factory: (
        override: EditorServiceOverrides, toDispose: DisposableCollection) => Promise<MonacoEditor>
    ): Promise<MonacoEditor> {
        const commandService = this.commandServiceFactory();
        const domNode = document.createElement('div');
        const contextKeyService = this.contextKeyService.createScoped(domNode);
        const { codeEditorService, textModelService, contextMenuService } = this;
        const workspaceEditService = this.bulkEditService;
        const toDispose = new DisposableCollection(commandService);
        const openerService = new MonacoOpenerService(codeEditorService, commandService);
        openerService.registerOpener({
            open: (u, options) => this.interceptOpen(u, options)
        });
        const overrides: EditorServiceOverrides = [
            [ICodeEditorService, codeEditorService],
            [ITextModelService, textModelService],
            [IContextMenuService, contextMenuService],
            [IBulkEditService, workspaceEditService],
            [IContextKeyService, contextKeyService],
            [IOpenerService, openerService],
            [IQuickInputService, this.quickInputService],
            [ICommandService, commandService]
        ];
        const editor = await factory(overrides, toDispose);
        editor.onDispose(() => toDispose.dispose());

        this.injectKeybindingResolver(editor);

        const standaloneCommandService = new StandaloneCommandService(StandaloneServices.get(IInstantiationService));
        commandService.setDelegate(standaloneCommandService);

        toDispose.push(editor.onFocusChanged(focused => {
            if (focused) {
                this._current = editor;
            }
        }));
        toDispose.push(Disposable.create(() => {
            if (this._current === editor) {
                this._current = undefined;
            }
        }));

        return editor;
    }

    /**
     * Intercept internal Monaco open calls and delegate to OpenerService.
     */
    protected async interceptOpen(monacoUri: monaco.Uri | string, monacoOptions?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
        let options = undefined;
        if (monacoOptions) {
            if ('openToSide' in monacoOptions && monacoOptions.openToSide) {
                options = Object.assign(options || {}, <WidgetOpenerOptions>{
                    widgetOptions: {
                        mode: 'split-right'
                    }
                });
            }
            if ('openExternal' in monacoOptions && monacoOptions.openExternal) {
                options = Object.assign(options || {}, <HttpOpenHandlerOptions>{
                    openExternal: true
                });
            }
        }
        const uri = new URI(monacoUri.toString());
        try {
            await open(this.openerService, uri, options);
            return true;
        } catch (e) {
            console.error(`Fail to open '${uri.toString()}':`, e);
            return false;
        }
    }

    protected injectKeybindingResolver(editor: MonacoEditor): void {
        const keybindingService = StandaloneServices.get(IKeybindingService);
        keybindingService.resolveKeybinding = keybinding => [new MonacoResolvedKeybinding(MonacoResolvedKeybinding.keySequence(keybinding), this.keybindingRegistry)];
        keybindingService.resolveKeyboardEvent = keyboardEvent => {
            const keybinding = new SimpleKeybinding(
                keyboardEvent.ctrlKey,
                keyboardEvent.shiftKey,
                keyboardEvent.altKey,
                keyboardEvent.metaKey,
                keyboardEvent.keyCode
            ).toChord();
            return new MonacoResolvedKeybinding(MonacoResolvedKeybinding.keySequence(keybinding), this.keybindingRegistry);
        };
    }

    protected createEditor(uri: URI, override: EditorServiceOverrides, toDispose: DisposableCollection): Promise<MonacoEditor> {
        if (DiffUris.isDiffUri(uri)) {
            return this.createMonacoDiffEditor(uri, override, toDispose);
        }
        return this.createMonacoEditor(uri, override, toDispose);
    }

    protected get preferencePrefixes(): string[] {
        return ['editor.'];
    }
    protected async createMonacoEditor(uri: URI, override: EditorServiceOverrides, toDispose: DisposableCollection): Promise<MonacoEditor> {
        const model = await this.getModel(uri, toDispose);
        const options = this.createMonacoEditorOptions(model);
        const factory = this.factories.getContributions().find(({ scheme }) => uri.scheme === scheme);
        const editor = factory
            ? factory.create(model, options, override)
            : new MonacoEditor(uri, model, document.createElement('div'), this.services, options, override);
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
        options.lineNumbersMinChars = model.lineNumbersMinChars;
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

    protected shouldFormat(editor: MonacoEditor, event: WillSaveMonacoModelEvent): boolean {
        if (event.reason !== TextDocumentSaveReason.Manual) {
            return false;
        }
        if (event.options?.formatType) {
            switch (event.options.formatType) {
                case FormatType.ON: return true;
                case FormatType.OFF: return false;
                case FormatType.DIRTY: return editor.document.dirty;
            }
        }
        return true;
    }

    protected async formatOnSave(editor: MonacoEditor, event: WillSaveMonacoModelEvent): Promise<monaco.editor.IIdentifiedSingleEditOperation[]> {
        if (!this.shouldFormat(editor, event)) {
            return [];
        }
        const overrideIdentifier = editor.document.languageId;
        const uri = editor.uri.toString();
        const formatOnSave = this.editorPreferences.get({ preferenceName: 'editor.formatOnSave', overrideIdentifier }, undefined, uri);
        if (formatOnSave) {
            const formatOnSaveTimeout = this.editorPreferences.get({ preferenceName: 'editor.formatOnSaveTimeout', overrideIdentifier }, undefined, uri)!;
            await Promise.race([
                timeoutReject(formatOnSaveTimeout, `Aborted format on save after ${formatOnSaveTimeout}ms`),
                editor.runAction('editor.action.formatDocument')
            ]);
        }
        const shouldRemoveWhiteSpace = this.filePreferences.get({ preferenceName: 'files.trimTrailingWhitespace', overrideIdentifier }, undefined, uri);
        if (shouldRemoveWhiteSpace) {
            await editor.runAction('editor.action.trimTrailingWhitespace');
        }
        return [];
    }

    protected get diffPreferencePrefixes(): string[] {
        return [...this.preferencePrefixes, 'diffEditor.'];
    }
    protected async createMonacoDiffEditor(uri: URI, override: EditorServiceOverrides, toDispose: DisposableCollection): Promise<MonacoDiffEditor> {
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
    protected createOptions(prefixes: string[], uri: string): Record<string, any>;
    protected createOptions(prefixes: string[], uri: string, overrideIdentifier: string): Record<string, any>;
    protected createOptions(prefixes: string[], uri: string, overrideIdentifier?: string): Record<string, any> {
        const flat: Record<string, any> = {};
        for (const preferenceName of Object.keys(this.editorPreferences)) {
            flat[preferenceName] = (<any>this.editorPreferences).get({ preferenceName, overrideIdentifier }, undefined, uri);
        }
        return Object.entries(flat).reduce((tree, [preferenceName, value]) => this.setOption(preferenceName, deepClone(value), prefixes, tree), {});
    }

    protected setOption(preferenceName: string, value: any, prefixes: string[], options: Record<string, any> = {}): {
        [name: string]: any;
    } {
        const optionName = this.toOptionName(preferenceName, prefixes);
        this.doSetOption(options, value, optionName.split('.'));
        return options;
    }
    protected toOptionName(preferenceName: string, prefixes: string[]): string {
        for (const prefix of prefixes) {
            if (preferenceName.startsWith(prefix)) {
                return preferenceName.substring(prefix.length);
            }
        }
        return preferenceName;
    }
    protected doSetOption(obj: Record<string, any>, value: any, names: string[]): void {
        for (let i = 0; i < names.length - 1; i++) {
            const name = names[i];
            if (obj[name] === undefined) {
                obj = obj[name] = {};
            } else if (typeof obj[name] !== 'object' || obj[name] === null) { // eslint-disable-line no-null/no-null
                console.warn(`Preference (diff)editor.${names.join('.')} conflicts with another preference name.`);
                obj = obj[name] = {};
            } else {
                obj = obj[name];
            }
        }
        obj[names[names.length - 1]] = value;
    }

    getDiffNavigator(editor: TextEditor): DiffNavigator {
        if (editor instanceof MonacoDiffEditor) {
            return editor.diffNavigator;
        }
        return MonacoDiffNavigatorFactory.nullNavigator;
    }

    async createInline(uri: URI, node: HTMLElement, options?: MonacoEditor.IOptions): Promise<MonacoEditor> {
        return this.doCreateEditor(uri, async (override, toDispose) => {
            const overrides = override ? Array.from(override) : [];
            overrides.push([IContextMenuService, { showContextMenu: () => {/** no op! */ } }]);
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
                overrides
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
