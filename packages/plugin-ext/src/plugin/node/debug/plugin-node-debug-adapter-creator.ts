// *****************************************************************************
// Copyright (C) 2022 Arm and others.
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

import { PluginDebugAdapterCreator } from '../../debug/plugin-debug-adapter-creator';
import * as path from 'path';
import * as theia from '@theia/plugin';
import { PlatformSpecificAdapterContribution, PluginPackageDebuggersContribution } from '../../../common';
import { isWindows, isOSX } from '@theia/core/lib/common/os';
import * as net from 'net';
import { ChildProcess, spawn, fork, ForkOptions } from 'child_process';
import { DebugAdapter } from '@theia/debug/lib/common/debug-model';
import { DebugAdapterExecutable, DebugAdapterInlineImplementation, DebugAdapterNamedPipeServer, DebugAdapterServer } from '../../types-impl';
import { ProcessDebugAdapter, SocketDebugAdapter } from '@theia/debug/lib/node/stream-debug-adapter';
const isElectron = require('is-electron');

export class NodeDebugAdapterCreator extends PluginDebugAdapterCreator {
    public override async resolveDebugAdapterExecutable(
        pluginPath: string,
        debuggerContribution: PluginPackageDebuggersContribution
    ): Promise<theia.DebugAdapterExecutable | undefined> {
        const info = this.toPlatformInfo(debuggerContribution);
        let program = (info && info.program || debuggerContribution.program);
        if (!program) {
            return undefined;
        }
        program = path.join(pluginPath, program);
        const programArgs = info && info.args || debuggerContribution.args || [];
        let runtime = info && info.runtime || debuggerContribution.runtime;
        if (runtime && runtime.indexOf('./') === 0) {
            runtime = path.join(pluginPath, runtime);
        }
        const runtimeArgs = info && info.runtimeArgs || debuggerContribution.runtimeArgs || [];
        const command = runtime ? runtime : program;
        const args = runtime ? [...runtimeArgs, program, ...programArgs] : programArgs;
        return {
            command,
            args
        };
    }

    public override async createDebugAdapter(
        session: theia.DebugSession,
        debugConfiguration: theia.DebugConfiguration,
        executable: theia.DebugAdapterExecutable | undefined,
        descriptorFactory: theia.DebugAdapterDescriptorFactory | undefined
    ): Promise<DebugAdapter> {
        if (descriptorFactory) {
            // 'createDebugAdapterDescriptor' is called at the start of a debug session to provide details about the debug adapter to use.
            // These details must be returned as objects of type [DebugAdapterDescriptor](#DebugAdapterDescriptor).
            // Currently two types of debug adapters are supported:
            // - a debug adapter executable is specified as a command path and arguments (see [DebugAdapterExecutable](#DebugAdapterExecutable)),
            // - a debug adapter server reachable via a communication port (see [DebugAdapterServer](#DebugAdapterServer)).
            // If the method is not implemented the default behavior is this:
            //   createDebugAdapter(session: DebugSession, executable: DebugAdapterExecutable) {
            //      if (typeof session.configuration.debugServer === 'number') {
            //         return new DebugAdapterServer(session.configuration.debugServer);
            //      }
            //      return executable;
            //   }
            //  @param session The [debug session](#DebugSession) for which the debug adapter will be used.
            //  @param executable The debug adapter's executable information as specified in the package.json (or undefined if no such information exists).
            const descriptor = await descriptorFactory.createDebugAdapterDescriptor(session, executable);
            if (descriptor) {
                if (DebugAdapterServer.is(descriptor)) {
                    return this.connectSocketDebugAdapter(descriptor);
                } else if (DebugAdapterExecutable.is(descriptor)) {
                    return this.startDebugAdapter(descriptor);
                } else if (DebugAdapterNamedPipeServer.is(descriptor)) {
                    return this.connectPipeDebugAdapter(descriptor);
                } else if (DebugAdapterInlineImplementation.is(descriptor)) {
                    return this.connectInlineDebugAdapter(descriptor);
                }
            }
        }

        if ('debugServer' in debugConfiguration) {
            return this.connectSocketDebugAdapter({ port: debugConfiguration.debugServer });
        } else {
            if (!executable) {
                throw new Error('It is not possible to provide debug adapter executable.');
            }
            return this.startDebugAdapter(executable);
        }
    }

    protected toPlatformInfo(executable: PluginPackageDebuggersContribution): PlatformSpecificAdapterContribution | undefined {
        if (isWindows && !process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')) {
            return executable.winx86 || executable.win || executable.windows;
        }
        if (isWindows) {
            return executable.win || executable.windows;
        }
        if (isOSX) {
            return executable.osx;
        }
        return executable.linux;
    }

    public startDebugAdapter(executable: DebugAdapterExecutable): DebugAdapter {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const options: any = { stdio: ['pipe', 'pipe', 2] };

        if (executable.options) {
            options.cwd = executable.options.cwd;

            // The additional environment of the executed program or shell. If omitted
            // the parent process' environment is used. If provided it is merged with
            // the parent process' environment.
            options.env = Object.assign({}, process.env);
            Object.assign(options.env, executable.options.env);
        }

        let childProcess: ChildProcess;
        const { command, args } = executable;
        if (command === 'node') {
            if (Array.isArray(args) && args.length > 0) {
                const forkOptions: ForkOptions = {
                    env: options.env,
                    // When running in Electron, fork will automatically add ELECTRON_RUN_AS_NODE=1 to the env,
                    // but this will cause issues when debugging Electron apps, so we'll remove it.
                    execArgv: isElectron()
                        ? ['-e', 'delete process.env.ELECTRON_RUN_AS_NODE;require(process.argv[1])']
                        : [],
                    silent: true
                };
                if (options.cwd) {
                    forkOptions.cwd = options.cwd;
                }
                options.stdio.push('ipc');
                forkOptions.stdio = options.stdio;
                childProcess = fork(args[0], args.slice(1), forkOptions);
            } else {
                throw new Error(`It is not possible to launch debug adapter with the command: ${JSON.stringify(executable)}`);
            }
        } else {
            childProcess = spawn(command, args, options);
        }

        return new ProcessDebugAdapter(childProcess);
    }

    /**
     * Connects to a remote debug server.
     */
    public connectSocketDebugAdapter(server: DebugAdapterServer): SocketDebugAdapter {
        const socket = net.createConnection(server.port, server.host);
        return new SocketDebugAdapter(socket);
    }

    public connectPipeDebugAdapter(adapter: DebugAdapterNamedPipeServer): SocketDebugAdapter {
        const socket = net.createConnection(adapter.path);
        return new SocketDebugAdapter(socket);
    }
}
