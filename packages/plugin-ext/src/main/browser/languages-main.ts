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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Method `$changeLanguage` copied and modified
// from https://github.com/microsoft/vscode/blob/e9c50663154c369a06355ce752b447af5b580dc3/src/vs/workbench/api/browser/mainThreadLanguages.ts#L30-L42

import {
    LanguagesMain,
    SerializedLanguageConfiguration,
    SerializedRegExp,
    SerializedIndentationRule,
    SerializedOnEnterRule,
    MAIN_RPC_CONTEXT,
    LanguagesExt,
    WorkspaceEditDto,
    WorkspaceTextEditDto,
    PluginInfo
} from '../../common/plugin-api-rpc';
import { injectable, inject } from '@theia/core/shared/inversify';
import {
    SerializedDocumentFilter, MarkerData, Range, RelatedInformation,
    MarkerSeverity, DocumentLink, WorkspaceSymbolParams, CodeAction, CompletionDto
} from '../../common/plugin-api-rpc-model';
import { RPCProtocol } from '../../common/rpc-protocol';
import { MonacoLanguages, WorkspaceSymbolProvider } from '@theia/monaco/lib/browser/monaco-languages';
import CoreURI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { ProblemManager } from '@theia/markers/lib/browser';
import * as vst from '@theia/core/shared/vscode-languageserver-protocol';
import * as theia from '@theia/plugin';
import { UriComponents } from '../../common/uri-components';
import { CancellationToken } from '@theia/core/lib/common';
import { LanguageSelector, RelativePattern } from '@theia/callhierarchy/lib/common/language-selector';
import { CallHierarchyService, CallHierarchyServiceProvider, Definition } from '@theia/callhierarchy/lib/browser';
import { toDefinition, toUriComponents, fromDefinition, fromPosition, toCaller, toCallee } from './callhierarchy/callhierarchy-type-converters';
import { Position, DocumentUri } from '@theia/core/shared/vscode-languageserver-protocol';
import { ObjectIdentifier } from '../../common/object-identifier';
import { mixin } from '../../common/types';
import { relative } from '../../common/paths-util';
import { decodeSemanticTokensDto } from '../../common/semantic-tokens-dto';
import { DiagnosticTag } from '@theia/core/shared/vscode-languageserver-protocol';

@injectable()
export class LanguagesMainImpl implements LanguagesMain, Disposable {

    @inject(MonacoLanguages)
    private readonly monacoLanguages: MonacoLanguages;

    @inject(ProblemManager)
    private readonly problemManager: ProblemManager;

    @inject(CallHierarchyServiceProvider)
    private readonly callHierarchyServiceContributionRegistry: CallHierarchyServiceProvider;

    private readonly proxy: LanguagesExt;
    private readonly services = new Map<number, Disposable>();
    private readonly toDispose = new DisposableCollection();

    constructor(@inject(RPCProtocol) rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.LANGUAGES_EXT);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    $getLanguages(): Promise<string[]> {
        return Promise.resolve(monaco.languages.getLanguages().map(l => l.id));
    }

    $changeLanguage(resource: UriComponents, languageId: string): Promise<void> {
        const uri = monaco.Uri.revive(resource);
        const model = monaco.editor.getModel(uri);
        if (!model) {
            return Promise.reject(new Error('Invalid uri'));
        }
        const langId = monaco.languages.getEncodedLanguageId(languageId);
        if (!langId) {
            return Promise.reject(new Error(`Unknown language ID: ${languageId}`));
        }
        monaco.editor.setModelLanguage(model, languageId);
        return Promise.resolve(undefined);
    }

    protected register(handle: number, service: Disposable): void {
        this.services.set(handle, service);
        this.toDispose.push(Disposable.create(() => this.$unregister(handle)));
    }

    $unregister(handle: number): void {
        const disposable = this.services.get(handle);
        if (disposable) {
            this.services.delete(handle);
            disposable.dispose();
        }
    }

    $setLanguageConfiguration(handle: number, languageId: string, configuration: SerializedLanguageConfiguration): void {
        const config: monaco.languages.LanguageConfiguration = {
            comments: configuration.comments,
            brackets: configuration.brackets,
            wordPattern: reviveRegExp(configuration.wordPattern),
            indentationRules: reviveIndentationRule(configuration.indentationRules),
            onEnterRules: reviveOnEnterRules(configuration.onEnterRules),
        };

        this.register(handle, monaco.languages.setLanguageConfiguration(languageId, config));
    }

