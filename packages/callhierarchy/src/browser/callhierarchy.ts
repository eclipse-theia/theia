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
