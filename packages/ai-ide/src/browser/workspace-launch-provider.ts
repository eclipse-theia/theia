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

@injectable()
export class LaunchListProvider implements ToolProvider {

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    getTool(): ToolRequest {
        return {
            id: LIST_LAUNCH_CONFIGURATIONS_FUNCTION_ID,
            name: LIST_LAUNCH_CONFIGURATIONS_FUNCTION_ID,
            description: 'Lists available launch configurations in the workspace. Launch configurations can be filtered by name.',
            parameters: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'string',
                        description: 'Filter to apply on launch configuration names (empty string to retrieve all configurations).'
                    }
                },
                required: ['filter']
            },
            handler: async (argString: string) => {
                const filterArgs: { filter: string } = JSON.parse(argString);
                const configurations = await this.getAvailableLaunchConfigurations(filterArgs.filter);
                return JSON.stringify(configurations);
            }
        };
    }

    private async getAvailableLaunchConfigurations(filter: string = ''): Promise<string[]> {
        await this.debugConfigurationManager.load();
        const configurations: string[] = [];

        for (const options of this.debugConfigurationManager.all) {
            const name = this.getDisplayName(options);
            if (name.toLowerCase().includes(filter.toLowerCase())) {
                configurations.push(name);
            }
        }

        return configurations;
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

    getTool(): ToolRequest {
        return {
            id: RUN_LAUNCH_CONFIGURATION_FUNCTION_ID,
            name: RUN_LAUNCH_CONFIGURATION_FUNCTION_ID,
            description: 'Executes a specified launch configuration to start debugging.',
            parameters: {
                type: 'object',
                properties: {
                    configurationName: {
                        type: 'string',
                        description: 'The name of the launch configuration to execute.'
                    }
                },
                required: ['configurationName']
            },
            handler: async (argString: string, ctx?: ToolInvocationContext) => this.handleRunLaunchConfiguration(argString, ctx?.cancellationToken)
        };
    }

    private async handleRunLaunchConfiguration(argString: string, cancellationToken?: CancellationToken): Promise<string> {
        try {
            const args: { configurationName: string } = JSON.parse(argString);

            await this.debugConfigurationManager.load();

            const options = this.findConfigurationByName(args.configurationName);
            if (!options) {
                return `Did not find a launch configuration for the name: '${args.configurationName}'`;
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

    private findConfigurationByName(name: string): DebugSessionOptions | undefined {
        for (const options of this.debugConfigurationManager.all) {
            const displayName = this.getDisplayName(options);
            if (displayName === name) {
                return options;
            }
        }
        return undefined;
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

    getTool(): ToolRequest {
        return {
            id: STOP_LAUNCH_CONFIGURATION_FUNCTION_ID,
            name: STOP_LAUNCH_CONFIGURATION_FUNCTION_ID,
            description: 'Stops an active launch configuration or debug session.',
            parameters: {
                type: 'object',
                properties: {
                    configurationName: {
                        type: 'string',
                        description: 'The name of the launch configuration to stop. If not provided, stops the current active session.'
                    }
                },
                required: []
            },
            handler: async (argString: string) => this.handleStopLaunchConfiguration(argString)
        };
    }

    private async handleStopLaunchConfiguration(argString: string): Promise<string> {
        try {
            const args: { configurationName?: string } = JSON.parse(argString);

            if (args.configurationName) {
                // Find and stop specific session by configuration name
                const session = this.findSessionByConfigurationName(args.configurationName);
                if (!session) {
                    return `No active session found for launch configuration: '${args.configurationName}'`;
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

    private findSessionByConfigurationName(configurationName: string): DebugSession | undefined {
        return this.debugSessionManager.sessions.find(
            session => session.configuration.name === configurationName
        );
    }
}
