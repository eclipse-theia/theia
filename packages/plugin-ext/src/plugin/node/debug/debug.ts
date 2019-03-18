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
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable } from '../../types-impl';
import { Breakpoint } from '../../../api/model';
import { RPCProtocol } from '../../../api/rpc-protocol';
import {
    PLUGIN_RPC_CONTEXT as Ext,
    DebugMain,
    DebugExt,
    TerminalOptionsExt
} from '../../../api/plugin-api';
import * as theia from '@theia/plugin';
import uuid = require('uuid');
import { ConnectionExtImpl } from '../../connection-ext';
import { CommandRegistryImpl } from '../../command-registry';
import { DebuggerContribution } from '../../../common';
import { PluginWebSocketChannel } from '../../../common/connection';
import { DebugAdapterExecutable, CommunicationProvider } from '@theia/debug/lib/common/debug-model';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { PluginDebugAdapterSession } from './plugin-debug-adapter-session';
import { startDebugAdapter, connectDebugAdapter } from './plugin-debug-adapter-starter';
import { resolveDebugAdapterExecutable } from './plugin-debug-adapter-executable-resolver';
import URI from 'vscode-uri';
import { Path } from '@theia/core/lib/common/path';

// tslint:disable:no-any

// TODO: rename file to `debug-ext.ts`

/**
 * It is supposed to work at node only.
 */
export class DebugExtImpl implements DebugExt {
    // debug sessions by sessionId
    private sessions = new Map<string, PluginDebugAdapterSession>();

    // providers by type
    private configurationProviders = new Map<string, Set<theia.DebugConfigurationProvider>>();
    private debuggersContributions = new Map<string, DebuggerContribution>();
    private contributionPaths = new Map<string, string>();

    private connectionExt: ConnectionExtImpl;
    private commandRegistryExt: CommandRegistryImpl;

    private proxy: DebugMain;

    private readonly onDidChangeBreakpointsEmitter = new Emitter<theia.BreakpointsChangeEvent>();
    private readonly onDidChangeActiveDebugSessionEmitter = new Emitter<theia.DebugSession | undefined>();
    private readonly onDidTerminateDebugSessionEmitter = new Emitter<theia.DebugSession>();
    private readonly onDidStartDebugSessionEmitter = new Emitter<theia.DebugSession>();
    private readonly onDidReceiveDebugSessionCustomEmitter = new Emitter<theia.DebugSessionCustomEvent>();

