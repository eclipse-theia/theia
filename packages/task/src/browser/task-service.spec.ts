// *****************************************************************************
// Copyright (C) 2026 Md. Mehedi Hasan.
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

import * as sinon from 'sinon';
// TaskService imports xterm, which probes the canvas API during module loading.
// These tests do not render a terminal, and JSDOM has no canvas backend.
const canvasContext = sinon.stub(HTMLCanvasElement.prototype, 'getContext');

import { expect } from 'chai';
import { cancelled } from '@theia/core/lib/common/cancellation';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { RunTaskOption, TaskConfiguration, TaskInfo, TaskScope } from '../common';
import { TaskResolverRegistry } from './task-contribution';
import { TaskDefinitionRegistry } from './task-definition-registry';
import { TaskService } from './task-service';

canvasContext.restore();
disableJSDOM();

class TestTaskService extends TaskService {
    override readonly logger = new MockLogger();
    override readonly taskResolverRegistry = new TaskResolverRegistry();
    override readonly taskDefinitionRegistry = new TaskDefinitionRegistry();
    override readonly runResolvedTask = sinon.stub<[TaskConfiguration, RunTaskOption?], Promise<TaskInfo | undefined>>().resolves();

    resolveAndRun(task: TaskConfiguration): Promise<TaskInfo | undefined> {
        return this.doRunTask(task);
    }
}

describe('TaskService task resolution', () => {
    let service: TestTaskService;
    let logError: sinon.SinonStub;
    const task: TaskConfiguration = { type: 'shell', label: 'input task', _scope: TaskScope.Workspace };

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        service = new TestTaskService();
        logError = sinon.stub(service.logger, 'error').resolves();
    });

    for (const stage of ['task', 'execution'] as const) {
        it(`does not launch a task or log an error when the ${stage} resolver is cancelled`, async () => {
            const resolver = { resolveTask: sinon.stub().rejects(cancelled()) };
            if (stage === 'task') {
                service.taskResolverRegistry.registerTaskResolver('shell', resolver);
            } else {
                service.taskResolverRegistry.registerExecutionResolver('shell', resolver);
            }

            expect(await service.resolveAndRun(task)).to.equal(undefined);
            sinon.assert.calledOnce(resolver.resolveTask);
            sinon.assert.notCalled(service.runResolvedTask);
            sinon.assert.notCalled(logError);

            resolver.resolveTask.resolves(task);
            await service.resolveAndRun(task);
            sinon.assert.calledOnceWithExactly(service.runResolvedTask, task, undefined);
            sinon.assert.notCalled(logError);
        });
    }

    it('still logs unexpected resolver errors without launching the task', async () => {
        const error = new Error('Unable to resolve task');
        service.taskResolverRegistry.registerExecutionResolver('shell', {
            resolveTask: sinon.stub().rejects(error)
        });

        expect(await service.resolveAndRun(task)).to.equal(undefined);
        sinon.assert.notCalled(service.runResolvedTask);
        sinon.assert.calledOnceWithExactly(logError, `Error resolving task '${task.label}': ${error}`);
    });
});
