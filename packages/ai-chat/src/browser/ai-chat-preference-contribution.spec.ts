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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { AIChatPreferenceContribution } from './ai-chat-preference-contribution';
import { SessionStorageDefaultsProvider } from './session-storage-defaults-provider';
import { PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { SESSION_STORAGE_PREF, SessionStorageValue } from '../common/ai-chat-preferences';
import { Disposable } from '@theia/core/lib/common/disposable';

describe('AIChatPreferenceContribution', () => {
    let sandbox: sinon.SinonSandbox;
    let container: Container;
    let contribution: AIChatPreferenceContribution;
    let mockDefaultsProvider: {
        initialize: sinon.SinonStub;
        getDefaultValue: sinon.SinonStub;
    };
    let mockSchemaService: {
        registerOverride: sinon.SinonStub;
    };

    const DEFAULT_GLOBAL_PATH = '/__test__/mock-config/chatSessions';

    const DEFAULT_STORAGE_VALUE: SessionStorageValue = {
        scope: 'workspace',
        workspacePath: '.theia/chatSessions',
        globalPath: DEFAULT_GLOBAL_PATH
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        container = new Container();

        mockDefaultsProvider = {
            initialize: sandbox.stub().resolves(),
            getDefaultValue: sandbox.stub().returns(DEFAULT_STORAGE_VALUE)
        };

        mockSchemaService = {
            registerOverride: sandbox.stub().returns(Disposable.NULL)
        };

        container.bind(SessionStorageDefaultsProvider).toConstantValue(mockDefaultsProvider as unknown as SessionStorageDefaultsProvider);
        container.bind(AIChatPreferenceContribution).toSelf().inSingletonScope();

        contribution = container.get(AIChatPreferenceContribution);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('initSchema', () => {
        it('should initialize defaults provider before registering', async () => {
            await contribution.initSchema(mockSchemaService as unknown as PreferenceSchemaService);

            expect(mockDefaultsProvider.initialize.calledOnce).to.be.true;
            expect(mockDefaultsProvider.initialize.calledBefore(mockSchemaService.registerOverride)).to.be.true;
        });

        it('should register defaults with the schema service', async () => {
            await contribution.initSchema(mockSchemaService as unknown as PreferenceSchemaService);

            expect(mockSchemaService.registerOverride.calledOnce).to.be.true;

            const [key, overrideId, value] = mockSchemaService.registerOverride.firstCall.args;
            expect(key).to.equal(SESSION_STORAGE_PREF);
            expect(overrideId).to.be.undefined;
            expect(value).to.deep.equal(DEFAULT_STORAGE_VALUE);
        });

        it('should use values from defaults provider', async () => {
            const customDefaults: SessionStorageValue = {
                scope: 'workspace',
                workspacePath: '.custom/sessions',
                globalPath: '/custom/global/path'
            };
            mockDefaultsProvider.getDefaultValue.returns(customDefaults);

            await contribution.initSchema(mockSchemaService as unknown as PreferenceSchemaService);

            const [, , value] = mockSchemaService.registerOverride.firstCall.args;
            expect(value).to.deep.equal(customDefaults);
        });
    });
});
