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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import * as model from '../../common/plugin-api-rpc-model';
import * as rpc from '../../common/plugin-api-rpc';
import * as types from '../types-impl';

export class CallHierarchyAdapter {

    constructor(
        private readonly provider: theia.CallHierarchyProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    protected readonly cache = new Map<string, theia.CallHierarchyItem>();

    async provideRootDefinition(
        resource: URI, position: rpc.Position, token: theia.CancellationToken
    ): Promise<model.CallHierarchyDefinition | model.CallHierarchyDefinition[] | undefined> {
        this.cache.clear();
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

        return Array.isArray(definition) ? definition.map(item => this.fromCallHierarchyItem(item)) : this.fromCallHierarchyItem(definition);
    }

    async provideCallers(definition: model.CallHierarchyDefinition, token: theia.CancellationToken): Promise<model.CallHierarchyReference[] | undefined> {
        const callers = await this.provider.provideCallHierarchyIncomingCalls(this.toCallHierarchyItem(definition), token);
        if (!callers) {
            return undefined;
        }

        return callers.map(item => this.fromCallHierarchyIncomingCall(item));
    }

    async provideCallees(definition: model.CallHierarchyDefinition, token: theia.CancellationToken): Promise<model.CallHierarchyReference[] | undefined> {
        const callees = await this.provider.provideCallHierarchyOutgoingCalls(this.toCallHierarchyItem(definition), token);
        if (!callees) {
            return undefined;
        }

        return callees.map(item => this.fromCallHierarchyOutgoingCall(item));
    }

    private fromCallHierarchyItem(item: theia.CallHierarchyItem): model.CallHierarchyDefinition {
        const data = this.cache.size.toString(36);
        const definition = {
            uri: item.uri,
            range: this.fromRange(item.range),
            selectionRange: this.fromRange(item.selectionRange),
            name: item.name,
            kind: item.kind,
            tags: item.tags,
            data,
        };
        this.cache.set(data, item);
        return definition;
    }

    private fromRange(range: theia.Range): model.Range {
        return {
            startLineNumber: range.start.line + 1,
            startColumn: range.start.character + 1,
            endLineNumber: range.end.line + 1,
            endColumn: range.end.character + 1,
        };
    }

    private toCallHierarchyItem(definition: model.CallHierarchyDefinition): theia.CallHierarchyItem {
        const cached = this.cache.get(definition.data as string);
        if (!cached) {
            throw new Error(`Found no cached item corresponding to ${definition.name} in ${definition.uri.path} with ID ${definition.data}.`);
        }
        return cached;
    }

    private fromCallHierarchyIncomingCall(caller: theia.CallHierarchyIncomingCall): model.CallHierarchyReference {
        return {
            callerDefinition: this.fromCallHierarchyItem(caller.from),
            references: caller.fromRanges.map(l => this.fromRange(l))
        };
    }

    protected fromCallHierarchyOutgoingCall(caller: theia.CallHierarchyOutgoingCall): model.CallHierarchyReference {
        return {
            callerDefinition: this.fromCallHierarchyItem(caller.to),
            references: caller.fromRanges.map(this.fromRange.bind(this)),
        };
    }
}
