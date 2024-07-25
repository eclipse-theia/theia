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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { Path } from '@theia/core/lib/common/path';
import * as theia from '@theia/plugin';
import { URI } from '@theia/core/shared/vscode-uri';
import { Breakpoint, DebugStackFrameDTO, DebugThreadDTO } from '../../common/plugin-api-rpc-model';
import { DebugConfigurationProviderTriggerKind, DebugExt, DebugMain, PLUGIN_RPC_CONTEXT as Ext, TerminalOptionsExt } from '../../common/plugin-api-rpc';
import { PluginPackageDebuggersContribution } from '../../common/plugin-protocol';
import { RPCProtocol } from '../../common/rpc-protocol';
import { CommandRegistryImpl } from '../command-registry';
import { ConnectionImpl } from '../../common/connection';
import { DEBUG_SCHEME, SCHEME_PATTERN } from '@theia/debug/lib/common/debug-uri-utils';
import { Disposable, Breakpoint as BreakpointExt, SourceBreakpoint, FunctionBreakpoint, Location, Range, URI as URIImpl, DebugStackFrame, DebugThread } from '../types-impl';
import { PluginDebugAdapterSession } from './plugin-debug-adapter-session';
import { PluginDebugAdapterTracker } from './plugin-debug-adapter-tracker';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { DebugAdapter } from '@theia/debug/lib/common/debug-model';
import { PluginDebugAdapterCreator } from './plugin-debug-adapter-creator';
import { NodeDebugAdapterCreator } from '../node/debug/plugin-node-debug-adapter-creator';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugConfiguration, DebugSessionOptions } from '@theia/debug/lib/common/debug-configuration';
import { checkTestRunInstance } from '../tests';

interface ConfigurationProviderRecord {
    handle: number;
    type: string;
    trigger: DebugConfigurationProviderTriggerKind,
    provider: theia.DebugConfigurationProvider;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

@injectable()
export class DebugExtImpl implements DebugExt {
    @inject(RPCProtocol)
    protected readonly rpc: RPCProtocol;

    // debug sessions by sessionId
    private sessions = new Map<string, PluginDebugAdapterSession>();
    private configurationProviderHandleGenerator: number;
    private configurationProviders: ConfigurationProviderRecord[];

    /**
     * Only use internally, don't send it to the frontend. It's expensive!
     * It's already there as a part of the plugin metadata.
     */
    private debuggersContributions = new Map<string, PluginPackageDebuggersContribution>();
    private descriptorFactories = new Map<string, theia.DebugAdapterDescriptorFactory>();
    private trackerFactories: [string, theia.DebugAdapterTrackerFactory][] = [];
    private contributionPaths = new Map<string, string>();
    private contributionTypes = new Map<string, theia.PluginType>();

    private connectionExt: ConnectionImpl;
    private commandRegistryExt: CommandRegistryImpl;

    private proxy: DebugMain;

    private readonly onDidChangeBreakpointsEmitter = new Emitter<theia.BreakpointsChangeEvent>();
    private readonly onDidChangeActiveDebugSessionEmitter = new Emitter<theia.DebugSession | undefined>();
    private readonly onDidTerminateDebugSessionEmitter = new Emitter<theia.DebugSession>();
    private readonly onDidCreateDebugSessionEmitter = new Emitter<theia.DebugSession>();
    private readonly onDidStartDebugSessionEmitter = new Emitter<theia.DebugSession>();
    private readonly onDidReceiveDebugSessionCustomEmitter = new Emitter<theia.DebugSessionCustomEvent>();

    activeDebugSession: theia.DebugSession | undefined;
    activeDebugConsole: theia.DebugConsole;

    _activeStackItem: theia.DebugStackFrame | theia.DebugThread | undefined;
    private readonly onDidChangeActiveStackItemEmitter = new Emitter<theia.DebugStackFrame | theia.DebugThread | undefined>();

    private readonly _breakpoints = new Map<string, theia.Breakpoint>();

    private frontendAdapterCreator = new PluginDebugAdapterCreator();
    private backendAdapterCreator = new NodeDebugAdapterCreator();

