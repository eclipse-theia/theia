// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { CancellationToken, ILogger, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Position as LspPosition, Range as LspRange } from '@theia/core/shared/vscode-languageserver-protocol';
import { URI as CodeUri } from '@theia/core/shared/vscode-uri';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import * as monaco from '@theia/monaco-editor-core';
import { IReference } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { DocumentSymbol } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { CallHierarchyItem, CallHierarchyServiceProvider } from '@theia/callhierarchy/lib/browser';
import { WorkspaceFunctionScope } from './workspace-functions';

/** The kinds of location requests that resolve to one or more source locations. */
export type LocationKind = 'definition' | 'implementation' | 'typeDefinition' | 'references';

/**
 * The concrete text-model type returned by {@link MonacoEditorModel.textEditorModel}. It is the
 * intersection of the public and internal Monaco model interfaces, so it is accepted both by the
 * public provider methods and by the internal language-feature registries.
 */
type TextModel = monaco.editor.ITextModel & ITextModel;

/** A 1-based source range, consistent across every LSP tool result. */
export interface ToolRange {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

/** A single source location with a workspace-relative path and an optional code snippet. */
export interface ToolLocation extends ToolRange {
    path: string;
    snippet?: string;
}

/**
 * Shared support for the LSP-backed tools. Centralizes path resolution and access control
 * (via {@link WorkspaceFunctionScope}), Monaco text-model lifecycle, range/symbol-kind
 * conversion to a consistent 1-based, root-prefixed format, and the actual provider queries.
 *
 * Results from the Monaco language feature registries use 1-based ranges; results coming
 * through Theia's call-hierarchy service use 0-based LSP ranges and are converted here.
 */
@injectable()
export class LspToolSupport {

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(CallHierarchyServiceProvider)
    protected readonly callHierarchyProvider: CallHierarchyServiceProvider;

    @inject(ILogger)
    protected readonly logger: ILogger;

    // ── Public tool operations ──────────────────────────────────────────

    /**
     * Resolves definitions / implementations / type definitions / references for the symbol
     * at the given 1-based position and returns a JSON string with the located source ranges.
     */
    async queryLocations(
        filePath: string,
        line: number,
        column: number,
        kind: LocationKind,
        cancellationToken?: CancellationToken,
        limit: number = 100
    ): Promise<string> {
        return this.run(kind, () => this.withModel(filePath, async model => {
            const token = cancellationToken ?? CancellationToken.None;
            const position = new monaco.Position(line, column);
            const providers = this.locationProviders(model, kind);
            if (providers.length === 0) {
                return this.failure(`No ${this.label(kind)} providers are available for this file type.`);
            }

            const collected: { uri: URI; range: ToolRange }[] = [];
            for (const provider of providers) {
                if (token.isCancellationRequested) {
                    return this.cancelled();
                }
                const result = await this.callLocationProvider(provider, kind, model, position, token);
                const normalized = this.normalizeMonacoLocations(result);
                if (normalized.length > 0) {
                    collected.push(...normalized);
                    // For navigation requests the first provider that yields a result wins;
                    // references are aggregated across all providers.
                    if (kind !== 'references') {
                        break;
                    }
                }
            }

            if (collected.length === 0) {
                return this.failure(`No ${this.label(kind)} found at ${filePath}:${line}:${column}.`);
            }

            const truncated = collected.length > limit;
            const locations = await this.toLocationResults(collected.slice(0, limit));
            return JSON.stringify({ success: true, locations, count: locations.length, truncated: truncated || undefined });
        }));
    }

    /** Returns the hover information (type signature, documentation) for the symbol at the 1-based position. */
    async getHover(filePath: string, line: number, column: number, cancellationToken?: CancellationToken): Promise<string> {
        return this.run('hover', () => this.withModel(filePath, async model => {
            const token = cancellationToken ?? CancellationToken.None;
            const providers = this.getLanguageFeatures().hoverProvider.all(model);
            if (providers.length === 0) {
                return this.failure('No hover providers are available for this file type.');
            }
            const position = new monaco.Position(line, column);
            const contents: string[] = [];
            for (const provider of providers) {
                if (token.isCancellationRequested) {
                    return this.cancelled();
                }
                const hover = await provider.provideHover(model, position, token);
                for (const part of hover?.contents ?? []) {
                    const value = part?.value?.trim();
                    if (value) {
                        contents.push(value);
                    }
                }
            }
            if (contents.length === 0) {
                return this.failure(`No hover information found at ${filePath}:${line}:${column}.`);
            }
            return JSON.stringify({ success: true, contents: contents.join('\n\n---\n\n') });
        }));
    }

