// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
import { isObject } from '@theia/core/lib/common';
import { TaskIdentifier } from '@theia/task/lib/common';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Configuration for a debug adapter session.
 */
export interface DebugConfiguration {
    /**
     * The type of the debug adapter session.
     */
    type: string;

    /**
     * The name of the debug adapter session.
     */
    name: string;

    /**
     * Additional debug type specific properties.
     */
    [key: string]: any;

    parentSessionId?: string;

    lifecycleManagedByParent?: boolean;

    consoleMode?: DebugConsoleMode;

    compact?: boolean;

    /**
     * The request type of the debug adapter session.
     */
    request: string;

    /**
     * If noDebug is true the launch request should launch the program without enabling debugging.
     */
    noDebug?: boolean;

    /**
     * Optional data from the previous, restarted session.
     * The data is sent as the 'restart' attribute of the 'terminated' event.
     * The client should leave the data intact.
     */
    __restart?: boolean;

    /** default: neverOpen */
    openDebug?: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart' | 'openOnDebugBreak';

    /** default: neverOpen */
    internalConsoleOptions?: 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart'

    /** Task to run before debug session starts */
    preLaunchTask?: string | TaskIdentifier;

    /** Task to run after debug session ends */
    postDebugTask?: string | TaskIdentifier;

    /**
     * When true, a save will not be triggered for open editors when starting a debug session,
     * regardless of the value of the `debug.saveBeforeStart` setting.
     */
    suppressSaveBeforeStart?: boolean;

    /** When true, the window statusbar color will not be changed for this session. */
    suppressDebugStatusbar?: boolean;

    /** When true, the debug viewlet will not be automatically revealed for this session. */
    suppressDebugView?: boolean;
}
export namespace DebugConfiguration {
    export function is(arg: unknown): arg is DebugConfiguration {
        return isObject(arg) && 'type' in arg && 'name' in arg && 'request' in arg;
    }
}

export interface DebugSessionOptions {
    lifecycleManagedByParent?: boolean;
    parentSessionId?: string;
    consoleMode?: DebugConsoleMode;
    noDebug?: boolean;
    compact?: boolean;
    suppressSaveBeforeStart?: boolean;
    suppressDebugStatusbar?: boolean;
    suppressDebugView?: boolean;
    testRun?: {
        controllerId: string,
        runId: string
    }
}

export enum DebugConsoleMode {
    Separate = 0,
    MergeWithParent = 1
}