    get breakpoints(): theia.Breakpoint[] {
        return [...this._breakpoints.values()];
    }

    constructor() {
        this.activeDebugConsole = {
            append: (value: string) => this.proxy.$appendToDebugConsole(value),
            appendLine: (value: string) => this.proxy.$appendLineToDebugConsole(value)
        };
        this.configurationProviderHandleGenerator = 0;
        this.configurationProviders = [];
    }

    @postConstruct()
    initialize(): void {
        this.proxy = this.rpc.getProxy(Ext.DEBUG_MAIN);
    }

    /**
     * Sets dependencies.
     */
    assistedInject(connectionExt: ConnectionImpl, commandRegistryExt: CommandRegistryImpl): void {
        this.connectionExt = connectionExt;
        this.commandRegistryExt = commandRegistryExt;
    }

    /**
     * Registers contributions.
     * @param pluginFolder plugin folder path
     * @param pluginType plugin type
     * @param contributions available debuggers contributions
     */
    registerDebuggersContributions(pluginFolder: string, pluginType: theia.PluginType, contributions: PluginPackageDebuggersContribution[]): void {
        contributions.forEach(contribution => {
            this.contributionPaths.set(contribution.type, pluginFolder);
            this.contributionTypes.set(contribution.type, pluginType);
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

    get onDidCreateDebugSession(): theia.Event<theia.DebugSession> {
        return this.onDidCreateDebugSessionEmitter.event;
    }

    get onDidStartDebugSession(): theia.Event<theia.DebugSession> {
        return this.onDidStartDebugSessionEmitter.event;
    }

    get onDidChangeActiveStackItem(): theia.Event<theia.DebugStackFrame | theia.DebugThread | undefined> {
        return this.onDidChangeActiveStackItemEmitter.event;
    }

    get onDidChangeBreakpoints(): theia.Event<theia.BreakpointsChangeEvent> {
        return this.onDidChangeBreakpointsEmitter.event;
    }

    addBreakpoints(breakpoints: readonly theia.Breakpoint[]): void {
        const added: theia.Breakpoint[] = [];
        for (const b of breakpoints) {
            if (this._breakpoints.has(b.id)) {
                continue;
            }
            this._breakpoints.set(b.id, b);
            added.push(b);
        }
        if (added.length) {
            this.onDidChangeBreakpointsEmitter.fire({ added, removed: [], changed: [] });
            this.proxy.$addBreakpoints(added);
        }
    }

    removeBreakpoints(breakpoints: readonly theia.Breakpoint[]): void {
        const removed: theia.Breakpoint[] = [];
        const removedIds: string[] = [];
        for (const b of breakpoints) {
            if (!this._breakpoints.has(b.id)) {
                continue;
            }
            this._breakpoints.delete(b.id);
            removed.push(b);
            removedIds.push(b.id);
        }
        if (removed.length) {
            this.onDidChangeBreakpointsEmitter.fire({ added: [], removed, changed: [] });
            this.proxy.$removeBreakpoints(removedIds);
        }
    }

    startDebugging(folder: theia.WorkspaceFolder | undefined, nameOrConfiguration: string | theia.DebugConfiguration, options: theia.DebugSessionOptions): PromiseLike<boolean> {
        const optionsDto: DebugSessionOptions = {
            parentSessionId: options.parentSession?.id,
            compact: options.compact,
            consoleMode: options.consoleMode,
            suppressSaveBeforeStart: options.suppressSaveBeforeStart,
            suppressDebugStatusbar: options.suppressDebugStatusbar,
            suppressDebugView: options.suppressDebugView,
            lifecycleManagedByParent: options.lifecycleManagedByParent,
            noDebug: options.noDebug,
        };
        if (options.testRun) {
            const run = checkTestRunInstance(options.testRun);
            optionsDto.testRun = {
                controllerId: run.controller.id,
                runId: run.id
            };
        }
        return this.proxy.$startDebugging(folder, nameOrConfiguration, optionsDto);
    }

    stopDebugging(session?: theia.DebugSession): PromiseLike<void> {
        return this.proxy.$stopDebugging(session?.id);
    }

    asDebugSourceUri(source: theia.DebugProtocolSource, session?: theia.DebugSession): theia.Uri {
        return this.getDebugSourceUri(source, session?.id);
    }

    private getDebugSourceUri(raw: DebugProtocol.Source, sessionId?: string): theia.Uri {
        if (raw.sourceReference && raw.sourceReference > 0) {
            let query = 'ref=' + String(raw.sourceReference);
            if (sessionId) {
                query += `&session=${sessionId}`;
            }
            return URIImpl.from({ scheme: DEBUG_SCHEME, path: raw.path ?? '', query });
        }
        if (!raw.path) {
            throw new Error('Unrecognized source type: ' + JSON.stringify(raw));
        }
        if (raw.path.match(SCHEME_PATTERN)) {
            return URIImpl.parse(raw.path);
        }
        return URIImpl.file(raw.path);
    }

    registerDebugAdapterDescriptorFactory(debugType: string, factory: theia.DebugAdapterDescriptorFactory): Disposable {
        if (this.descriptorFactories.has(debugType)) {
            throw new Error(`Descriptor factory for ${debugType} has been already registered`);
        }
        this.descriptorFactories.set(debugType, factory);
        return Disposable.create(() => this.descriptorFactories.delete(debugType));
    }

    registerDebugAdapterTrackerFactory(debugType: string, factory: theia.DebugAdapterTrackerFactory): Disposable {
        if (!factory) {
            return Disposable.create(() => { });
        }

        this.trackerFactories.push([debugType, factory]);
        return Disposable.create(() => {
            this.trackerFactories = this.trackerFactories.filter(tuple => tuple[1] !== factory);
        });
    }

    registerDebugConfigurationProvider(debugType: string, provider: theia.DebugConfigurationProvider, trigger: DebugConfigurationProviderTriggerKind): Disposable {
        console.log(`Debug configuration provider has been registered: ${debugType}, trigger: ${trigger}`);

        const handle = this.configurationProviderHandleGenerator++;
        this.configurationProviders.push({ handle, type: debugType, trigger, provider });
        const descriptor = {
            handle,
            type: debugType,
            trigger,
            provideDebugConfiguration: !!provider.provideDebugConfigurations,
            resolveDebugConfigurations: !!provider.resolveDebugConfiguration,
            resolveDebugConfigurationWithSubstitutedVariables: !!provider.resolveDebugConfigurationWithSubstitutedVariables
        };
        this.proxy.$registerDebugConfigurationProvider(descriptor);
        return Disposable.create(() => {
            this.configurationProviders = this.configurationProviders.filter(p => (p.handle !== handle));
            this.proxy.$unregisterDebugConfigurationProvider(handle);
        });
    }

    set activeStackItem(stackItem: theia.DebugStackFrame | theia.DebugThread | undefined) {
        if (this._activeStackItem === stackItem) {
            return;
        }
        this._activeStackItem = stackItem;
        this.onDidChangeActiveStackItemEmitter.fire(this.activeStackItem);
    }

    get activeStackItem(): theia.DebugStackFrame | theia.DebugThread | undefined {
        return this._activeStackItem;
    }

    async $onDidChangeActiveThread(debugThread: DebugThreadDTO | undefined): Promise<void> {
        if (!debugThread) {
            this.activeStackItem = undefined;
            return;
        }
        const session = this.sessions.get(debugThread.sessionId);
        if (session) {
            this.activeStackItem = new DebugThread(session, debugThread.threadId);
        }
    }

    async $onDidChangeActiveFrame(debugFrame: DebugStackFrameDTO | undefined): Promise<void> {
        if (!debugFrame) {
            this.activeStackItem = undefined;
            return;
        }
        const session = this.sessions.get(debugFrame!.sessionId);
        if (session) {
            this.activeStackItem = new DebugStackFrame(session, debugFrame.threadId, debugFrame.frameId);
        }
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
            this.onDidCreateDebugSessionEmitter.fire(session);
        }
    }

    async $sessionDidStart(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.onDidStartDebugSessionEmitter.fire(session);
        }
    }

    async $sessionDidDestroy(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.onDidTerminateDebugSessionEmitter.fire(session);
            this.sessions.delete(sessionId);
        }
    }

