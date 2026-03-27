// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugSessionOptions } from '@theia/debug/lib/browser/debug-session-options';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import {
    LIST_LAUNCH_CONFIGURATIONS_FUNCTION_ID,
    RUN_LAUNCH_CONFIGURATION_FUNCTION_ID,
    STOP_LAUNCH_CONFIGURATION_FUNCTION_ID
} from '../common/workspace-functions';
import { WorkspaceFunctionScope } from './workspace-functions';

export interface LaunchConfigurationInfo {
    name: string;
    running: boolean;
    /** The workspace root name this configuration belongs to, if scoped to a folder */
    workspaceRoot?: string;
}

@injectable()
export class LaunchListProvider implements ToolProvider {

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    getTool(): ToolRequest {
        return {
            id: LIST_LAUNCH_CONFIGURATIONS_FUNCTION_ID,
            name: LIST_LAUNCH_CONFIGURATIONS_FUNCTION_ID,
            description: 'Lists available launch configurations in the workspace. Each result includes the configuration name, whether it is currently running, ' +
                'and optionally a "workspaceRoot" (the root name the configuration belongs to). ' +
                'Optionally provide a filter substring to narrow results by name. If omitted, all configurations are returned. ' +
                'Always call this before runLaunchConfiguration to discover exact configuration names.',
            parameters: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'string',
                        description: 'Filter to apply on launch configuration names (empty string to retrieve all configurations).'
                    }
                },
                required: []
            },
            handler: async (argString: string) => {
                const filterArgs: { filter?: string } = JSON.parse(argString);
                const configurations = await this.getAvailableLaunchConfigurations(filterArgs.filter);
                return JSON.stringify(configurations);
            }
        };
    }

    private async getAvailableLaunchConfigurations(filter: string = ''): Promise<LaunchConfigurationInfo[]> {
        await this.debugConfigurationManager.load();
        const configurations: LaunchConfigurationInfo[] = [];
        const runningSessions = new Set(
            this.debugSessionManager.sessions.map(session => session.configuration.name)
        );
        for (const options of this.debugConfigurationManager.all) {
            const name = this.getDisplayName(options);
            if (name.toLowerCase().includes(filter.toLowerCase())) {
                const entry: LaunchConfigurationInfo = {
                    name,
                    running: runningSessions.has(name)
                };
                const rootName = this.resolveRootName(options.workspaceFolderUri);
                if (rootName) {
                    entry.workspaceRoot = rootName;
                }
                configurations.push(entry);
            }
        }

        return configurations;
    }

    private resolveRootName(workspaceFolderUri: string | undefined): string | undefined {
        if (!workspaceFolderUri) {
            return undefined;
        }
        try {
            const uri = new URI(workspaceFolderUri);
            return this.workspaceScope.getRootName(uri);
        } catch {
            return undefined;
        }
    }

    private getDisplayName(options: DebugSessionOptions): string {
        if (DebugSessionOptions.isConfiguration(options)) {
            return options.configuration.name;
        } else if (DebugSessionOptions.isCompound(options)) {
            return options.compound.name;
        }
        return 'Unnamed Configuration';
    }
}

@injectable()
export class LaunchRunnerProvider implements ToolProvider {

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    getTool(): ToolRequest {
        return {
            id: RUN_LAUNCH_CONFIGURATION_FUNCTION_ID,
            name: RUN_LAUNCH_CONFIGURATION_FUNCTION_ID,
            description: 'Starts a launch configuration and returns immediately — the application continues running in the background. ' +
                'Use listLaunchConfigurations first to discover available configuration names and check whether one is already running. ' +
                'If multiple configurations share the same name, specify the workspaceRoot parameter to disambiguate. ' +
                'The response includes the debug session ID on success. If the configuration name doesn\'t match any available configuration, returns an error.',
            parameters: {
                type: 'object',
                properties: {
                    configurationName: {
                        type: 'string',
                        description: 'The name of the launch configuration to execute.'
                    },
                    workspaceRoot: {
                        type: 'string',
                        description: 'The workspace root name the configuration belongs to (as returned by listLaunchConfigurations). ' +
                            'Required when multiple configurations share the same name across different workspace roots.'
                    }
                },
                required: ['configurationName']
            },
            handler: async (argString: string, ctx?: ToolInvocationContext) => this.handleRunLaunchConfiguration(argString, ctx?.cancellationToken)
        };
    }

