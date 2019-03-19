/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode-debugadapter-node/blob/master/adapter/src/protocol.ts

import * as net from 'net';
import { injectable, inject } from 'inversify';
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess,
    RawForkOptions,
    RawProcessOptions
} from '@theia/process/lib/node';
import {
    DebugAdapterExecutable,
    CommunicationProvider,
    DebugAdapterSession,
    DebugAdapterSessionFactory,
    DebugAdapterFactory
} from '../common/debug-model';
import { DebugAdapterSessionImpl } from './debug-adapter-session';

/**
 * [DebugAdapterFactory](#DebugAdapterFactory) implementation based on
 * launching the debug adapter as separate process.
 */
@injectable()
export class LaunchBasedDebugAdapterFactory implements DebugAdapterFactory {
    @inject(RawProcessFactory)
    protected readonly processFactory: RawProcessFactory;
    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    start(executable: DebugAdapterExecutable): CommunicationProvider {
        const process = this.childProcess(executable);

        // FIXME: propagate onError + onExit
        return {
            input: process.inputStream,
            output: process.outputStream,
            dispose: () => process.kill()
        };
    }

    private childProcess(executable: DebugAdapterExecutable): RawProcess {
        // tslint:disable-next-line:no-any
        const isForkOptions = (forkOptions: RawForkOptions | any): forkOptions is RawForkOptions =>
            !!forkOptions && !!forkOptions.modulePath;

        const processOptions: RawProcessOptions | RawForkOptions = { ...executable };
        const options = { stdio: ['pipe', 'pipe', 2] };

        if (isForkOptions(processOptions)) {
            options.stdio.push('ipc');
        }

        processOptions.options = options;
        return this.processFactory(processOptions);
    }

    connect(debugServerPort: number): CommunicationProvider {
        const socket = net.createConnection(debugServerPort);
        // FIXME: propagate socket.on('error', ...) + socket.on('close', ...)
        return {
            input: socket,
            output: socket,
            dispose: () => socket.end()
        };
    }
}

/**
 * [DebugAdapterSessionFactory](#DebugAdapterSessionFactory) implementation.
 */
@injectable()
export class DebugAdapterSessionFactoryImpl implements DebugAdapterSessionFactory {

    get(sessionId: string, communicationProvider: CommunicationProvider): DebugAdapterSession {
        return new DebugAdapterSessionImpl(
            sessionId,
            communicationProvider
        );
    }
}
