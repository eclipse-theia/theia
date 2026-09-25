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

import { cancelled, isCancelled } from '@theia/core/lib/common/cancellation';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { Variable, VariableRegistry } from '@theia/variable-resolver/lib/browser/variable';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TaskDefinitionRegistry } from '../task-definition-registry';
import { TaskScope } from '../../common/task-protocol';
import { ProcessTaskConfiguration } from '../../common/process/task-protocol';
import { ProcessTaskResolver } from './process-task-resolver';

disableJSDOM();

describe('ProcessTaskResolver', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    function createTask(overrides: Partial<ProcessTaskConfiguration> = {}): ProcessTaskConfiguration {
        return {
            label: 'task with input variables',
            type: 'shell',
            command: 'node',
            _scope: TaskScope.Workspace,
            ...overrides
        };
    }

    function createResolver(inputValue: string | undefined, workspaceRoot?: URI): ProcessTaskResolver {
        const container = new Container();
        container.bind(ILogger).to(MockLogger);
        container.bind(VariableRegistry).toSelf().inSingletonScope();
        container.bind(VariableResolverService).toSelf().inSingletonScope();
        container.bind(TaskDefinitionRegistry).toSelf().inSingletonScope();
        container.bind<Partial<WorkspaceService>>(WorkspaceService).toConstantValue({
            getWorkspaceRootUri: () => workspaceRoot
        });
        container.bind(ProcessTaskResolver).toSelf();

        const variableRegistry = container.get(VariableRegistry);
        const input: Variable = {
            name: 'input',
            resolve: () => {
                if (inputValue === undefined) {
                    throw cancelled();
                }
                return inputValue;
            }
        };
        variableRegistry.registerVariable(input);

        return container.get(ProcessTaskResolver);
    }

    const cancellationCases: Array<{ name: string; task: ProcessTaskConfiguration }> = [
        {
            name: 'the command',
            task: createTask({ command: '${input:value}' })
        },
        {
            name: 'the arguments',
            task: createTask({ args: ['before', '${input:value}', 'after'] })
        },
        {
            name: 'the working directory',
            task: createTask({ options: { cwd: '${input:value}' } })
        },
        {
            name: 'an environment variable',
            task: createTask({ options: { env: { BEFORE: 'unchanged', INPUT: '${input:value}', AFTER: 'unchanged' } } })
        },
        {
            name: 'a platform-specific working directory',
            task: createTask({ windows: { options: { cwd: '${input:value}' } } })
        },
        {
            name: 'a platform-specific environment variable',
            task: createTask({ linux: { options: { env: { INPUT: '${input:value}' } } } })
        }
    ];

    for (const type of ['shell', 'process']) {
        for (const cancellationCase of cancellationCases) {
            it(`cancels ${type} task resolution when resolving ${cancellationCase.name} is cancelled`, async () => {
                const resolver = createResolver(undefined);

                let error: Error | undefined;
                try {
                    await resolver.resolveTask({ ...cancellationCase.task, type });
                } catch (e) {
                    error = e as Error;
                }

                expect(isCancelled(error)).to.equal(true);
            });
        }
    }

    it('resolves command properties and preserves unrelated options', async () => {
        const resolver = createResolver('resolved-value');
        const task = createTask({
            command: '${input:value}',
            args: ['before', '${input:value}', 'after'],
            options: {
                cwd: '${input:value}',
                env: { KEEP: 'unchanged', INPUT: '${input:value}' },
                shell: { executable: 'bash', args: ['-c'] }
            }
        });

        const resolved = await resolver.resolveTask(task) as ProcessTaskConfiguration;

        expect(resolved.command).to.equal('resolved-value');
        expect(resolved.args).to.deep.equal(['before', 'resolved-value', 'after']);
        expect(resolved.options).to.deep.equal({
            cwd: 'resolved-value',
            env: { KEEP: 'unchanged', INPUT: 'resolved-value' },
            shell: { executable: 'bash', args: ['-c'] }
        });
        expect(task.command).to.equal('${input:value}');
    });

    it('preserves an accepted empty input in arguments and the environment', async () => {
        const resolver = createResolver('');
        const resolved = await resolver.resolveTask(createTask({
            args: ['${input:value}'],
            options: { env: { INPUT: '${input:value}' } }
        })) as ProcessTaskConfiguration;

        expect(resolved.args).to.deep.equal(['']);
        expect(resolved.options?.env).to.deep.equal({ INPUT: '' });
    });

    it('uses the workspace root when no working directory is configured', async () => {
        const workspaceRoot = new URI('file:///workspace');
        const resolver = createResolver('resolved-value', workspaceRoot);

        const resolved = await resolver.resolveTask(createTask()) as ProcessTaskConfiguration;

        expect(resolved.options?.cwd).to.equal(workspaceRoot.toString());
    });

    it('does not treat absent optional properties as cancellation', async () => {
        const resolver = createResolver(undefined);

        const resolved = await resolver.resolveTask(createTask()) as ProcessTaskConfiguration;

        expect(resolved.command).to.equal('node');
        expect(resolved.args).to.equal(undefined);
        expect(resolved.options?.cwd).to.equal(undefined);
        expect(resolved.options?.env).to.equal(undefined);
        expect(resolved.windows).to.equal(undefined);
        expect(resolved.osx).to.equal(undefined);
        expect(resolved.linux).to.equal(undefined);
    });

    for (const platform of ['windows', 'osx', 'linux'] as const) {
        it(`resolves ${platform} overrides without changing the original configuration`, async () => {
            const resolver = createResolver('resolved-value');
            const overrides = {
                command: '${input:value}',
                args: ['${input:value}'],
                options: {
                    cwd: '${input:value}',
                    env: { INPUT: '${input:value}' },
                    shell: { executable: 'custom-shell', args: ['-c'] }
                }
            };
            const task = createTask({ [platform]: overrides });

            const resolved = await resolver.resolveTask(task) as ProcessTaskConfiguration;

            expect(resolved[platform]).to.deep.equal({
                command: 'resolved-value',
                args: ['resolved-value'],
                options: {
                    cwd: 'resolved-value',
                    env: { INPUT: 'resolved-value' },
                    shell: { executable: 'custom-shell', args: ['-c'] }
                }
            });
            expect(task[platform]).to.equal(overrides);
            expect(overrides.options.env.INPUT).to.equal('${input:value}');
        });
    }
});
