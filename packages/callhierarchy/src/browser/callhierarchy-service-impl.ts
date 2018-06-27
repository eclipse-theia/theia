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

import { injectable, inject } from "inversify";
import { ILanguageClient } from '@theia/languages/lib/common/languageclient-services';
import { LanguageClientProvider } from '@theia/languages/lib/browser/language-client-provider';
import { ReferencesRequest, ReferenceParams, DocumentSymbolRequest, DefinitionRequest, TextDocumentPositionParams } from 'vscode-base-languageclient/lib/protocol';
import { DocumentSymbolParams, TextDocumentIdentifier, SymbolInformation, Location, Position, Range, SymbolKind } from 'vscode-languageserver-types';
import * as utils from './utils';
import { Definition, Caller } from './callhierarchy';
import { CallHierarchyService } from './callhierarchy-service';
import { ILogger, Disposable } from "@theia/core";
import { MonacoTextModelService } from "@theia/monaco/lib/browser/monaco-text-model-service";
import URI from '@theia/core/lib/common/uri';

export class CallHierarchyContext {

    readonly symbolCache = new Map<string, SymbolInformation[]>();
    readonly disposables: Disposable[] = [];

    constructor(readonly languageClient: ILanguageClient,
        readonly textModelService: MonacoTextModelService,
        readonly logger: ILogger) { }

    async getAllSymbols(uri: string): Promise<SymbolInformation[]> {
        const cachedSymbols = this.symbolCache.get(uri);
        if (cachedSymbols) {
            return cachedSymbols;
        }
        const symbols = await this.languageClient.sendRequest(DocumentSymbolRequest.type, <DocumentSymbolParams>{
            textDocument: TextDocumentIdentifier.create(uri)
        });
        this.symbolCache.set(uri, symbols);
        return symbols;
    }

    async getEditorModelReference(uri: string) {
        const model = await this.textModelService.createModelReference(new URI(uri));
        this.disposables.push(model);
        return model;
    }

    async getDefinitionLocation(location: Location): Promise<Location | undefined> {
        const uri = location.uri;
        const { line, character } = location.range.start;
        let locations: Location | Location[] | null = null;
        try {
            locations = await this.languageClient.sendRequest(DefinitionRequest.type, <TextDocumentPositionParams>{
                position: Position.create(line, character),
                textDocument: { uri }
            });
        } catch (error) {
            this.logger.error(`Error from definitions request: ${uri}#${line}/${character}`, error);
        }
        if (!locations) {
            return undefined;
        }
        return Array.isArray(locations) ? locations[0] : locations;
    }

    async getCallerReferences(definition: Location): Promise<Location[]> {
        try {
            const references = await this.languageClient.sendRequest(ReferencesRequest.type, <ReferenceParams>{
                context: {
                    includeDeclaration: false // TODO find out, why definitions are still contained
                },
                position: {
                    line: definition.range.start.line,
                    character: definition.range.start.character
                },
                textDocument: {
                    uri: definition.uri
                }
            });
            const uniqueReferences = utils.filterUnique(references);
            const filteredReferences = utils.filterSame(uniqueReferences, definition);
            return filteredReferences;
        } catch (error) {
            this.logger.error(`Error from references request`, error);
            return [];
        }
    }

    dispose() {
        this.disposables.forEach(element => {
            element.dispose();
        });
        this.symbolCache.clear();
    }
}

@injectable()
export abstract class AbstractDefaultCallHierarchyService implements CallHierarchyService {

    @inject(LanguageClientProvider) readonly languageClientProvider: LanguageClientProvider;
    @inject(ILogger) readonly logger: ILogger;
    @inject(MonacoTextModelService) readonly textModelService: MonacoTextModelService;

    abstract get languageId(): string;

    /**
     * Returns root definition of caller hierarchy.
     */
    public async getRootDefinition(location: Location): Promise<Definition | undefined> {
        return this.withContext(async services => {
            const definitionLocation = await services.getDefinitionLocation(location);
            if (!definitionLocation) {
                return undefined;
            }
            const definitionSymbol = await this.getEnclosingRootSymbol(definitionLocation, services);
            if (!definitionSymbol) {
                return undefined;
            }
            return this.toDefinition(definitionSymbol, services);
        });
    }

    /**
     * Returns next level of caller definitions.
     */
    public async getCallers(definition: Definition): Promise<Caller[] | undefined> {
        return this.withContext(async services => {
            const callerReferences = await services.getCallerReferences(definition.location);
            const callers = this.createCallers(callerReferences, services);
            return callers;
        });
    }