    /** Returns the structured symbol outline (classes, methods, fields, ...) of a single file. */
    async getDocumentSymbols(filePath: string, cancellationToken?: CancellationToken): Promise<string> {
        return this.run('documentSymbols', () => this.withModel(filePath, async (model, uri) => {
            const token = cancellationToken ?? CancellationToken.None;
            const providers = this.getLanguageFeatures().documentSymbolProvider.all(model);
            if (providers.length === 0) {
                return this.failure('No document symbol providers are available for this file type.');
            }
            const symbols: DocumentSymbol[] = [];
            for (const provider of providers) {
                if (token.isCancellationRequested) {
                    return this.cancelled();
                }
                symbols.push(...(await provider.provideDocumentSymbols(model, token) ?? []));
            }
            if (symbols.length === 0) {
                return this.failure(`No symbols found in ${filePath}.`);
            }
            return JSON.stringify({ success: true, path: this.relativePath(uri), symbols: symbols.map(symbol => this.mapDocumentSymbol(symbol)) });
        }));
    }

    /**
     * Returns the call hierarchy for the symbol at the 1-based position: the resolved item plus
     * its incoming and/or outgoing calls depending on {@link direction}.
     */
    async getCallHierarchy(
        filePath: string,
        line: number,
        column: number,
        direction: 'incoming' | 'outgoing' | 'both' = 'both',
        cancellationToken?: CancellationToken
    ): Promise<string> {
        return this.run('callHierarchy', async () => {
            const uri = await this.resolveUri(filePath);
            const ref = await this.textModelService.createModelReference(uri);
            try {
                const token = cancellationToken ?? CancellationToken.None;
                const languageId = ref.object.textEditorModel.getLanguageId();
                const service = this.callHierarchyProvider.get(languageId, uri);
                if (!service) {
                    return this.failure('No call hierarchy provider is available for this file type.');
                }
                const position: LspPosition = { line: line - 1, character: column - 1 };
                const session = await service.getRootDefinition(uri.toString(), position, token);
                if (!session || session.items.length === 0) {
                    return this.failure(`No call hierarchy item found at ${filePath}:${line}:${column}.`);
                }
                try {
                    const root = session.items[0];
                    const result: Record<string, unknown> = { success: true, item: this.mapHierarchyItem(root) };
                    if (direction !== 'outgoing') {
                        const callers = await service.getCallers(root, token) ?? [];
                        result.incoming = callers.map(caller => ({
                            from: this.mapHierarchyItem(caller.from),
                            fromRanges: caller.fromRanges.map(range => this.fromLspRange(range))
                        }));
                    }
                    if (direction !== 'incoming' && service.getCallees) {
                        const callees = await service.getCallees(root, token) ?? [];
                        result.outgoing = callees.map(callee => ({
                            to: this.mapHierarchyItem(callee.to),
                            fromRanges: callee.fromRanges.map(range => this.fromLspRange(range))
                        }));
                    }
                    return JSON.stringify(result);
                } finally {
                    session.dispose();
                }
            } finally {
                ref.dispose();
            }
        });
    }

    // ── Model & service access ──────────────────────────────────────────

    getLanguageFeatures(): ILanguageFeaturesService {
        return StandaloneServices.get(ILanguageFeaturesService);
    }

    /**
     * Resolves a workspace-relative (or otherwise accessible) path to a URI, enforcing the
     * workspace access boundary. Throws if the path is invalid or not accessible.
     */
    async resolveUri(filePath: string): Promise<URI> {
        const uri = await this.workspaceScope.resolveToUri(filePath);
        if (!uri) {
            throw new Error(`Invalid file path: '${filePath}'`);
        }
        await this.workspaceScope.ensureAccessible(uri);
        return uri;
    }

    /**
     * Resolves the path, opens a Monaco text model reference (which activates language services),
     * runs the given operation and reliably disposes the reference afterwards.
     */
    protected async withModel(filePath: string, run: (model: TextModel, uri: URI) => Promise<string>): Promise<string> {
        const uri = await this.resolveUri(filePath);
        const ref = await this.textModelService.createModelReference(uri);
        try {
            const model = ref.object.textEditorModel;
            if (!model) {
                throw new Error(`Could not load a text model for '${filePath}'.`);
            }
            return await run(model, uri);
        } finally {
            ref.dispose();
        }
    }

    // ── Conversion helpers ──────────────────────────────────────────────

    /** Converts a Monaco (1-based) range to the tool's 1-based range shape. */
    fromMonacoRange(range: monaco.IRange): ToolRange {
        return {
            startLine: range.startLineNumber,
            startColumn: range.startColumn,
            endLine: range.endLineNumber,
            endColumn: range.endColumn
        };
    }

    /** Converts a 0-based LSP range to the tool's 1-based range shape. */
    fromLspRange(range: LspRange): ToolRange {
        return {
            startLine: range.start.line + 1,
            startColumn: range.start.character + 1,
            endLine: range.end.line + 1,
            endColumn: range.end.character + 1
        };
    }

    /** Returns the human-readable name of a Monaco symbol kind (e.g. `Class`, `Method`). */
    monacoSymbolKindName(kind: number): string {
        return monaco.languages.SymbolKind[kind] ?? 'Unknown';
    }

    /**
     * Returns the human-readable name of an LSP symbol kind. The Monaco and LSP symbol-kind
     * enumerations list the same members in the same order, but LSP is 1-based while Monaco is
     * 0-based, so the LSP value is shifted by one before the Monaco name lookup.
     */
    lspSymbolKindName(kind: number): string {
        return monaco.languages.SymbolKind[kind - 1] ?? 'Unknown';
    }

