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
import { ILogger } from '@theia/core/lib/common/logger';
import { QuickInputService, QuickPickValue } from '@theia/core/lib/common/quick-pick-service';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import URI from '@theia/core/lib/common/uri';
import { Container } from '@theia/core/shared/inversify';
import { VariableRegistry, VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { TaskConfiguration, TaskConfigurationScope, TaskScope } from '../common/index.js';
import { TaskConfigurations } from './task-configurations.js';
import { TaskDefinitionRegistry } from './task-definition-registry.js';
import { TaskNameResolver } from './task-name-resolver.js';
import { TaskService } from './task-service.js';
import { TaskVariableContribution } from './task-variable-contribution.js';

canvasContext.restore();
disableJSDOM();

describe('TaskVariableContribution', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const folder = new URI('file:///workspace/extension');
    const launchOptions = { context: folder, configurationSection: 'launch' };

    const buildTask = (label: string, isDefault: boolean, scope: TaskConfigurationScope = folder.toString()): TaskConfiguration => ({
        type: 'shell', label, command: label, _scope: scope, group: isDefault ? { kind: 'build', isDefault } : 'build'
    });
    const npmTask = (script: string, group: TaskConfiguration['group']): TaskConfiguration => ({
        type: 'npm', script, label: script, source: 'npm', _source: 'npm', _scope: folder.toString(), group
    });
    const compile = buildTask('compile', true);
    const lint = buildTask('lint', false);
    const unitTests: TaskConfiguration = { type: 'shell', label: 'unit tests', command: 'test', _scope: folder.toString(), group: { kind: 'test', isDefault: true } };

    let configuredTasks: TaskConfiguration[];
    let taskService: Record<'startUserAction' | 'getConfiguredTasks', sinon.SinonStub>;
    let showQuickPick: sinon.SinonStub;
    let variables: VariableRegistry;
    let variableResolver: VariableResolverService;

    beforeEach(() => {
        configuredTasks = [];
        taskService = {
            startUserAction: sinon.stub().returns(1),
            getConfiguredTasks: sinon.stub().callsFake(async () => configuredTasks)
        };
        showQuickPick = sinon.stub().resolves(undefined);

        const container = new Container();
        container.bind(ILogger).to(MockLogger);
        container.bind<Partial<TaskService>>(TaskService).toConstantValue(taskService);
        container.bind<Partial<TaskConfigurations>>(TaskConfigurations).toConstantValue({ getRawTaskConfigurations: () => [] });
        container.bind<Partial<QuickInputService>>(QuickInputService).toConstantValue({ showQuickPick });
        container.bind(TaskDefinitionRegistry).toSelf().inSingletonScope();
        container.bind(TaskNameResolver).toSelf().inSingletonScope();
        container.bind(VariableRegistry).toSelf().inSingletonScope();
        container.bind(VariableResolverService).toSelf().inSingletonScope();
        container.bind(TaskVariableContribution).toSelf().inSingletonScope();

        container.get(TaskDefinitionRegistry).register({
            taskType: 'npm',
            source: 'npm',
            properties: { required: ['script'], all: ['script'], schema: { type: 'object' } }
        });
        variables = container.get(VariableRegistry);
        container.get(TaskVariableContribution).registerVariables(variables);
        variableResolver = container.get(VariableResolverService);
    });

    const resolveDefaultBuildTask = () => variables.getVariable('defaultBuildTask')!.resolve(folder);
    const offeredTasks = (): string[] => showQuickPick.firstCall.args[0].map((item: QuickPickValue<string>) => item.label);

    it('resolves the preLaunchTask of a launch configuration to the default build task', async () => {
        configuredTasks = [unitTests, compile, lint];

        const resolved = await variableResolver.resolve({ name: 'Run Extension', preLaunchTask: '${defaultBuildTask}' }, launchOptions);

        expect(resolved).to.deep.equal({ name: 'Run Extension', preLaunchTask: 'compile' });
        sinon.assert.notCalled(showQuickPick);
    });

    it('resolves to the name that a customized detected task is run with', async () => {
        configuredTasks = [npmTask('watch', { kind: 'build', isDefault: true })];

        expect(await resolveDefaultBuildTask()).to.equal('npm: watch');
    });

    it('ignores the default build tasks of other workspace folders', async () => {
        configuredTasks = [buildTask('other folder build', true, 'file:///workspace/other'), buildTask('user build', true, TaskScope.Global)];

        expect(await resolveDefaultBuildTask()).to.equal('user build');
        sinon.assert.notCalled(showQuickPick);
    });

    it('only looks at user and workspace tasks without a workspace folder', async () => {
        configuredTasks = [compile, buildTask('user build', false, TaskScope.Global), buildTask('workspace build', false, TaskScope.Workspace)];
        showQuickPick.callsFake(async items => items[1]);

        expect(await variables.getVariable('defaultBuildTask')!.resolve(undefined)).to.equal('workspace build');
        expect(offeredTasks()).to.deep.equal(['user build', 'workspace build']);
    });

    it('asks for a build task when there is no default build task', async () => {
        const npmWatch = { ...npmTask('watch', 'build'), detail: 'tsc -watch' };
        configuredTasks = [unitTests, lint, buildTask('other folder build', false, 'file:///workspace/other'), npmWatch];
        showQuickPick.callsFake(async items => items[1]);

        expect(await resolveDefaultBuildTask()).to.equal('npm: watch');
        expect(offeredTasks()).to.deep.equal(['lint', 'npm: watch']);
        expect(showQuickPick.firstCall.args[0][1].detail).to.equal('tsc -watch');
        expect(showQuickPick.firstCall.args[1]).to.deep.equal({ placeholder: 'Select the build task (there is no default build task defined)', ignoreFocusOut: true });
    });

    it('only offers the default build tasks when there are several of them', async () => {
        configuredTasks = [compile, lint, buildTask('bundle', true)];
        showQuickPick.callsFake(async items => items[1]);

        expect(await resolveDefaultBuildTask()).to.equal('bundle');
        expect(offeredTasks()).to.deep.equal(['compile', 'bundle']);
        expect(showQuickPick.firstCall.args[1]).to.deep.equal({ placeholder: 'Select the build task to run', ignoreFocusOut: true });
    });

    it('cancels the resolution when the build task picker is closed', async () => {
        configuredTasks = [lint];

        expect(await variableResolver.resolve({ preLaunchTask: '${defaultBuildTask}' }, launchOptions)).to.equal(undefined);
        sinon.assert.calledOnce(showQuickPick);
    });

    it('leaves the variable unresolved when there are no build tasks', async () => {
        configuredTasks = [unitTests];

        expect(await variableResolver.resolve({ preLaunchTask: '${defaultBuildTask}' }, launchOptions)).to.deep.equal({ preLaunchTask: '${defaultBuildTask}' });
        sinon.assert.notCalled(showQuickPick);
    });
});
