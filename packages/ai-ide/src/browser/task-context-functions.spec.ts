// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Summary, TaskContextStorageService } from '@theia/ai-chat/lib/browser/task-context-service';
import { TASK_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/browser/task-context-variable';
import { ToolInvocationContext } from '@theia/ai-core';
import { GetTaskContextFunction, ListTaskContextsFunction } from './task-context-functions';

disableJSDOM();

const SESSION_A_SUMMARY: Summary = {
    id: 'ctx-attached',
    label: 'Plan From Session A',
    summary: 'attached plan content',
    sessionId: 'session-a'
};

const SESSION_B_SUMMARY: Summary = {
    id: 'ctx-session',
    label: 'Plan From Session B',
    summary: 'session plan content',
    sessionId: 'session-b'
};

function makeStorage(summaries: Summary[]): TaskContextStorageService {
    return {
        getAll: () => summaries,
        get: async (id: string) => summaries.find(candidate => candidate.id === id),
        store: async () => { },
        open: async () => { },
        delete: async () => false
    } as unknown as TaskContextStorageService;
}

function makeContext(attachedIds: string[], sessionId = 'session-b'): ToolInvocationContext {
    return {
        request: {
            session: {
                id: sessionId,
                context: {
                    getVariables: () => attachedIds.map(arg => ({ variable: TASK_CONTEXT_VARIABLE, arg }))
                }
            }
        },
        response: {}
    } as unknown as ToolInvocationContext;
}

function makeGetTaskContextFunction(storage: TaskContextStorageService): GetTaskContextFunction {
    const fn = new GetTaskContextFunction();
    Object.defineProperty(fn, 'storageService', { value: storage });
    return fn;
}

function makeListTaskContextsFunction(storage: TaskContextStorageService): ListTaskContextsFunction {
    const fn = new ListTaskContextsFunction();
    Object.defineProperty(fn, 'storageService', { value: storage });
    return fn;
}

describe('GetTaskContextFunction', () => {
    it('returns the summary for an explicit taskContextId', async () => {
        const fn = makeGetTaskContextFunction(makeStorage([SESSION_A_SUMMARY, SESSION_B_SUMMARY]));
        const result = await fn.getTool().handler(JSON.stringify({ taskContextId: 'ctx-attached' }), makeContext([]));
        expect(result).to.equal('attached plan content');
    });

    it('returns the plain summary when a single task context exists for the session', async () => {
        const fn = makeGetTaskContextFunction(makeStorage([SESSION_A_SUMMARY, SESSION_B_SUMMARY]));
        const result = await fn.getTool().handler(JSON.stringify({}), makeContext([]));
        expect(result).to.equal('session plan content');
    });

    it('returns all task contexts stored for the session or attached to the chat context when no id is given', async () => {
        const fn = makeGetTaskContextFunction(makeStorage([SESSION_A_SUMMARY, SESSION_B_SUMMARY]));
        const result = await fn.getTool().handler(JSON.stringify({}), makeContext(['ctx-attached'])) as string;
        expect(result).to.contain('2 task contexts are available');
        expect(result).to.contain('## Task 1: "Plan From Session B" (id: ctx-session)');
        expect(result).to.contain('session plan content');
        expect(result).to.contain('## Task 2: "Plan From Session A" (id: ctx-attached) [attached to chat context]');
        expect(result).to.contain('attached plan content');
    });

    it('falls back to a task context attached to the chat context when none exists for the session', async () => {
        const fn = makeGetTaskContextFunction(makeStorage([SESSION_A_SUMMARY]));
        const result = await fn.getTool().handler(JSON.stringify({}), makeContext(['ctx-attached']));
        expect(result).to.equal('attached plan content');
    });

    it('reports when no task context is stored for the session or attached to the chat context', async () => {
        const fn = makeGetTaskContextFunction(makeStorage([SESSION_A_SUMMARY]));
        const result = await fn.getTool().handler(JSON.stringify({}), makeContext([]));
        expect(result).to.equal('No task context found for this session or attached to the chat context. Use createTaskContext to create one.');
    });

    it('ignores attached task contexts that cannot be resolved', async () => {
        const fn = makeGetTaskContextFunction(makeStorage([]));
        const result = await fn.getTool().handler(JSON.stringify({}), makeContext(['ctx-missing']));
        expect(result).to.equal('No task context found for this session or attached to the chat context. Use createTaskContext to create one.');
    });
});

describe('ListTaskContextsFunction', () => {
    it('lists session task contexts and attached task contexts', async () => {
        const fn = makeListTaskContextsFunction(makeStorage([SESSION_A_SUMMARY, SESSION_B_SUMMARY]));
        const result = await fn.getTool().handler('{}', makeContext(['ctx-attached'])) as string;
        expect(result).to.contain('Task contexts available in this chat:');
        expect(result).to.contain('"Plan From Session B" (id: ctx-session)');
        expect(result).to.contain('"Plan From Session A" (id: ctx-attached) [attached to chat context]');
        expect(result).to.contain('Most recent: "Plan From Session B"');
    });

    it('resolves attached labels via the storage service when they are not part of getAll', async () => {
        const storage = {
            getAll: () => [],
            get: async (id: string) => id === 'ctx-attached' ? SESSION_A_SUMMARY : undefined,
            store: async () => { },
            open: async () => { },
            delete: async () => false
        } as unknown as TaskContextStorageService;
        const fn = makeListTaskContextsFunction(storage);
        const result = await fn.getTool().handler('{}', makeContext(['ctx-attached'])) as string;
        expect(result).to.contain('"Plan From Session A" (id: ctx-attached) [attached to chat context]');
        expect(result).to.not.contain('"ctx-attached"');
    });

    it('skips attached task contexts that cannot be resolved', async () => {
        const fn = makeListTaskContextsFunction(makeStorage([SESSION_B_SUMMARY]));
        const result = await fn.getTool().handler('{}', makeContext(['ctx-missing'])) as string;
        expect(result).to.contain('"Plan From Session B" (id: ctx-session)');
        expect(result).to.not.contain('ctx-missing');
    });

    it('marks the attached task context as most recent when no session task context exists', async () => {
        const fn = makeListTaskContextsFunction(makeStorage([SESSION_A_SUMMARY]));
        const result = await fn.getTool().handler('{}', makeContext(['ctx-attached'])) as string;
        expect(result).to.contain('Most recent: "Plan From Session A"');
    });

    it('reports when no task contexts exist', async () => {
        const fn = makeListTaskContextsFunction(makeStorage([SESSION_A_SUMMARY]));
        const result = await fn.getTool().handler('{}', makeContext([]));
        expect(result).to.equal('No task contexts found for this session or attached to the chat context.');
    });
});