    /**
     * Normalizes the result of a Monaco location provider (a single `Location`, an array of
     * `Location`s, or an array of `LocationLink`s) to URIs with 1-based ranges. Both `Location`
     * and `LocationLink` expose `uri` and `range` in Monaco, so the target is read directly.
     */
    normalizeMonacoLocations(result: monaco.languages.Definition | monaco.languages.LocationLink[] | null | undefined): { uri: URI; range: ToolRange }[] {
        if (!result) {
            return [];
        }
        const items = Array.isArray(result) ? result : [result];
        const locations: { uri: URI; range: ToolRange }[] = [];
        for (const item of items) {
            if (item?.uri && item.range) {
                locations.push({ uri: new URI(item.uri.toString()), range: this.fromMonacoRange(item.range) });
            }
        }
        return locations;
    }

    /** Converts a URI to the `<rootName>/<relativePath>` format used by the other workspace tools. */
    relativePath(uri: URI): string {
        return this.workspaceScope.toWorkspaceRelativePath(uri) ?? uri.path.base;
    }

    // ── Internals ───────────────────────────────────────────────────────

    protected mapDocumentSymbol(symbol: DocumentSymbol): Record<string, unknown> {
        return {
            name: symbol.name,
            kind: this.monacoSymbolKindName(symbol.kind),
            detail: symbol.detail || undefined,
            range: this.fromMonacoRange(symbol.range),
            selectionRange: this.fromMonacoRange(symbol.selectionRange),
            children: symbol.children?.length ? symbol.children.map(child => this.mapDocumentSymbol(child)) : undefined
        };
    }

    protected mapHierarchyItem(item: CallHierarchyItem): Record<string, unknown> {
        return {
            name: item.name,
            kind: this.lspSymbolKindName(item.kind),
            detail: item.detail || undefined,
            path: this.relativePath(new URI(CodeUri.revive(item.uri).toString())),
            range: this.fromLspRange(item.range),
            selectionRange: this.fromLspRange(item.selectionRange)
        };
    }

    /** Loads the (deduplicated) target models to attach a one-line code snippet to each location. */
    protected async toLocationResults(locations: { uri: URI; range: ToolRange }[]): Promise<ToolLocation[]> {
        const refs: IReference<MonacoEditorModel>[] = [];
        const models = new Map<string, TextModel | undefined>();
        try {
            const results: ToolLocation[] = [];
            for (const location of locations) {
                const key = location.uri.toString();
                if (!models.has(key)) {
                    try {
                        const ref = await this.textModelService.createModelReference(location.uri);
                        refs.push(ref);
                        models.set(key, ref.object.textEditorModel);
                    } catch {
                        models.set(key, undefined);
                    }
                }
                const model = models.get(key);
                results.push({
                    path: this.relativePath(location.uri),
                    ...location.range,
                    snippet: model ? this.lineSnippet(model, location.range.startLine) : undefined
                });
            }
            return results;
        } finally {
            refs.forEach(ref => ref.dispose());
        }
    }

    protected lineSnippet(model: TextModel, line: number): string | undefined {
        if (line < 1 || line > model.getLineCount()) {
            return undefined;
        }
        const content = model.getLineContent(line).trim();
        return content || undefined;
    }

    protected locationProviders(model: TextModel, kind: LocationKind): unknown[] {
        const features = this.getLanguageFeatures();
        switch (kind) {
            case 'definition': return features.definitionProvider.all(model);
            case 'implementation': return features.implementationProvider.all(model);
            case 'typeDefinition': return features.typeDefinitionProvider.all(model);
            case 'references': return features.referenceProvider.all(model);
        }
    }

    protected callLocationProvider(
        provider: unknown,
        kind: LocationKind,
        model: TextModel,
        position: monaco.Position,
        token: CancellationToken
    ): monaco.languages.ProviderResult<monaco.languages.Definition | monaco.languages.LocationLink[]> {
        switch (kind) {
            case 'definition': return (provider as monaco.languages.DefinitionProvider).provideDefinition(model, position, token);
            case 'implementation': return (provider as monaco.languages.ImplementationProvider).provideImplementation(model, position, token);
            case 'typeDefinition': return (provider as monaco.languages.TypeDefinitionProvider).provideTypeDefinition(model, position, token);
            case 'references': return (provider as monaco.languages.ReferenceProvider).provideReferences(model, position, { includeDeclaration: true }, token);
        }
    }

    protected label(kind: LocationKind): string {
        switch (kind) {
            case 'definition': return 'definition';
            case 'implementation': return 'implementation';
            case 'typeDefinition': return 'type definition';
            case 'references': return 'reference';
        }
    }

    protected async run(operation: string, run: () => Promise<string>): Promise<string> {
        try {
            return await run();
        } catch (error) {
            this.logger.error(`[LspToolSupport] ${operation} failed`, error);
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }

    protected failure(message: string): string {
        return JSON.stringify({ success: false, message });
    }

    protected cancelled(): string {
        return JSON.stringify({ success: false, error: 'Operation cancelled by user' });
    }
}