    $registerCompletionSupport(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], triggerCharacters: string[], supportsResolveDetails: boolean): void {
        this.register(handle, monaco.modes.CompletionProviderRegistry.register(this.toLanguageSelector(selector), {
            triggerCharacters,
            provideCompletionItems: (model, position, context, token) => this.provideCompletionItems(handle, model, position, context, token),
            resolveCompletionItem: supportsResolveDetails
                ? (suggestion, token) => Promise.resolve(this.resolveCompletionItem(handle, suggestion, token))
                : undefined
        }));
    }

    protected provideCompletionItems(handle: number, model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.CompletionContext, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
        return this.proxy.$provideCompletionItems(handle, model.uri, position, context, token).then(result => {
            if (!result) {
                return undefined;
            }
            return {
                suggestions: result.completions.map(c => Object.assign(c, {
                    range: c.range || result.defaultRange
                })),
                incomplete: result.incomplete,
                dispose: () => this.proxy.$releaseCompletionItems(handle, result.id)
            };
        });
    }

    protected resolveCompletionItem(handle: number,
        item: monaco.languages.CompletionItem, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.CompletionItem> {
        const { parentId, id } = item as CompletionDto;
        return this.proxy.$resolveCompletionItem(handle, [parentId, id], token).then(resolved => {
            if (resolved) {
                mixin(item, resolved, true);
            }
            return item;
        });
    }

    $registerDefinitionProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const definitionProvider = this.createDefinitionProvider(handle);
        this.register(handle, monaco.languages.registerDefinitionProvider(languageSelector, definitionProvider));
    }

    $registerDeclarationProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const declarationProvider = this.createDeclarationProvider(handle);
        this.register(handle, monaco.languages.registerDeclarationProvider(languageSelector, declarationProvider));
    }

    $registerReferenceProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const referenceProvider = this.createReferenceProvider(handle);
        this.register(handle, monaco.languages.registerReferenceProvider(languageSelector, referenceProvider));
    }

    protected createReferenceProvider(handle: number): monaco.languages.ReferenceProvider {
        return {
            provideReferences: (model, position, context, token) => this.provideReferences(handle, model, position, context, token)
        };
    }

    protected provideReferences(handle: number, model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.ReferenceContext, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.Location[]> {
        return this.proxy.$provideReferences(handle, model.uri, position, context, token).then(result => {
            if (!result) {
                return undefined;
            }

            if (Array.isArray(result)) {
                const references: monaco.languages.Location[] = [];
                for (const item of result) {
                    references.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                }
                return references;
            }

            return undefined;
        });
    }

    $registerSignatureHelpProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], metadata: theia.SignatureHelpProviderMetadata): void {
        const languageSelector = this.toLanguageSelector(selector);
        const signatureHelpProvider = this.createSignatureHelpProvider(handle, metadata);
        this.register(handle, monaco.languages.registerSignatureHelpProvider(languageSelector, signatureHelpProvider));
    }

    $clearDiagnostics(id: string): void {
        for (const uri of this.problemManager.getUris()) {
            this.problemManager.setMarkers(new CoreURI(uri), id, []);
        }
    }

    $changeDiagnostics(id: string, delta: [string, MarkerData[]][]): void {
        for (const [uriString, markers] of delta) {
            const uri = new CoreURI(uriString);
            this.problemManager.setMarkers(uri, id, markers.map(reviveMarker));
        }
    }

    $registerImplementationProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const implementationProvider = this.createImplementationProvider(handle);
        this.register(handle, monaco.languages.registerImplementationProvider(languageSelector, implementationProvider));
    }

    protected createImplementationProvider(handle: number): monaco.languages.ImplementationProvider {
        return {
            provideImplementation: (model, position, token) => this.provideImplementation(handle, model, position, token)
        };
    }

    protected provideImplementation(handle: number, model: monaco.editor.ITextModel,
        position: monaco.Position, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.Definition> {
        return this.proxy.$provideImplementation(handle, model.uri, position, token).then(result => {
            if (!result) {
                return undefined;
            }

            if (Array.isArray(result)) {
                // using DefinitionLink because Location is mandatory part of DefinitionLink
                const definitionLinks: monaco.languages.LocationLink[] = [];
                for (const item of result) {
                    definitionLinks.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                }
                return definitionLinks;
            } else {
                // single Location
                return <monaco.languages.Location>{
                    uri: monaco.Uri.revive(result.uri),
                    range: result.range
                };
            }
        });
    }

    $registerTypeDefinitionProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const typeDefinitionProvider = this.createTypeDefinitionProvider(handle);
        this.register(handle, monaco.languages.registerTypeDefinitionProvider(languageSelector, typeDefinitionProvider));
    }

    protected createTypeDefinitionProvider(handle: number): monaco.languages.TypeDefinitionProvider {
        return {
            provideTypeDefinition: (model, position, token) => this.provideTypeDefinition(handle, model, position, token)
        };
    }

    protected provideTypeDefinition(handle: number, model: monaco.editor.ITextModel,
        position: monaco.Position, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.Definition> {
        return this.proxy.$provideTypeDefinition(handle, model.uri, position, token).then(result => {
            if (!result) {
                return undefined;
            }

            if (Array.isArray(result)) {
                // using DefinitionLink because Location is mandatory part of DefinitionLink
                const definitionLinks: monaco.languages.LocationLink[] = [];
                for (const item of result) {
                    definitionLinks.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                }
                return definitionLinks;
            } else {
                // single Location
                return <monaco.languages.Location>{
                    uri: monaco.Uri.revive(result.uri),
                    range: result.range
                };
            }
        });
    }

    $registerHoverProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const hoverProvider = this.createHoverProvider(handle);
        this.register(handle, monaco.languages.registerHoverProvider(languageSelector, hoverProvider));
    }

    protected createHoverProvider(handle: number): monaco.languages.HoverProvider {
        return {
            provideHover: (model, position, token) => this.provideHover(handle, model, position, token)
        };
    }

    protected provideHover(handle: number, model: monaco.editor.ITextModel, position: monaco.Position,
        token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.Hover> {
        return this.proxy.$provideHover(handle, model.uri, position, token);
    }

    $registerDocumentHighlightProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const documentHighlightProvider = this.createDocumentHighlightProvider(handle);
        this.register(handle, monaco.languages.registerDocumentHighlightProvider(languageSelector, documentHighlightProvider));
    }

    protected createDocumentHighlightProvider(handle: number): monaco.languages.DocumentHighlightProvider {
        return {
            provideDocumentHighlights: (model, position, token) => this.provideDocumentHighlights(handle, model, position, token)
        };
    }

    protected provideDocumentHighlights(handle: number, model: monaco.editor.ITextModel, position: monaco.Position,
        token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.DocumentHighlight[]> {
        return this.proxy.$provideDocumentHighlights(handle, model.uri, position, token).then(result => {
            if (!result) {
                return undefined;
            }

            if (Array.isArray(result)) {
                const highlights: monaco.languages.DocumentHighlight[] = [];
                for (const item of result) {
                    highlights.push(
                        {
                            ...item,
                            kind: (item.kind ? item.kind : monaco.languages.DocumentHighlightKind.Text)
                        });
                }
                return highlights;
            }

            return undefined;
        });
    }

    $registerWorkspaceSymbolProvider(handle: number, pluginInfo: PluginInfo): void {
        const workspaceSymbolProvider = this.createWorkspaceSymbolProvider(handle);
        this.register(handle, this.monacoLanguages.registerWorkspaceSymbolProvider(workspaceSymbolProvider));
    }

    protected createWorkspaceSymbolProvider(handle: number): WorkspaceSymbolProvider {
        return {
            provideWorkspaceSymbols: (params, token) => this.provideWorkspaceSymbols(handle, params, token),
            resolveWorkspaceSymbol: (symbol, token) => this.resolveWorkspaceSymbol(handle, symbol, token)
        };
    }

    protected provideWorkspaceSymbols(handle: number, params: WorkspaceSymbolParams, token: monaco.CancellationToken): Thenable<vst.SymbolInformation[]> {
        return this.proxy.$provideWorkspaceSymbols(handle, params.query, token);
    }

    protected resolveWorkspaceSymbol(handle: number, symbol: vst.SymbolInformation, token: monaco.CancellationToken): Thenable<vst.SymbolInformation | undefined> {
        return this.proxy.$resolveWorkspaceSymbol(handle, symbol, token);
    }

    $registerDocumentLinkProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const linkProvider = this.createLinkProvider(handle);
        this.register(handle, monaco.languages.registerLinkProvider(languageSelector, linkProvider));
    }

    protected createLinkProvider(handle: number): monaco.languages.LinkProvider {
        return {
            provideLinks: async (model, token) => this.provideLinks(handle, model, token),
            resolveLink: async (link, token) => this.resolveLink(handle, link, token)
        };
    }

    protected async provideLinks(handle: number, model: monaco.editor.ITextModel,
        token: monaco.CancellationToken): Promise<monaco.languages.ProviderResult<monaco.languages.ILinksList>> {
        const links = await this.proxy.$provideDocumentLinks(handle, model.uri, token);
        if (!links) {
            return undefined;
        }
        return {
            links: links.map(link => this.toMonacoLink(link)),
            dispose: () => {
                if (links && Array.isArray(links)) {
                    this.proxy.$releaseDocumentLinks(handle, links.map(link => ObjectIdentifier.of(link)));
                }
            }
        };
    }

    protected async resolveLink(handle: number, link: monaco.languages.ILink,
        token: monaco.CancellationToken): Promise<monaco.languages.ProviderResult<monaco.languages.ILink>> {
        const resolved = await this.proxy.$resolveDocumentLink(handle, link, token);
        return resolved && this.toMonacoLink(resolved);
    }

    protected toMonacoLink(link: DocumentLink): monaco.languages.ILink {
        return {
            ...link,
            url: !!link.url && typeof link.url !== 'string' ? monaco.Uri.revive(link.url) : link.url
        };
    }

    $registerCodeLensSupport(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], eventHandle: number): void {
        const languageSelector = this.toLanguageSelector(selector);
        const lensProvider = this.createCodeLensProvider(handle);

        if (typeof eventHandle === 'number') {
            const emitter = new Emitter<monaco.languages.CodeLensProvider>();
            this.register(eventHandle, emitter);
            lensProvider.onDidChange = emitter.event;
        }

        this.register(handle, monaco.languages.registerCodeLensProvider(languageSelector, lensProvider));
    }

    protected createCodeLensProvider(handle: number): monaco.languages.CodeLensProvider {
        return {
            provideCodeLenses: async (model, token) => this.provideCodeLenses(handle, model, token),
            resolveCodeLens: (model, codeLens, token) => this.resolveCodeLens(handle, model, codeLens, token)
        };
    }

    protected async provideCodeLenses(handle: number, model: monaco.editor.ITextModel,
        token: monaco.CancellationToken): Promise<monaco.languages.ProviderResult<monaco.languages.CodeLensList>> {
        const lenses = await this.proxy.$provideCodeLenses(handle, model.uri, token);
        if (!lenses) {
            return undefined;
        }
        return {
            lenses,
            dispose: () => {
                if (lenses && Array.isArray(lenses)) {
                    this.proxy.$releaseCodeLenses(handle, lenses.map(symbol => ObjectIdentifier.of(symbol)));
                }
            }
        };
    }

    protected resolveCodeLens(handle: number, model: monaco.editor.ITextModel,
        codeLens: monaco.languages.CodeLens, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.CodeLens> {
        return this.proxy.$resolveCodeLens(handle, model.uri, codeLens, token);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $emitCodeLensEvent(eventHandle: number, event?: any): void {
        const obj = this.services.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(event);
        }
    }

    $registerOutlineSupport(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const symbolProvider = this.createDocumentSymbolProvider(handle);
        this.register(handle, monaco.modes.DocumentSymbolProviderRegistry.register(languageSelector, symbolProvider));
    }

    protected createDocumentSymbolProvider(handle: number): monaco.languages.DocumentSymbolProvider {
        return {
            provideDocumentSymbols: (model, token) => this.provideDocumentSymbols(handle, model, token)
        };
    }

    protected provideDocumentSymbols(handle: number, model: monaco.editor.ITextModel,
        token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.DocumentSymbol[]> {
        return this.proxy.$provideDocumentSymbols(handle, model.uri, token);
    }

    protected createDefinitionProvider(handle: number): monaco.languages.DefinitionProvider {
        return {
            provideDefinition: (model, position, token) => this.provideDefinition(handle, model, position, token)
        };
    }

    protected createDeclarationProvider(handle: number): monaco.languages.DeclarationProvider {
        return {
            provideDeclaration: (model, position, token) => this.provideDeclaration(handle, model, position, token)
        };
    }

    protected provideDeclaration(handle: number, model: monaco.editor.ITextModel, position: monaco.Position,
        token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.Definition> {
        return this.proxy.$provideDeclaration(handle, model.uri, position, token).then(result => {
            if (!result) {
                return undefined;
            }

            if (Array.isArray(result)) {
                // using DefinitionLink because Location is mandatory part of DefinitionLink
                const definitionLinks: monaco.languages.LocationLink[] = [];
                for (const item of result) {
                    definitionLinks.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                }
                return definitionLinks;
            } else {
                // single Location
                return <monaco.languages.Location>{
                    uri: monaco.Uri.revive(result.uri),
                    range: result.range
                };
            }
        });
    }

    protected provideDefinition(handle: number, model: monaco.editor.ITextModel,
        position: monaco.Position, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.Definition> {
        return this.proxy.$provideDefinition(handle, model.uri, position, token).then(result => {
            if (!result) {
                return undefined;
            }

            if (Array.isArray(result)) {
                // using DefinitionLink because Location is mandatory part of DefinitionLink
                const definitionLinks: monaco.languages.LocationLink[] = [];
                for (const item of result) {
                    definitionLinks.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                }
                return definitionLinks;
            } else {
                // single Location
                return <monaco.languages.Location>{
                    uri: monaco.Uri.revive(result.uri),
                    range: result.range
                };
            }
        });
    }

    protected createSignatureHelpProvider(handle: number, metadata: theia.SignatureHelpProviderMetadata): monaco.languages.SignatureHelpProvider {
        return {
            signatureHelpTriggerCharacters: metadata.triggerCharacters,
            signatureHelpRetriggerCharacters: metadata.retriggerCharacters,
            provideSignatureHelp: async (model, position, token, context) => this.provideSignatureHelp(handle, model, position, token, context)
        };
    }

    protected async provideSignatureHelp(handle: number, model: monaco.editor.ITextModel,
        position: monaco.Position, token: monaco.CancellationToken,
        context: monaco.languages.SignatureHelpContext): Promise<monaco.languages.ProviderResult<monaco.languages.SignatureHelpResult>> {
        const value = await this.proxy.$provideSignatureHelp(handle, model.uri, position, context, token);
        if (!value) {
            return undefined;
        }
        return {
            value,
            dispose: () => {
                if (typeof value.id === 'number') {
                    this.proxy.$releaseSignatureHelp(handle, value.id);
                }
            }
        };
    }

    $registerDocumentFormattingSupport(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const documentFormattingEditSupport = this.createDocumentFormattingSupport(handle, pluginInfo);
        this.register(handle, monaco.languages.registerDocumentFormattingEditProvider(languageSelector, documentFormattingEditSupport));
    }

    createDocumentFormattingSupport(handle: number, pluginInfo: PluginInfo): monaco.languages.DocumentFormattingEditProvider {
        const provider: monaco.languages.DocumentFormattingEditProvider = {
            extensionId: {
                value: pluginInfo.id
            },
            displayName: pluginInfo.name,
            provideDocumentFormattingEdits: (model, options, token) =>
                this.provideDocumentFormattingEdits(handle, model, options, token)
        };

        return provider;
    }

    protected provideDocumentFormattingEdits(handle: number, model: monaco.editor.ITextModel,
        options: monaco.languages.FormattingOptions, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.TextEdit[]> {
        return this.proxy.$provideDocumentFormattingEdits(handle, model.uri, options, token);
    }

    $registerRangeFormattingSupport(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const rangeFormattingEditProvider = this.createRangeFormattingSupport(handle, pluginInfo);
        this.register(handle, monaco.languages.registerDocumentRangeFormattingEditProvider(languageSelector, rangeFormattingEditProvider));
    }

    createRangeFormattingSupport(handle: number, pluginInfo: PluginInfo): monaco.languages.DocumentRangeFormattingEditProvider {
        const provider: monaco.languages.DocumentRangeFormattingEditProvider = {
            extensionId: {
                value: pluginInfo.id
            },
            displayName: pluginInfo.name,
            provideDocumentRangeFormattingEdits: (model, range: Range, options, token) =>
                this.provideDocumentRangeFormattingEdits(handle, model, range, options, token)
        };

        return provider;
    }

    protected provideDocumentRangeFormattingEdits(handle: number, model: monaco.editor.ITextModel,
        range: Range, options: monaco.languages.FormattingOptions, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.TextEdit[]> {
        return this.proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options, token);
    }

    $registerOnTypeFormattingProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], autoFormatTriggerCharacters: string[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const onTypeFormattingProvider = this.createOnTypeFormattingProvider(handle, autoFormatTriggerCharacters);
        this.register(handle, monaco.languages.registerOnTypeFormattingEditProvider(languageSelector, onTypeFormattingProvider));
    }

    protected createOnTypeFormattingProvider(
        handle: number,
        autoFormatTriggerCharacters: string[]
    ): monaco.languages.OnTypeFormattingEditProvider {
        return {
            autoFormatTriggerCharacters,
            provideOnTypeFormattingEdits: (model, position, ch, options, token) => this.provideOnTypeFormattingEdits(handle, model, position, ch, options, token)
        };
    }

    protected provideOnTypeFormattingEdits(handle: number, model: monaco.editor.ITextModel, position: monaco.Position,
        ch: string, options: monaco.languages.FormattingOptions, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.TextEdit[]> {
        return this.proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options, token);
    }

    $registerFoldingRangeProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const provider = this.createFoldingRangeProvider(handle);
        this.register(handle, monaco.languages.registerFoldingRangeProvider(languageSelector, provider));
    }

    createFoldingRangeProvider(handle: number): monaco.languages.FoldingRangeProvider {
        return {
            provideFoldingRanges: (model, context, token) => this.provideFoldingRanges(handle, model, context, token)
        };
    }

    protected provideFoldingRanges(handle: number, model: monaco.editor.ITextModel,
        context: monaco.languages.FoldingContext, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.FoldingRange[]> {
        return this.proxy.$provideFoldingRange(handle, model.uri, context, token);
    }

    $registerSelectionRangeProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const provider = this.createSelectionRangeProvider(handle);
        this.register(handle, monaco.languages.registerSelectionRangeProvider(languageSelector, provider));
    }

    protected createSelectionRangeProvider(handle: number): monaco.languages.SelectionRangeProvider {
        return {
            provideSelectionRanges: (model, positions, token) => this.provideSelectionRanges(handle, model, positions, token)
        };
    }

    protected provideSelectionRanges(handle: number, model: monaco.editor.ITextModel,
        positions: monaco.Position[], token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.SelectionRange[][]> {
        return this.proxy.$provideSelectionRanges(handle, model.uri, positions, token);
    }

    $registerDocumentColorProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const colorProvider = this.createColorProvider(handle);
        this.register(handle, monaco.languages.registerColorProvider(languageSelector, colorProvider));
    }

    createColorProvider(handle: number): monaco.languages.DocumentColorProvider {
        return {
            provideDocumentColors: (model, token) => this.provideDocumentColors(handle, model, token),
            provideColorPresentations: (model, colorInfo, token) => this.provideColorPresentations(handle, model, colorInfo, token)
        };
    }

    protected provideDocumentColors(handle: number, model: monaco.editor.ITextModel,
        token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.IColorInformation[]> {
        return this.proxy.$provideDocumentColors(handle, model.uri, token).then(documentColors =>
            documentColors.map(documentColor => {
                const [red, green, blue, alpha] = documentColor.color;
                const color = {
                    red: red,
                    green: green,
                    blue: blue,
                    alpha: alpha
                };

                return {
                    color,
                    range: documentColor.range
                };
            })
        );
    }

    protected provideColorPresentations(handle: number, model: monaco.editor.ITextModel,
        colorInfo: monaco.languages.IColorInformation, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.IColorPresentation[]> {
        return this.proxy.$provideColorPresentations(handle, model.uri, {
            color: [
                colorInfo.color.red,
                colorInfo.color.green,
                colorInfo.color.blue,
                colorInfo.color.alpha
            ],
            range: colorInfo.range
        }, token);
    }

    $registerQuickFixProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], providedCodeActionKinds?: string[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const quickFixProvider = {
            provideCodeActions: (model: monaco.editor.ITextModel, range: monaco.Range,
                context: monaco.languages.CodeActionContext, token: monaco.CancellationToken): monaco.languages.CodeActionList | Promise<monaco.languages.CodeActionList> => {
                const markers = monaco.services.StaticServices.markerService.get().read({ resource: model.uri }).filter(m => monaco.Range.areIntersectingOrTouching(m, range));
                return this.provideCodeActions(handle, model, range, { markers, only: context.only }, token);
            },
            providedCodeActionKinds
        };
        this.register(handle, monaco.modes.CodeActionProviderRegistry.register(languageSelector, quickFixProvider));
    }

    protected async provideCodeActions(handle: number, model: monaco.editor.ITextModel,
        rangeOrSelection: Range, context: monaco.languages.CodeActionContext,
        token: monaco.CancellationToken): Promise<monaco.languages.CodeActionList | monaco.languages.CodeActionList> {
        const actions = await this.proxy.$provideCodeActions(handle, model.uri, rangeOrSelection, {
            ...context
        }, token);
        if (!actions) {
            return undefined!;
        }
        return {
            actions: actions.map(a => toMonacoAction(a)),
            dispose: () => {
                // TODO this.proxy.$releaseCodeActions(handle, cacheId);
            }
        };
    }

    $registerRenameProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], supportsResolveLocation: boolean): void {
        const languageSelector = this.toLanguageSelector(selector);
        const renameProvider = this.createRenameProvider(handle, supportsResolveLocation);
        this.register(handle, monaco.languages.registerRenameProvider(languageSelector, renameProvider));
    }

    protected createRenameProvider(handle: number, supportsResolveLocation: boolean): monaco.languages.RenameProvider {
        return {
            provideRenameEdits: (model, position, newName, token) => this.provideRenameEdits(handle, model, position, newName, token)
            ,
            resolveRenameLocation: supportsResolveLocation
                ? (model, position, token) =>
                    this.resolveRenameLocation(handle, model, position, token)
                : undefined
        };
    }

    protected provideRenameEdits(handle: number, model: monaco.editor.ITextModel,
        position: monaco.Position, newName: string, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.WorkspaceEdit & monaco.languages.Rejection> {
        return this.proxy.$provideRenameEdits(handle, model.uri, position, newName, token).then(toMonacoWorkspaceEdit);
    }

    $registerCallHierarchyProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = this.toLanguageSelector(selector);
        const callHierarchyService = this.createCallHierarchyService(handle, languageSelector);
        this.register(handle, this.callHierarchyServiceContributionRegistry.add(callHierarchyService));
    }

    protected createCallHierarchyService(handle: number, language: LanguageSelector): CallHierarchyService {
        return {
            selector: language,
            getRootDefinition: (uri: DocumentUri, position: Position, cancellationToken: CancellationToken) =>
                this.proxy.$provideRootDefinition(handle, toUriComponents(uri), fromPosition(position), cancellationToken)
                    .then(def => Array.isArray(def) ? def.map(item => toDefinition(item)) : toDefinition(def)),
            getCallers: (definition: Definition, cancellationToken: CancellationToken) => this.proxy.$provideCallers(handle, fromDefinition(definition), cancellationToken)
                .then(result => {
                    if (!result) {
                        return undefined!;
                    }

                    if (Array.isArray(result)) {
                        return result.map(toCaller);
                    }

                    return undefined!;
                }),

            getCallees: (definition: Definition, cancellationToken: CancellationToken) => this.proxy.$provideCallees(handle, fromDefinition(definition), cancellationToken)
                .then(result => {
                    if (!result) {
                        return undefined;
                    }
                    if (Array.isArray(result)) {
                        return result.map(toCallee);
                    }

                    return undefined;
                }),
        };
    }

    protected resolveRenameLocation(handle: number, model: monaco.editor.ITextModel,
        position: monaco.Position, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.RenameLocation> {
        return this.proxy.$resolveRenameLocation(handle, model.uri, position, token);
    }

    // --- semantic tokens

    $registerDocumentSemanticTokensProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], legend: theia.SemanticTokensLegend,
        eventHandle: number | undefined): void {
        const languageSelector = this.toLanguageSelector(selector);
        let event: Event<void> | undefined = undefined;
        if (typeof eventHandle === 'number') {
            const emitter = new Emitter<void>();
            this.register(eventHandle, emitter);
            event = emitter.event;
        }
        const provider = this.createDocumentSemanticTokensProvider(handle, legend, event);
        this.register(handle, monaco.languages.registerDocumentSemanticTokensProvider(languageSelector, provider));
    }

    protected createDocumentSemanticTokensProvider(handle: number, legend: theia.SemanticTokensLegend, event?: Event<void>): monaco.languages.DocumentSemanticTokensProvider {
        return {
            releaseDocumentSemanticTokens: resultId => {
                if (resultId) {
                    this.proxy.$releaseDocumentSemanticTokens(handle, parseInt(resultId, 10));
                }
            },
            getLegend: () => legend,
            provideDocumentSemanticTokens: async (model, lastResultId, token) => {
                const nLastResultId = lastResultId ? parseInt(lastResultId, 10) : 0;
                const encodedDto = await this.proxy.$provideDocumentSemanticTokens(handle, model.uri, nLastResultId, token);
                if (!encodedDto) {
                    return null;
                }
                if (token.isCancellationRequested) {
                    return null;
                }
                const dto = decodeSemanticTokensDto(encodedDto);
                if (dto.type === 'full') {
                    return {
                        resultId: String(dto.id),
                        data: dto.data
                    };
                }
                return {
                    resultId: String(dto.id),
                    edits: dto.deltas
                };
            }
        };
    }

    $emitDocumentSemanticTokensEvent(eventHandle: number): void {
        const obj = this.services.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(undefined);
        }
    }

    $registerDocumentRangeSemanticTokensProvider(handle: number, pluginInfo: PluginInfo, selector: SerializedDocumentFilter[], legend: theia.SemanticTokensLegend): void {
        const languageSelector = this.toLanguageSelector(selector);
        const provider = this.createDocumentRangeSemanticTokensProvider(handle, legend);
        this.register(handle, monaco.languages.registerDocumentRangeSemanticTokensProvider(languageSelector, provider));
    }

    protected createDocumentRangeSemanticTokensProvider(handle: number, legend: theia.SemanticTokensLegend): monaco.languages.DocumentRangeSemanticTokensProvider {
        return {
            getLegend: () => legend,
            provideDocumentRangeSemanticTokens: async (model, range, token) => {
                const encodedDto = await this.proxy.$provideDocumentRangeSemanticTokens(handle, model.uri, range, token);
                if (!encodedDto) {
                    return null;
                }
                if (token.isCancellationRequested) {
                    return null;
                }
                const dto = decodeSemanticTokensDto(encodedDto);
                if (dto.type === 'full') {
                    return {
                        resultId: String(dto.id),
                        data: dto.data
                    };
                }
                throw new Error('Unexpected');
            }
        };
    }

    // --- suggest

    protected toLanguageSelector(filters: SerializedDocumentFilter[]): monaco.modes.LanguageSelector & LanguageSelector {
        return filters.map(filter => {
            let pattern: string | (monaco.modes.IRelativePattern & RelativePattern) | undefined;
            if (typeof filter.pattern === 'string') {
                pattern = filter.pattern;
            } else if (filter.pattern) {
                pattern = {
                    base: monaco.path.normalize(filter.pattern.base),
                    pattern: filter.pattern.pattern,
                    pathToRelative: relative
                };
            }
            return {
                language: filter.language,
                scheme: filter.scheme,
                pattern
            };
        });
    }

}

