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

import URI from 'vscode-uri/lib/umd';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import { CodeLensSymbol } from '../../api/model';
import * as Converter from '../type-converters';
import { ObjectIdentifier } from '../../common/object-identifier';

/** Adapts the calls from main to extension thread for providing/resolving the code lenses. */
export class CodeLensAdapter {

    private static readonly BAD_CMD: theia.Command = { command: 'missing', title: '<<MISSING COMMAND>>' };

    private cacheId = 0;
    private cache = new Map<number, theia.CodeLens>();

    constructor(
        private readonly provider: theia.CodeLensProvider,
        private readonly documents: DocumentsExtImpl,
    ) { }

    provideCodeLenses(resource: URI, token: theia.CancellationToken): Promise<CodeLensSymbol[] | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const doc = document.document;

        return Promise.resolve(this.provider.provideCodeLenses(doc, token)).then(lenses => {
            if (Array.isArray(lenses)) {
                return lenses.map(lens => {
                    const id = this.cacheId++;
                    const lensSymbol = ObjectIdentifier.mixin({
                        range: Converter.fromRange(lens.range)!,
                        command: lens.command ? Converter.toInternalCommand(lens.command) : undefined
                    }, id);
                    this.cache.set(id, lens);
                    return lensSymbol;
                });
            }
            return undefined;
        });
    }

    resolveCodeLens(resource: URI, symbol: CodeLensSymbol, token: theia.CancellationToken): Promise<CodeLensSymbol | undefined> {
        const lens = this.cache.get(ObjectIdentifier.of(symbol));
        if (!lens) {
            return Promise.resolve(undefined);
        }

        let resolve: Promise<theia.CodeLens | undefined>;
        if (typeof this.provider.resolveCodeLens !== 'function' || lens.isResolved) {
            resolve = Promise.resolve(lens);
        } else {
            resolve = Promise.resolve(this.provider.resolveCodeLens(lens, token));
        }

        return resolve.then(newLens => {
            newLens = newLens || lens;
            symbol.command = Converter.toInternalCommand(newLens.command ? newLens.command : CodeLensAdapter.BAD_CMD);
            return symbol;
        });
    }
}
