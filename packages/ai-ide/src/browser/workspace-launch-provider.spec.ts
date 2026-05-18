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
import { PreferenceService } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
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
import { WorkspaceFunctionScope } from './workspace-functions';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

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

        const mockWorkspaceService = {
            tryGetRoots: () => [
                { resource: new URI('file:///workspace') }
            ],
            roots: Promise.resolve([
                { resource: new URI('file:///workspace') }
            ]),
            onWorkspaceChanged: () => ({ dispose: () => { } })
        } as unknown as WorkspaceService;

        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(FileService).toConstantValue({} as FileService);
        container.bind(PreferenceService).toConstantValue({ get: () => false } as unknown as PreferenceService);
        container.bind(WorkspaceFunctionScope).toSelf();

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

        container.bind(LaunchListProvider).toSelf();
        container.bind(LaunchRunnerProvider).toSelf();
        container.bind(LaunchStopProvider).toSelf();
        launchListProvider = container.get(LaunchListProvider);
        launchRunnerProvider = container.get(LaunchRunnerProvider);
        launchStopProvider = container.get(LaunchStopProvider);
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
                workspaceFolderUri: 'file:///workspace',
            },
            {
                name: 'Python Debug',
                configuration: config2,
                workspaceFolderUri: 'file:///workspace',
            },
            { name: 'Launch All', compound, workspaceFolderUri: 'file:///workspace' },
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
            expect(tool.parameters.required).to.deep.equal([]);
        });

        it('should list all configurations when filter is omitted', async () => {
            const tool = launchListProvider.getTool();
            const result = await tool.handler('{}');
            expect(result).to.be.a('string');
            const configurations = JSON.parse(result as string);

            expect(configurations).to.be.an('array');
            expect(configurations).to.have.lengthOf(3);
            expect(configurations.map((c: { name: string }) => c.name)).to.include('Node.js Debug');
            expect(configurations.map((c: { name: string }) => c.name)).to.include('Python Debug');
            expect(configurations.map((c: { name: string }) => c.name)).to.include('Launch All');
            // All configurations should show running: false since no sessions are active
            configurations.forEach((config: { name: string; running: boolean; workspaceRoot?: string }) => {
                expect(config.running).to.equal(false);
            });
        });

        it('should filter configurations by name', async () => {
            const tool = launchListProvider.getTool();
            const result = await tool.handler('{"filter":"Node"}');
            expect(result).to.be.a('string');
            const configurations = JSON.parse(result as string);

            expect(configurations).to.be.an('array');
            expect(configurations).to.have.lengthOf(1);
            expect(configurations[0].name).to.equal('Node.js Debug');
            expect(configurations[0].running).to.equal(false);
        });

        it('should handle case-insensitive filtering', async () => {
            const tool = launchListProvider.getTool();
            const result = await tool.handler('{"filter":"python"}');
            expect(result).to.be.a('string');
            const configurations = JSON.parse(result as string);

            expect(configurations).to.be.an('array');
            expect(configurations).to.have.lengthOf(1);
            expect(configurations[0].name).to.equal('Python Debug');
            expect(configurations[0].running).to.equal(false);
        });

        it('should include workspace root info in listed configurations', async () => {
            const tool = launchListProvider.getTool();
            const result = await tool.handler('{"filter":""}');
            expect(result).to.be.a('string');
            const configurations = JSON.parse(result as string);

            // All configs in our mock are scoped to 'file:///workspace' whose basename is 'workspace'
            configurations.forEach((config: { name: string; running: boolean; workspaceRoot?: string }) => {
                expect(config.workspaceRoot).to.equal('workspace');
            });
        });
    });

    describe('LaunchRunnerProvider', () => {
        it('should provide the correct tool metadata', () => {
            const tool = launchRunnerProvider.getTool();
            expect(tool.id).to.equal('runLaunchConfiguration');
            expect(tool.name).to.equal('runLaunchConfiguration');
            expect(tool.description).to.contain(
                'Starts a launch configuration'
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

    describe('Multi-root disambiguation', () => {
        it('should report ambiguity when same config name exists in multiple roots', async () => {
            const multiRootContainer = new Container();

            const multiRootWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///home/user/frontend') },
                    { resource: new URI('file:///home/user/backend') }
                ],
                roots: Promise.resolve([
                    { resource: new URI('file:///home/user/frontend') },
                    { resource: new URI('file:///home/user/backend') }
                ]),
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            multiRootContainer.bind(WorkspaceService).toConstantValue(multiRootWorkspaceService);
            multiRootContainer.bind(FileService).toConstantValue({} as FileService);
            multiRootContainer.bind(PreferenceService).toConstantValue({ get: () => false } as unknown as PreferenceService);
            multiRootContainer.bind(WorkspaceFunctionScope).toSelf();

            const debugConfig: DebugConfiguration = {
                name: 'Start App',
                type: 'node',
                request: 'launch',
                program: 'app.js',
            };

            const duplicateConfigs: DebugSessionOptions[] = [
                { name: 'Start App', configuration: debugConfig, workspaceFolderUri: 'file:///home/user/frontend' },
                { name: 'Start App', configuration: debugConfig, workspaceFolderUri: 'file:///home/user/backend' },
            ];

            const mockConfigManager = {
                load: () => Promise.resolve(),
                get all(): IterableIterator<DebugSessionOptions> {
                    return duplicateConfigs[Symbol.iterator]();
                },
            };

            const mockSessionManager = {
                start: async () => ({ id: 'test-session', configuration: { name: 'Start App' } }),
                terminateSession: () => Promise.resolve(),
                currentSession: undefined,
                sessions: [],
            };

            multiRootContainer.bind(DebugConfigurationManager).toConstantValue(mockConfigManager as unknown as DebugConfigurationManager);
            multiRootContainer.bind(DebugSessionManager).toConstantValue(mockSessionManager as unknown as DebugSessionManager);
            multiRootContainer.bind(LaunchRunnerProvider).toSelf();
            multiRootContainer.bind(LaunchListProvider).toSelf();

            // Listing should show both configs with their respective roots
            const listTool = multiRootContainer.get(LaunchListProvider).getTool();
            const listResult = await listTool.handler('{"filter":""}');
            const configs = JSON.parse(listResult as string);
            expect(configs).to.have.lengthOf(2);
            expect(configs[0].workspaceRoot).to.equal('frontend');
            expect(configs[1].workspaceRoot).to.equal('backend');

            // Running without workspaceRoot should report ambiguity
            const runTool = multiRootContainer.get(LaunchRunnerProvider).getTool();
            const ambiguousResult = await runTool.handler('{"configurationName":"Start App"}');
            expect(ambiguousResult).to.be.a('string');
            expect(ambiguousResult as string).to.include('Ambiguous');
            expect(ambiguousResult as string).to.include('frontend');
            expect(ambiguousResult as string).to.include('backend');

            // Running with workspaceRoot should succeed
            const disambiguatedResult = await runTool.handler('{"configurationName":"Start App","workspaceRoot":"frontend"}');
            expect(disambiguatedResult).to.be.a('string');
            expect(disambiguatedResult as string).to.not.include('Ambiguous');
            expect(disambiguatedResult as string).to.include('started');
        });
    });
});
