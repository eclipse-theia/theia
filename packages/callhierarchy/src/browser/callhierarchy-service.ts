/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { Location } from 'vscode-languageserver-types';
import { Definition, Caller } from './callhierarchy';
import { ContributionProvider } from '@theia/core/lib/common';

export const CallHierarchyService = Symbol('CallHierarchyService');

export interface CallHierarchyService {
    readonly languageId: string
    getRootDefinition(location: Location): Promise<Definition | undefined>
    getCallers(definition: Definition): Promise<Caller[] | undefined>
}

@injectable()
export class CallHierarchyServiceProvider {

    @inject(ContributionProvider) @named(CallHierarchyService)
    protected readonly contributions: ContributionProvider<CallHierarchyService>;

    get(languageId: string): CallHierarchyService | undefined {
        return this.contributions.getContributions().find(service => languageId === service.languageId);
    }
}
