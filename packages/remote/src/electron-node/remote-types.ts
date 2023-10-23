// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { Disposable, Event, OS } from '@theia/core';
import * as net from 'net';

export interface RemotePlatform {
    os: OS.Type
    arch: string
}

export type RemoteStatusReport = (message: string) => void;

export interface ExpressLayer {
    name: string
    regexp: RegExp
    handle: Function
    path?: string
}

export interface RemoteExecOptions {
    env?: NodeJS.ProcessEnv;
}

export interface RemoteExecResult {
    stdout: string;
    stderr: string;
}

export type RemoteExecTester = (stdout: string, stderr: string) => boolean;

export interface RemoteConnection extends Disposable {
    id: string;
    name: string;
    type: string;
    localPort: number;
    remotePort: number;
    onDidDisconnect: Event<void>;
    forwardOut(socket: net.Socket): void;
    exec(cmd: string, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult>;
    execPartial(cmd: string, tester: RemoteExecTester, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult>;
    copy(localPath: string | Buffer | NodeJS.ReadableStream, remotePath: string): Promise<void>;
}
