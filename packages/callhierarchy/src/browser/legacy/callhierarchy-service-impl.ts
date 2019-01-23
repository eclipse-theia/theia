/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { LanguageClientProvider } from '@theia/languages/lib/browser/language-client-provider';
import { Location, Range, DocumentSymbol } from 'vscode-languageserver-protocol';
import * as utils from '../utils';
import { CallHierarchyService, CallHierarchyParams, CallHierarchyItem, CallHierarchyDirection,  } from '../callhierarchy-service';
import { ILogger } from '@theia/core';
import { CallHierarchyContext } from '../callhierarchy-context';
import { ResolveCallHierarchyItemParams } from '@theia/languages/lib/browser/call-hierarchy/call-hierarchy-protocol.proposed';

export type ExtendedDocumentSymbol = DocumentSymbol & Location;

@injectable()
export abstract class AbstractDefaultCallHierarchyService implements CallHierarchyService {

    @inject(LanguageClientProvider) readonly languageClientProvider: LanguageClientProvider;
    @inject(ILogger) readonly logger: ILogger;

    abstract get languageId(): string;

    async callHierarchy(params: CallHierarchyParams): Promise<CallHierarchyItem | undefined> {
        if (params.direction === CallHierarchyDirection.Outgoing) {
            return undefined;
        }
        const item = await this.getItem(params);
        if (!item) {
            return undefined;
        }
        const levelsToResolve = params.resolve || 0;
        await this.resolveItem(item, levelsToResolve);
        return item;
    }
    async resolve(params: ResolveCallHierarchyItemParams): Promise<CallHierarchyItem> {
        if (params.direction === CallHierarchyDirection.Outgoing) {
            return params.item;
        }
        const { item, resolve } = params;
        await this.resolveItem(item, resolve);
        return item;
    }

    async resolveItem(item: CallHierarchyItem, levelsToResolve: number): Promise<void> {
        if (levelsToResolve < 1) {
            return;
        }
        const callers = await this.resolveCallers(item);
        item.calls = callers;
        for (const caller of callers) {
            await this.resolveItem(caller, levelsToResolve - 1);
        }
    }

    async getItem(params: CallHierarchyParams): Promise<CallHierarchyItem | undefined> {
        return this.withContext<CallHierarchyItem | undefined>(async services => {
            const definitionLocation = await services.getDefinitionLocation(params.textDocument.uri, params.position);
            if (!definitionLocation) {
                return undefined;
            }
            const definitionSymbol = await this.getEnclosingRootSymbol(definitionLocation, services);
            if (!definitionSymbol) {
                return undefined;
            }
            const { name, detail, kind, range, selectionRange } = definitionSymbol;
            const uri = definitionLocation.uri;
            return <CallHierarchyItem>{ uri, name, detail, kind, range, selectionRange };
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
            this.logger.error('Error getting language client', error);
        }
        return undefined;
    }

    protected async createContext() {
        const languageClient = await this.languageClientProvider.getLanguageClient(this.languageId);
        if (!languageClient) {
            this.logger.error('No language client with ID ' + this.languageId);
            return undefined;
        } else {
            return new CallHierarchyContext(languageClient, this.logger);
        }
    }

    protected async resolveCallers(item: CallHierarchyItem): Promise<CallHierarchyItem[]> {
        return await this.withContext<CallHierarchyItem[]>(async services => {
            const callerReferences = await services.getCallerReferences(item.uri, item.selectionRange.start);

            const callers: CallHierarchyItem[] = [];
            for (const callerReference of callerReferences) {
                const callerSymbol = await this.getEnclosingCallerSymbol(callerReference, services);
                if (!callerSymbol) {
                    continue;
                }
                const { name, detail, kind, range, selectionRange } = callerSymbol;
                const uri = callerReference.uri;
                const callLocations = [Location.create(uri, Range.create(callerReference.range.start, callerReference.range.end))];
                callers.push({ uri, name, detail, kind, range, selectionRange, callLocations });
            }
            return callers;
        }) || [];
    }

    /**
     * Finds the symbol that encloses the definition range of the root element
     *
     * As symbols can be nested, we are looking for the one with the smallest region.
     * As we only check regions that contain the definition, that is the one with the
     * latest start position.
     */
    protected async getEnclosingRootSymbol(definition: Location, context: CallHierarchyContext): Promise<ExtendedDocumentSymbol | undefined> {
        const allSymbols = await context.getAllSymbols(definition.uri);
        if (allSymbols.length === 0 || !DocumentSymbol.is(allSymbols[0])) {
            return undefined;
        }
        const symbols = (allSymbols as DocumentSymbol[]);
        const containsDefinition = (symbol: DocumentSymbol) => utils.containsRange(symbol.range, definition.range);
        for (const symbol of symbols) {
            let candidate = containsDefinition(symbol) ? symbol : undefined;
            outer: while (candidate) {
                const children = candidate.children || [];
                for (const child of children) {
                    if (containsDefinition(child)) {
                        candidate = child;
                        continue outer;
                    }
                }
                break;
            }
            if (candidate) {
                return <ExtendedDocumentSymbol>{ uri: definition.uri, ...candidate };
            }
        }
        return undefined;
    }

    /**
     * Finds the symbol that encloses the reference range of a caller
     */
    protected async getEnclosingCallerSymbol(reference: Location, context: CallHierarchyContext): Promise<ExtendedDocumentSymbol | undefined> {
        return this.getEnclosingRootSymbol(reference, context);
    }

}
