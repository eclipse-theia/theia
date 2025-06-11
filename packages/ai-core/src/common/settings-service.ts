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
import { Event } from '@theia/core';
import { LanguageModelRequirement } from './language-model';
import { NotificationType } from './notification-types';

export const AISettingsService = Symbol('AISettingsService');
/**
 * Service to store and retrieve settings on a per-agent basis.
 */
export interface AISettingsService {
    updateAgentSettings(agent: string, agentSettings: Partial<AgentSettings>): Promise<void>;
    getAgentSettings(agent: string): Promise<AgentSettings | undefined>;
    getSettings(): Promise<AISettings>;
    onDidChange: Event<void>;
}
export type AISettings = Record<string, AgentSettings>;
export interface AgentSettings {
    languageModelRequirements?: LanguageModelRequirement[];
    enable?: boolean;
    /**
     * A mapping of main template IDs to their selected variant IDs.
     * If a main template is not present in this mapping, it means the main template is used.
     */
    selectedVariants?: Record<string, string>;
    /**
     * Configuration for completion notifications when the agent finishes a task.
     * If undefined, defaults to 'off'.
     */
    completionNotification?: NotificationType;
}
