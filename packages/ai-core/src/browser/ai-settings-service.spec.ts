// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
import { Container } from '@theia/core/shared/inversify';
import { Emitter, ILogger } from '@theia/core';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { PreferenceInspection, PreferenceUtils } from '@theia/core/lib/common/preferences';
import { AiConfigurationChange, AiConfigurationService } from '../common/ai-configuration-service';
import { AISettings } from '../common/settings-service';
import { AISettingsServiceImpl } from './ai-settings-service';

/**
 * User and Session values of `ai-features.agentSettings`, resolved as `AiConfigurationService` resolves them in a
 * trusted workspace with no workspace values: `get` merges the objects, and `update` writes User scope and clears
 * the session value unless the value is unchanged.
 */
class ScopedConfiguration {
    user?: AISettings;
    session?: AISettings;
    readonly ready = Promise.resolve();
    readonly onDidChange = new Emitter<AiConfigurationChange>().event;

    get<T>(_key: string, fallback?: T): T | undefined {
        let value: JSONValue | undefined;
        for (const scopeValue of [this.user, this.session]) {
            if (scopeValue !== undefined) {
                value = PreferenceUtils.merge(value, scopeValue as JSONValue);
            }
        }
        return (value as T | undefined) ?? fallback;
    }

    inspect(key: string): PreferenceInspection<JSONValue> {
        const globalValue = this.user as JSONValue | undefined;
        const sessionValue = this.session as JSONValue | undefined;
        return {
            preferenceName: key, defaultValue: undefined, globalValue, workspaceValue: undefined, workspaceFolderValue: undefined, sessionValue,
            value: sessionValue ?? globalValue
        };
    }

    update(key: string, value: AISettings): Promise<void> {
        // Like `updateValue`, write nothing when the value equals the one of the highest scope that sets it.
        if (!PreferenceUtils.deepEqual(this.inspect(key).value, value as JSONValue)) {
            this.user = value;
            this.session = undefined;
        }
        return Promise.resolve();
    }
}

describe('AISettingsServiceImpl', () => {

    let configuration: ScopedConfiguration;
    let service: AISettingsServiceImpl;

    beforeEach(() => {
        configuration = new ScopedConfiguration();
        const container = new Container();
        container.bind(AiConfigurationService).toConstantValue(configuration as unknown as AiConfigurationService);
        container.bind(ILogger).toConstantValue({ warn: () => { } } as unknown as ILogger).whenTargetNamed('ai-core:AISettingsServiceImpl');
        container.bind(AISettingsServiceImpl).toSelf();
        service = container.get(AISettingsServiceImpl);
    });

    describe('updateAgentSettings', () => {

        it('doesn\'t save the session value to the user settings', async () => {
            configuration.user = { Coder: { completionNotification: 'message' } };
            configuration.session = { Architect: { enable: false }, Coder: { showInChat: false } };

            await service.updateAgentSettings('Coder', { completionNotification: 'os-notification' });

            expect(configuration.user).to.deep.equal({ Coder: { completionNotification: 'os-notification' } });
        });

        it('keeps the other user settings of the agent', async () => {
            configuration.user = { Coder: { completionNotification: 'message', showInChat: false } };

            await service.updateAgentSettings('Coder', { enable: false });

            expect(configuration.user).to.deep.equal({ Coder: { completionNotification: 'message', showInChat: false, enable: false } });
        });
    });
});