function reviveMarker(marker: MarkerData): vst.Diagnostic {
    const monacoMarker: vst.Diagnostic = {
        code: marker.code,
        severity: reviveSeverity(marker.severity),
        range: reviveRange(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn),
        message: marker.message,
        source: marker.source,
        relatedInformation: undefined
    };

    if (marker.relatedInformation) {
        monacoMarker.relatedInformation = marker.relatedInformation.map(reviveRelated);
    }

    if (marker.tags) {
        monacoMarker.tags = marker.tags.map(reviveTag);
    }

    return monacoMarker;
}

function reviveSeverity(severity: MarkerSeverity): vst.DiagnosticSeverity {
    switch (severity) {
        case MarkerSeverity.Error: return vst.DiagnosticSeverity.Error;
        case MarkerSeverity.Warning: return vst.DiagnosticSeverity.Warning;
        case MarkerSeverity.Info: return vst.DiagnosticSeverity.Information;
        case MarkerSeverity.Hint: return vst.DiagnosticSeverity.Hint;
    }
}

function reviveRange(startLine: number, startColumn: number, endLine: number, endColumn: number): vst.Range {
    // note: language server range is 0-based, marker is 1-based, so need to deduct 1 here
    return {
        start: {
            line: startLine - 1,
            character: startColumn - 1
        },
        end: {
            line: endLine - 1,
            character: endColumn - 1
        }
    };
}

