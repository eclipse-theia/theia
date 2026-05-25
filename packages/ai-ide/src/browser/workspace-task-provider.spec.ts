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
import { ToolInvocationContext } from '@theia/ai-core';
import { Container } from '@theia/core/shared/inversify';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TaskConfiguration, TaskInfo } from '@theia/task/lib/common';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';

describe('Workspace Task Provider Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: ToolInvocationContext;
    let container: Container;
    let mockTaskService: TaskService;
    let mockTerminalService: TerminalService;

    beforeEach(() => {
        cancellationTokenSource = new CancellationTokenSource();

        // Setup mock context
        mockCtx = {
            cancellationToken: cancellationTokenSource.token
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
            getTerminateSignal: async () => 'SIGTERM',
            isTaskRunning: () => false
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

    describe('Task cancellation with completed tasks', () => {
        it('should NOT terminate task if task has already completed (not in runningTasks)', async () => {
            let terminateTaskCalled = false;
            mockTaskService.terminateTask = async () => {
                terminateTaskCalled = true;
            };
            // Simulate task already completed (isTaskRunning returns false)
            mockTaskService.isTaskRunning = () => false;

            // Mock getTerminateSignal to never resolve (simulates in-flight handler)
            mockTaskService.getTerminateSignal = () => new Promise(() => { });

            const taskRunnerProvider = container.get(TaskRunnerProvider);
            const handler = taskRunnerProvider.getTool().handler;

            // Start task execution (will hang on getTerminateSignal)
            handler(JSON.stringify({ taskName: 'build' }), mockCtx);

            // Give time for the handler to register the cancellation listener
            await new Promise(resolve => setTimeout(resolve, 10));

            // Cancel while handler is "in-flight"
            cancellationTokenSource.cancel();

            // Give time for cancellation to process
            await new Promise(resolve => setTimeout(resolve, 10));

            // terminateTask should NOT have been called since isTaskRunning returns false
            expect(terminateTaskCalled).to.be.false;
        });

        it('should terminate task if task is still running', async () => {
            let terminateTaskCalled = false;
            mockTaskService.terminateTask = async () => {
                terminateTaskCalled = true;
            };

            // Mock isTaskRunning to return true (task still running)
            mockTaskService.isTaskRunning = () => true;

            // Mock getTerminateSignal to never resolve (simulates in-flight task)
            mockTaskService.getTerminateSignal = () => new Promise(() => { });

            const taskRunnerProvider = container.get(TaskRunnerProvider);
            const handler = taskRunnerProvider.getTool().handler;

            // Start task execution (will hang on getTerminateSignal)
            handler(JSON.stringify({ taskName: 'build' }), mockCtx);

            // Give time for the handler to register the cancellation listener
            await new Promise(resolve => setTimeout(resolve, 10));

            // Cancel while task is "in-flight"
            cancellationTokenSource.cancel();

            // Give time for cancellation to process
            await new Promise(resolve => setTimeout(resolve, 10));

            // terminateTask SHOULD have been called since isTaskRunning returns true
            expect(terminateTaskCalled).to.be.true;
        });

        it('should handle multiple tasks with shared cancellation token - only terminate running tasks', async () => {
            const terminatedTasks: number[] = [];
            mockTaskService.terminateTask = async (taskInfo: TaskInfo) => {
                terminatedTasks.push(taskInfo.taskId);
            };

            // Mock isTaskRunning to simulate: task 0 completed, tasks 1 & 2 still running
            mockTaskService.isTaskRunning = (taskId: number) => taskId !== 0;

            // Mock getTerminateSignal to never resolve (simulates in-flight handlers)
            mockTaskService.getTerminateSignal = () => new Promise(() => { });

            // Mock runTaskByLabel to return different task IDs
            let taskIdCounter = 0;
            mockTaskService.runTaskByLabel = async (token: number, taskLabel: string) => ({
                taskId: taskIdCounter++,
                terminalId: taskIdCounter - 1,
                config: {
                    label: taskLabel,
                    _scope: 'workspace',
                    type: 'shell'
                }
            } as TaskInfo);

            const taskRunnerProvider = container.get(TaskRunnerProvider);
            const handler = taskRunnerProvider.getTool().handler;

            // Use ONE shared CancellationTokenSource (simulates real scenario)
            const sharedCts = new CancellationTokenSource();
            const sharedCtx: ToolInvocationContext = { cancellationToken: sharedCts.token };

            // Call handler three times with the same shared cancellation token
            handler(JSON.stringify({ taskName: 'build' }), sharedCtx);
            handler(JSON.stringify({ taskName: 'test' }), sharedCtx);
            handler(JSON.stringify({ taskName: 'lint' }), sharedCtx);

            // Give time for handlers to register cancellation listeners
            await new Promise(resolve => setTimeout(resolve, 10));

            // Cancel the shared token once - this fires all registered listeners
            sharedCts.cancel();

            // Give time for cancellation listeners to fire
            await new Promise(resolve => setTimeout(resolve, 10));

            // Only task 1 and 2 should have been terminated (task 0 was completed)
            expect(terminatedTasks).to.have.lengthOf(2);
            expect(terminatedTasks).to.include(1);
            expect(terminatedTasks).to.include(2);
            expect(terminatedTasks).to.not.include(0);

            sharedCts.dispose();
        });
    });

    it('TaskListProvider should respect cancellation token', async () => {
        const taskListProvider = container.get(TaskListProvider);
        cancellationTokenSource.cancel();

        const handler = taskListProvider.getTool().handler;
        const result = await handler(JSON.stringify({ filter: '' }), mockCtx);

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('TaskRunnerProvider should respect cancellation token at the beginning', async () => {
        const taskRunnerProvider = container.get(TaskRunnerProvider);
        cancellationTokenSource.cancel();

        const handler = taskRunnerProvider.getTool().handler;
        const result = await handler(JSON.stringify({ taskName: 'build' }), mockCtx);

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

});
