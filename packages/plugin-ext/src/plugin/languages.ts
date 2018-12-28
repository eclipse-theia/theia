/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import {
    LanguagesExt,
    PLUGIN_RPC_CONTEXT,
    LanguagesMain,
    SerializedLanguageConfiguration,
    SerializedRegExp,
    SerializedOnEnterRule,
    SerializedIndentationRule,
    Position,
    Selection
} from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from './documents';
import { PluginModel } from '../common/plugin-protocol';
import { Disposable } from './types-impl';
import URI from 'vscode-uri/lib/umd';
import { match as matchGlobPattern } from '../common/glob';
import { UriComponents } from '../common/uri-components';
import {
    CompletionContext,
    CompletionResultDto,
    Completion,
    SerializedDocumentFilter,
    SignatureHelp,
    Hover,
    DocumentHighlight,
    Range,
    SingleEditOperation,
    FormattingOptions,
    Definition,
    DefinitionLink,
    DocumentLink,
    CodeLensSymbol,
    DocumentSymbol,
    ReferenceContext,
    Location
} from '../api/model';
import { CompletionAdapter } from './languages/completion';
import { Diagnostics } from './languages/diagnostics';
import { SignatureHelpAdapter } from './languages/signature';
import { HoverAdapter } from './languages/hover';
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
import { CommandRegistryImpl } from './command-registry';
import { OutlineAdapter } from './languages/outline';
import { ReferenceAdapter } from './languages/reference';
import { WorkspaceSymbolAdapter } from './languages/workspace-symbol';
import { SymbolInformation } from 'vscode-languageserver-types';
import { FoldingProviderAdapter } from './languages/folding';

type Adapter = CompletionAdapter |
    SignatureHelpAdapter |
    HoverAdapter |
    DocumentHighlightAdapter |
    DocumentFormattingAdapter |
    RangeFormattingAdapter |
    OnTypeFormattingAdapter |
    DefinitionAdapter |
    ImplementationAdapter |
    TypeDefinitionAdapter |
    LinkProviderAdapter |
    CodeLensAdapter |
    CodeActionAdapter |
    OutlineAdapter |
    LinkProviderAdapter |
    ReferenceAdapter |
    WorkspaceSymbolAdapter |
    FoldingProviderAdapter;

export class LanguagesExtImpl implements LanguagesExt {

    private proxy: LanguagesMain;

    private diagnostics: Diagnostics;

    private callId = 0;
    private adaptersMap = new Map<number, Adapter>();