function reviveRelated(related: RelatedInformation): vst.DiagnosticRelatedInformation {
    return {
        message: related.message,
        location: {
            uri: related.resource,
            range: reviveRange(related.startLineNumber, related.startColumn, related.endLineNumber, related.endColumn)
        }
    };
}

function reviveTag(tag: DiagnosticTag): vst.DiagnosticTag {
    switch (tag) {
        case 1: return DiagnosticTag.Unnecessary;
        case 2: return DiagnosticTag.Deprecated;
    }
}

function reviveRegExp(regExp?: SerializedRegExp): RegExp | undefined {
    if (typeof regExp === 'undefined' || regExp === null) {
        return undefined;
    }
    return new RegExp(regExp.pattern, regExp.flags);
}

function reviveIndentationRule(indentationRule?: SerializedIndentationRule): monaco.languages.IndentationRule | undefined {
    if (typeof indentationRule === 'undefined' || indentationRule === null) {
        return undefined;
    }
    return {
        increaseIndentPattern: reviveRegExp(indentationRule.increaseIndentPattern)!,
        decreaseIndentPattern: reviveRegExp(indentationRule.decreaseIndentPattern)!,
        indentNextLinePattern: reviveRegExp(indentationRule.indentNextLinePattern),
        unIndentedLinePattern: reviveRegExp(indentationRule.unIndentedLinePattern),
    };
}

