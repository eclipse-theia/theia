/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { AbstractDefaultCallHierarchyService, CallHierarchyContext } from "@theia/callhierarchy/lib/browser/callhierarchy-service-impl";
import { TYPESCRIPT_LANGUAGE_ID } from "../common";
import { SymbolInformation, Range, Location } from 'vscode-languageserver-types';
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
    async getEnclosingCallerSymbol(reference: Location, context: CallHierarchyContext): Promise<SymbolInformation | undefined> {
        const symbols = (await context.getAllSymbols(reference.uri)).filter(s => this.isCallable(s));
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
