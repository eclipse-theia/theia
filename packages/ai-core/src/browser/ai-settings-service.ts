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
import { DisposableCollection, Emitter, Event } from '@theia/core';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/browser';
import { JSONObject } from '@theia/core/shared/@phosphor/coreutils';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LanguageModelRequirement } from '../common';

@injectable()
export class AISettingsService {
    @inject(PreferenceService) protected preferenceService: PreferenceService;
    static readonly PREFERENCE_NAME = 'ai.settings';

    protected toDispose = new DisposableCollection();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    onDidChange: Event<void> = this.onDidChangeEmitter.event;

    updateAgentSettings(agent: string, agentSettings: AgentSettings): void {
        const settings = this.getSettings();
        settings.agents[agent] = agentSettings;
        this.preferenceService.set(AISettingsService.PREFERENCE_NAME, settings, PreferenceScope.User);
        this.onDidChangeEmitter.fire();
    }

    getAgentSettings(agent: string): AgentSettings | undefined {
        const settings = this.getSettings();
        return settings.agents[agent];
    }

    getSettings(): AISettings {
        const pref = this.preferenceService.inspect<AISettings>(AISettingsService.PREFERENCE_NAME);
        return pref?.value ? pref.value : { agents: {} };
    }

}
export interface AISettings extends JSONObject {
    agents: Record<string, AgentSettings>
}

interface AgentSettings extends JSONObject {
    languageModelRequirements: LanguageModelRequirement[];
}