function reviveOnEnterRule(onEnterRule: SerializedOnEnterRule): monaco.languages.OnEnterRule {
    return {
        beforeText: reviveRegExp(onEnterRule.beforeText)!,
        afterText: reviveRegExp(onEnterRule.afterText),
        action: onEnterRule.action
    };
}

function reviveOnEnterRules(onEnterRules?: SerializedOnEnterRule[]): monaco.languages.OnEnterRule[] | undefined {
    if (typeof onEnterRules === 'undefined' || onEnterRules === null) {
        return undefined;
    }
    return onEnterRules.map(reviveOnEnterRule);
}

function toMonacoAction(action: CodeAction): monaco.languages.CodeAction {
    return {
        ...action,
        diagnostics: action.diagnostics ? action.diagnostics.map(m => toMonacoMarkerData(m)) : undefined,
        edit: action.edit ? toMonacoWorkspaceEdit(action.edit) : undefined
    };
}

function toMonacoMarkerData(marker: MarkerData): monaco.editor.IMarkerData {
    return {
        ...marker,
        relatedInformation: marker.relatedInformation
            ? marker.relatedInformation.map(i => toMonacoRelatedInformation(i))
            : undefined
    };
}

function toMonacoRelatedInformation(relatedInfo: RelatedInformation): monaco.editor.IRelatedInformation {
    return {
        ...relatedInfo,
        resource: monaco.Uri.parse(relatedInfo.resource)
    };
}

export function toMonacoWorkspaceEdit(data: WorkspaceEditDto | undefined): monaco.languages.WorkspaceEdit {
    return {
        edits: (data && data.edits || []).map(edit => {
            if (WorkspaceTextEditDto.is(edit)) {
                return <monaco.languages.WorkspaceTextEdit>{
                    resource: monaco.Uri.revive(edit.resource),
                    edit: edit.edit, metadata: edit.metadata
                };
            } else {
                return <monaco.languages.WorkspaceFileEdit>{
                    newUri: monaco.Uri.revive(edit.newUri), oldUri: monaco.Uri.revive(edit.oldUri),
                    options: edit.options, metadata: edit.metadata
                };
            }
        })
    };
}
