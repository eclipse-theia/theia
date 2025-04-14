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

import { CancellationToken, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
import { MonacoLanguages } from '@theia/monaco/lib/browser/monaco-languages';
import { WorkspaceSymbolParams } from '@theia/core/shared/vscode-languageserver-protocol';
import { LspToolSupport } from './lsp-tool-support';

export const GO_TO_DEFINITION_ID = 'goToDefinition';
export const GO_TO_IMPLEMENTATION_ID = 'goToImplementation';
export const GO_TO_TYPE_DEFINITION_ID = 'goToTypeDefinition';
export const FIND_REFERENCES_ID = 'findReferences';
export const GET_HOVER_ID = 'getHover';
export const GET_DOCUMENT_SYMBOLS_ID = 'getDocumentSymbols';
export const GET_CALL_HIERARCHY_ID = 'getCallHierarchy';
export const SEARCH_WORKSPACE_SYMBOLS_ID = 'searchWorkspaceSymbols';

const FILE_PARAM_DESCRIPTION =
    'The path to the file, in the `<rootName>/<relativePath>` format returned by the other workspace tools ' +
    '(e.g., "my-project/src/index.ts"). Absolute paths and `file://` URIs are accepted when inside the workspace.';

/** Shared `file`/`line`/`column` parameter schema for the position-based LSP tools. */
const POSITION_PARAMETERS: ToolRequest['parameters'] = {
    type: 'object',
    properties: {
        file: { type: 'string', description: FILE_PARAM_DESCRIPTION },
        line: { type: 'number', description: 'The 1-based line number of the symbol.' },
        column: { type: 'number', description: 'The 1-based column number of the symbol.' }
    },
    required: ['file', 'line', 'column']
};

interface PositionArgs {
    file: string;
    line: number;
    column: number;
}

function parsePosition(argString: string): PositionArgs {
    const args = JSON.parse(argString);
    if (typeof args.file !== 'string' || typeof args.line !== 'number' || typeof args.column !== 'number') {
        throw new Error('Parameters "file" (string), "line" (number) and "column" (number) are required.');
    }
    return { file: args.file, line: args.line, column: args.column };
}

@injectable()
export class GoToDefinitionFunction implements ToolProvider {
    static ID = GO_TO_DEFINITION_ID;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: GoToDefinitionFunction.ID,
            name: GoToDefinitionFunction.ID,
            description: 'Resolves the definition(s) of the symbol at a given file path and 1-based position using language services (LSP). ' +
                'Returns the target file path, range and a code snippet for each definition. More precise than text search.',
            parameters: POSITION_PARAMETERS,
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, token?: CancellationToken): Promise<string> {
        try {
            const { file, line, column } = parsePosition(argString);
            return await this.support.queryLocations(file, line, column, 'definition', token);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}

@injectable()
export class GoToImplementationFunction implements ToolProvider {
    static ID = GO_TO_IMPLEMENTATION_ID;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: GoToImplementationFunction.ID,
            name: GoToImplementationFunction.ID,
            description: 'Resolves the implementation(s) of the symbol (e.g. an interface or abstract method) at a given file path and 1-based position ' +
                'using language services (LSP). Returns the target file path, range and a code snippet for each implementation.',
            parameters: POSITION_PARAMETERS,
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, token?: CancellationToken): Promise<string> {
        try {
            const { file, line, column } = parsePosition(argString);
            return await this.support.queryLocations(file, line, column, 'implementation', token);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}

@injectable()
export class GoToTypeDefinitionFunction implements ToolProvider {
    static ID = GO_TO_TYPE_DEFINITION_ID;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: GoToTypeDefinitionFunction.ID,
            name: GoToTypeDefinitionFunction.ID,
            description: 'Resolves the type definition(s) of the symbol at a given file path and 1-based position using language services (LSP). ' +
                'Returns the target file path, range and a code snippet for each type definition.',
            parameters: POSITION_PARAMETERS,
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, token?: CancellationToken): Promise<string> {
        try {
            const { file, line, column } = parsePosition(argString);
            return await this.support.queryLocations(file, line, column, 'typeDefinition', token);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}

@injectable()
export class FindReferencesFunction implements ToolProvider {
    static ID = FIND_REFERENCES_ID;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: FindReferencesFunction.ID,
            name: FindReferencesFunction.ID,
            description: 'Finds all references (usages) of the symbol at a given file path and 1-based position using language services (LSP). ' +
                'Returns each usage as a file path, range and code snippet. Use this for impact analysis and refactoring - it is far more precise ' +
                'than text search because it understands symbols and excludes unrelated matches in comments, strings, or same-named symbols.',
            parameters: {
                type: 'object',
                properties: {
                    file: { type: 'string', description: FILE_PARAM_DESCRIPTION },
                    line: { type: 'number', description: 'The 1-based line number of the symbol.' },
                    column: { type: 'number', description: 'The 1-based column number of the symbol.' },
                    limit: { type: 'number', description: 'Optional maximum number of references to return (default: 100).' }
                },
                required: ['file', 'line', 'column']
            },
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, token?: CancellationToken): Promise<string> {
        try {
            const { file, line, column } = parsePosition(argString);
            const limit = JSON.parse(argString).limit;
            return await this.support.queryLocations(file, line, column, 'references', token, typeof limit === 'number' ? limit : 100);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}

@injectable()
export class HoverFunction implements ToolProvider {
    static ID = GET_HOVER_ID;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: HoverFunction.ID,
            name: HoverFunction.ID,
            description: 'Returns the hover information (type signature, inferred type and documentation) for the symbol at a given file path and 1-based position ' +
                'using language services (LSP). A token-efficient way to understand an API without reading the whole file.',
            parameters: POSITION_PARAMETERS,
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, token?: CancellationToken): Promise<string> {
        try {
            const { file, line, column } = parsePosition(argString);
            return await this.support.getHover(file, line, column, token);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}

@injectable()
export class DocumentSymbolsFunction implements ToolProvider {
    static ID = GET_DOCUMENT_SYMBOLS_ID;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: DocumentSymbolsFunction.ID,
            name: DocumentSymbolsFunction.ID,
            description: 'Returns the structured symbol outline (classes, methods, fields, ... with their kinds and 1-based ranges) of a single file ' +
                'using language services (LSP). Use this to navigate a large file and read only the relevant ranges instead of the whole file.',
            parameters: {
                type: 'object',
                properties: {
                    file: { type: 'string', description: FILE_PARAM_DESCRIPTION }
                },
                required: ['file']
            },
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, token?: CancellationToken): Promise<string> {
        try {
            const args = JSON.parse(argString);
            if (typeof args.file !== 'string') {
                throw new Error('Parameter "file" (string) is required.');
            }
            return await this.support.getDocumentSymbols(args.file, token);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}

@injectable()
export class CallHierarchyFunction implements ToolProvider {
    static ID = GET_CALL_HIERARCHY_ID;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: CallHierarchyFunction.ID,
            name: CallHierarchyFunction.ID,
            description: 'Resolves the call hierarchy of the symbol at a given file path and 1-based position using language services (LSP): ' +
                'the incoming calls (who calls this) and/or outgoing calls (what this calls).',
            parameters: {
                type: 'object',
                properties: {
                    file: { type: 'string', description: FILE_PARAM_DESCRIPTION },
                    line: { type: 'number', description: 'The 1-based line number of the symbol.' },
                    column: { type: 'number', description: 'The 1-based column number of the symbol.' },
                    direction: {
                        type: 'string',
                        enum: ['incoming', 'outgoing', 'both'],
                        description: 'Which calls to resolve: "incoming" (callers), "outgoing" (callees) or "both" (default).'
                    }
                },
                required: ['file', 'line', 'column']
            },
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, token?: CancellationToken): Promise<string> {
        try {
            const { file, line, column } = parsePosition(argString);
            const direction = JSON.parse(argString).direction;
            const resolved = direction === 'incoming' || direction === 'outgoing' ? direction : 'both';
            return await this.support.getCallHierarchy(file, line, column, resolved, token);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
}

@injectable()
export class SearchWorkspaceSymbolsFunction implements ToolProvider {
    static ID = SEARCH_WORKSPACE_SYMBOLS_ID;

    @inject(MonacoLanguages)
    protected readonly languages: MonacoLanguages;

    @inject(LspToolSupport)
    protected readonly support: LspToolSupport;

    getTool(): ToolRequest {
        return {
            id: SearchWorkspaceSymbolsFunction.ID,
            name: SearchWorkspaceSymbolsFunction.ID,
            description: 'Searches for symbols (classes, functions, ...) across the entire workspace using language services (LSP), with optional filtering. ' +
                'Returns matching symbols with their kind, workspace-relative path and 1-based range.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The query string to search for symbols.' },
                    symbolName: { type: 'string', description: 'Optional exact symbol name to filter the results.' },
                    containerName: { type: 'string', description: 'Optional container name (e.g. enclosing class) to filter the results.' },
                    limit: { type: 'number', description: 'Optional maximum number of results to return (default: 100).' }
                },
                required: ['query']
            },
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx?.cancellationToken)
        };
    }

    protected async handle(argString: string, cancellationToken?: CancellationToken): Promise<string> {
        try {
            const args = JSON.parse(argString);
            if (typeof args.query !== 'string') {
                throw new Error('Parameter "query" (string) is required.');
            }
            return await this.searchWorkspaceSymbols(args.query, args.symbolName, args.containerName, typeof args.limit === 'number' ? args.limit : 100, cancellationToken);
        } catch (error) {
            return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
    }

    protected async searchWorkspaceSymbols(
        query: string,
        symbolName: string | undefined,
        containerName: string | undefined,
        limit: number,
        cancellationToken?: CancellationToken
    ): Promise<string> {
        const providers = this.languages.workspaceSymbolProviders;
        if (!providers || providers.length === 0) {
            return JSON.stringify({ success: false, message: 'No workspace symbol providers are available.' });
        }

        const token = cancellationToken ?? CancellationToken.None;
        const param: WorkspaceSymbolParams = { query };
        const symbols: Record<string, unknown>[] = [];

        await Promise.all(providers.map(async provider => {
            const provided = await provider.provideWorkspaceSymbols(param, token);
            if (!provided || token.isCancellationRequested) {
                return;
            }
            for (const symbol of provided) {
                const matchesName = !symbolName || symbol.name === symbolName;
                const matchesContainer = !containerName || symbol.containerName === containerName;
                if (matchesName && matchesContainer) {
                    symbols.push({
                        name: symbol.name,
                        kind: this.support.lspSymbolKindName(symbol.kind),
                        containerName: symbol.containerName || undefined,
                        path: this.support.relativePath(new URI(symbol.location.uri)),
                        range: this.support.fromLspRange(symbol.location.range)
                    });
                }
            }
        }));

        const sorted = symbols.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return JSON.stringify({
            success: true,
            query,
            symbols: sorted.slice(0, limit),
            totalCount: sorted.length,
            truncated: sorted.length > limit || undefined
        });
    }
}