    private async handleRunLaunchConfiguration(argString: string, cancellationToken?: CancellationToken): Promise<string> {
        try {
            const args: { configurationName: string; workspaceRoot?: string } = JSON.parse(argString);

            await this.debugConfigurationManager.load();

            const allMatches = this.findAllConfigurationsByName(args.configurationName);

            if (allMatches.length === 0) {
                return `Did not find a launch configuration for the name: '${args.configurationName}'`;
            }

            let options: DebugSessionOptions;

            if (allMatches.length === 1) {
                options = allMatches[0];
            } else if (args.workspaceRoot) {
                const rootMapping = this.workspaceScope.getRootMapping();
                const rootUri = rootMapping.get(args.workspaceRoot);
                if (!rootUri) {
                    const availableRoots = Array.from(rootMapping.keys()).join(', ');
                    return `Unknown workspace root '${args.workspaceRoot}'. Available roots: ${availableRoots}`;
                }
                const rootUriStr = rootUri.toString();
                const filtered = allMatches.filter(opt => opt.workspaceFolderUri === rootUriStr);
                if (filtered.length === 0) {
                    return `No launch configuration '${args.configurationName}' found in workspace root '${args.workspaceRoot}'. `
                        + 'The configuration may be defined in a different root. Use listLaunchConfigurations to check.';
                }
                options = filtered[0];
            } else {
                const rootNames = allMatches.map(opt => {
                    if (opt.workspaceFolderUri) {
                        try {
                            const name = this.workspaceScope.getRootName(new URI(opt.workspaceFolderUri));
                            return name ?? '(unknown)';
                        } catch {
                            return '(unknown)';
                        }
                    }
                    return '(global)';
                });
                return `Ambiguous launch configuration name '${args.configurationName}' — found in multiple workspace roots: ${rootNames.join(', ')}. `
                    + 'Please specify the workspaceRoot parameter to disambiguate.';
            }

            const session = await this.debugSessionManager.start(options);

            if (!session) {
                return `Failed to start launch configuration '${args.configurationName}'`;
            }

            if (cancellationToken && typeof session !== 'boolean') {
                cancellationToken.onCancellationRequested(() => {
                    this.debugSessionManager.terminateSession(session);
                });
            }

            const sessionInfo = typeof session === 'boolean'
                ? `Compound launch configuration '${args.configurationName}' started successfully`
                : `Launch configuration '${args.configurationName}' started with session ID: ${session.id}`;

            return sessionInfo;

        } catch (error) {
            return JSON.stringify({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to run launch configuration'
            });
        }
    }

    private findAllConfigurationsByName(name: string): DebugSessionOptions[] {
        const results: DebugSessionOptions[] = [];
        for (const options of this.debugConfigurationManager.all) {
            const displayName = this.getDisplayName(options);
            if (displayName === name) {
                results.push(options);
            }
        }
        return results;
    }

    private getDisplayName(options: DebugSessionOptions): string {
        if (DebugSessionOptions.isConfiguration(options)) {
            return options.configuration.name;
        } else if (DebugSessionOptions.isCompound(options)) {
            return options.compound.name;
        }
        return 'Unnamed Configuration';
    }
}

@injectable()
export class LaunchStopProvider implements ToolProvider {

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    getTool(): ToolRequest {
        return {
            id: STOP_LAUNCH_CONFIGURATION_FUNCTION_ID,
            name: STOP_LAUNCH_CONFIGURATION_FUNCTION_ID,
            description: 'Stops an active launch configuration or debug session. If a configuration name is provided, stops the session matching that name. ' +
                'If no name is provided, stops the currently active session. ' +
                'If multiple sessions share the same configuration name, specify the workspaceRoot parameter to disambiguate. ' +
                'Returns an error if no matching active session is found.',
            parameters: {
                type: 'object',
                properties: {
                    configurationName: {
                        type: 'string',
                        description: 'The name of the launch configuration to stop. If not provided, stops the current active session.'
                    },
                    workspaceRoot: {
                        type: 'string',
                        description: 'The workspace root name to disambiguate when multiple sessions share the same configuration name.'
                    }
                },
                required: []
            },
            handler: async (argString: string) => this.handleStopLaunchConfiguration(argString)
        };
    }

    private async handleStopLaunchConfiguration(argString: string): Promise<string> {
        try {
            const args: { configurationName?: string; workspaceRoot?: string } = JSON.parse(argString);

            if (args.configurationName) {
                const matchingSessions = this.findSessionsByConfigurationName(args.configurationName);

                if (matchingSessions.length === 0) {
                    return `No active session found for launch configuration: '${args.configurationName}'`;
                }

                let session: DebugSession;

                if (matchingSessions.length === 1) {
                    session = matchingSessions[0];
                } else if (args.workspaceRoot) {
                    const rootMapping = this.workspaceScope.getRootMapping();
                    const rootUri = rootMapping.get(args.workspaceRoot);
                    if (!rootUri) {
                        const availableRoots = Array.from(rootMapping.keys()).join(', ');
                        return `Unknown workspace root '${args.workspaceRoot}'. Available roots: ${availableRoots}`;
                    }
                    const rootUriStr = rootUri.toString();
                    const filtered = matchingSessions.filter(s => s.options.workspaceFolderUri === rootUriStr);
                    if (filtered.length === 0) {
                        return `No active session for '${args.configurationName}' in workspace root '${args.workspaceRoot}'.`;
                    }
                    session = filtered[0];
                } else {
                    const rootNames = matchingSessions.map(s => {
                        if (s.options.workspaceFolderUri) {
                            try {
                                const name = this.workspaceScope.getRootName(new URI(s.options.workspaceFolderUri));
                                return name ?? '(unknown)';
                            } catch {
                                return '(unknown)';
                            }
                        }
                        return '(global)';
                    });
                    return `Ambiguous: multiple active sessions for '${args.configurationName}' in workspace roots: ${rootNames.join(', ')}. `
                        + 'Please specify the workspaceRoot parameter to disambiguate.';
                }

                await this.debugSessionManager.terminateSession(session);
                return `Successfully stopped launch configuration: '${args.configurationName}'`;
            } else {
                // Stop current active session
                const currentSession = this.debugSessionManager.currentSession;
                if (!currentSession) {
                    return 'No active debug session to stop';
                }

                await this.debugSessionManager.terminateSession(currentSession);
                return `Successfully stopped current debug session: '${currentSession.configuration.name}'`;
            }

        } catch (error) {
            return JSON.stringify({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to stop launch configuration'
            });
        }
    }

    private findSessionsByConfigurationName(configurationName: string): DebugSession[] {
        return this.debugSessionManager.sessions.filter(
            session => session.configuration.name === configurationName
        );
    }
}
