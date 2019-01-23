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
    TextDocumentIdentifier, Location, Position, DocumentSymbol, ReferenceParams
} from 'vscode-languageserver-protocol';
import * as utils from './utils';
import { ILogger, Disposable } from '@theia/core';

export class CallHierarchyContext implements Disposable {

    protected readonly symbolCache = new Map<string, DocumentSymbol[]>();
    protected readonly disposables: Disposable[] = [];

    constructor(protected readonly languageClient: ILanguageClient,
        protected readonly logger: ILogger) { }

    async getAllSymbols(uri: string): Promise<DocumentSymbol[]> {
        const cachedSymbols = this.symbolCache.get(uri);
        if (cachedSymbols) {
            return cachedSymbols;
        }
        const result = await this.languageClient.sendRequest(DocumentSymbolRequest.type, {
            textDocument: TextDocumentIdentifier.create(uri)
        });
        const symbols = (result || []) as DocumentSymbol[];
        this.symbolCache.set(uri, symbols);
        return symbols;
    }

    async getDefinitionLocation(uri: string, position: Position): Promise<Location | undefined> {
        const { line, character } = position;

        // Definition can be null
        // tslint:disable-next-line:no-null-keyword
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

    async getCallerReferences(uri: string, position: Position): Promise<Location[]> {
        try {
            const references = await this.languageClient.sendRequest(ReferencesRequest.type, <ReferenceParams>{
                context: {
                    includeDeclaration: false // TODO find out, why definitions are still contained
                },
                position: {
                    line: position.line,
                    character: position.character
                },
                textDocument: {
                    uri
                }
            });
            const uniqueReferences = utils.filterUnique(references);
            const filteredReferences = utils.filterSame(uniqueReferences, uri, position);
            return filteredReferences;
        } catch (error) {
            this.logger.error('Error from references request', error);
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
