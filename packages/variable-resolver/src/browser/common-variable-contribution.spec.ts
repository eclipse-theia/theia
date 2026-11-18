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

import { ResourceContextKey } from '@theia/core/lib/browser/resource-context-key';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { CommandService } from '@theia/core/lib/common/command';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { isCancelled } from '@theia/core/lib/common/cancellation';
import { ILogger } from '@theia/core/lib/common/logger';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { Deferred, wait } from '@theia/core/lib/common/promise-util';
import { ShellEnvironmentResolution, ShellEnvironmentServer } from '@theia/core/lib/common/shell-environment';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import * as sinon from 'sinon';
import URI from '@theia/core/lib/common/uri';
import { CommonVariableContribution } from './common-variable-contribution.js';
import { VariableInput } from './variable-input.js';
import { VariableRegistry } from './variable.js';

disableJSDOM();

describe('CommonVariableContribution', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const workspace = new URI('file:///workspace');
    const promptInput: VariableInput = {
        id: 'task-argument',
        type: 'promptString',
        description: 'Enter a task argument',
        default: 'default-value'
    };
    const pickInput: VariableInput = {
        id: 'task-argument-choice',
        type: 'pickString',
        description: 'Choose a task argument',
        options: ['first', 'second'],
        default: 'second'
    };

    let variables: VariableRegistry;
    let input: sinon.SinonStub;
    let showQuickPick: sinon.SinonStub;
    let getValue: sinon.SinonStub;

    /** Registers the variables, with the login shell environment service of an Electron frontend if given. */
    const setup = async (shellEnvironment?: Partial<ShellEnvironmentServer>): Promise<void> => {
        const container = new Container();
        container.bind(ILogger).to(MockLogger);
        input = sinon.stub().resolves('task-argument');
        showQuickPick = sinon.stub();
        getValue = sinon.stub().resolves({ name: 'PATH', value: '/usr/bin' });
        const inputs = [promptInput, pickInput];

        container.bind<Partial<EnvVariablesServer>>(EnvVariablesServer).toConstantValue({
            getExecPath: async () => '',
            getValue
        });
        if (shellEnvironment) {
            container.bind<Partial<ShellEnvironmentServer>>(ShellEnvironmentServer).toConstantValue(shellEnvironment);
        }
        container.bind<Partial<CommandService>>(CommandService).toConstantValue({});
        container.bind<Partial<PreferenceService>>(PreferenceService).toConstantValue({
            get: sinon.stub().returns({ inputs })
        });
        container.bind<Partial<ResourceContextKey>>(ResourceContextKey).toConstantValue({
            get: () => workspace.toString()
        });
        container.bind<Partial<QuickInputService>>(QuickInputService).toConstantValue({
            input,
            showQuickPick
        });
        container.bind<Partial<ApplicationServer>>(ApplicationServer).toConstantValue({});
        container.bind(VariableRegistry).toSelf();
        container.bind(CommonVariableContribution).toSelf();

        variables = container.get(VariableRegistry);
        await container.get(CommonVariableContribution).registerVariables(variables);
    };

    beforeEach(() => setup());

    it('reads an environment variable at once where the login shell environment is not resolved', async () => {
        expect(await variables.getVariable('env')?.resolve(workspace, 'PATH')).to.equal('/usr/bin');
        sinon.assert.calledOnceWithExactly(getValue, 'PATH');
    });

    it('waits for the environment of the login shell before reading a variable', async () => {
        const resolution = new Deferred<ShellEnvironmentResolution>();
        await setup({ whenResolved: () => resolution.promise });

        const resolving = variables.getVariable('env')?.resolve(workspace, 'PATH');
        await wait(0);
        sinon.assert.notCalled(getValue);

        resolution.resolve({ status: 'applied' });
        expect(await resolving).to.equal('/usr/bin');
        sinon.assert.calledOnceWithExactly(getValue, 'PATH');
    });

    it('keeps promptString inputs open when focus is lost', async () => {
        const resolved = await variables.getVariable('input')?.resolve(workspace, 'task-argument', 'tasks');

        expect(resolved).to.equal('task-argument');
        sinon.assert.calledOnceWithExactly(input, {
            prompt: 'Enter a task argument',
            value: 'default-value',
            ignoreFocusLost: true
        });
    });

    it('accepts an empty promptString value', async () => {
        input.resolves('');

        const resolved = await variables.getVariable('input')?.resolve(workspace, 'task-argument', 'tasks');

        expect(resolved).to.equal('');
    });

    it('cancels promptString inputs when input returns undefined', async () => {
        input.resolves(undefined);

        let error: Error | undefined;
        try {
            await variables.getVariable('input')?.resolve(workspace, 'task-argument', 'tasks');
        } catch (e) {
            error = e as Error;
        }

        expect(isCancelled(error)).to.equal(true);
    });

    it('keeps pickString inputs open when focus is lost', async () => {
        showQuickPick.resolves({ label: 'first', value: 'first' });

        const resolved = await variables.getVariable('input')?.resolve(workspace, 'task-argument-choice', 'tasks');

        expect(resolved).to.equal('first');
        sinon.assert.calledOnceWithExactly(showQuickPick, [
            { label: 'second', value: 'second', description: 'Default' },
            { label: 'first', value: 'first' }
        ], {
            placeholder: 'Choose a task argument',
            ignoreFocusOut: true
        });
    });

    it('cancels pickString inputs when no item is selected', async () => {
        showQuickPick.resolves(undefined);

        let error: Error | undefined;
        try {
            await variables.getVariable('input')?.resolve(workspace, 'task-argument-choice', 'tasks');
        } catch (e) {
            error = e as Error;
        }

        expect(isCancelled(error)).to.equal(true);
    });
});
