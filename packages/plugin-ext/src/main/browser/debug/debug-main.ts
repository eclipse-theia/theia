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

// tslint:disable:no-any

import { interfaces } from 'inversify';
import { RPCProtocol } from '../../../api/rpc-protocol';
import {
    DebugMain,
    DebugExt,
    MAIN_RPC_CONTEXT
} from '../../../api/plugin-api';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { Breakpoint, WorkspaceFolder } from '../../../api/model';
import { LabelProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { BreakpointManager } from '@theia/debug/lib/browser/breakpoint/breakpoint-manager';
import { DebugBreakpoint } from '@theia/debug/lib/browser/model/debug-breakpoint';
import Uri from 'vscode-uri';
import { DebugConsoleSession } from '@theia/debug/lib/browser/console/debug-console-session';
import { SourceBreakpoint } from '@theia/debug/lib/browser/breakpoint/breakpoint-marker';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { ConnectionMainImpl } from '../connection-main';
import { DebuggerDescription } from '@theia/debug/lib/common/debug-service';
import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { MessageClient } from '@theia/core/lib/common/message-service-protocol';
import { OutputChannelManager } from '@theia/output/lib/common/output-channel';
import { DebugPreferences } from '@theia/debug/lib/browser/debug-preferences';
import { PluginDebugAdapterContribution } from './plugin-debug-adapter-contribution';
import { PluginDebugSessionContributionRegistrator, PluginDebugSessionContributionRegistry } from './plugin-debug-session-contribution-registry';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { PluginDebugSessionFactory } from './plugin-debug-session-factory';
import { PluginWebSocketChannel } from '../../../common/connection';
import { PluginDebugAdapterContributionRegistrator, PluginDebugService } from './plugin-debug-service';
import { DebugSchemaUpdater } from '@theia/debug/lib/browser/debug-schema-updater';
import { FileSystem } from '@theia/filesystem/lib/common';

export class DebugMainImpl implements DebugMain {
    private readonly debugExt: DebugExt;

    private readonly sessionManager: DebugSessionManager;
    private readonly labelProvider: LabelProvider;
    private readonly editorManager: EditorManager;
    private readonly breakpointsManager: BreakpointManager;
    private readonly debugConsoleSession: DebugConsoleSession;
    private readonly configurationManager: DebugConfigurationManager;
    private readonly terminalService: TerminalService;
    private readonly messages: MessageClient;
    private readonly outputChannelManager: OutputChannelManager;
    private readonly debugPreferences: DebugPreferences;
    private readonly sessionContributionRegistrator: PluginDebugSessionContributionRegistrator;
    private readonly adapterContributionRegistrator: PluginDebugAdapterContributionRegistrator;
    private readonly debugSchemaUpdater: DebugSchemaUpdater;
    private readonly fileSystem: FileSystem;

    private readonly toDispose = new Map<string, DisposableCollection>();

    constructor(rpc: RPCProtocol, readonly connectionMain: ConnectionMainImpl, container: interfaces.Container) {
        this.debugExt = rpc.getProxy(MAIN_RPC_CONTEXT.DEBUG_EXT);
        this.sessionManager = container.get(DebugSessionManager);
        this.labelProvider = container.get(LabelProvider);
        this.editorManager = container.get(EditorManager);
        this.breakpointsManager = container.get(BreakpointManager);
        this.debugConsoleSession = container.get(DebugConsoleSession);
        this.configurationManager = container.get(DebugConfigurationManager);
        this.terminalService = container.get(TerminalService);
        this.messages = container.get(MessageClient);
        this.outputChannelManager = container.get(OutputChannelManager);
        this.debugPreferences = container.get(DebugPreferences);
        this.adapterContributionRegistrator = container.get(PluginDebugService);
        this.sessionContributionRegistrator = container.get(PluginDebugSessionContributionRegistry);
        this.debugSchemaUpdater = container.get(DebugSchemaUpdater);
        this.fileSystem = container.get(FileSystem);

        this.breakpointsManager.onDidChangeBreakpoints(({ added, removed, changed }) => {
            // TODO can we get rid of all to reduce amount of data set each time, should not it be possible to recover on another side from deltas?
            const all = this.breakpointsManager.getBreakpoints();
            this.debugExt.$breakpointsDidChange(
                this.toTheiaPluginApiBreakpoints(all),
                this.toTheiaPluginApiBreakpoints(added),
                this.toTheiaPluginApiBreakpoints(removed),
                this.toTheiaPluginApiBreakpoints(changed)
            );
        });

        this.sessionManager.onDidCreateDebugSession(debugSession => this.debugExt.$sessionDidCreate(debugSession.id));
        this.sessionManager.onDidDestroyDebugSession(debugSession => this.debugExt.$sessionDidDestroy(debugSession.id));
        this.sessionManager.onDidChangeActiveDebugSession(event => this.debugExt.$sessionDidChange(event.current && event.current.id));
        this.sessionManager.onDidReceiveDebugSessionCustomEvent(event => this.debugExt.$onSessionCustomEvent(event.session.id, event.event, event.body));
    }

    async $appendToDebugConsole(value: string): Promise<void> {
        this.debugConsoleSession.append(value);
    }

    async $appendLineToDebugConsole(value: string): Promise<void> {
        this.debugConsoleSession.appendLine(value);
    }

    async $registerDebuggerContribution(description: DebuggerDescription): Promise<void> {
        const disposable = new DisposableCollection();
        this.toDispose.set(description.type, disposable);
        const terminalOptionsExt = await this.debugExt.$getTerminalCreationOptions(description.type);

        const debugSessionFactory = new PluginDebugSessionFactory(
            this.terminalService,
            this.editorManager,
            this.breakpointsManager,
            this.labelProvider,
            this.messages,
            this.outputChannelManager,
            this.debugPreferences,
            async (sessionId: string) => {
                const connection = await this.connectionMain.ensureConnection(sessionId);
                return new PluginWebSocketChannel(connection);
            },
            this.fileSystem,
            terminalOptionsExt
        );

        disposable.pushAll([
            this.adapterContributionRegistrator.registerDebugAdapterContribution(
                new PluginDebugAdapterContribution(description, this.debugExt)
            ),
            this.sessionContributionRegistrator.registerDebugSessionContribution({
                debugType: description.type,
                debugSessionFactory: () => debugSessionFactory
            })
        ]);

        this.debugSchemaUpdater.update();
    }

    async $unregisterDebuggerConfiguration(debugType: string): Promise<void> {
        const disposable = this.toDispose.get(debugType);
        if (disposable) {
            disposable.dispose();
            this.toDispose.delete(debugType);
            this.debugSchemaUpdater.update();
        }
    }

    async $addBreakpoints(breakpoints: Breakpoint[]): Promise<void> {
        const newBreakpoints = new Map<string, Breakpoint>();
        breakpoints.forEach(b => newBreakpoints.set(b.id, b));
        this.breakpointsManager.findMarkers({
            dataFilter: data => {
                // install only new breakpoints
                if (newBreakpoints.has(data.id)) {
                    newBreakpoints.delete(data.id);
                }
                return false;
            }
        });
        for (const breakpoint of newBreakpoints.values()) {
            if (breakpoint.location) {
                const location = breakpoint.location;
                this.breakpointsManager.addBreakpoint({
                    id: breakpoint.id,
                    uri: Uri.revive(location.uri).toString(),
                    enabled: true,
                    raw: {
                        line: breakpoint.location.range.startLineNumber + 1,
                        column: 1,
                        condition: breakpoint.condition,
                        hitCondition: breakpoint.hitCondition,
                        logMessage: breakpoint.logMessage
                    }
                });
            }
        }
    }

    async $removeBreakpoints(breakpoints: Breakpoint[]): Promise<void> {
        const ids = new Set<string>();
        breakpoints.forEach(b => ids.add(b.id));
        for (const origin of this.breakpointsManager.findMarkers({ dataFilter: data => ids.has(data.id) })) {
            const breakpoint = new DebugBreakpoint(origin.data, this.labelProvider, this.breakpointsManager, this.editorManager, this.sessionManager.currentSession);
            breakpoint.remove();
        }
    }

    async $customRequest(sessionId: string, command: string, args?: any): Promise<DebugProtocol.Response> {
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
            return session.sendCustomRequest(command, args);
        }

        throw new Error(`Debug session '${sessionId}' not found`);
    }

    async $startDebugging(folder: WorkspaceFolder | undefined, nameOrConfiguration: string | DebugConfiguration): Promise<boolean> {
        let configuration: DebugConfiguration | undefined;

        if (typeof nameOrConfiguration === 'string') {
            for (const options of this.configurationManager.all) {
                if (options.configuration.name === nameOrConfiguration) {
                    configuration = options.configuration;
                }
            }
        } else {
            configuration = nameOrConfiguration;
        }

        if (!configuration) {
            console.error(`There is no debug configuration for ${nameOrConfiguration}`);
            return false;
        }

        const session = await this.sessionManager.start({
            configuration,
            workspaceFolderUri: folder && Uri.revive(folder.uri).toString()
        });

        return !!session;
    }

    private toTheiaPluginApiBreakpoints(sourceBreakpoints: SourceBreakpoint[]): Breakpoint[] {
        return sourceBreakpoints.map(b => ({
            id: b.id,
            enabled: b.enabled,
            condition: b.raw.condition,
            hitCondition: b.raw.hitCondition,
            logMessage: b.raw.logMessage,
            location: {
                uri: Uri.parse(b.uri),
                range: {
                    startLineNumber: b.raw.line - 1,
                    startColumn: (b.raw.column || 1) - 1,
                    endLineNumber: b.raw.line - 1,
                    endColumn: (b.raw.column || 1) - 1
                }
            }
        }));
    }
}
