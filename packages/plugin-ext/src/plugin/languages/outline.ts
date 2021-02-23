/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';
import { DocumentSymbol, Range } from '../../common/plugin-api-rpc-model';
import * as types from '../types-impl';

/** Adapts the calls from main to extension thread for providing the document symbols. */
export class OutlineAdapter {

    constructor(
        private readonly documents: DocumentsExtImpl,
        private readonly provider: theia.DocumentSymbolProvider
    ) { }

    provideDocumentSymbols(resource: URI, token: theia.CancellationToken): Promise<DocumentSymbol[] | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const doc = document.document;

        return Promise.resolve(this.provider.provideDocumentSymbols(doc, token)).then(value => {
            if (!value || value.length === 0) {
                return undefined;
            }
            if (value[0] instanceof types.DocumentSymbol) {
                return (<types.DocumentSymbol[]>value).map(Converter.fromDocumentSymbol);
            } else {
                return OutlineAdapter.asDocumentSymbolTree(resource, <types.SymbolInformation[]>value);
            }
        });
    }

    private static asDocumentSymbolTree(resource: URI, infos: types.SymbolInformation[]): DocumentSymbol[] {
        // first sort by start (and end) and then loop over all elements
        // and build a tree based on containment.
        infos = infos.slice(0).sort((a, b) => {
            let r = a.location.range.start.compareTo(b.location.range.start);
            if (r === 0) {
                r = b.location.range.end.compareTo(a.location.range.end);
            }
            return r;
        });
        const res: DocumentSymbol[] = [];
        const parentStack: DocumentSymbol[] = [];
        for (const info of infos) {
            const element = <DocumentSymbol>{
                name: info.name,
                detail: '',
                kind: Converter.SymbolKind.fromSymbolKind(info.kind),
                containerName: info.containerName,
                range: Converter.fromRange(info.location.range),
                selectionRange: Converter.fromRange(info.location.range),
                children: [],
                tags: info.tags && info.tags.length > 0 ? info.tags.map(Converter.fromSymbolTag) : [],
            };

            while (true) {
                if (parentStack.length === 0) {
                    parentStack.push(element);
                    res.push(element);
                    break;
                }
                const parent = parentStack[parentStack.length - 1];
                if (OutlineAdapter.containsRange(parent.range, element.range) && !OutlineAdapter.equalsRange(parent.range, element.range)) {
                    parent.children!.push(element);
                    parentStack.push(element);
                    break;
                }
                parentStack.pop();
            }
        }
        return res;
    }

    /**
     * Test if `otherRange` is in `range`. If the ranges are equal, will return true.
     */
    private static containsRange(range: Range, otherRange: Range): boolean {
        if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) {
            return false;
        }
        if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) {
            return false;
        }
        if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn < range.startColumn) {
            return false;
        }
        if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn > range.endColumn) {
            return false;
        }
        return true;
    }

    /**
     * Test if range `a` equals `b`.
     */
    private static equalsRange(a: Range, b: Range): boolean {
        return (
            !!a &&
            !!b &&
            a.startLineNumber === b.startLineNumber &&
            a.startColumn === b.startColumn &&
            a.endLineNumber === b.endLineNumber &&
            a.endColumn === b.endColumn
        );
    }
}
