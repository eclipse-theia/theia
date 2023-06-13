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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode-debugadapter-node/blob/master/adapter/src/protocol.ts

import * as net from 'net';
import { injectable, inject } from '@theia/core/shared/inversify';
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess,
    RawForkOptions,
    RawProcessOptions
} from '@theia/process/lib/node';
import {
    DebugAdapterExecutable,
    DebugAdapterSession,
    DebugAdapterSessionFactory,
    DebugAdapterFactory,
    DebugAdapterForkExecutable,
    DebugAdapter
} from '../common/debug-model';
import { DebugAdapterSessionImpl } from '../common/debug-adapter-session';
import { environment } from '@theia/core/shared/@theia/application-package';
import { ProcessDebugAdapter, SocketDebugAdapter } from './stream-debug-adapter';
import { isObject } from '@theia/core/lib/common';

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

    start(executable: DebugAdapterExecutable): DebugAdapter {
        const process = this.childProcess(executable);

        if (!process.process) {
            throw new Error(`Could not start debug adapter process: ${JSON.stringify(executable)}`);
        }

        // FIXME: propagate onError + onExit
        const provider = new ProcessDebugAdapter(process.process);
        return provider;
    }

    private childProcess(executable: DebugAdapterExecutable): RawProcess {
        const isForkOptions = (forkOptions: unknown): forkOptions is RawForkOptions =>
            isObject(forkOptions) && 'modulePath' in forkOptions;

        const processOptions: RawProcessOptions | RawForkOptions = { ...executable };
        const options: { stdio: (string | number)[], env?: object, execArgv?: string[] } = { stdio: ['pipe', 'pipe', 2] };

        if (isForkOptions(processOptions)) {
            options.stdio.push('ipc');
            options.env = environment.electron.runAsNodeEnv();
            options.execArgv = (executable as DebugAdapterForkExecutable).execArgv;
        }

        processOptions.options = options;
        return this.processFactory(processOptions);
    }

    connect(debugServerPort: number): DebugAdapter {
        const socket = net.createConnection(debugServerPort);
        // FIXME: propagate socket.on('error', ...) + socket.on('close', ...)

        const provider = new SocketDebugAdapter(socket);
        return provider;
    }
}

/**
 * [DebugAdapterSessionFactory](#DebugAdapterSessionFactory) implementation.
 */
@injectable()
export class DebugAdapterSessionFactoryImpl implements DebugAdapterSessionFactory {

    get(sessionId: string, debugAdapter: DebugAdapter): DebugAdapterSession {
        return new DebugAdapterSessionImpl(
            sessionId,
            debugAdapter
        );
    }
}
