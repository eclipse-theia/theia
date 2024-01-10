// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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
import { DocumentsExtImpl } from '../documents';
import * as dto from '../../common/plugin-api-rpc-model';
import * as rpc from '../../common/plugin-api-rpc';
import * as types from '../types-impl';
import { fromRange, SymbolKind } from '../type-converters';

export class CallHierarchyAdapter {

    constructor(
        private readonly provider: theia.CallHierarchyProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    protected sessionIds = 0;
    protected readonly cache = new Map<string, Map<string, theia.CallHierarchyItem>>();

    async provideRootDefinition(
        resource: URI, position: rpc.Position, token: theia.CancellationToken
    ): Promise<dto.CallHierarchyItem[] | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const definition = await this.provider.prepareCallHierarchy(documentData.document,
            new types.Position(
                position.lineNumber,
                position.column
            ),
            token
        );

        if (!definition) {
            return undefined;
        }
        const sessionId = (this.sessionIds++).toString(36);
        this.cache.set(sessionId, new Map());
        return Array.isArray(definition) ? definition.map(item => this.fromCallHierarchyItem(item, sessionId)) : [this.fromCallHierarchyItem(definition, sessionId)];
    }

    async provideCallers(definition: dto.CallHierarchyItem, token: theia.CancellationToken): Promise<dto.CallHierarchyIncomingCall[] | undefined> {
        const callers = await this.provider.provideCallHierarchyIncomingCalls(this.toCallHierarchyItem(definition), token);
        if (!callers) {
            return undefined;
        }

        return callers.map(item => this.fromCallHierarchyIncomingCall(item, definition._sessionId!));
    }

    async provideCallees(definition: dto.CallHierarchyItem, token: theia.CancellationToken): Promise<dto.CallHierarchyOutgoingCall[] | undefined> {
        const callees = await this.provider.provideCallHierarchyOutgoingCalls(this.toCallHierarchyItem(definition), token);
        if (!callees) {
            return undefined;
        }

        return callees.map(item => this.fromCallHierarchyOutgoingCall(item, definition._sessionId!));
    }

    private fromCallHierarchyItem(item: theia.CallHierarchyItem, sessionId: string): dto.CallHierarchyItem {
        const sessionCache = this.cache.get(sessionId)!;
        const itemId = sessionCache.size.toString(36);
        const definition: dto.CallHierarchyItem = {
            uri: item.uri,
            range: fromRange(item.range),
            selectionRange: fromRange(item.selectionRange),
            name: item.name,
            kind: SymbolKind.fromSymbolKind(item.kind),
            tags: item.tags,
            _itemId: itemId,
            _sessionId: sessionId,
        };
        sessionCache.set(itemId, item);
        return definition;
    }

    private toCallHierarchyItem(definition: dto.CallHierarchyItem): theia.CallHierarchyItem {
        const cached = this.cache.get(definition._sessionId!)?.get(definition._itemId!);
        if (!cached) {
            throw new Error(`Found no cached item corresponding to ${definition.name} in ${definition.uri.path} with ID ${definition.data}.`);
        }
        return cached;
    }

    private fromCallHierarchyIncomingCall(caller: theia.CallHierarchyIncomingCall, sessionId: string): dto.CallHierarchyIncomingCall {
        return {
            from: this.fromCallHierarchyItem(caller.from, sessionId),
            fromRanges: caller.fromRanges.map(r => fromRange(r))
        };
    }

    protected fromCallHierarchyOutgoingCall(caller: theia.CallHierarchyOutgoingCall, sessionId: string): dto.CallHierarchyOutgoingCall {
        return {
            to: this.fromCallHierarchyItem(caller.to, sessionId),
            fromRanges: caller.fromRanges.map(r => fromRange(r)),
        };
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
