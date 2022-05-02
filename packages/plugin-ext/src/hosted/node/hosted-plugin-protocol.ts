// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

// Custom message protocol between `HostedPluginProcess` and its `PluginHost` child process.

/**
 * Sent to initiate termination of the counterpart process.
 */
export interface ProcessTerminateMessage {
    type: typeof ProcessTerminateMessage.TYPE,
    stopTimeout?: number
}

export namespace ProcessTerminateMessage {
    export const TYPE = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(object: any): object is ProcessTerminateMessage {
        return typeof object === 'object' && object.type === TYPE;
    }
}

/**
 * Sent to inform the counter part process that the process termination has been completed.
 */

export interface ProcessTerminatedMessage {
    type: typeof ProcessTerminateMessage.TYPE,
}

export namespace ProcessTerminatedMessage {
    export const TYPE = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(object: any): object is ProcessTerminateMessage {
        return typeof object === 'object' && object.type === TYPE;
    }
}

