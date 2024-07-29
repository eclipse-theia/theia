// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatVariables.ts

import { injectable } from '@theia/core/shared/inversify';

export interface IChatVariableData {
    id: string;
    name: string;
}
export const ChatVariablesService = Symbol('ChatVariablesService');
export interface ChatVariablesService {
    hasVariable(name: string): boolean;
    getVariable(name: string): IChatVariableData | undefined;
    getVariables(): Iterable<Readonly<IChatVariableData>>;
}
@injectable()
export class DummyChatVariablesService implements ChatVariablesService {
    hasVariable(name: string): boolean {
        return false;
    }
    getVariable(name: string): IChatVariableData | undefined {
        return undefined
    }
    getVariables(): Iterable<Readonly<IChatVariableData>> {
        return [];
    }
}
