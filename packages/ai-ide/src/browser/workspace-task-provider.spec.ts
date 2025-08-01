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

import { expect } from 'chai';
import { CancellationTokenSource } from '@theia/core';
import { TaskListProvider, TaskRunnerProvider } from './workspace-task-provider';
import { MutableChatRequestModel, MutableChatResponseModel } from '@theia/ai-chat';
import { Container } from '@theia/core/shared/inversify';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TaskConfiguration, TaskInfo } from '@theia/task/lib/common';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';

describe('Workspace Task Provider Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: Partial<MutableChatRequestModel>;
    let container: Container;
    let mockTaskService: TaskService;
    let mockTerminalService: TerminalService;

    beforeEach(() => {
        cancellationTokenSource = new CancellationTokenSource();

        // Setup mock context
        mockCtx = {
            response: {
                cancellationToken: cancellationTokenSource.token
            } as MutableChatResponseModel
        };

        // Create a new container for each test
        container = new Container();

        // Mock dependencies
        mockTaskService = {
            startUserAction: () => 123,
            getTasks: async (token: number) => [
                {
                    label: 'build',
                    _scope: 'workspace',
                    type: 'shell'
                } as TaskConfiguration,
                {
                    label: 'test',
                    _scope: 'workspace',
                    type: 'shell'
                } as TaskConfiguration
            ],
            runTaskByLabel: async (token: number, taskLabel: string) => {
                if (taskLabel === 'build' || taskLabel === 'test') {
                    return {
                        taskId: 0,
                        terminalId: 0,
                        config: {
                            label: taskLabel,
                            _scope: 'workspace',
                            type: 'shell'
                        }
                    } as TaskInfo;
                }
                return undefined;
            },
            terminateTask: async (activeTaskInfo: TaskInfo) => {
                // Track termination
            },
            getTerminateSignal: async () => 'SIGTERM'
        } as unknown as TaskService;

        mockTerminalService = {
            getByTerminalId: () => ({
                buffer: {
                    length: 10,
                    getLines: () => ['line1', 'line2', 'line3'],
                },
                clearOutput: () => { }
            } as unknown as TerminalWidget)
        } as unknown as TerminalService;

        // Register mocks in the container
        container.bind(TaskService).toConstantValue(mockTaskService);
        container.bind(TerminalService).toConstantValue(mockTerminalService);
        container.bind(TaskListProvider).toSelf();
        container.bind(TaskRunnerProvider).toSelf();
    });

    afterEach(() => {
        cancellationTokenSource.dispose();
    });

    it('TaskListProvider should respect cancellation token', async () => {
        const taskListProvider = container.get(TaskListProvider);
        cancellationTokenSource.cancel();

        const handler = taskListProvider.getTool().handler;
        const result = await handler(JSON.stringify({ filter: '' }), mockCtx as MutableChatRequestModel);

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('TaskRunnerProvider should respect cancellation token at the beginning', async () => {
        const taskRunnerProvider = container.get(TaskRunnerProvider);
        cancellationTokenSource.cancel();

        const handler = taskRunnerProvider.getTool().handler;
        const result = await handler(JSON.stringify({ taskName: 'build' }), mockCtx as MutableChatRequestModel);

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

});