    activeDebugSession: theia.DebugSession | undefined;
    activeDebugConsole: theia.DebugConsole;
    breakpoints: theia.Breakpoint[] = [];

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.DEBUG_MAIN);
        this.activeDebugConsole = {
            append: (value: string) => this.proxy.$appendToDebugConsole(value),
            appendLine: (value: string) => this.proxy.$appendLineToDebugConsole(value)
        };
    }

    /**
     * Sets dependencies.
     */
    assistedInject(connectionExt: ConnectionExtImpl, commandRegistryExt: CommandRegistryImpl) {
        this.connectionExt = connectionExt;
        this.commandRegistryExt = commandRegistryExt;
    }

    /**
     * Registers contributions.
     * @param pluginFolder plugin folder path
     * @param contributions available debuggers contributions
     */
    registerDebuggersContributions(pluginFolder: string, contributions: DebuggerContribution[]): void {
        contributions.forEach((contribution: DebuggerContribution) => {
            this.contributionPaths.set(contribution.type, pluginFolder);
            this.debuggersContributions.set(contribution.type, contribution);
            this.proxy.$registerDebuggerContribution({
                type: contribution.type,
                label: contribution.label || contribution.type
            });
            console.log(`Debugger contribution has been registered: ${contribution.type}`);
        });
    }

    get onDidReceiveDebugSessionCustomEvent(): theia.Event<theia.DebugSessionCustomEvent> {
        return this.onDidReceiveDebugSessionCustomEmitter.event;
    }

    get onDidChangeActiveDebugSession(): theia.Event<theia.DebugSession | undefined> {
        return this.onDidChangeActiveDebugSessionEmitter.event;
    }

    get onDidTerminateDebugSession(): theia.Event<theia.DebugSession> {
        return this.onDidTerminateDebugSessionEmitter.event;
    }

    get onDidStartDebugSession(): theia.Event<theia.DebugSession> {
        return this.onDidStartDebugSessionEmitter.event;
    }

    get onDidChangeBreakpoints(): theia.Event<theia.BreakpointsChangeEvent> {
        return this.onDidChangeBreakpointsEmitter.event;
    }

    addBreakpoints(breakpoints: theia.Breakpoint[]): void {
        this.proxy.$addBreakpoints(breakpoints);
    }

    removeBreakpoints(breakpoints: theia.Breakpoint[]): void {
        this.proxy.$removeBreakpoints(breakpoints);
    }

    startDebugging(folder: theia.WorkspaceFolder | undefined, nameOrConfiguration: string | theia.DebugConfiguration): PromiseLike<boolean> {
        return this.proxy.$startDebugging(folder, nameOrConfiguration);
    }

    registerDebugConfigurationProvider(debugType: string, provider: theia.DebugConfigurationProvider): Disposable {
        console.log(`Debug configuration provider has been registered: ${debugType}`);
        const providers = this.configurationProviders.get(debugType) || new Set<theia.DebugConfigurationProvider>();
        this.configurationProviders.set(debugType, providers);
        providers.add(provider);

        return Disposable.create(() => {
            // tslint:disable-next-line:no-shadowed-variable
            const providers = this.configurationProviders.get(debugType);
            if (providers) {
                providers.delete(provider);
                if (providers.size === 0) {
                    this.configurationProviders.delete(debugType);
                }
            }
        });
    }

    async $onSessionCustomEvent(sessionId: string, event: string, body?: any): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.onDidReceiveDebugSessionCustomEmitter.fire({ event, body, session });
        }
    }

    async $sessionDidCreate(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.onDidStartDebugSessionEmitter.fire(session);
        }
    }

    async $sessionDidDestroy(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.onDidTerminateDebugSessionEmitter.fire(session);
        }
    }

    async $sessionDidChange(sessionId: string | undefined): Promise<void> {
        this.activeDebugSession = sessionId ? this.sessions.get(sessionId) : undefined;
        this.onDidChangeActiveDebugSessionEmitter.fire(this.activeDebugSession);
    }

    async $breakpointsDidChange(all: Breakpoint[], added: Breakpoint[], removed: Breakpoint[], changed: Breakpoint[]): Promise<void> {
        this.breakpoints = all;
        this.onDidChangeBreakpointsEmitter.fire({ added, removed, changed });
    }

    async $createDebugSession(debugConfiguration: theia.DebugConfiguration): Promise<string> {
        let communicationProvider: CommunicationProvider;
        if ('debugServer' in debugConfiguration) {
            communicationProvider = connectDebugAdapter(debugConfiguration.debugServer);
        } else {
            const executable = await this.getExecutable(debugConfiguration);
            communicationProvider = startDebugAdapter(executable);
        }
        const sessionId = uuid.v4();

        const debugAdapterSession = new PluginDebugAdapterSession(
            sessionId,
            debugConfiguration,
            communicationProvider,
            (command: string, args?: any) => this.proxy.$customRequest(sessionId, command, args));
        this.sessions.set(sessionId, debugAdapterSession);

        const connection = await this.connectionExt!.ensureConnection(sessionId);
        debugAdapterSession.start(new PluginWebSocketChannel(connection));

        return sessionId;
    }

    async $terminateDebugSession(sessionId: string): Promise<void> {
        const debugAdapterSession = this.sessions.get(sessionId);
        if (debugAdapterSession) {
            await debugAdapterSession.stop();
            this.sessions.delete(sessionId);
        }
    }

    async $getSupportedLanguages(debugType: string): Promise<string[]> {
        const contribution = this.debuggersContributions.get(debugType);
        return contribution && contribution.languages || [];
    }

    async $getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        const contribution = this.debuggersContributions.get(debugType);
        return contribution && contribution.configurationAttributes || [];
    }

    async $getConfigurationSnippets(debugType: string): Promise<IJSONSchemaSnippet[]> {
        const contribution = this.debuggersContributions.get(debugType);
        return contribution && contribution.configurationSnippets || [];
    }

    async $getTerminalCreationOptions(debugType: string): Promise<TerminalOptionsExt | undefined> {
        return this.doGetTerminalCreationOptions(debugType);
    }

    async doGetTerminalCreationOptions(debugType: string): Promise<TerminalOptionsExt | undefined> {
        return undefined;
    }

    async $provideDebugConfigurations(debugType: string, workspaceFolderUri: string | undefined): Promise<theia.DebugConfiguration[]> {
        let result: theia.DebugConfiguration[] = [];

        const providers = this.configurationProviders.get(debugType);
        if (providers) {
            for (const provider of providers) {
                if (provider.provideDebugConfigurations) {
                    result = result.concat(await provider.provideDebugConfigurations(this.toWorkspaceFolder(workspaceFolderUri)) || []);
                }
            }
        }

        return result;
    }

    async $resolveDebugConfigurations(debugConfiguration: theia.DebugConfiguration, workspaceFolderUri: string | undefined): Promise<theia.DebugConfiguration | undefined> {
        let current = debugConfiguration;

        const providers = this.configurationProviders.get(debugConfiguration.type);
        if (providers) {
            for (const provider of providers) {
                if (provider.resolveDebugConfiguration) {
                    try {
                        const next = await provider.resolveDebugConfiguration(this.toWorkspaceFolder(workspaceFolderUri), current);
                        if (next) {
                            current = next;
                        } else {
                            return current;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        }

        return current;
    }

    private async getExecutable(debugConfiguration: theia.DebugConfiguration): Promise<DebugAdapterExecutable> {
        const { type } = debugConfiguration;
        const contribution = this.debuggersContributions.get(type);
        if (contribution) {
            if (contribution.adapterExecutableCommand) {
                const executable = await this.commandRegistryExt.executeCommand<DebugAdapterExecutable>(contribution.adapterExecutableCommand);
                if (executable) {
                    return executable;
                }
            } else {
                const contributionPath = this.contributionPaths.get(type);
                if (contributionPath) {
                    return resolveDebugAdapterExecutable(contributionPath, contribution);
                }
            }
        }

        throw new Error(`It is not possible to provide debug adapter executable for '${debugConfiguration.type}'.`);
    }

    private toWorkspaceFolder(folder: string | undefined): theia.WorkspaceFolder | undefined {
        if (!folder) {
            return undefined;
        }

        const uri = URI.parse(folder);
        const path = new Path(uri.path);
        return {
            uri: uri,
            name: path.base,
            index: 0
        };
    }
}