    protected async withContext<T>(lambda: (context: CallHierarchyContext) => Promise<T>): Promise<T | undefined> {
        try {
            const context = await this.createContext();
            if (context) {
                const result = await lambda.call(this, context);
                context.dispose();
                return result;
            }
        } catch (error) {
            this.logger.error("Error getting language client", error);
        }
        return undefined;
    }

    protected async createContext() {
        const languageClient = await this.languageClientProvider.getLanguageClient(this.languageId);
        if (!languageClient) {
            this.logger.error("No language client with ID " + this.languageId);
            return undefined;
        } else {
            return new CallHierarchyContext(languageClient, this.textModelService, this.logger);
        }
    }

    /**
     * Creates callers for given references and method symbols.
     */
    protected async createCallers(callerReferences: Location[], context: CallHierarchyContext): Promise<Caller[]> {
        const result: Caller[] = [];
        const caller2references = new Map<SymbolInformation, Location[]>();
        for (const reference of callerReferences) {
            const callerSymbol = await this.getEnclosingCallerSymbol(reference, context);
            if (callerSymbol) {
                const references = caller2references.get(callerSymbol);
                if (references) {
                    references.push(reference);
                } else {
                    caller2references.set(callerSymbol, [reference]);
                }
            }
        }
        for (const callerSymbol of caller2references.keys()) {
            const locations = caller2references.get(callerSymbol);
            if (locations) {
                const definition = await this.toDefinition(callerSymbol, context);
                if (definition) {
                    const caller = this.toCaller(definition, locations);
                    result.push(caller);
                }
            }
        }
        return result;
    }

    protected toCaller(callerDefinition: Definition, references: Location[]): Caller {
        return <Caller>{ callerDefinition, references };
    }

    protected async toDefinition(symbol: SymbolInformation, context: CallHierarchyContext): Promise<Definition | undefined> {
        const location = await this.getSymbolNameLocation(symbol, context);
        if (!location) {
            return undefined;
        }
        const symbolName = symbol.name;
        const symbolKind = symbol.kind;
        const containerName = symbol.containerName;
        return <Definition>{ location, symbolName, symbolKind, containerName };
    }

    /**
     * Override this to configure the callables of your language.
     */
    protected isCallable(symbol: SymbolInformation): boolean {
        switch (symbol.kind) {
            case SymbolKind.Constant:
            case SymbolKind.Constructor:
            case SymbolKind.Field:
            case SymbolKind.Function:
            case SymbolKind.Method:
            case SymbolKind.Property:
            case SymbolKind.Variable:
                return true;
            default:
                return false;
        }
    }

    /**
     * Finds the symbol that encloses the definition range of the root element
     *
     * As symbols can be nested, we are looking for the one with the smallest region.
     * As we only check regions that contain the definition, that is the one with the
     * latest start position.
     */
    protected async getEnclosingRootSymbol(definition: Location, context: CallHierarchyContext): Promise<SymbolInformation | undefined> {
        const symbols = (await context.getAllSymbols(definition.uri)).filter(s => this.isCallable(s));
        let bestMatch: SymbolInformation | undefined = undefined;
        let bestRange: Range | undefined = undefined;
        for (const candidate of symbols) {
            const candidateRange = candidate.location.range;
            if (utils.containsRange(candidateRange, definition.range)) {
                if (!bestMatch || utils.startsAfter(candidateRange, bestRange!)) {
                    bestMatch = candidate;
                    bestRange = candidateRange;
                }
            }
        }
        return bestMatch;
    }

    /**
     * Finds the symbol that encloses the reference range of a caller
     */
    protected async getEnclosingCallerSymbol(reference: Location, context: CallHierarchyContext): Promise<SymbolInformation | undefined> {
        return this.getEnclosingRootSymbol(reference, context);
    }

    /**
     * Finds the location of its name within a symbol's location.
     */
    protected async getSymbolNameLocation(symbol: SymbolInformation, context: CallHierarchyContext): Promise<Location | undefined> {
        const model = await context.getEditorModelReference(symbol.location.uri);
        let position = new monaco.Position(
            symbol.location.range.start.line + 1,
            symbol.location.range.start.character + 1
        );
        const endPosition = new monaco.Position(
            symbol.location.range.end.line + 1,
            symbol.location.range.end.character + 1
        );
        do {
            const word = model.object.textEditorModel.getWordAtPosition(position);
            if (word && word.word === symbol.name) {
                const range = Range.create(
                    Position.create(position.lineNumber - 1, position.column - 1),
                    Position.create(position.lineNumber - 1, position.column - 1 + symbol.name.length));
                return Location.create(symbol.location.uri, range);
            }
            const delta = (word) ? word.word.length + 1 : 1;
            position = model.object.textEditorModel.modifyPosition(position, delta);
        } while (position.isBefore(endPosition));
        return undefined;
    }
}