    constructor(rpc: RPCProtocol, private readonly documents: DocumentsExtImpl, private readonly commands: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.LANGUAGES_MAIN);
        this.diagnostics = new Diagnostics(rpc);
    }

    get onDidChangeDiagnostics() {
        return this.diagnostics.onDidChangeDiagnostics;
    }

    getLanguages(): Promise<string[]> {
        return this.proxy.$getLanguages();
    }

    setLanguageConfiguration(language: string, configuration: theia.LanguageConfiguration): theia.Disposable {
        const { wordPattern } = configuration;

        if (wordPattern) {
            this.documents.setWordDefinitionFor(language, wordPattern);
        } else {
            // tslint:disable-next-line:no-null-keyword
            this.documents.setWordDefinitionFor(language, null);
        }

        const callId = this.nextCallId();

        const config: SerializedLanguageConfiguration = {
            brackets: configuration.brackets,
            comments: configuration.comments,
            onEnterRules: serializeEnterRules(configuration.onEnterRules),
            wordPattern: serializeRegExp(configuration.wordPattern),
            indentationRules: serializeIndentation(configuration.indentationRules)
        };

        this.proxy.$setLanguageConfiguration(callId, language, config);
        return this.createDisposable(callId);
    }

    private nextCallId(): number {
        return this.callId++;
    }

    private createDisposable(callId: number): theia.Disposable {
        return new Disposable(() => {
            this.adaptersMap.delete(callId);
            this.proxy.$unregister(callId);
        });
    }

    private addNewAdapter(adapter: Adapter): number {
        const callId = this.nextCallId();
        this.adaptersMap.set(callId, adapter);
        return callId;
    }

    // tslint:disable-next-line:no-any
    private withAdapter<A, R>(handle: number, ctor: { new(...args: any[]): A }, callback: (adapter: A) => Promise<R>): Promise<R> {
        const adapter = this.adaptersMap.get(handle);
        if (!(adapter instanceof ctor)) {
            return Promise.reject(new Error('no adapter found'));
        }
        return callback(<A>adapter);
    }

    private transformDocumentSelector(selector: theia.DocumentSelector): SerializedDocumentFilter[] {
        if (Array.isArray(selector)) {
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
                pattern: selector.pattern
            };
        }

        return undefined;
    }

    // ### Completion begin
    $provideCompletionItems(handle: number, resource: UriComponents, position: Position, context: CompletionContext): Promise<CompletionResultDto | undefined> {
        return this.withAdapter(handle, CompletionAdapter, adapter => adapter.provideCompletionItems(URI.revive(resource), position, context));
    }

    $resolveCompletionItem(handle: number, resource: UriComponents, position: Position, completion: Completion): Promise<Completion> {
        return this.withAdapter(handle, CompletionAdapter, adapter => adapter.resolveCompletionItem(URI.revive(resource), position, completion));
    }

    $releaseCompletionItems(handle: number, id: number): void {
        this.withAdapter(handle, CompletionAdapter, adapter => adapter.releaseCompletionItems(id));
    }

    registerCompletionItemProvider(selector: theia.DocumentSelector, provider: theia.CompletionItemProvider, triggerCharacters: string[]): theia.Disposable {
        const callId = this.addNewAdapter(new CompletionAdapter(provider, this.documents));
        this.proxy.$registerCompletionSupport(callId, this.transformDocumentSelector(selector), triggerCharacters, CompletionAdapter.hasResolveSupport(provider));
        return this.createDisposable(callId);
    }
    // ### Completion end

    // ### Definition provider begin
    $provideDefinition(handle: number, resource: UriComponents, position: Position): Promise<Definition | DefinitionLink[] | undefined> {
        return this.withAdapter(handle, DefinitionAdapter, adapter => adapter.provideDefinition(URI.revive(resource), position));
    }

    registerDefinitionProvider(selector: theia.DocumentSelector, provider: theia.DefinitionProvider): theia.Disposable {
        const callId = this.addNewAdapter(new DefinitionAdapter(provider, this.documents));
        this.proxy.$registerDefinitionProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Definition provider end

    // ### Signature help begin
    $provideSignatureHelp(handle: number, resource: UriComponents, position: Position): Promise<SignatureHelp | undefined> {
        return this.withAdapter(handle, SignatureHelpAdapter, adapter => adapter.provideSignatureHelp(URI.revive(resource), position));
    }

    registerSignatureHelpProvider(selector: theia.DocumentSelector, provider: theia.SignatureHelpProvider, ...triggerCharacters: string[]): theia.Disposable {
        const callId = this.addNewAdapter(new SignatureHelpAdapter(provider, this.documents));
        this.proxy.$registerSignatureHelpProvider(callId, this.transformDocumentSelector(selector), triggerCharacters);
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
    $provideImplementation(handle: number, resource: UriComponents, position: Position): Promise<Definition | DefinitionLink[] | undefined> {
        return this.withAdapter(handle, ImplementationAdapter, adapter => adapter.provideImplementation(URI.revive(resource), position));
    }

    registerImplementationProvider(selector: theia.DocumentSelector, provider: theia.ImplementationProvider): theia.Disposable {
        const callId = this.addNewAdapter(new ImplementationAdapter(provider, this.documents));
        this.proxy.$registerImplementationProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Implementation provider end

    // ### Type Definition provider begin
    $provideTypeDefinition(handle: number, resource: UriComponents, position: Position): Promise<Definition | DefinitionLink[] | undefined> {
        return this.withAdapter(handle, TypeDefinitionAdapter, adapter => adapter.provideTypeDefinition(URI.revive(resource), position));
    }

    registerTypeDefinitionProvider(selector: theia.DocumentSelector, provider: theia.TypeDefinitionProvider): theia.Disposable {
        const callId = this.addNewAdapter(new TypeDefinitionAdapter(provider, this.documents));
        this.proxy.$registerTypeDefinitionProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Type Definition provider end

    // ### Hover Provider begin
    registerHoverProvider(selector: theia.DocumentSelector, provider: theia.HoverProvider): theia.Disposable {
        const callId = this.addNewAdapter(new HoverAdapter(provider, this.documents));
        this.proxy.$registerHoverProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideHover(handle: number, resource: UriComponents, position: Position): Promise<Hover | undefined> {
        return this.withAdapter(handle, HoverAdapter, adapter => adapter.provideHover(URI.revive(resource), position));
    }
    // ### Hover Provider end

    // ### Document Highlight Provider begin
    registerDocumentHighlightProvider(selector: theia.DocumentSelector, provider: theia.DocumentHighlightProvider): theia.Disposable {
        const callId = this.addNewAdapter(new DocumentHighlightAdapter(provider, this.documents));
        this.proxy.$registerDocumentHighlightProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentHighlights(handle: number, resource: UriComponents, position: Position): Promise<DocumentHighlight[] | undefined> {
        return this.withAdapter(handle, DocumentHighlightAdapter, adapter => adapter.provideDocumentHighlights(URI.revive(resource), position));
    }
    // ### Document Highlight Provider end

    // ### WorkspaceSymbol Provider begin
    registerWorkspaceSymbolProvider(provider: theia.WorkspaceSymbolProvider): theia.Disposable {
        const callId = this.addNewAdapter(new WorkspaceSymbolAdapter(provider));
        this.proxy.$registerWorkspaceSymbolProvider(callId);
        return this.createDisposable(callId);
    }

    $provideWorkspaceSymbols(handle: number, query: string): PromiseLike<SymbolInformation[]> {
        return this.withAdapter(handle, WorkspaceSymbolAdapter, adapter => adapter.provideWorkspaceSymbols(query));
    }

    $resolveWorkspaceSymbol(handle: number, symbol: SymbolInformation): PromiseLike<SymbolInformation> {
        return this.withAdapter(handle, WorkspaceSymbolAdapter, adapter => adapter.resolveWorkspaceSymbol(symbol));
    }
    // ### WorkspaceSymbol Provider end

    // ### Document Formatting Edit begin
    registerDocumentFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentFormattingEditProvider): theia.Disposable {
        const callId = this.addNewAdapter(new DocumentFormattingAdapter(provider, this.documents));
        this.proxy.$registerDocumentFormattingSupport(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: FormattingOptions): Promise<SingleEditOperation[] | undefined> {
        return this.withAdapter(handle, DocumentFormattingAdapter, adapter => adapter.provideDocumentFormattingEdits(URI.revive(resource), options));
    }
    // ### Document Formatting Edit end

    // ### Document Range Formatting Edit begin
    registerDocumentRangeFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentRangeFormattingEditProvider): theia.Disposable {
        const callId = this.addNewAdapter(new RangeFormattingAdapter(provider, this.documents));
        this.proxy.$registerRangeFormattingProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: Range, options: FormattingOptions): Promise<SingleEditOperation[] | undefined> {
        return this.withAdapter(handle, RangeFormattingAdapter, adapter => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options));
    }
    // ### Document Range Formatting Edit end

    // ### On Type Formatting Edit begin
    registerOnTypeFormattingEditProvider(
        selector: theia.DocumentSelector,
        provider: theia.OnTypeFormattingEditProvider,
        triggerCharacters: string[]
    ): theia.Disposable {
        const callId = this.addNewAdapter(new OnTypeFormattingAdapter(provider, this.documents));
        this.proxy.$registerOnTypeFormattingProvider(callId, this.transformDocumentSelector(selector), triggerCharacters);
        return this.createDisposable(callId);
    }

    $provideOnTypeFormattingEdits(handle: number, resource: UriComponents, position: Position, ch: string, options: FormattingOptions): Promise<SingleEditOperation[] | undefined> {
        return this.withAdapter(handle, OnTypeFormattingAdapter, adapter => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options));
    }
    // ### On Type Formatting Edit end

    // ### Document Link Provider begin
    $provideDocumentLinks(handle: number, resource: UriComponents): Promise<DocumentLink[] | undefined> {
        return this.withAdapter(handle, LinkProviderAdapter, adapter => adapter.provideLinks(URI.revive(resource)));
    }

    $resolveDocumentLink(handle: number, link: DocumentLink): Promise<DocumentLink | undefined> {
        return this.withAdapter(handle, LinkProviderAdapter, adapter => adapter.resolveLink(link));
    }

    registerLinkProvider(selector: theia.DocumentSelector, provider: theia.DocumentLinkProvider): theia.Disposable {
        const callId = this.addNewAdapter(new LinkProviderAdapter(provider, this.documents));
        this.proxy.$registerDocumentLinkProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Document Link Provider end

    // ### Code Actions Provider begin
    registerCodeActionsProvider(
        selector: theia.DocumentSelector,
        provider: theia.CodeActionProvider,
        pluginModel: PluginModel,
        metadata?: theia.CodeActionProviderMetadata
    ): theia.Disposable {
        const callId = this.addNewAdapter(new CodeActionAdapter(provider, this.documents, this.diagnostics, pluginModel ? pluginModel.id : ''));
        this.proxy.$registerQuickFixProvider(
            callId,
            this.transformDocumentSelector(selector),
            metadata && metadata.providedCodeActionKinds ? metadata.providedCodeActionKinds.map(kind => kind.value!) : undefined
        );
        return this.createDisposable(callId);
    }

    $provideCodeActions(handle: number,
        resource: UriComponents,
        rangeOrSelection: Range | Selection,
        context: monaco.languages.CodeActionContext
    ): Promise<monaco.languages.CodeAction[]> {
        return this.withAdapter(handle, CodeActionAdapter, adapter => adapter.provideCodeAction(URI.revive(resource), rangeOrSelection, context));
    }
    // ### Code Actions Provider end

    // ### Code Lens Provider begin
    registerCodeLensProvider(selector: theia.DocumentSelector, provider: theia.CodeLensProvider): theia.Disposable {
        const callId = this.addNewAdapter(new CodeLensAdapter(provider, this.documents, this.commands.getConverter()));
        const eventHandle = typeof provider.onDidChangeCodeLenses === 'function' ? this.nextCallId() : undefined;
        this.proxy.$registerCodeLensSupport(callId, this.transformDocumentSelector(selector), eventHandle);
        let result = this.createDisposable(callId);

        if (eventHandle !== undefined && provider.onDidChangeCodeLenses) {
            const subscription = provider.onDidChangeCodeLenses(e => this.proxy.$emitCodeLensEvent(eventHandle));
            result = Disposable.from(result, subscription);
        }

        return result;
    }

    $provideCodeLenses(handle: number, resource: UriComponents): Promise<CodeLensSymbol[] | undefined> {
        return this.withAdapter(handle, CodeLensAdapter, adapter => adapter.provideCodeLenses(URI.revive(resource)));
    }

    $resolveCodeLens(handle: number, resource: UriComponents, symbol: CodeLensSymbol): Promise<CodeLensSymbol | undefined> {
        return this.withAdapter(handle, CodeLensAdapter, adapter => adapter.resolveCodeLens(URI.revive(resource), symbol));
    }
    // ### Code Lens Provider end

    // ### Code Reference Provider begin
    $provideReferences(handle: number, resource: UriComponents, position: Position, context: ReferenceContext): Promise<Location[] | undefined> {
        return this.withAdapter(handle, ReferenceAdapter, adapter => adapter.provideReferences(URI.revive(resource), position, context));
    }

    registerReferenceProvider(selector: theia.DocumentSelector, provider: theia.ReferenceProvider): theia.Disposable {
        const callId = this.addNewAdapter(new ReferenceAdapter(provider, this.documents));
        this.proxy.$registeReferenceProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }
    // ### Code Reference Provider end

    // ### Document Symbol Provider begin
    registerDocumentSymbolProvider(selector: theia.DocumentSelector, provider: theia.DocumentSymbolProvider): theia.Disposable {
        const callId = this.addNewAdapter(new OutlineAdapter(this.documents, provider));
        this.proxy.$registerOutlineSupport(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideDocumentSymbols(handle: number, resource: UriComponents): Promise<DocumentSymbol[] | undefined> {
        return this.withAdapter(handle, OutlineAdapter, adapter => adapter.provideDocumentSymbols(URI.revive(resource)));
    }
    // ### Document Symbol Provider end

    // ### Folding Range Provider begin
    registerFoldingRangeProvider(selector: theia.DocumentSelector, provider: theia.FoldingRangeProvider): theia.Disposable {
        const callId = this.addNewAdapter(new FoldingProviderAdapter(provider, this.documents));
        this.proxy.$registerFoldingRangeProvider(callId, this.transformDocumentSelector(selector));
        return this.createDisposable(callId);
    }

    $provideFoldingRange(
        callId: number,
        resource: UriComponents,
        context: theia.FoldingContext
    ): Promise<monaco.languages.FoldingRange[] | undefined> {
        return this.withAdapter(callId, FoldingProviderAdapter, adapter => adapter.provideFoldingRanges(URI.revive(resource), context));
    }
    // ### Folging Range Provider end
}

function serializeEnterRules(rules?: theia.OnEnterRule[]): SerializedOnEnterRule[] | undefined {
    if (typeof rules === 'undefined' || rules === null) {
        return undefined;
    }

    return rules.map(r =>
        ({
            action: r.action,
            beforeText: serializeRegExp(r.beforeText),
            afterText: serializeRegExp(r.afterText)
        } as SerializedOnEnterRule));
}

function serializeRegExp(regexp?: RegExp): SerializedRegExp | undefined {
    if (typeof regexp === 'undefined' || regexp === null) {
        return undefined;
    }

    return {
        pattern: regexp.source,
        flags: (regexp.global ? 'g' : '') + (regexp.ignoreCase ? 'i' : '') + (regexp.multiline ? 'm' : '')
    };
}

function serializeIndentation(indentationRules?: theia.IndentationRule): SerializedIndentationRule | undefined {
    if (typeof indentationRules === 'undefined' || indentationRules === null) {
        return undefined;
    }

    return {
        increaseIndentPattern: serializeRegExp(indentationRules.increaseIndentPattern),
        decreaseIndentPattern: serializeRegExp(indentationRules.decreaseIndentPattern),
        indentNextLinePattern: serializeRegExp(indentationRules.indentNextLinePattern),
        unIndentedLinePattern: serializeRegExp(indentationRules.unIndentedLinePattern)
    };
}

export interface RelativePattern {
    base: string;
    pattern: string;
    pathToRelative(from: string, to: string): string;
}
export interface LanguageFilter {
    language?: string;
    scheme?: string;
    pattern?: string | RelativePattern;
    hasAccessToAllModels?: boolean;
}
export type LanguageSelector = string | LanguageFilter | (string | LanguageFilter)[];

export function score(selector: LanguageSelector | undefined, candidateUri: URI, candidateLanguage: string, candidateIsSynchronized: boolean): number {

    if (Array.isArray(selector)) {
        let ret = 0;
        for (const filter of selector) {
            const value = score(filter, candidateUri, candidateLanguage, candidateIsSynchronized);
            if (value === 10) {
                return value;
            }
            if (value > ret) {
                ret = value;
            }
        }
        return ret;

    } else if (typeof selector === 'string') {

        if (!candidateIsSynchronized) {
            return 0;
        }

        if (selector === '*') {
            return 5;
        } else if (selector === candidateLanguage) {
            return 10;
        } else {
            return 0;
        }

    } else if (selector) {
        const { language, pattern, scheme, hasAccessToAllModels } = selector;

        if (!candidateIsSynchronized && !hasAccessToAllModels) {
            return 0;
        }

        let result = 0;

        if (scheme) {
            if (scheme === candidateUri.scheme) {
                result = 10;
            } else if (scheme === '*') {
                result = 5;
            } else {
                return 0;
            }
        }

        if (language) {
            if (language === candidateLanguage) {
                result = 10;
            } else if (language === '*') {
                result = Math.max(result, 5);
            } else {
                return 0;
            }
        }

        if (pattern) {
            if (pattern === candidateUri.fsPath || matchGlobPattern(pattern, candidateUri.fsPath)) {
                result = 10;
            } else {
                return 0;
            }
        }

        return result;

    } else {
        return 0;
    }
}
