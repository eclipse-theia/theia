// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import 'reflect-metadata';

import { expect } from 'chai';
import { TaskListProvider, TaskRunnerProvider } from './workspace-task-provider';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';

disableJSDOM();

describe('Task Providers - Group Field', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('TaskListProvider', () => {
        let provider: TaskListProvider;

        beforeEach(() => {
            provider = new TaskListProvider();
            // Mock dependencies
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).taskService = {} as TaskService;
        });

        it('should return ToolRequest with group field set to "Tasks"', () => {
            const tool = provider.getTool();

            expect(tool).to.not.be.undefined;
            expect(tool.group).to.equal('Tasks');
            expect(tool.id).to.equal('list_tasks');
            expect(tool.name).to.equal('list_tasks');
        });

        it('should have all required ToolRequest properties', () => {
            const tool = provider.getTool();

            expect(tool.id).to.be.a('string');
            expect(tool.name).to.be.a('string');
            expect(tool.description).to.be.a('string');
            expect(tool.parameters).to.be.an('object');
            expect(tool.handler).to.be.a('function');
            expect(tool.group).to.equal('Tasks');
        });
    });

    describe('TaskRunnerProvider', () => {
        let provider: TaskRunnerProvider;

        beforeEach(() => {
            provider = new TaskRunnerProvider();
            // Mock dependencies
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).taskService = {} as TaskService;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (provider as any).terminalService = {} as TerminalService;
        });

        it('should return ToolRequest with group field set to "Tasks"', () => {
            const tool = provider.getTool();

            expect(tool).to.not.be.undefined;
            expect(tool.group).to.equal('Tasks');
            expect(tool.id).to.equal('run_task');
            expect(tool.name).to.equal('run_task');
        });

        it('should have all required ToolRequest properties', () => {
            const tool = provider.getTool();

            expect(tool.id).to.be.a('string');
            expect(tool.name).to.be.a('string');
            expect(tool.description).to.be.a('string');
            expect(tool.parameters).to.be.an('object');
            expect(tool.handler).to.be.a('function');
            expect(tool.group).to.equal('Tasks');
        });
    });

    describe('Task Providers - Group Consistency', () => {
        it('should have both providers return the same group name', () => {
            const listProvider = new TaskListProvider();
            const runnerProvider = new TaskRunnerProvider();

            // Mock dependencies
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (listProvider as any).taskService = {} as TaskService;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (runnerProvider as any).taskService = {} as TaskService;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (runnerProvider as any).terminalService = {} as TerminalService;

            const listTool = listProvider.getTool();
            const runnerTool = runnerProvider.getTool();

            expect(listTool.group).to.equal('Tasks');
            expect(runnerTool.group).to.equal('Tasks');

            // Both should have the same group value
            expect(listTool.group).to.equal(runnerTool.group);
        });
    });
});
