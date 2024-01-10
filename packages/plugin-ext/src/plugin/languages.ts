// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import {
    LanguagesExt,
    PLUGIN_RPC_CONTEXT,
    LanguagesMain,
    SerializedLanguageConfiguration,
    Position,
    Selection,
    RawColorInfo,
    WorkspaceEditDto,
    PluginInfo,
    Plugin,
    InlayHintsDto,
    InlayHintDto,
    IdentifiableInlineCompletions,
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from './documents';
import { PluginModel } from '../common/plugin-protocol';
import { Disposable, URI, LanguageStatusSeverity } from './types-impl';
import { UriComponents } from '../common/uri-components';
import {
    CodeActionProviderDocumentation,
    CompletionContext,
    CompletionResultDto,
    Completion,
    SerializedDocumentFilter,
    SignatureHelp,
    Hover,
    DocumentHighlight,
    Range,
    TextEdit,
    FormattingOptions,
    Definition,
    DocumentLink,
    CodeLensSymbol,
    DocumentSymbol,
    ReferenceContext,
    Location,
    ColorPresentation,
    RenameLocation,
    SignatureHelpContext,
    CodeActionContext,
    CodeAction,
    FoldingRange,
    SelectionRange,
    ChainedCacheId,
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    LinkedEditingRanges,
    EvaluatableExpression,
    InlineValue,
    InlineValueContext,
    TypeHierarchyItem,
    InlineCompletionContext,
    DocumentDropEdit,
    DataTransferDTO
} from '../common/plugin-api-rpc-model';
import { CompletionAdapter } from './languages/completion';
import { Diagnostics } from './languages/diagnostics';
import { SignatureHelpAdapter } from './languages/signature';
import { HoverAdapter } from './languages/hover';
import { EvaluatableExpressionAdapter } from './languages/evaluatable-expression';
import { InlineValuesAdapter } from './languages/inline-values';
import { DocumentHighlightAdapter } from './languages/document-highlight';
import { DocumentFormattingAdapter } from './languages/document-formatting';
import { RangeFormattingAdapter } from './languages/range-formatting';
import { OnTypeFormattingAdapter } from './languages/on-type-formatting';
import { DefinitionAdapter } from './languages/definition';
import { ImplementationAdapter } from './languages/implementation';
import { TypeDefinitionAdapter } from './languages/type-definition';
import { CodeActionAdapter } from './languages/code-action';
import { LinkProviderAdapter } from './languages/link-provider';
import { CodeLensAdapter } from './languages/lens';
import { OutlineAdapter } from './languages/outline';
import { ReferenceAdapter } from './languages/reference';
import { WorkspaceSymbolAdapter } from './languages/workspace-symbol';
import { SymbolInformation } from '@theia/core/shared/vscode-languageserver-protocol';
import { FoldingProviderAdapter } from './languages/folding';
import { SelectionRangeProviderAdapter } from './languages/selection-range';
import { ColorProviderAdapter } from './languages/color';
import { RenameAdapter } from './languages/rename';
import { Event } from '@theia/core/lib/common/event';
import { CommandRegistryImpl } from './command-registry';
import { DeclarationAdapter } from './languages/declaration';
import { CallHierarchyAdapter } from './languages/call-hierarchy';
import { TypeHierarchyAdapter } from './languages/type-hierarchy';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { DocumentSemanticTokensAdapter, DocumentRangeSemanticTokensAdapter } from './languages/semantic-highlighting';
import { isReadonlyArray } from '../common/arrays';
import { DisposableCollection, disposableTimeout, Disposable as TheiaDisposable } from '@theia/core/lib/common/disposable';
import { Severity } from '@theia/core/lib/common/severity';
import { LinkedEditingRangeAdapter } from './languages/linked-editing-range';
import { serializeAutoClosingPairs, serializeEnterRules, serializeIndentation, serializeRegExp } from './languages-utils';
import { InlayHintsAdapter } from './languages/inlay-hints';
import { InlineCompletionAdapter, InlineCompletionAdapterBase } from './languages/inline-completion';
import { DocumentDropEditAdapter } from './languages/document-drop-edit';
import { IDisposable } from '@theia/monaco-editor-core';
import { FileSystemExtImpl, FsLinkProvider } from './file-system-ext-impl';

type Adapter = CompletionAdapter |
    SignatureHelpAdapter |
    HoverAdapter |
    EvaluatableExpressionAdapter |
    InlineValuesAdapter |
    DocumentHighlightAdapter |
    DocumentFormattingAdapter |
    RangeFormattingAdapter |
    OnTypeFormattingAdapter |
    DefinitionAdapter |
    DeclarationAdapter |
    ImplementationAdapter |
    TypeDefinitionAdapter |
    LinkProviderAdapter |
    CodeLensAdapter |
    CodeActionAdapter |
    OutlineAdapter |
    ReferenceAdapter |
    WorkspaceSymbolAdapter |
    FoldingProviderAdapter |
    SelectionRangeProviderAdapter |
    ColorProviderAdapter |
    InlayHintsAdapter |
    RenameAdapter |
    CallHierarchyAdapter |
    DocumentRangeSemanticTokensAdapter |
    DocumentSemanticTokensAdapter |
    LinkedEditingRangeAdapter |
    TypeHierarchyAdapter |
    InlineCompletionAdapter |
    DocumentDropEditAdapter;

export class LanguagesExtImpl implements LanguagesExt {

