/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Location, SymbolKind } from 'vscode-languageserver-types';

export const CALLHIERARCHY_ID = 'callhierarchy';

export interface Definition {
    location: Location,
    symbolName: string,
    symbolKind: SymbolKind,
    containerName: string,
    callers: Caller[] | undefined
}

export interface Caller {
    callerDefinition: Definition,
    references: Location[]
}
