// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { RpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { Disposable } from '@theia/core';

export interface TerminalProcessInfo {
    executable: string
    arguments: string[]
}

export interface IBaseTerminalServerOptions { }

export interface IBaseTerminalServer extends RpcServer<IBaseTerminalClient> {
    create(IBaseTerminalServerOptions: object): Promise<number>;
    getProcessId(id: number): Promise<number>;
    getProcessInfo(id: number): Promise<TerminalProcessInfo>;
    getCwdURI(id: number): Promise<string>;
    resize(id: number, cols: number, rows: number): Promise<void>;
    attach(id: number): Promise<number>;
    onAttachAttempted(id: number): Promise<void>;
    close(id: number): Promise<void>;
    getDefaultShell(): Promise<string>;
}
export namespace IBaseTerminalServer {
    export function validateId(id?: number): boolean {
        return typeof id === 'number' && id !== -1;
    }
}

export interface IBaseTerminalExitEvent {
    terminalId: number;

    // Either code and reason will be set or signal.
    code?: number;
    reason?: TerminalExitReason;
    signal?: string;

    attached?: boolean;
}

export enum TerminalExitReason {
    Unknown = 0,
    Shutdown = 1,
    Process = 2,
    User = 3,
    Extension = 4,
}

export interface IBaseTerminalErrorEvent {
    terminalId: number;
    error: Error;
    attached?: boolean;
}

export interface IBaseTerminalClient {
    onTerminalExitChanged(event: IBaseTerminalExitEvent): void;
    onTerminalError(event: IBaseTerminalErrorEvent): void;
    updateTerminalEnvVariables(): void;
    storeTerminalEnvVariables(data: string): void;
}

export class DispatchingBaseTerminalClient {

    protected readonly clients = new Set<IBaseTerminalClient>();

    push(client: IBaseTerminalClient): Disposable {
        this.clients.add(client);
        return Disposable.create(() => this.clients.delete(client));
    }

    onTerminalExitChanged(event: IBaseTerminalExitEvent): void {
        this.clients.forEach(c => {
            try {
                c.onTerminalExitChanged(event);
            } catch (e) {
                console.error(e);
            }
        });
    }

    onTerminalError(event: IBaseTerminalErrorEvent): void {

        this.clients.forEach(c => {
            try {
                c.onTerminalError(event);
            } catch (e) {
                console.error(e);
            }
        });
    }

    updateTerminalEnvVariables(): void {
        this.clients.forEach(c => {
            try {
                c.updateTerminalEnvVariables();
            } catch (e) {
                console.error(e);
            }
        });
    }

    storeTerminalEnvVariables(data: string): void {
        this.clients.forEach(c => {
            try {
                c.storeTerminalEnvVariables(data);
            } catch (e) {
                console.error(e);
            }
        });
    }
}