    async $sessionDidChange(sessionId: string | undefined): Promise<void> {
        this.activeDebugSession = sessionId ? this.sessions.get(sessionId) : undefined;
        this.onDidChangeActiveDebugSessionEmitter.fire(this.activeDebugSession);
    }

    async $breakpointsDidChange(added: Breakpoint[], removed: string[], changed: Breakpoint[]): Promise<void> {
        const a: theia.Breakpoint[] = [];
        const r: theia.Breakpoint[] = [];
        const c: theia.Breakpoint[] = [];
        for (const b of added) {
            if (this._breakpoints.has(b.id)) {
                continue;
            }
            const bExt = this.toBreakpointExt(b);
            if (bExt) {
                this._breakpoints.set(bExt.id, bExt);
                a.push(bExt);
            }
        }
        for (const id of removed) {
            const bExt = this._breakpoints.get(id);
            if (bExt) {
                this._breakpoints.delete(id);
                r.push(bExt);
            }
        }
        for (const b of changed) {
            const bExt = this._breakpoints.get(b.id);
            if (bExt) {
                const { functionName, location, enabled, condition, hitCondition, logMessage } = b;
                if (bExt instanceof FunctionBreakpoint && functionName) {
                    Object.assign(bExt, { enabled, condition, hitCondition, logMessage, functionName });
                } else if (bExt instanceof SourceBreakpoint && location) {
                    const range = new Range(location.range.startLineNumber, location.range.startColumn, location.range.endLineNumber, location.range.endColumn);
                    Object.assign(bExt, { enabled, condition, hitCondition, logMessage, location: new Location(URI.revive(location.uri), range) });
                }
                c.push(bExt);
            }
        }
        this.onDidChangeBreakpointsEmitter.fire({ added: a, removed: r, changed: c });
    }

