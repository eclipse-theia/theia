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

import { ILanguageClient } from '@theia/languages/lib/browser';
import {
    ReferencesRequest, DocumentSymbolRequest, DefinitionRequest, TextDocumentPositionParams,
    TextDocumentIdentifier, SymbolInformation, Location, Position, DocumentSymbol, ReferenceParams, LocationLink
} from 'monaco-languageclient/lib/services';
import * as utils from './utils';
import { ILogger, Disposable } from '@theia/core';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import URI from '@theia/core/lib/common/uri';

export class CallHierarchyContext implements Disposable {

    protected readonly symbolCache = new Map<string, DocumentSymbol[] | SymbolInformation[]>();
    protected readonly disposables: Disposable[] = [];

    constructor(protected readonly languageClient: ILanguageClient,
        protected readonly textModelService: MonacoTextModelService,
        protected readonly logger: ILogger) { }

    async getAllSymbols(uri: string): Promise<DocumentSymbol[] | SymbolInformation[]> {
        const cachedSymbols = this.symbolCache.get(uri);
        if (cachedSymbols) {
            return cachedSymbols;
        }
        const result = await this.languageClient.sendRequest(DocumentSymbolRequest.type, {
            textDocument: TextDocumentIdentifier.create(uri)
        });
        const symbols = (result || []) as DocumentSymbol[] | SymbolInformation[];
        this.symbolCache.set(uri, symbols);
        return symbols;
    }

    // tslint:disable-next-line:typedef
    async getEditorModelReference(uri: string) {
        const model = await this.textModelService.createModelReference(new URI(uri));
        this.disposables.push(model);
        return model;
    }

    async getDefinitionLocation(location: Location): Promise<Location | undefined> {
        const uri = location.uri;
        const { line, character } = location.range.start;

        // Definition can be null
        // tslint:disable-next-line:no-null-keyword
        let locations: Location | Location[] | LocationLink[] | null = null;
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
        const targetLocation =  Array.isArray(locations) ? locations[0] : locations;
        return LocationLink.is(targetLocation) ? {
            uri: targetLocation.targetUri,
            range: targetLocation.targetSelectionRange
        } : targetLocation;
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
            this.logger.error('Error from references request', error);
            return [];
        }
    }

    dispose(): void {
        this.disposables.forEach(element => {
            element.dispose();
        });
        this.symbolCache.clear();
    }
}