    private proxy: LanguagesMain;

    private readonly diagnostics: Diagnostics;

    private linkProviderRegistration?: IDisposable;

    private callId = 0;
    private adaptersMap = new Map<number, Adapter>();

    constructor(
        rpc: RPCProtocol,
        private readonly documents: DocumentsExtImpl,
        private readonly commands: CommandRegistryImpl,
        private readonly filesSystem: FileSystemExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.LANGUAGES_MAIN);
        this.diagnostics = new Diagnostics(rpc);
        filesSystem.onWillRegisterFileSystemProvider(linkProvider => this.registerLinkProviderIfNotYetRegistered(linkProvider));
    }

    dispose(): void {
        if (this.linkProviderRegistration) {
            this.linkProviderRegistration.dispose();
        }
    }

    get onDidChangeDiagnostics(): Event<theia.DiagnosticChangeEvent> {
        return this.diagnostics.onDidChangeDiagnostics;
    }

    getLanguages(): Promise<string[]> {
        return this.proxy.$getLanguages();
    }

    changeLanguage(uri: URI, languageId: string): Promise<theia.TextDocument> {
        return this.proxy.$changeLanguage(uri, languageId).then(() => {
            const doc = this.documents.getDocumentData(uri);
            if (!doc) {
                throw new Error('No document found by URI ' + uri.toString());
            }
            return doc.document;
        });
    }

    setLanguageConfiguration(language: string, configuration: theia.LanguageConfiguration): theia.Disposable {
        const { wordPattern } = configuration;

        if (wordPattern) {
            this.documents.setWordDefinitionFor(language, wordPattern);
        } else {
            this.documents.setWordDefinitionFor(language, null);
        }

        const callId = this.nextCallId();

        const config: SerializedLanguageConfiguration = {
            brackets: configuration.brackets,
            comments: configuration.comments,
            onEnterRules: serializeEnterRules(configuration.onEnterRules),
            wordPattern: serializeRegExp(configuration.wordPattern),
            indentationRules: serializeIndentation(configuration.indentationRules),
            autoClosingPairs: serializeAutoClosingPairs(configuration.autoClosingPairs)
        };

        this.proxy.$setLanguageConfiguration(callId, language, config);
        return this.createDisposable(callId);
    }

    private nextCallId(): number {
        return this.callId++;
    }

    private createDisposable(callId: number, onDispose?: () => void): theia.Disposable {
        return new Disposable(() => {
            this.adaptersMap.delete(callId);
            this.proxy.$unregister(callId);
            onDispose?.();
        });
    }

    private addNewAdapter(adapter: Adapter): number {
        const callId = this.nextCallId();
        this.adaptersMap.set(callId, adapter);
        return callId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async withAdapter<A, R>(handle: number, ctor: { new(...args: any[]): A }, callback: (adapter: A) => Promise<R>, fallbackValue: R): Promise<R> {
        const adapter = this.adaptersMap.get(handle);
        if (!adapter) {
            return fallbackValue;
        }
        if (adapter instanceof ctor) {
            return callback(adapter);
        }
        throw new Error('no adapter found');
    }

    private transformDocumentSelector(selector: theia.DocumentSelector): SerializedDocumentFilter[] {
        if (isReadonlyArray(selector)) {
            return selector.map(sel => this.doTransformDocumentSelector(sel)!);
        }

        return [this.doTransformDocumentSelector(selector)!];
    }

    private doTransformDocumentSelector(selector: string | theia.DocumentFilter): SerializedDocumentFilter | undefined {
        if (typeof selector === 'string') {
            return {
                $serialized: true,
                language: selector
            };
        }

        if (selector) {
            return {
                $serialized: true,
                language: selector.language,
                scheme: selector.scheme,
                pattern: selector.pattern,
                notebookType: selector.notebookType
            };
        }

        return undefined;
    }

    private registerLinkProviderIfNotYetRegistered(linkProvider: FsLinkProvider): void {
        if (!this.linkProviderRegistration) {
            this.linkProviderRegistration = this.registerDocumentLinkProvider('*', linkProvider, {
                id: 'theia.fs-ext-impl',
                name: 'fs-ext-impl'
            });
        }
    }

    // ### Completion begin
    $provideCompletionItems(handle: number, resource: UriComponents, position: Position,
        context: CompletionContext, token: theia.CancellationToken): Promise<CompletionResultDto | undefined> {
        return this.withAdapter(handle, CompletionAdapter, adapter => adapter.provideCompletionItems(URI.revive(resource), position, context, token), undefined);
    }

    $resolveCompletionItem(handle: number, chainedId: ChainedCacheId, token: theia.CancellationToken): Promise<Completion | undefined> {
        return this.withAdapter(handle, CompletionAdapter, adapter => adapter.resolveCompletionItem(chainedId, token), undefined);
    }

    $releaseCompletionItems(handle: number, id: number): void {
        this.withAdapter(handle, CompletionAdapter, async adapter => adapter.releaseCompletionItems(id), undefined);
    }

    registerCompletionItemProvider(selector: theia.DocumentSelector, provider: theia.CompletionItemProvider, triggerCharacters: string[],
        pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new CompletionAdapter(provider, this.documents, this.commands));
        this.proxy.$registerCompletionSupport(callId, pluginInfo, this.transformDocumentSelector(selector), triggerCharacters, CompletionAdapter.hasResolveSupport(provider));
        return this.createDisposable(callId);
    }
    // ### Completion end

    // ### Inline completion provider begin
    registerInlineCompletionsProvider(selector: theia.DocumentSelector, provider: theia.InlineCompletionItemProvider): theia.Disposable {
        const callId = this.addNewAdapter(new InlineCompletionAdapter(this.documents, provider, this.commands));
        this.proxy.$registerInlineCompletionsSupport(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideInlineCompletions(
        handle: number,
        resource: UriComponents,
        position: Position,
        context: InlineCompletionContext,
        token: theia.CancellationToken
    ): Promise<IdentifiableInlineCompletions | undefined> {
        return this.withAdapter(handle, InlineCompletionAdapterBase, adapter => adapter.provideInlineCompletions(URI.revive(resource), position, context, token), undefined);
    }

    $freeInlineCompletionsList(handle: number, pid: number): void {
        this.withAdapter(handle, InlineCompletionAdapterBase, async adapter => { adapter.disposeCompletions(pid); }, undefined);
    }
    // ### Inline completion provider end

    // ### Definition provider begin
    $provideDefinition(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<Definition | undefined> {
        return this.withAdapter(handle, DefinitionAdapter, adapter => adapter.provideDefinition(URI.revive(resource), position, token), undefined);
    }

    registerDefinitionProvider(selector: theia.DocumentSelector, provider: theia.DefinitionProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new DefinitionAdapter(provider, this.documents));
        this.proxy.$registerDefinitionProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Definition provider end

    // ### Declaration provider begin
    $provideDeclaration(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<Definition | undefined> {
        return this.withAdapter(handle, DeclarationAdapter, adapter => adapter.provideDeclaration(URI.revive(resource), position, token), undefined);
    }

    registerDeclarationProvider(selector: theia.DocumentSelector, provider: theia.DeclarationProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new DeclarationAdapter(provider, this.documents));
        this.proxy.$registerDeclarationProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Declaration provider end

    // ### Signature help begin
    $provideSignatureHelp(
        handle: number, resource: UriComponents, position: Position, context: SignatureHelpContext, token: theia.CancellationToken
    ): Promise<SignatureHelp | undefined> {
        return this.withAdapter(handle, SignatureHelpAdapter, adapter => adapter.provideSignatureHelp(URI.revive(resource), position, token, context), undefined);
    }

    $releaseSignatureHelp(handle: number, id: number): void {
        this.withAdapter(handle, SignatureHelpAdapter, async adapter => adapter.releaseSignatureHelp(id), undefined);
    }

    registerSignatureHelpProvider(selector: theia.DocumentSelector, provider: theia.SignatureHelpProvider, metadata: theia.SignatureHelpProviderMetadata,
        pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new SignatureHelpAdapter(provider, this.documents));
        this.proxy.$registerSignatureHelpProvider(callId, pluginInfo, this.transformDocumentSelector(selector), metadata);
        return this.createDisposable(callId);
    }
    // ### Signature help end

    // ### Diagnostics begin
    getDiagnostics(resource?: URI): theia.Diagnostic[] | [URI, theia.Diagnostic[]][] {
        return this.diagnostics.getDiagnostics(resource!);
    }

    createDiagnosticCollection(name?: string): theia.DiagnosticCollection {
        return this.diagnostics.createDiagnosticCollection(name);
    }
    // ### Diagnostics end

    // ### Implementation provider begin
    $provideImplementation(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<Definition | undefined> {
        return this.withAdapter(handle, ImplementationAdapter, adapter => adapter.provideImplementation(URI.revive(resource), position, token), undefined);
    }

    registerImplementationProvider(selector: theia.DocumentSelector, provider: theia.ImplementationProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new ImplementationAdapter(provider, this.documents));
        this.proxy.$registerImplementationProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Implementation provider end

    // ### Type Definition provider begin
    $provideTypeDefinition(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<Definition | undefined> {
        return this.withAdapter(handle, TypeDefinitionAdapter, adapter => adapter.provideTypeDefinition(URI.revive(resource), position, token), undefined);
    }

    registerTypeDefinitionProvider(selector: theia.DocumentSelector, provider: theia.TypeDefinitionProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new TypeDefinitionAdapter(provider, this.documents));
        this.proxy.$registerTypeDefinitionProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Type Definition provider end

    // ### Hover Provider begin
    registerHoverProvider(selector: theia.DocumentSelector, provider: theia.HoverProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new HoverAdapter(provider, this.documents));
        this.proxy.$registerHoverProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideHover(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<Hover | undefined> {
        return this.withAdapter(handle, HoverAdapter, adapter => adapter.provideHover(URI.revive(resource), position, token), undefined);
    }
    // ### Hover Provider end

    // ### EvaluatableExpression Provider begin
    registerEvaluatableExpressionProvider(selector: theia.DocumentSelector, provider: theia.EvaluatableExpressionProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new EvaluatableExpressionAdapter(provider, this.documents));
        this.proxy.$registerEvaluatableExpressionProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideEvaluatableExpression(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<EvaluatableExpression | undefined> {
        return this.withAdapter(handle, EvaluatableExpressionAdapter, adapter => adapter.provideEvaluatableExpression(URI.revive(resource), position, token), undefined);
    }
    // ### EvaluatableExpression Provider end

    // ### InlineValues Provider begin
    registerInlineValuesProvider(selector: theia.DocumentSelector, provider: theia.InlineValuesProvider, pluginInfo: PluginInfo): theia.Disposable {
        const eventHandle = typeof provider.onDidChangeInlineValues === 'function' ? this.nextCallId() : undefined;
        const callId = this.addNewAdapter(new InlineValuesAdapter(provider, this.documents));
        this.proxy.$registerInlineValuesProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        let result = this.createDisposable(callId);

        if (eventHandle !== undefined) {
            const subscription = provider.onDidChangeInlineValues!(_ => this.proxy.$emitInlineValuesEvent(eventHandle));
            result = Disposable.from(result, subscription);
        }
        return result;
    }

    $provideInlineValues(handle: number, resource: UriComponents, range: Range, context: InlineValueContext, token: theia.CancellationToken): Promise<InlineValue[] | undefined> {
        return this.withAdapter(handle, InlineValuesAdapter, adapter => adapter.provideInlineValues(URI.revive(resource), range, context, token), undefined);
    }
    // ### InlineValue Provider end

    // ### Document Highlight Provider begin
    registerDocumentHighlightProvider(selector: theia.DocumentSelector, provider: theia.DocumentHighlightProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new DocumentHighlightAdapter(provider, this.documents));
        this.proxy.$registerDocumentHighlightProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentHighlights(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<DocumentHighlight[] | undefined> {
        return this.withAdapter(handle, DocumentHighlightAdapter, adapter => adapter.provideDocumentHighlights(URI.revive(resource), position, token), undefined);
    }
    // ### Document Highlight Provider end

    // ### WorkspaceSymbol Provider begin
    registerWorkspaceSymbolProvider(provider: theia.WorkspaceSymbolProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new WorkspaceSymbolAdapter(provider));
        this.proxy.$registerWorkspaceSymbolProvider(callId, pluginInfo);
        return this.createDisposable(callId);
    }

    $provideWorkspaceSymbols(handle: number, query: string, token: theia.CancellationToken): PromiseLike<SymbolInformation[]> {
        return this.withAdapter(handle, WorkspaceSymbolAdapter, adapter => adapter.provideWorkspaceSymbols(query, token), []);
    }

    $resolveWorkspaceSymbol(handle: number, symbol: SymbolInformation, token: theia.CancellationToken): PromiseLike<SymbolInformation | undefined> {
        return this.withAdapter(handle, WorkspaceSymbolAdapter, adapter => adapter.resolveWorkspaceSymbol(symbol, token), undefined);
    }
    // ### WorkspaceSymbol Provider end

    // ### Document Formatting Edit begin
    registerDocumentFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentFormattingEditProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new DocumentFormattingAdapter(provider, this.documents));
        this.proxy.$registerDocumentFormattingSupport(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentFormattingEdits(handle: number, resource: UriComponents,
        options: FormattingOptions, token: theia.CancellationToken): Promise<TextEdit[] | undefined> {
        return this.withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.provideDocumentFormattingEdits(URI.revive(resource), options, token), undefined);
    }
    // ### Document Formatting Edit end

    // ### Drop Edit Provider start
    $provideDocumentDropEdits(handle: number, resource: UriComponents, position: Position,
        dataTransfer: DataTransferDTO, token: theia.CancellationToken): Promise<DocumentDropEdit | undefined> {
        return this.withAdapter(handle, DocumentDropEditAdapter, adapter => adapter.provideDocumentDropEdits(URI.revive(resource), position, dataTransfer, token), undefined);
    }

    registerDocumentDropEditProvider(
        selector: theia.DocumentSelector,
        provider: theia.DocumentDropEditProvider,
        metadata?: theia.DocumentDropEditProviderMetadata
    ): theia.Disposable {
        const callId = this.addNewAdapter(new DocumentDropEditAdapter(provider, this.documents, this.filesSystem));
        this.proxy.$registerDocumentDropEditProvider(callId, this.transformDocumentSelector(selector), metadata);
        return this.createDisposable(callId);
    }
    // ### Drop Edit Provider end

    // ### Document Range Formatting Edit begin
    registerDocumentRangeFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentRangeFormattingEditProvider,
        pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new RangeFormattingAdapter(provider, this.documents));
        this.proxy.$registerRangeFormattingSupport(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: Range,
        options: FormattingOptions, token: theia.CancellationToken): Promise<TextEdit[] | undefined> {
        return this.withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options, token), undefined);
    }
    // ### Document Range Formatting Edit end

    // ### On Type Formatting Edit begin
    registerOnTypeFormattingEditProvider(
        selector: theia.DocumentSelector,
        provider: theia.OnTypeFormattingEditProvider,
        triggerCharacters: string[],
        pluginInfo: PluginInfo
    ): theia.Disposable {
        const callId = this.addNewAdapter(new OnTypeFormattingAdapter(provider, this.documents));
        this.proxy.$registerOnTypeFormattingProvider(callId, pluginInfo, this.transformDocumentSelector(selector), triggerCharacters);
        return this.createDisposable(callId);
    }

    $provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: Position, ch: string,
        options: FormattingOptions, token: theia.CancellationToken): Promise<TextEdit[] | undefined> {
        return this.withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options, token), undefined);
    }
    // ### On Type Formatting Edit end

    // ### Document Link Provider begin
    $provideDocumentLinks(handle: number, resource: UriComponents, token: theia.CancellationToken): Promise<DocumentLink[] | undefined> {
        return this.withAdapter(handle, LinkProviderAdapter, adapter => adapter.provideLinks(URI.revive(resource), token), undefined);
    }

    $resolveDocumentLink(handle: number, link: DocumentLink, token: theia.CancellationToken): Promise<DocumentLink | undefined> {
        return this.withAdapter(handle, LinkProviderAdapter, adapter => adapter.resolveLink(link, token), undefined);
    }

    registerDocumentLinkProvider(selector: theia.DocumentSelector, provider: theia.DocumentLinkProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new LinkProviderAdapter(provider, this.documents));
        this.proxy.$registerDocumentLinkProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $releaseDocumentLinks(handle: number, ids: number[]): void {
        this.withAdapter(handle, LinkProviderAdapter, async adapter => adapter.releaseDocumentLinks(ids), undefined);
    }

    // ### Document Link Provider end

    // ### Code Actions Provider begin
    registerCodeActionsProvider(
        selector: theia.DocumentSelector,
        provider: theia.CodeActionProvider,
        pluginModel: PluginModel,
        pluginInfo: PluginInfo,
        metadata?: theia.CodeActionProviderMetadata
    ): theia.Disposable {
        const callId = this.addNewAdapter(new CodeActionAdapter(provider, this.documents, this.diagnostics, pluginModel ? pluginModel.id : '', this.commands));

        let documentation: CodeActionProviderDocumentation | undefined;
        let disposables: DisposableCollection | undefined;
        if (metadata && metadata.documentation) {
            disposables = new DisposableCollection();
            documentation = metadata.documentation.map(doc => ({
                kind: doc.kind.value,
                command: this.commands.converter.toSafeCommand(doc.command, disposables!)
            }));
        }

        this.proxy.$registerQuickFixProvider(
            callId,
            pluginInfo,
            this.transformDocumentSelector(selector),
            metadata && metadata.providedCodeActionKinds ? metadata.providedCodeActionKinds.map(kind => kind.value) : undefined,
            documentation
        );

        return this.createDisposable(callId, disposables?.dispose);
    }

    $provideCodeActions(
        handle: number,
        resource: UriComponents,
        rangeOrSelection: Range | Selection,
        context: CodeActionContext,
        token: theia.CancellationToken
    ): Promise<CodeAction[] | undefined> {
        return this.withAdapter(handle, CodeActionAdapter, adapter => adapter.provideCodeAction(URI.revive(resource), rangeOrSelection, context, token), undefined);
    }

    $releaseCodeActions(handle: number, cacheIds: number[]): void {
        this.withAdapter(handle, CodeActionAdapter, adapter => adapter.releaseCodeActions(cacheIds), undefined);
    }

    $resolveCodeAction(handle: number, cacheId: number, token: theia.CancellationToken): Promise<WorkspaceEditDto | undefined> {
        return this.withAdapter(handle, CodeActionAdapter, adapter => adapter.resolveCodeAction(cacheId, token), undefined);
    };

    // ### Code Actions Provider end

    // ### Code Lens Provider begin
    registerCodeLensProvider(selector: theia.DocumentSelector, provider: theia.CodeLensProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new CodeLensAdapter(provider, this.documents, this.commands));
        const eventHandle = typeof provider.onDidChangeCodeLenses === 'function' ? this.nextCallId() : undefined;
        this.proxy.$registerCodeLensSupport(callId, pluginInfo, this.transformDocumentSelector(selector), eventHandle);
        let result = this.createDisposable(callId);

        if (eventHandle !== undefined && provider.onDidChangeCodeLenses) {
            const subscription = provider.onDidChangeCodeLenses(e => this.proxy.$emitCodeLensEvent(eventHandle));
            result = Disposable.from(result, subscription);
        }

        return result;
    }

    $provideCodeLenses(handle: number, resource: UriComponents, token: theia.CancellationToken): Promise<CodeLensSymbol[] | undefined> {
        return this.withAdapter(handle, CodeLensAdapter, adapter => adapter.provideCodeLenses(URI.revive(resource), token), undefined);
    }

    $resolveCodeLens(handle: number, resource: UriComponents, symbol: CodeLensSymbol, token: theia.CancellationToken): Promise<CodeLensSymbol | undefined> {
        return this.withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLens(URI.revive(resource), symbol, token), undefined);
    }

    $releaseCodeLenses(handle: number, ids: number[]): void {
        this.withAdapter(handle, CodeLensAdapter, async adapter => adapter.releaseCodeLenses(ids), undefined);
    }
    // ### Code Lens Provider end

    // ### Code Reference Provider begin
    $provideReferences(handle: number, resource: UriComponents, position: Position, context: ReferenceContext, token: theia.CancellationToken): Promise<Location[] | undefined> {
        return this.withAdapter(handle, ReferenceAdapter, adapter => adapter.provideReferences(URI.revive(resource), position, context, token), undefined);
    }

    registerReferenceProvider(selector: theia.DocumentSelector, provider: theia.ReferenceProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new ReferenceAdapter(provider, this.documents));
        this.proxy.$registerReferenceProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Code Reference Provider end

    // ### Document Symbol Provider begin
    registerDocumentSymbolProvider(selector: theia.DocumentSelector, provider: theia.DocumentSymbolProvider, pluginInfo: PluginInfo,
        metadata?: theia.DocumentSymbolProviderMetadata): theia.Disposable {
        const callId = this.addNewAdapter(new OutlineAdapter(this.documents, provider));
        const displayName = (metadata && metadata.label) || getPluginLabel(pluginInfo);
        this.proxy.$registerOutlineSupport(callId, pluginInfo, this.transformDocumentSelector(selector), displayName);
        return this.createDisposable(callId);
    }

    $provideDocumentSymbols(handle: number, resource: UriComponents, token: theia.CancellationToken): Promise<DocumentSymbol[] | undefined> {
        return this.withAdapter(handle, OutlineAdapter, adapter => adapter.provideDocumentSymbols(URI.revive(resource), token), undefined);
    }
    // ### Document Symbol Provider end

    // ### Color Provider begin
    registerColorProvider(selector: theia.DocumentSelector, provider: theia.DocumentColorProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new ColorProviderAdapter(this.documents, provider));
        this.proxy.$registerDocumentColorProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentColors(handle: number, resource: UriComponents, token: theia.CancellationToken): Promise<RawColorInfo[]> {
        return this.withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColors(URI.revive(resource), token), []);
    }

    $provideColorPresentations(handle: number, resource: UriComponents, colorInfo: RawColorInfo, token: theia.CancellationToken): Promise<ColorPresentation[]> {
        return this.withAdapter(handle, ColorProviderAdapter, adapter => adapter.provideColorPresentations(URI.revive(resource), colorInfo, token), []);
    }
    // ### Color Provider end

    // ### InlayHints Provider begin
    registerInlayHintsProvider(selector: theia.DocumentSelector, provider: theia.InlayHintsProvider, pluginInfo: PluginInfo): theia.Disposable {
        const eventHandle = typeof provider.onDidChangeInlayHints === 'function' ? this.nextCallId() : undefined;
        const callId = this.addNewAdapter(new InlayHintsAdapter(provider, this.documents, this.commands));
        this.proxy.$registerInlayHintsProvider(callId, pluginInfo, this.transformDocumentSelector(selector));

        let result = this.createDisposable(callId);

        if (eventHandle !== undefined) {
            const subscription = provider.onDidChangeInlayHints!(() => this.proxy.$emitInlayHintsEvent(eventHandle));
            result = Disposable.from(result, subscription);
        }

        return result;
    }

    $provideInlayHints(handle: number, resource: UriComponents, range: Range, token: theia.CancellationToken): Promise<InlayHintsDto | undefined> {
        return this.withAdapter(handle, InlayHintsAdapter, adapter => adapter.provideInlayHints(URI.revive(resource), range, token), undefined);
    }

    $resolveInlayHint(handle: number, id: ChainedCacheId, token: theia.CancellationToken): Promise<InlayHintDto | undefined> {
        return this.withAdapter(handle, InlayHintsAdapter, adapter => adapter.resolveInlayHint(id, token), undefined);
    }

    $releaseInlayHints(handle: number, id: number): void {
        this.withAdapter(handle, InlayHintsAdapter, async adapter => adapter.releaseHints(id), undefined);
    }
    // ### InlayHints Provider end

    // ### Folding Range Provider begin
    registerFoldingRangeProvider(selector: theia.DocumentSelector, provider: theia.FoldingRangeProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new FoldingProviderAdapter(provider, this.documents));
        const eventHandle = typeof provider.onDidChangeFoldingRanges === 'function' ? this.nextCallId() : undefined;

        this.proxy.$registerFoldingRangeProvider(callId, pluginInfo, this.transformDocumentSelector(selector), eventHandle);
        let result = this.createDisposable(callId);

        if (eventHandle !== undefined) {
            const subscription = provider.onDidChangeFoldingRanges!(() => this.proxy.$emitFoldingRangeEvent(eventHandle));
            result = Disposable.from(result, subscription);
        }
        return result;
    }

    $provideFoldingRange(
        callId: number,
        resource: UriComponents,
        context: theia.FoldingContext,
        token: theia.CancellationToken
    ): Promise<FoldingRange[] | undefined> {
        return this.withAdapter(callId, FoldingProviderAdapter, adapter => adapter.provideFoldingRanges(URI.revive(resource), context, token), undefined);
    }
    // ### Folding Range Provider end

    registerSelectionRangeProvider(selector: theia.DocumentSelector, provider: theia.SelectionRangeProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new SelectionRangeProviderAdapter(provider, this.documents));
        this.proxy.$registerSelectionRangeProvider(callId, pluginInfo, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideSelectionRanges(handle: number, resource: UriComponents, positions: Position[], token: theia.CancellationToken): Promise<SelectionRange[][]> {
        return this.withAdapter(handle, SelectionRangeProviderAdapter, adapter => adapter.provideSelectionRanges(URI.revive(resource), positions, token), []);
    }

    // ### Rename Provider begin
    registerRenameProvider(selector: theia.DocumentSelector, provider: theia.RenameProvider, pluginInfo: PluginInfo): theia.Disposable {
        const callId = this.addNewAdapter(new RenameAdapter(provider, this.documents));
        this.proxy.$registerRenameProvider(callId, pluginInfo, this.transformDocumentSelector(selector), RenameAdapter.supportsResolving(provider));
        return this.createDisposable(callId);
    }

    $provideRenameEdits(handle: number, resource: UriComponents, position: Position, newName: string, token: theia.CancellationToken): Promise<WorkspaceEditDto | undefined> {
        return this.withAdapter(handle, RenameAdapter, adapter => adapter.provideRenameEdits(URI.revive(resource), position, newName, token), undefined);
    }

    $resolveRenameLocation(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<RenameLocation | undefined> {
        return this.withAdapter(handle, RenameAdapter, adapter => adapter.resolveRenameLocation(URI.revive(resource), position, token), undefined);
    }
    // ### Rename Provider end

    // ### Call Hierarchy Provider begin
    registerCallHierarchyProvider(selector: theia.DocumentSelector, provider: theia.CallHierarchyProvider): theia.Disposable {
        const callId = this.addNewAdapter(new CallHierarchyAdapter(provider, this.documents));
        this.proxy.$registerCallHierarchyProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideRootDefinition(
        handle: number, resource: UriComponents, location: Position, token: theia.CancellationToken
    ): Promise<CallHierarchyItem[] | undefined> {
        return this.withAdapter(handle, CallHierarchyAdapter, adapter => adapter.provideRootDefinition(URI.revive(resource), location, token), undefined);
    }

    $provideCallers(handle: number, definition: CallHierarchyItem, token: theia.CancellationToken): Promise<CallHierarchyIncomingCall[] | undefined> {
        return this.withAdapter(handle, CallHierarchyAdapter, adapter => adapter.provideCallers(definition, token), undefined);
    }

    $provideCallees(handle: number, definition: CallHierarchyItem, token: theia.CancellationToken): Promise<CallHierarchyOutgoingCall[] | undefined> {
        return this.withAdapter(handle, CallHierarchyAdapter, adapter => adapter.provideCallees(definition, token), undefined);
    }

    $releaseCallHierarchy(handle: number, session?: string): Promise<boolean> {
        return this.withAdapter(handle, CallHierarchyAdapter, adapter => adapter.releaseSession(session), false);
    }
    // ### Call Hierarchy Provider end

    // ### Type hierarchy Provider begin
    registerTypeHierarchyProvider(selector: theia.DocumentSelector, provider: theia.TypeHierarchyProvider): theia.Disposable {
        const callId = this.addNewAdapter(new TypeHierarchyAdapter(provider, this.documents));
        this.proxy.$registerTypeHierarchyProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $prepareTypeHierarchy(handle: number, resource: UriComponents, location: Position, token: theia.CancellationToken
    ): Promise<TypeHierarchyItem[] | undefined> {
        return this.withAdapter(
            handle,
            TypeHierarchyAdapter,
            adapter => adapter.prepareSession(URI.revive(resource), location, token),
            undefined
        );
    }

    $provideSuperTypes(handle: number, sessionId: string, itemId: string, token: theia.CancellationToken):
        Promise<TypeHierarchyItem[] | undefined> {
        return this.withAdapter(
            handle,
            TypeHierarchyAdapter,
            adapter => adapter.provideSupertypes(sessionId, itemId, token),
            undefined
        );
    }

    $provideSubTypes(handle: number, sessionId: string, itemId: string, token: theia.CancellationToken):
        Promise<TypeHierarchyItem[] | undefined> {
        return this.withAdapter(
            handle,
            TypeHierarchyAdapter,
            adapter => adapter.provideSubtypes(sessionId, itemId, token),
            undefined
        );
    }

    $releaseTypeHierarchy(handle: number, session?: string): Promise<boolean> {
        return this.withAdapter(
            handle,
            TypeHierarchyAdapter,
            adapter => adapter.releaseSession(session),
            false);
    }

    // ### Type hierarchy Provider end

    // ### Linked Editing Range Provider begin
    registerLinkedEditingRangeProvider(selector: theia.DocumentSelector, provider: theia.LinkedEditingRangeProvider): theia.Disposable {
        const handle = this.addNewAdapter(new LinkedEditingRangeAdapter(this.documents, provider));
        this.proxy.$registerLinkedEditingRangeProvider(handle, this.transformDocumentSelector(selector));
        return this.createDisposable(handle);
    }

    $provideLinkedEditingRanges(handle: number, resource: UriComponents, position: Position, token: theia.CancellationToken): Promise<LinkedEditingRanges | undefined> {
        return this.withAdapter(handle, LinkedEditingRangeAdapter, async adapter => adapter.provideRanges(URI.revive(resource), position, token), undefined);
    }

    // ### Linked Editing Range Provider end

    // #region semantic coloring

    registerDocumentSemanticTokensProvider(selector: theia.DocumentSelector, provider: theia.DocumentSemanticTokensProvider, legend: theia.SemanticTokensLegend,
        pluginInfo: PluginInfo): theia.Disposable {
        const eventHandle = (typeof provider.onDidChangeSemanticTokens === 'function' ? this.nextCallId() : undefined);

        const handle = this.addNewAdapter(new DocumentSemanticTokensAdapter(this.documents, provider));
        this.proxy.$registerDocumentSemanticTokensProvider(handle, pluginInfo, this.transformDocumentSelector(selector), legend, eventHandle);
        let result = this.createDisposable(handle);

        if (eventHandle) {
            // eslint-disable-next-line no-unsanitized/method
            const subscription = provider.onDidChangeSemanticTokens!(_ => this.proxy.$emitDocumentSemanticTokensEvent(eventHandle));
            result = Disposable.from(result, subscription);
        }

        return result;
    }

    $provideDocumentSemanticTokens(handle: number, resource: UriComponents, previousResultId: number, token: theia.CancellationToken): Promise<BinaryBuffer | null> {
        return this.withAdapter(handle, DocumentSemanticTokensAdapter, adapter => adapter.provideDocumentSemanticTokens(URI.revive(resource), previousResultId, token), null);
    }

    $releaseDocumentSemanticTokens(handle: number, semanticColoringResultId: number): void {
        this.withAdapter(handle, DocumentSemanticTokensAdapter, adapter => adapter.releaseDocumentSemanticColoring(semanticColoringResultId), undefined);
    }

    registerDocumentRangeSemanticTokensProvider(selector: theia.DocumentSelector, provider: theia.DocumentRangeSemanticTokensProvider,
        legend: theia.SemanticTokensLegend, pluginInfo: PluginInfo): theia.Disposable {
        const handle = this.addNewAdapter(new DocumentRangeSemanticTokensAdapter(this.documents, provider));
        this.proxy.$registerDocumentRangeSemanticTokensProvider(handle, pluginInfo, this.transformDocumentSelector(selector), legend);
        return this.createDisposable(handle);
    }

    $provideDocumentRangeSemanticTokens(handle: number, resource: UriComponents, range: Range, token: theia.CancellationToken): Promise<BinaryBuffer | null> {
        return this.withAdapter(handle, DocumentRangeSemanticTokensAdapter, adapter => adapter.provideDocumentRangeSemanticTokens(URI.revive(resource), range, token), null);
    }

    // Copied from https://github.com/microsoft/vscode/blob/7d9b1c37f8e5ae3772782ba3b09d827eb3fdd833/src/vs/workbench/api/common/extHostLanguages.ts
    protected statusItemHandlePool = 0;
    protected readonly statusItemIds = new Set<string>();
    createLanguageStatusItem(extension: Plugin, id: string, selector: theia.DocumentSelector): theia.LanguageStatusItem {

        const handle = this.statusItemHandlePool++;
        const proxy = this.proxy;
        const ids = this.statusItemIds;

        // enforce extension unique identifier
        const fullyQualifiedId = `${extension.model.id}/${id}`;
        if (ids.has(fullyQualifiedId)) {
            throw new Error(`LanguageStatusItem with id '${id}' ALREADY exists`);
        }
        ids.add(fullyQualifiedId);

        const data: Omit<theia.LanguageStatusItem, 'dispose'> = {
            selector,
            id,
            name: extension.model.displayName ?? extension.model.name,
            severity: LanguageStatusSeverity.Information,
            command: undefined,
            text: '',
            detail: '',
            busy: false
        };

        let soonHandle: TheiaDisposable | undefined;
        const commandDisposables = new DisposableCollection();
        const updateAsync = () => {
            soonHandle?.dispose();
            soonHandle = disposableTimeout(() => {
                commandDisposables.dispose();
                commandDisposables.push({ dispose: () => { } }); // Mark disposable as undisposed.
                this.proxy.$setLanguageStatus(handle, {
                    id: fullyQualifiedId,
                    name: data.name ?? extension.model.displayName ?? extension.model.name,
                    source: extension.model.displayName ?? extension.model.name,
                    selector: this.transformDocumentSelector(data.selector),
                    label: data.text,
                    detail: data.detail ?? '',
                    severity: data.severity === LanguageStatusSeverity.Error ? Severity.Error : data.severity === LanguageStatusSeverity.Warning ? Severity.Warning : Severity.Info,
                    command: data.command && this.commands.converter.toSafeCommand(data.command, commandDisposables),
                    accessibilityInfo: data.accessibilityInformation,
                    busy: data.busy
                });
            }, 0);
        };

        const result: theia.LanguageStatusItem = {
            dispose(): void {
                commandDisposables.dispose();
                soonHandle?.dispose();
                proxy.$removeLanguageStatus(handle);
                ids.delete(fullyQualifiedId);
            },
            get id(): string {
                return data.id;
            },
            get name(): string | undefined {
                return data.name;
            },
            set name(value) {
                data.name = value;
                updateAsync();
            },
            get selector(): theia.DocumentSelector {
                return data.selector;
            },
            set selector(value) {
                data.selector = value;
                updateAsync();
            },
            get text(): string {
                return data.text;
            },
            set text(value) {
                data.text = value;
                updateAsync();
            },
            get detail(): string | undefined {
                return data.detail;
            },
            set detail(value) {
                data.detail = value;
                updateAsync();
            },
            get severity(): theia.LanguageStatusSeverity {
                return data.severity;
            },
            set severity(value) {
                data.severity = value;
                updateAsync();
            },
            get accessibilityInformation(): theia.AccessibilityInformation | undefined {
                return data.accessibilityInformation;
            },
            set accessibilityInformation(value) {
                data.accessibilityInformation = value;
                updateAsync();
            },
            get command(): theia.Command | undefined {
                return data.command;
            },
            set command(value) {
                data.command = value;
                updateAsync();
            },
            get busy(): boolean {
                return data.busy;
            },
            set busy(value: boolean) {
                data.busy = value;
                updateAsync();
            }
        };
        updateAsync();
        return result;
    }
    // #endregion

    // region DocumentPaste

    /** @stubbed */
    registerDocumentPasteEditProvider(
        extension: Plugin, selector: theia.DocumentSelector, provider: theia.DocumentPasteEditProvider, metadata: theia.DocumentPasteProviderMetadata
    ): theia.Disposable {
        return Disposable.NULL;
    }
    // #endregion
}

function getPluginLabel(pluginInfo: PluginInfo): string {
    return pluginInfo.displayName || pluginInfo.name;
}

