// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { DisposableCollection, Emitter, Event, ILogger } from '@theia/core';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { JSONObject } from '@theia/core/shared/@lumino/coreutils';
import { AISettings, AISettingsService, AgentSettings } from '../common';

@injectable()
export class AISettingsServiceImpl implements AISettingsService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(PreferenceService) protected preferenceService: PreferenceService;
    static readonly PREFERENCE_NAME = 'ai-features.agentSettings';

    protected toDispose = new DisposableCollection();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(
            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === AISettingsServiceImpl.PREFERENCE_NAME) {
                    this.onDidChangeEmitter.fire();
                }
            })
        );
    }

    async updateAgentSettings(agent: string, agentSettings: Partial<AgentSettings>): Promise<void> {
        const settings = await this.getSettings();
        const newAgentSettings = { ...settings[agent], ...agentSettings };
        settings[agent] = newAgentSettings;
        try {
            await this.preferenceService.set(AISettingsServiceImpl.PREFERENCE_NAME, settings, PreferenceScope.User);
        } catch (e) {
            this.onDidChangeEmitter.fire();
            this.logger.warn('Updating the preferences was unsuccessful: ' + e);
        }
    }

    async getAgentSettings(agent: string): Promise<AgentSettings | undefined> {
        const settings = await this.getSettings();
        return settings[agent];
    }

    async getSettings(): Promise<AISettings> {
        await this.preferenceService.ready;
        const pref = this.preferenceService.inspect<AISettings & JSONObject>(AISettingsServiceImpl.PREFERENCE_NAME);
        return pref?.value ? pref.value : {};
    }
}
