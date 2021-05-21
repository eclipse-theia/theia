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

import { environment } from '@theia/core/shared/@theia/application-package';
import { injectable } from '@theia/core/shared/inversify';
import * as cp from 'child_process';
import * as net from 'net';
import {
    CommunicationProvider, DebugAdapterExecutable, DebugAdapterFactory, DebugAdapterForkExecutable, DebugAdapterSession, DebugAdapterSessionFactory
} from '../common/debug-model';
import { DebugAdapterSessionImpl } from './debug-adapter-session';

/**
 * [DebugAdapterFactory](#DebugAdapterFactory) implementation based on
 * launching the debug adapter as separate process.
 */
@injectable()
export class LaunchBasedDebugAdapterFactory implements DebugAdapterFactory {

    start(executable: DebugAdapterExecutable): CommunicationProvider {
        const debugAdapter = this.spawnOrForkDebugAdapter(executable);
        // TODO/FIXME: propagate onError + onExit
        return {
            input: debugAdapter.stdin!,
            output: debugAdapter.stdout!,
            dispose: () => debugAdapter.kill()
        };
    }

    connect(debugServerPort: number): CommunicationProvider {
        const socket = net.createConnection(debugServerPort);
        // TODO/FIXME: propagate socket.on('error', ...) + socket.on('close', ...)
        return {
            input: socket,
            output: socket,
            dispose: () => socket.end()
        };
    }

    private spawnOrForkDebugAdapter(executable: DebugAdapterExecutable): cp.ChildProcess {
        const stdio = ['pipe' as const, 'pipe' as const, 'inherit' as const];
        if ('command' in executable) {
            return cp.spawn(executable.command, executable.args ?? [], { stdio });
        } else if ('modulePath' in executable) {
            return cp.fork(executable.modulePath, executable.args ?? [], {
                execArgv: executable.execArgv,
                stdio: [...stdio, 'ipc'],
            });
        } else {
            throw new Error(`wrong configuration: ${JSON.stringify(executable)}`);
        }
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
