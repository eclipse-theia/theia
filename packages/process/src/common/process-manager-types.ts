// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { Event } from '@theia/core';

export interface ManagedProcessManager {
    register(process: ManagedProcess): number;
    unregister(process: ManagedProcess): void;
    get(id: number): ManagedProcess | undefined;
}

export interface ManagedProcess {
    readonly id: number;
    readonly onStart: Event<IProcessStartEvent>;
    readonly onExit: Event<IProcessExitEvent>;
    readonly onClose: Event<IProcessExitEvent>;
    readonly onError: Event<ProcessErrorEvent>;
    readonly killed: boolean;
    kill(): void;
}

export interface IProcessExitEvent {
    // Exactly one of code and signal will be set.
    readonly code?: number,
    readonly signal?: string
}

/**
 * Data emitted when a process has been successfully started.
 */
export interface IProcessStartEvent {
}

/**
 * Data emitted when a process has failed to start.
 */
export interface ProcessErrorEvent extends Error {
    /** An errno-like error string (e.g. ENOENT).  */
    code: string;
}

export enum ProcessType {
    'Raw',
    'Terminal'
}
