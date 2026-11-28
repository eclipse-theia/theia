// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { Emitter, ILogger } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { JsonSchemaDataStore } from '@theia/core/lib/browser/json-schema-store';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TaskDefinition, TaskServer } from '../common/index.js';
import { TaskDefinitionRegistry } from './task-definition-registry.js';
import { ProblemMatcherRegistry } from './task-problem-matcher-registry.js';
import { TaskSchemaUpdater } from './task-schema-updater.js';

disableJSDOM();

describe('TaskSchemaUpdater', () => {

    const shellTask = { label: 'build', type: 'shell', command: 'make' };

    const validDefinition: TaskDefinition = {
        taskType: 'valid',
        source: 'valid',
        properties: {
            required: ['flavor'],
            all: ['flavor'],
            schema: {
                type: 'object',
                required: ['flavor'],
                properties: {
                    flavor: { type: 'string' }
                }
            }
        }
    };

    // What a plugin contributes with a mistyped `type` in a property of its task definition.
    const invalidDefinition: TaskDefinition = {
        taskType: 'broken',
        source: 'broken',
        properties: {
            required: [],
            all: ['flavor'],
            schema: {
                type: 'object',
                properties: {
                    flavor: { type: 'strnig' } as unknown as IJSONSchema
                }
            }
        }
    };

    let problemMatchers: { name: string }[];
    let onDidChangeProblemMatcherEmitter: Emitter<void>;
    let registry: TaskDefinitionRegistry;
    let logError: sinon.SinonSpy;
    let updater: TaskSchemaUpdater;

    const createUpdater = (): TaskSchemaUpdater => {
        const logger = new MockLogger();
        logError = sinon.spy(logger, 'error');
        const container = new Container();
        container.bind(ILogger).toConstantValue(logger);
        container.bind(JsonSchemaDataStore).toSelf().inSingletonScope();
        container.bind(TaskDefinitionRegistry).toConstantValue(registry);
        container.bind(ProblemMatcherRegistry).toConstantValue({
            getAll: () => problemMatchers,
            onDidChangeProblemMatcher: onDidChangeProblemMatcherEmitter.event
        } as unknown as ProblemMatcherRegistry);
        container.bind(TaskServer).toConstantValue({} as TaskServer);
        container.bind(WorkspaceService).toConstantValue({} as WorkspaceService);
        container.bind(TaskSchemaUpdater).toSelf().inSingletonScope();
        return container.get(TaskSchemaUpdater);
    };

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(async () => {
        problemMatchers = [{ name: 'tsc' }];
        onDidChangeProblemMatcherEmitter = new Emitter<void>();
        registry = new TaskDefinitionRegistry();
        updater = createUpdater();
        await updater.update();
    });

    it('validates a task configuration against the schema', () => {
        expect(updater.validate({ tasks: [shellTask] })).to.be.true;
        expect(updater.validate({ tasks: [{ label: 'no command', type: 'shell' }] })).to.be.false;
        expect(logError.called).to.be.false;
    });

    it('validates against the task definitions that are registered', async () => {
        expect(updater.validate({ tasks: [{ type: 'valid', flavor: 'vanilla' }] })).to.be.false;

        registry.register(validDefinition);
        await updater.update();

        expect(updater.validate({ tasks: [{ type: 'valid', flavor: 'vanilla' }] })).to.be.true;
        expect(updater.validate({ tasks: [{ type: 'valid' }] })).to.be.false;
    });

    it('keeps validating against the last valid schema when a task definition has an invalid schema', async () => {
        registry.register(validDefinition);
        await updater.update();
        expect(updater.validate({ tasks: [shellTask] })).to.be.true;

        registry.register(invalidDefinition);
        await updater.update();

        expect(updater.validate({ tasks: [shellTask] })).to.be.true;
        expect(updater.validate({ tasks: [{ type: 'valid', flavor: 'vanilla' }] })).to.be.true;
        expect(updater.validate({ tasks: [{ label: 'no command', type: 'shell' }] })).to.be.false;
    });

    it('reports an invalid schema once, not for every validation', async () => {
        registry.register(invalidDefinition);
        await updater.update();

        updater.validate({ tasks: [shellTask] });
        updater.validate({ tasks: [shellTask] });
        updater.validate({ tasks: [shellTask] });

        expect(logError.callCount).to.equal(1);
    });

    it('validates nothing, without failing, as long as there has not been a valid schema', async () => {
        // The schema is not valid without a problem matcher, which is the case until the default ones are registered.
        problemMatchers = [];
        const early = createUpdater();
        await early.update();

        expect(early.validate({ tasks: [shellTask] })).to.be.false;

        problemMatchers = [{ name: 'tsc' }];
        onDidChangeProblemMatcherEmitter.fire();
        await early.update();

        expect(early.validate({ tasks: [shellTask] })).to.be.true;
    });

    it('validates against the new schema when the invalid task definition is removed', async () => {
        const registration = registry.register(invalidDefinition);
        await updater.update();
        expect(updater.validate({ tasks: [{ type: 'valid', flavor: 'vanilla' }] })).to.be.false;

        registration.dispose();
        registry.register(validDefinition);
        await updater.update();

        expect(updater.validate({ tasks: [{ type: 'valid', flavor: 'vanilla' }] })).to.be.true;
    });

});
