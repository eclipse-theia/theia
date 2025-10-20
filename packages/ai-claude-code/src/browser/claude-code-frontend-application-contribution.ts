// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { AgentService } from '@theia/ai-core';
import { PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CLAUDE_CHAT_AGENT_ID } from './claude-code-chat-agent';
import { API_KEY_PREF } from './claude-code-frontend-service';

@injectable()
export class ClaudeCodeFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    protected envApiKey: string | undefined;

    onStart(): void {
        this.preferenceService.ready.then(async () => {
            this.envApiKey = await this.readEnvAnthropicApiKey();

            const preferenceValue = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.updateAgentState(preferenceValue);

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    this.handlePreferenceChange(event.newValue);
                }
            });
        });
    }

    protected async readEnvAnthropicApiKey(): Promise<string | undefined> {
        try {
            const variable = await this.envVariablesServer.getValue('ANTHROPIC_API_KEY');
            const value = variable?.value?.trim();
            return value && value.length > 0 ? value : undefined;
        } catch {
            return undefined;
        }
    }

    protected normalizeApiKeyValue(value: unknown): string | undefined {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
        return undefined;
    }

    protected updateAgentState(preferenceValue: unknown): void {
        const preferenceApiKey = this.normalizeApiKeyValue(preferenceValue);
        if (preferenceApiKey || this.envApiKey) {
            this.agentService.enableAgent(CLAUDE_CHAT_AGENT_ID);
        } else {
            this.agentService.disableAgent(CLAUDE_CHAT_AGENT_ID);
        }
    }

    protected handlePreferenceChange(newValue: unknown): void {
        this.updateAgentState(newValue);
    }
}
