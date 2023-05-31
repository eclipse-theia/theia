// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugSessionConnection } from './debug-session-connection';

export const DebugContribution = Symbol('DebugContribution');

export interface DebugContribution {
    register(configType: string, connection: DebugSessionConnection): void;
}

// copied from https://github.com/microsoft/vscode-node-debug2/blob/bcd333ef87642b817ac96d28fde7ab96fee3f6a9/src/nodeDebugInterfaces.d.ts
export interface LaunchVSCodeRequest extends DebugProtocol.Request {
    arguments: LaunchVSCodeArguments;
}

export interface LaunchVSCodeArguments {
    args: LaunchVSCodeArgument[];
    env?: { [key: string]: string | null; };
}

export interface LaunchVSCodeArgument {
    prefix?: string;
    path?: string;
}

export interface LaunchVSCodeResult {
    rendererDebugPort?: number;
}