    protected toBreakpointExt({ functionName, location, enabled, condition, hitCondition, logMessage, id }: Breakpoint): BreakpointExt | undefined {
        if (location) {
            const range = new Range(location.range.startLineNumber, location.range.startColumn, location.range.endLineNumber, location.range.endColumn);
            return new SourceBreakpoint(new Location(URI.revive(location.uri), range), enabled, condition, hitCondition, logMessage, id);
        }
        if (functionName) {
            return new FunctionBreakpoint(functionName!, enabled, condition, hitCondition, logMessage, id);
        }
        return undefined;
    }

    async $createDebugSession(debugConfiguration: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<string> {
        const sessionId = generateUuid();

        const parentSession = debugConfiguration.parentSessionId ? this.sessions.get(debugConfiguration.parentSessionId) : undefined;
        const theiaSession: theia.DebugSession = {
            id: sessionId,
            type: debugConfiguration.type,
            name: debugConfiguration.name,
            parentSession: parentSession,
            workspaceFolder: this.toWorkspaceFolder(workspaceFolderUri),
            configuration: debugConfiguration,
            customRequest: async (command: string, args?: any) => {
                const response = await this.proxy.$customRequest(sessionId, command, args);
                if (response && response.success) {
                    return response.body;
                }
                return Promise.reject(new Error(response.message ?? 'custom request failed'));
            },
            getDebugProtocolBreakpoint: async (breakpoint: Breakpoint) =>
                this.proxy.$getDebugProtocolBreakpoint(sessionId, breakpoint.id)
        };

        const tracker = await this.createDebugAdapterTracker(theiaSession);
        const communicationProvider = await this.createDebugAdapter(theiaSession, debugConfiguration);

        const debugAdapterSession = new PluginDebugAdapterSession(communicationProvider, tracker, theiaSession);
        this.sessions.set(sessionId, debugAdapterSession);

        const connection = await this.connectionExt!.ensureConnection(sessionId);
        debugAdapterSession.start(connection);

        return sessionId;
    }

    async $terminateDebugSession(sessionId: string): Promise<void> {
        const debugAdapterSession = this.sessions.get(sessionId);
        if (debugAdapterSession) {
            await debugAdapterSession.stop();
        }
    }

    async $getTerminalCreationOptions(debugType: string): Promise<TerminalOptionsExt | undefined> {
        return this.doGetTerminalCreationOptions(debugType);
    }

    async doGetTerminalCreationOptions(debugType: string): Promise<TerminalOptionsExt | undefined> {
        return undefined;
    }

    private getConfigurationProviderRecord(handle: number): {
        provider: theia.DebugConfigurationProvider
        type: string
    } {
        const record = this.configurationProviders.find(p => p.handle === handle);
        if (!record) {
            throw new Error('No Debug configuration provider found with given handle number: ' + handle);
        }
        const { provider, type } = record;
        return { provider, type };
    }

    async $provideDebugConfigurationsByHandle(
        handle: number,
        workspaceFolderUri: string | undefined
    ): Promise<theia.DebugConfiguration[]> {
        const { provider, type } = this.getConfigurationProviderRecord(handle);

        const configurations = await provider.provideDebugConfigurations?.(
            this.toWorkspaceFolder(workspaceFolderUri)
        );

        if (!configurations) {
            throw new Error(
                'nothing returned from DebugConfigurationProvider.provideDebugConfigurations, type: ' + type
            );
        }

        return configurations;
    }

    async $resolveDebugConfigurationByHandle(
        handle: number,
        workspaceFolderUri: string | undefined,
        debugConfiguration: theia.DebugConfiguration
    ): Promise<theia.DebugConfiguration | undefined | null> {
        const { provider } = this.getConfigurationProviderRecord(handle);
        return provider.resolveDebugConfiguration?.(
            this.toWorkspaceFolder(workspaceFolderUri),
            debugConfiguration
        );
    }

    async $resolveDebugConfigurationWithSubstitutedVariablesByHandle(
        handle: number,
        workspaceFolderUri: string | undefined,
        debugConfiguration: theia.DebugConfiguration
    ): Promise<theia.DebugConfiguration | undefined | null> {
        const { provider } = this.getConfigurationProviderRecord(handle);
        return provider.resolveDebugConfigurationWithSubstitutedVariables?.(
            this.toWorkspaceFolder(workspaceFolderUri),
            debugConfiguration
        );
    }

    protected async createDebugAdapterTracker(session: theia.DebugSession): Promise<theia.DebugAdapterTracker> {
        return PluginDebugAdapterTracker.create(session, this.trackerFactories);
    }

    protected async createDebugAdapter(session: theia.DebugSession, debugConfiguration: theia.DebugConfiguration): Promise<DebugAdapter> {
        const executable = await this.resolveDebugAdapterExecutable(debugConfiguration);
        const descriptorFactory = this.descriptorFactories.get(session.type);
        return this.getAdapterCreator(debugConfiguration).createDebugAdapter(session, debugConfiguration, executable, descriptorFactory);
    }

    protected async resolveDebugAdapterExecutable(debugConfiguration: theia.DebugConfiguration): Promise<theia.DebugAdapterExecutable | undefined> {
        const { type } = debugConfiguration;
        const contribution = this.debuggersContributions.get(type);
        if (contribution) {
            if (contribution.adapterExecutableCommand) {
                const executable = await this.commandRegistryExt.executeCommand<theia.DebugAdapterExecutable>(contribution.adapterExecutableCommand);
                if (executable) {
                    return executable;
                }
            } else {
                const contributionPath = this.contributionPaths.get(type);
                if (contributionPath) {
                    return this.getAdapterCreator(debugConfiguration).resolveDebugAdapterExecutable(contributionPath, contribution);
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

    private getAdapterCreator(debugConfiguration: theia.DebugConfiguration): PluginDebugAdapterCreator {
        const pluginType = this.contributionTypes.get(debugConfiguration.type);
        return pluginType === 'frontend' ? this.frontendAdapterCreator : this.backendAdapterCreator;
    }
}
