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

import { injectable } from 'inversify';
import { AbstractDefaultCallHierarchyService, ExtendedDocumentSymbol } from '@theia/callhierarchy/lib/browser/callhierarchy-service-impl';
import { CallHierarchyContext } from '@theia/callhierarchy/lib/browser/callhierarchy-context';
import { TYPESCRIPT_LANGUAGE_ID } from '../common';
import { SymbolInformation, Range, Location, DocumentSymbol } from 'vscode-languageserver-types';
import * as utils from '@theia/callhierarchy/lib/browser/utils';

@injectable()
export class TypeScriptCallHierarchyService extends AbstractDefaultCallHierarchyService {

    readonly languageId: string = TYPESCRIPT_LANGUAGE_ID;

    /**
     * Finds the symbol that encloses the definition range of a caller.
     *
     * In the case of typescript, a method's definition and all its override definitions
     * are returned as a reference as well. As these are not calls they have to be filtered.
     * We also just want ot see the top-most caller symbol.
     */
    async getEnclosingCallerSymbol(reference: Location, context: CallHierarchyContext): Promise<ExtendedDocumentSymbol | SymbolInformation | undefined> {
        const allSymbols = await context.getAllSymbols(reference.uri);
        if (allSymbols.length === 0) {
            return undefined;
        }
        if (DocumentSymbol.is(allSymbols[0])) {
            return this.getEnclosingRootSymbol(reference, context);
        }
        const symbols = (allSymbols as SymbolInformation[]).filter(s => this.isCallable(s));
        let bestMatch: SymbolInformation | undefined = undefined;
        let bestRange: Range | undefined = undefined;
        for (const candidate of symbols) {
            const candidateRange = candidate.location.range;
            if (utils.containsRange(candidateRange, reference.range)) {
                // as opposed to default, find the topmost (earliest) symbol
                if (!bestMatch || utils.startsAfter(bestRange!, candidateRange)) {
                    bestMatch = candidate;
                    bestRange = candidateRange;
                }
            }
        }
        if (bestMatch) {
            // filter references that are in fact definitions
            const nameLocation = await this.getSymbolNameLocation(bestMatch, context);
            if (!nameLocation || utils.isSame(nameLocation, reference)) {
                return undefined;
            }
        }
        return bestMatch;
    }
}
