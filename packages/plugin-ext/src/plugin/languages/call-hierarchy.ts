/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import * as Converter from '../type-converters';
import { DocumentsExtImpl } from '../documents';
import * as model from '../../common/plugin-api-rpc-model';
import * as rpc from '../../common/plugin-api-rpc';
import * as types from '../types-impl';

export class CallHierarchyAdapter {

    constructor(
        private readonly provider: theia.CallHierarchyProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    async provideRootDefinition(resource: URI, position: rpc.Position, token: theia.CancellationToken): Promise<model.CallHierarchyDefinition | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const definition = await this.provider.prepareCallHierarchy(documentData.document,
            new types.Position(
                position.lineNumber,
                position.column
            ),
            token);
        if (!definition) {
            return undefined;
        }

        return this.fromCallHierarchyitem(definition);
    }

    async provideCallers(definition: model.CallHierarchyDefinition, token: theia.CancellationToken): Promise<model.CallHierarchyReference[] | undefined> {
        const callers = await this.provider.provideCallHierarchyIncomingCalls(this.toCallHierarchyItem(definition), token);
        if (!callers) {
            return undefined;
        }

        return callers.map(item => this.fromCallHierarchyIncomingCall(item));
    }

    private fromCallHierarchyitem(item: theia.CallHierarchyItem): model.CallHierarchyDefinition {
        return {
            uri: item.uri,
            range: this.fromRange(item.range),
            selectionRange: this.fromRange(item.selectionRange),
            name: item.name,
            kind: item.kind
        };
    }

    private fromRange(range: theia.Range): model.Range {
        return {
            startLineNumber: range.start.line,
            startColumn: range.start.character,
            endLineNumber: range.end.line,
            endColumn: range.end.character
        };
    }

    private toRange(range: model.Range): types.Range {
        return new types.Range(
            range.startLineNumber,
            range.startColumn,
            range.endLineNumber,
            range.endColumn
        );
    }

    private toCallHierarchyItem(definition: model.CallHierarchyDefinition): theia.CallHierarchyItem {
        return new types.CallHierarchyItem(
            Converter.SymbolKind.toSymbolKind(definition.kind),
            definition.name,
            definition.detail ? definition.detail : '',
            URI.revive(definition.uri),
            this.toRange(definition.range),
            this.toRange(definition.selectionRange),
        );
    }

    private fromCallHierarchyIncomingCall(caller: theia.CallHierarchyIncomingCall): model.CallHierarchyReference {
        return {
            callerDefinition: this.fromCallHierarchyitem(caller.from),
            references: caller.fromRanges.map(l => this.fromRange(l))
        };
    }
}
