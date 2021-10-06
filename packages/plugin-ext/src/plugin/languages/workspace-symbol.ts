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

import { SymbolInformation } from '@theia/core/shared/vscode-languageserver-protocol';
import * as theia from '@theia/plugin';
import * as Converter from '../type-converters';

export class WorkspaceSymbolAdapter {

    constructor(
        private readonly provider: theia.WorkspaceSymbolProvider
    ) { }

    provideWorkspaceSymbols(query: string, token: theia.CancellationToken): Promise<SymbolInformation[]> {
        return Promise.resolve(this.provider.provideWorkspaceSymbols(query, token)).then(workspaceSymbols => {
            if (!workspaceSymbols) {
                return [];
            }

            const newSymbols: SymbolInformation[] = [];
            for (const sym of workspaceSymbols) {
                const convertedSymbol = Converter.fromSymbolInformation(sym);
                if (convertedSymbol) {
                    newSymbols.push(convertedSymbol);
                }
            }
            return newSymbols;
        });
    }

    resolveWorkspaceSymbol(symbol: SymbolInformation, token: theia.CancellationToken): Promise<SymbolInformation> {
        if (this.provider.resolveWorkspaceSymbol && typeof this.provider.resolveWorkspaceSymbol === 'function') {
            const theiaSymbol = Converter.toSymbolInformation(symbol);
            if (!theiaSymbol) {
                return Promise.resolve(symbol);
            } else {
                return Promise.resolve(this.provider.resolveWorkspaceSymbol(theiaSymbol, token)).then(workspaceSymbol => {
                    if (!workspaceSymbol) {
                        return symbol;
                    }

                    const converted = Converter.fromSymbolInformation(workspaceSymbol);
                    if (converted) {
                        return converted;
                    }
                    return symbol;
                });
            }
        }
        return Promise.resolve(symbol);
    }

}
