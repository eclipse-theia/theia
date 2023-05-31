// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { IdGenerator } from '../../common/id-generator';
import * as rpc from '../../common/plugin-api-rpc';
import * as model from '../../common/plugin-api-rpc-model';
import { DocumentsExtImpl } from '../documents';
import { fromRange, SymbolKind } from '../type-converters';
import * as types from '../types-impl';

export class TypeHierarchyAdapter {

    private readonly idGenerator = new IdGenerator('');
    protected readonly cache = new Map<string, Map<string, theia.TypeHierarchyItem>>();

    constructor(
        private readonly provider: theia.TypeHierarchyProvider,
        private readonly documents: DocumentsExtImpl,
    ) { }

    private fromTypeHierarchyItem(item: theia.TypeHierarchyItem, sessionId: string): model.TypeHierarchyItem {
        const sessionCache = this.cache.get(sessionId)!;
        const itemId = sessionCache.size.toString(36);

        const definition: model.TypeHierarchyItem = {
            _itemId: itemId,
            _sessionId: sessionId,

            kind: SymbolKind.fromSymbolKind(item.kind),
            tags: item.tags,
            name: item.name,
            detail: item.detail,
            uri: item.uri,

            range: fromRange(item.range),
            selectionRange: fromRange(item.selectionRange),
        };
        sessionCache.set(itemId, item);
        return definition;
    }

    async prepareSession(uri: URI, position: rpc.Position, token: theia.CancellationToken): Promise<model.TypeHierarchyItem[] | undefined> {
        const documentData = this.documents.getDocumentData(uri);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${uri}`));
        }

        const definition = await this.provider.prepareTypeHierarchy(documentData.document,
            new types.Position(
                position.lineNumber,
                position.column
            ),
            token
        );

        if (!definition) {
            return undefined;
        }

        const sessionId = this.idGenerator.nextId();

        this.cache.set(sessionId, new Map());
        return Array.isArray(definition) ? definition.map(item => this.fromTypeHierarchyItem(item, sessionId)) : [this.fromTypeHierarchyItem(definition, sessionId)];
    }

    async provideSupertypes(sessionId: string, itemId: string, token: theia.CancellationToken): Promise<model.TypeHierarchyItem[] | undefined> {
        const item = this.fetchItemFromCatch(sessionId, itemId);
        if (!item) {
            throw new Error('missing type hierarchy item');
        }
        const supertypes = await this.provider.provideTypeHierarchySupertypes(item, token);
        if (!supertypes) {
            return undefined;
        }
        return supertypes.map(supertype => this.fromTypeHierarchyItem(supertype, sessionId));
    }

    async provideSubtypes(sessionId: string, itemId: string, token: theia.CancellationToken): Promise<model.TypeHierarchyItem[] | undefined> {
        const item = this.fetchItemFromCatch(sessionId, itemId);
        if (!item) {
            throw new Error('missing type hierarchy item');
        }
        const subTypes = await this.provider.provideTypeHierarchySubtypes(item, token);
        if (!subTypes) {
            return undefined;
        }
        return subTypes.map(subtype => this.fromTypeHierarchyItem(subtype, sessionId));
    }

    private fetchItemFromCatch(sessionId: string, itemId: string): theia.TypeHierarchyItem | undefined {
        return this.cache.get(sessionId!)?.get(itemId!);
    }

    releaseSession(session?: string): Promise<boolean> {
        if (session !== undefined) {
            return Promise.resolve(this.cache.delete(session));
        } else {
            this.cache.clear();
            return Promise.resolve(true);
        }
    }
}
