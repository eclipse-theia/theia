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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */
import URI from '@theia/core/lib/common/uri';
import { EditorPreferenceChange, EditorPreferences, TextEditor, DiffNavigator } from '@theia/editor/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { DisposableCollection, deepClone, Disposable, CancellationToken } from '@theia/core/lib/common';
import { MonacoDiffEditor } from './monaco-diff-editor';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { EditorServiceOverrides, MonacoEditor, MonacoEditorServices } from './monaco-editor';
import { MonacoEditorModel, TextDocumentSaveReason } from './monaco-editor-model';
import { MonacoWorkspace } from './monaco-workspace';
import { ContributionProvider } from '@theia/core';
import { KeybindingRegistry, OpenerService, open, WidgetOpenerOptions, SaveOptions, FormatType } from '@theia/core/lib/browser';
import { MonacoResolvedKeybinding } from './monaco-resolved-keybinding';
import { HttpOpenHandlerOptions } from '@theia/core/lib/browser/http-open-handler';
import { MonacoToProtocolConverter } from './monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';
import * as monaco from '@theia/monaco-editor-core';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '@theia/monaco-editor-core/esm/vs/platform/opener/common/opener';
import { IKeybindingService } from '@theia/monaco-editor-core/esm/vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from '@theia/monaco-editor-core/esm/vs/platform/contextview/browser/contextView';
import { KeyCodeChord } from '@theia/monaco-editor-core/esm/vs/base/common/keybindings';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { ITextModelService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import { IReference } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { SimpleMonacoEditor } from './simple-monaco-editor';
import { ICodeEditorWidgetOptions } from '@theia/monaco-editor-core/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { timeoutReject } from '@theia/core/lib/common/promise-util';
import { FileSystemPreferences } from '@theia/filesystem/lib/browser';
import { insertFinalNewline } from './monaco-utilities';

export const MonacoEditorFactory = Symbol('MonacoEditorFactory');
export interface MonacoEditorFactory {
    readonly scheme: string;
    create(model: MonacoEditorModel, defaultOptions: MonacoEditor.IOptions, defaultOverrides: EditorServiceOverrides): Promise<MonacoEditor>;
}

export const SaveParticipant = Symbol('SaveParticipant');

export interface SaveParticipant {
    readonly order: number;
    applyChangesOnSave(
        editor: MonacoEditor,
        cancellationToken: CancellationToken,
        options?: SaveOptions): Promise<void>;
}
export const SAVE_PARTICIPANT_DEFAULT_ORDER = 0;

@injectable()
export class MonacoEditorProvider {

    @inject(ContributionProvider)
    @named(MonacoEditorFactory)
    protected readonly factories: ContributionProvider<MonacoEditorFactory>;

    @inject(MonacoEditorServices)
    protected readonly services: MonacoEditorServices;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(ContributionProvider)
    @named(SaveParticipant)
    protected readonly saveProviderContributions: ContributionProvider<SaveParticipant>;

    @inject(FileSystemPreferences)
    protected readonly filePreferences: FileSystemPreferences;
    protected saveParticipants: SaveParticipant[];

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
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter,
        @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace,
        @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences,
        @inject(MonacoDiffNavigatorFactory) protected readonly diffNavigatorFactory: MonacoDiffNavigatorFactory,
    ) {
    }

    protected async getModel(uri: URI, toDispose: DisposableCollection): Promise<MonacoEditorModel> {
        const reference = await StandaloneServices.get(ITextModelService).createModelReference(monaco.Uri.from(uri.toComponents())) as IReference<MonacoEditorModel>;
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

    protected async doCreateEditor<T>(uri: URI, factory: (
        override: EditorServiceOverrides, toDispose: DisposableCollection) => Promise<T>
    ): Promise<T> {
        const domNode = document.createElement('div');
        const contextKeyService = StandaloneServices.get(IContextKeyService).createScoped(domNode);
        StandaloneServices.get(IOpenerService).registerOpener({
            open: (u, options) => this.interceptOpen(u, options)
        });
        const overrides: EditorServiceOverrides = [
            [IContextKeyService, contextKeyService],
        ];
        const toDispose = new DisposableCollection();
        const editor = await factory(overrides, toDispose);
        if (editor instanceof SimpleMonacoEditor || editor instanceof MonacoEditor) {
            editor.onDispose(() => toDispose.dispose());
        }
        if (editor instanceof MonacoEditor) {

            this.injectKeybindingResolver(editor);

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
        }
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
        keybindingService.resolveKeybinding = keybinding => [new MonacoResolvedKeybinding(MonacoResolvedKeybinding.keySequence(keybinding.chords), this.keybindingRegistry)];
        keybindingService.resolveKeyboardEvent = keyboardEvent => {
            const keybinding = new KeyCodeChord(
                keyboardEvent.ctrlKey,
                keyboardEvent.shiftKey,
                keyboardEvent.altKey,
                keyboardEvent.metaKey,
                keyboardEvent.keyCode
            );
            return new MonacoResolvedKeybinding(MonacoResolvedKeybinding.keySequence([keybinding]), this.keybindingRegistry);
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
    async createMonacoEditor(uri: URI, override: EditorServiceOverrides, toDispose: DisposableCollection): Promise<MonacoEditor> {
        const model = await this.getModel(uri, toDispose);
        const options = this.createMonacoEditorOptions(model);
        const factory = this.factories.getContributions().find(({ scheme }) => uri.scheme === scheme);
        const editor = factory
            ? await factory.create(model, options, override)
            : await MonacoEditor.create(uri, model, document.createElement('div'), this.services, options, override);
        toDispose.push(this.editorPreferences.onPreferenceChanged(event => {
            if (event.affects(uri.toString(), model.languageId)) {
                this.updateMonacoEditorOptions(editor, event);
            }
        }));
        toDispose.push(editor.onLanguageChanged(() => this.updateMonacoEditorOptions(editor)));
        toDispose.push(editor.onDidChangeReadOnly(() => this.updateReadOnlyMessage(options, model.readOnly)));
        toDispose.push(editor.document.onModelWillSaveModel(e => this.runSaveParticipants(editor, e.token, e.options)));
        return editor;
    }

    protected updateReadOnlyMessage(options: MonacoEditor.IOptions, readOnly: boolean | MarkdownString): void {
        options.readOnlyMessage = MarkdownString.is(readOnly) ? readOnly : undefined;
    }

    protected createMonacoEditorOptions(model: MonacoEditorModel): MonacoEditor.IOptions {
        const options = this.createOptions(this.preferencePrefixes, model.uri, model.languageId);
        options.model = model.textEditorModel;
        options.readOnly = model.readOnly;
        this.updateReadOnlyMessage(options, model.readOnly);
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
        options.readOnlyMessage = MarkdownString.is(modified.readOnly) ? modified.readOnly : undefined;
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

    /**
     * Creates an instance of the standard MonacoEditor with a StandaloneCodeEditor as its Monaco delegate.
     * Among other differences, these editors execute basic actions like typing or deletion via commands that may be overridden by extensions.
     * @deprecated Most use cases for inline editors should be served by `createSimpleInline` instead.
     */
    async createInline(uri: URI, node: HTMLElement, options?: MonacoEditor.IOptions): Promise<MonacoEditor> {
        return this.doCreateEditor(uri, async (override, toDispose) => {
            const overrides = override ? Array.from(override) : [];
            overrides.push([IContextMenuService, { showContextMenu: () => {/** no op! */ } }]);
            const document = await this.getModel(uri, toDispose);
            document.suppressOpenEditorWhenDirty = true;
            const model = (await document.load()).textEditorModel;
            return await MonacoEditor.create(
                uri,
                document,
                node,
                this.services,
                Object.assign({
                    model,
                    autoSizing: false,
                    minHeight: 1,
                    maxHeight: 1
                }, MonacoEditorProvider.inlineOptions, options),
                overrides
            );
        });
    }

    /**
     * Creates an instance of the standard MonacoEditor with a CodeEditorWidget as its Monaco delegate.
     * In addition to the service customizability of the StandaloneCodeEditor,This editor allows greater customization the editor contributions active in the widget.
     * See {@link ICodeEditorWidgetOptions.contributions}.
     */
    async createSimpleInline(uri: URI, node: HTMLElement, options?: MonacoEditor.IOptions, widgetOptions?: ICodeEditorWidgetOptions): Promise<SimpleMonacoEditor> {
        return this.doCreateEditor(uri, async (override, toDispose) => {
            const overrides = override ? Array.from(override) : [];
            overrides.push([IContextMenuService, { showContextMenu: () => { /** no op! */ } }]);
            const document = await this.getModel(uri, toDispose);
            document.suppressOpenEditorWhenDirty = true;
            const model = (await document.load()).textEditorModel;
            const baseOptions: Partial<MonacoEditor.IOptions> = {
                model,
                autoSizing: false,
                minHeight: 1,
                maxHeight: 1
            };
            const editorOptions = {
                ...baseOptions,
                ...MonacoEditorProvider.inlineOptions,
                ...options
            };
            return new SimpleMonacoEditor(
                uri,
                document,
                node,
                this.services,
                editorOptions,
                overrides,
                { isSimpleWidget: true, ...widgetOptions }
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

    async createEmbeddedDiffEditor(parentEditor: MonacoEditor, node: HTMLElement, originalUri: URI, modifiedUri: URI = parentEditor.uri,
        options?: MonacoDiffEditor.IOptions): Promise<MonacoDiffEditor> {
        options = {
            scrollBeyondLastLine: true,
            overviewRulerLanes: 2,
            fixedOverflowWidgets: true,
            minimap: { enabled: false },
            renderSideBySide: false,
            readOnly: false,
            renderIndicators: false,
            diffAlgorithm: 'advanced',
            stickyScroll: { enabled: false },
            ...options,
            scrollbar: {
                verticalScrollbarSize: 14,
                horizontal: 'auto',
                useShadows: true,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                ...options?.scrollbar
            }
        };
        const uri = DiffUris.encode(originalUri, modifiedUri);
        return await this.doCreateEditor(uri, async (override, toDispose) =>
            new MonacoDiffEditor(
                uri,
                node,
                await this.getModel(originalUri, toDispose),
                await this.getModel(modifiedUri, toDispose),
                this.services,
                this.diffNavigatorFactory,
                options,
                override,
                parentEditor
            )
        );
    }

    @postConstruct()
    init(): void {
        this.saveParticipants = this.saveProviderContributions.getContributions().slice().sort((left, right) => left.order - right.order);
        this.registerSaveParticipant({
            order: 1000,
            applyChangesOnSave: (
                editor: MonacoEditor,
                cancellationToken: monaco.CancellationToken,
                options: SaveOptions): Promise<void> => this.formatOnSave(editor, editor.document, cancellationToken, options)
        });
    }

    registerSaveParticipant(saveParticipant: SaveParticipant): Disposable {
        if (this.saveParticipants.find(value => value === saveParticipant)) {
            throw new Error('Save participant already registered');
        }
        this.saveParticipants.push(saveParticipant);
        this.saveParticipants.sort((left, right) => left.order - right.order);
        return Disposable.create(() => {
            const index = this.saveParticipants.indexOf(saveParticipant);
            if (index >= 0) {
                this.saveParticipants.splice(index, 1);
            }
        });
    }

    protected shouldFormat(model: MonacoEditorModel, options: SaveOptions): boolean {
        if (options.saveReason !== TextDocumentSaveReason.Manual) {
            return false;
        }
        switch (options.formatType) {
            case FormatType.ON: return true;
            case FormatType.OFF: return false;
            case FormatType.DIRTY: return model.dirty;
        }
        return true;
    }

    async runSaveParticipants(editor: MonacoEditor, cancellationToken: CancellationToken, options?: SaveOptions): Promise<void> {
        const initialState = editor.document.createSnapshot();
        for (const participant of this.saveParticipants) {
            if (cancellationToken.isCancellationRequested) {
                break;
            }
            const snapshot = editor.document.createSnapshot();
            try {
                await participant.applyChangesOnSave(editor, cancellationToken, options);
            } catch (e) {
                console.error(e);
                editor.document.applySnapshot(snapshot);
            }
        }
        if (cancellationToken.isCancellationRequested) {
            editor.document.applySnapshot(initialState);
        }
    }

    protected async formatOnSave(
        editor: MonacoEditor,
        model: MonacoEditorModel,
        cancellationToken: CancellationToken,
        options: SaveOptions): Promise<void> {
        if (!this.shouldFormat(model, options)) {
            return;
        }

        const overrideIdentifier = model.languageId;
        const uri = model.uri.toString();
        const formatOnSave = this.editorPreferences.get({ preferenceName: 'editor.formatOnSave', overrideIdentifier }, undefined, uri);
        if (formatOnSave) {
            const formatOnSaveTimeout = this.editorPreferences.get({ preferenceName: 'editor.formatOnSaveTimeout', overrideIdentifier }, undefined, uri)!;
            await Promise.race([
                timeoutReject(formatOnSaveTimeout, `Aborted format on save after ${formatOnSaveTimeout}ms`),
                await editor.runAction('editor.action.formatDocument')
            ]);
        }
        const shouldRemoveWhiteSpace = this.filePreferences.get({ preferenceName: 'files.trimTrailingWhitespace', overrideIdentifier }, undefined, uri);
        if (shouldRemoveWhiteSpace) {
            await editor.runAction('editor.action.trimTrailingWhitespace');
        }
        const shouldInsertFinalNewline = this.filePreferences.get({ preferenceName: 'files.insertFinalNewline', overrideIdentifier }, undefined, uri);
        if (shouldInsertFinalNewline) {
            this.insertFinalNewline(model);
        }
    }

    protected insertFinalNewline(editorModel: MonacoEditorModel): void {
        insertFinalNewline(editorModel);
    }
}
