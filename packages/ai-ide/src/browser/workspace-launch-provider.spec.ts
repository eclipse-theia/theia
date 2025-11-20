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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import {
    LaunchListProvider,
    LaunchRunnerProvider,
    LaunchStopProvider,
} from './workspace-launch-provider';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugSessionOptions } from '@theia/debug/lib/browser/debug-session-options';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-common';
import { DebugCompound } from '@theia/debug/lib/common/debug-compound';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';

disableJSDOM();

describe('Launch Management Tool Providers', () => {
    let container: Container;
    let launchListProvider: LaunchListProvider;
    let launchRunnerProvider: LaunchRunnerProvider;
    let launchStopProvider: LaunchStopProvider;
    let mockDebugConfigurationManager: Partial<DebugConfigurationManager>;
    let mockDebugSessionManager: Partial<DebugSessionManager>;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();

        const mockConfigs = createMockConfigurations();

        mockDebugConfigurationManager = {
            load: () => Promise.resolve(),
            get all(): IterableIterator<DebugSessionOptions> {
                function* configIterator(): IterableIterator<DebugSessionOptions> {
                    for (const config of mockConfigs) {
                        yield config;
                    }
                }
                return configIterator();
            },
        };

        mockDebugSessionManager = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            start: async (options: DebugSessionOptions | string): Promise<any> => {
                if (
                    typeof options === 'string' ||
                    DebugSessionOptions.isCompound(options)
                ) {
                    return true;
                }
                return {
                    id: 'test-session-id',
                    configuration: { name: 'Test Config' },
                } as DebugSession;
            },
            terminateSession: () => Promise.resolve(),
            currentSession: undefined,
            sessions: [],
        };

        container
            .bind(DebugConfigurationManager)
            .toConstantValue(
                mockDebugConfigurationManager as DebugConfigurationManager
            );
        container
            .bind(DebugSessionManager)
            .toConstantValue(mockDebugSessionManager as DebugSessionManager);

        launchListProvider = container.resolve(LaunchListProvider);
        launchRunnerProvider = container.resolve(LaunchRunnerProvider);
        launchStopProvider = container.resolve(LaunchStopProvider);
    });

    function createMockConfigurations(): DebugSessionOptions[] {
        const config1: DebugConfiguration = {
            name: 'Node.js Debug',
            type: 'node',
            request: 'launch',
            program: '${workspaceFolder}/app.js',
        };

        const config2: DebugConfiguration = {
            name: 'Python Debug',
            type: 'python',
            request: 'launch',
            program: '${workspaceFolder}/main.py',
        };

        const compound: DebugCompound = {
            name: 'Launch All',
            configurations: ['Node.js Debug', 'Python Debug'],
        };

        return [
            {
                name: 'Node.js Debug',
                configuration: config1,
                workspaceFolderUri: '/workspace',
            },
            {
                name: 'Python Debug',
                configuration: config2,
                workspaceFolderUri: '/workspace',
            },
            { name: 'Launch All', compound, workspaceFolderUri: '/workspace' },
        ];
    }

    describe('LaunchListProvider', () => {
        it('should provide the correct tool metadata', () => {
            const tool = launchListProvider.getTool();
            expect(tool.id).to.equal('listLaunchConfigurations');
            expect(tool.name).to.equal('listLaunchConfigurations');
            expect(tool.description).to.contain(
                'Lists available launch configurations'
            );
            expect(tool.parameters.required).to.deep.equal(['filter']);
        });

        it('should list all configurations without filter', async () => {
            const tool = launchListProvider.getTool();
            const result = await tool.handler('{"filter":""}');
            expect(result).to.be.a('string');
            const configurations = JSON.parse(result as string);

            expect(configurations).to.be.an('array');
            expect(configurations).to.have.lengthOf(3);
            expect(configurations).to.include('Node.js Debug');
            expect(configurations).to.include('Python Debug');
            expect(configurations).to.include('Launch All');
        });

        it('should filter configurations by name', async () => {
            const tool = launchListProvider.getTool();
            const result = await tool.handler('{"filter":"Node"}');
            expect(result).to.be.a('string');
            const configurations = JSON.parse(result as string);

            expect(configurations).to.be.an('array');
            expect(configurations).to.have.lengthOf(1);
            expect(configurations).to.include('Node.js Debug');
        });

        it('should handle case-insensitive filtering', async () => {
            const tool = launchListProvider.getTool();
            const result = await tool.handler('{"filter":"python"}');
            expect(result).to.be.a('string');
            const configurations = JSON.parse(result as string);

            expect(configurations).to.be.an('array');
            expect(configurations).to.have.lengthOf(1);
            expect(configurations).to.include('Python Debug');
        });
    });

    describe('LaunchRunnerProvider', () => {
        it('should provide the correct tool metadata', () => {
            const tool = launchRunnerProvider.getTool();
            expect(tool.id).to.equal('runLaunchConfiguration');
            expect(tool.name).to.equal('runLaunchConfiguration');
            expect(tool.description).to.contain(
                'Executes a specified launch configuration'
            );
            expect(tool.parameters.required).to.deep.equal([
                'configurationName',
            ]);
        });

        it('should start a valid configuration', async () => {
            const tool = launchRunnerProvider.getTool();
            const result = await tool.handler(
                '{"configurationName":"Node.js Debug"}'
            );

            expect(result).to.be.a('string');
            expect(result).to.contain('Node.js Debug');
            expect(result).to.contain('started with session ID');
        });

        it('should handle unknown configuration', async () => {
            const tool = launchRunnerProvider.getTool();
            const result = await tool.handler(
                '{"configurationName":"Unknown Config"}'
            );

            expect(result).to.be.a('string');
            expect(result).to.contain('Did not find a launch configuration');
            expect(result).to.contain('Unknown Config');
        });

        it('should handle compound configurations', async () => {
            const tool = launchRunnerProvider.getTool();
            const result = await tool.handler(
                '{"configurationName":"Launch All"}'
            );

            expect(result).to.be.a('string');
            expect(result).to.contain('Compound launch configuration');
            expect(result).to.contain('Launch All');
            expect(result).to.contain('started successfully');
        });
    });

    describe('LaunchStopProvider', () => {
        it('should provide the correct tool metadata', () => {
            const tool = launchStopProvider.getTool();
            expect(tool.id).to.equal('stopLaunchConfiguration');
            expect(tool.name).to.equal('stopLaunchConfiguration');
            expect(tool.description).to.contain(
                'Stops an active launch configuration'
            );
            expect(tool.parameters.required).to.deep.equal([]);
        });

        it('should stop current session when no configuration name provided', async () => {
            (
                mockDebugSessionManager as { currentSession: unknown }
            ).currentSession = {
                id: 'current-session',
                configuration: { name: 'Current Config' },
            };

            const tool = launchStopProvider.getTool();
            const result = await tool.handler('{}');

            expect(result).to.be.a('string');
            expect(result).to.contain(
                'Successfully stopped current debug session'
            );
            expect(result).to.contain('Current Config');
        });

        it('should handle no active session', async () => {
            (
                mockDebugSessionManager as { currentSession: unknown }
            ).currentSession = undefined;

            const tool = launchStopProvider.getTool();
            const result = await tool.handler('{}');

            expect(result).to.be.a('string');
            expect(result).to.contain('No active debug session to stop');
        });

        it('should stop specific session by name', async () => {
            Object.defineProperty(mockDebugSessionManager, 'sessions', {
                value: [
                    {
                        id: 'session-1',
                        configuration: { name: 'Node.js Debug' },
                    },
                    {
                        id: 'session-2',
                        configuration: { name: 'Python Debug' },
                    },
                ],
                writable: true,
                configurable: true,
            });

            const tool = launchStopProvider.getTool();
            const result = await tool.handler(
                '{"configurationName":"Node.js Debug"}'
            );

            expect(result).to.be.a('string');
            expect(result).to.contain(
                'Successfully stopped launch configuration'
            );
            expect(result).to.contain('Node.js Debug');
        });

        it('should handle session not found by name', async () => {
            Object.defineProperty(mockDebugSessionManager, 'sessions', {
                value: [],
                writable: true,
                configurable: true,
            });

            const tool = launchStopProvider.getTool();
            const result = await tool.handler(
                '{"configurationName":"Unknown Config"}'
            );

            expect(result).to.be.a('string');
            expect(result).to.contain('No active session found');
            expect(result).to.contain('Unknown Config');
        });
    });
});
