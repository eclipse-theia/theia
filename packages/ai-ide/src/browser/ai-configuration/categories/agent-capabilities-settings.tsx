// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import {
    AISettingsService,
    ParsedCapability,
    GenericCapabilitySelections,
    CAPABILITY_TYPE_PROMPT_MAP,
} from '@theia/ai-core/lib/common';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiToggleSwitch } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';

export interface AgentCapabilitiesSettingsProps {
    capabilities: ParsedCapability[];
    agentId: string;
    savedOverrides: Record<string, boolean> | undefined;
    aiSettingsService: AISettingsService;
    settingsRowService: AiSettingsRowService;
}

/**
 * The "Available Capabilities" section of the agent detail page: one toggle per capability the prompt
 * declares. Each toggle writes an override only when it differs from the agent's default; a per-row
 * reset (gear menu) and a "Reset All to Defaults" button clear overrides back to the declared defaults.
 */
export const AgentCapabilitiesSettings = ({ capabilities, agentId, savedOverrides, aiSettingsService, settingsRowService }: AgentCapabilitiesSettingsProps) => {
    const [loading, setLoading] = React.useState(false);

    const handleToggle = async (fragmentId: string, currentValue: boolean): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            const capability = capabilities.find(c => c.fragmentId === fragmentId);
            if (!capability) {
                return;
            }
            const newValue = !currentValue;
            const newOverrides = { ...savedOverrides };
            if (newValue === capability.defaultEnabled) {
                delete newOverrides[fragmentId];
            } else {
                newOverrides[fragmentId] = newValue;
            }
            await aiSettingsService.updateAgentSettings(agentId, { capabilityOverrides: newOverrides });
        } finally {
            setLoading(false);
        }
    };

    const handleResetAll = async (): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            await aiSettingsService.updateAgentSettings(agentId, { capabilityOverrides: undefined });
        } finally {
            setLoading(false);
        }
    };

    // Drop a single capability's override so it falls back to the agent's default.
    const resetCapability = async (fragmentId: string): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            const newOverrides = { ...savedOverrides };
            delete newOverrides[fragmentId];
            await aiSettingsService.updateAgentSettings(agentId, { capabilityOverrides: newOverrides });
        } finally {
            setLoading(false);
        }
    };

    const getCurrentValue = (capability: ParsedCapability): boolean =>
        savedOverrides && capability.fragmentId in savedOverrides ? savedOverrides[capability.fragmentId] : capability.defaultEnabled;
    const hasOverride = (capability: ParsedCapability): boolean => savedOverrides !== undefined && capability.fragmentId in savedOverrides;
    const hasAnyOverrides = savedOverrides && Object.keys(savedOverrides).length > 0;
    // Show "Name (id)" when the fragment declares a name; otherwise just the id.
    const labelFor = (capability: ParsedCapability): string =>
        capability.name ? `${capability.name} (${capability.fragmentId})` : capability.fragmentId;

    return <>
        {hasAnyOverrides && <div className='capability-reset-all-container'>
            <button
                className='theia-button secondary'
                onClick={handleResetAll}
                disabled={loading}
                title={nls.localize('theia/ai/ide/agentConfiguration/resetAllCapabilities', 'Reset all capabilities to their default values')}>
                {nls.localize('theia/ai/ide/agentConfiguration/resetAllDefaults', 'Reset All to Defaults')}
            </button>
        </div>}
        <div className='ai-configuration-item-list'>
            {capabilities.map(capability => <AiConfigurationItemRow
                key={capability.fragmentId}
                label={labelFor(capability)}
                description={capability.description}
                modified={hasOverride(capability)}
                onOpenMenu={hasOverride(capability)
                    ? gear => settingsRowService.openResetMenu(gear, () => resetCapability(capability.fragmentId))
                    : undefined}
                trailing={<AiToggleSwitch
                    checked={getCurrentValue(capability)}
                    disabled={loading}
                    ariaLabel={labelFor(capability)}
                    onChange={() => handleToggle(capability.fragmentId, getCurrentValue(capability))}
                />}
            />)}
        </div>
    </>;
};

export interface AgentGenericCapabilitiesSettingsProps {
    agentId: string;
    savedSelections: GenericCapabilitySelections | undefined;
    aiSettingsService: AISettingsService;
    settingsRowService: AiSettingsRowService;
}

/**
 * The "Generic Capabilities" section of the agent detail page: one row per capability type the user has
 * selected (skills, MCP functions, functions, prompt fragments, agent delegation, variables). Only
 * selected types are shown; each row is an override with a per-type reset and a shared "Reset All".
 */
export const AgentGenericCapabilitiesSettings = ({ agentId, savedSelections, aiSettingsService, settingsRowService }: AgentGenericCapabilitiesSettingsProps) => {
    const [loading, setLoading] = React.useState(false);

    const handleResetAll = async (): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            await aiSettingsService.updateAgentSettings(agentId, { genericCapabilitySelections: undefined });
        } finally {
            setLoading(false);
        }
    };

    // Drop a single capability type's selections.
    const handleReset = async (capabilityType: keyof GenericCapabilitySelections): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            await aiSettingsService.updateAgentSettings(agentId, { genericCapabilitySelections: { ...savedSelections, [capabilityType]: undefined } });
        } finally {
            setLoading(false);
        }
    };

    const capabilityTypes = CAPABILITY_TYPE_PROMPT_MAP.map(m => m.type);
    const getDisplayName = (type: keyof GenericCapabilitySelections): string => ({
        skills: nls.localizeByDefault('Skills'),
        mcpFunctions: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/mcpFunctions', 'MCP Functions'),
        functions: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/functions', 'Functions'),
        promptFragments: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/promptFragments', 'Prompt Fragments'),
        agentDelegation: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/agentDelegation', 'Agent Delegation'),
        variables: nls.localizeByDefault('Variables')
    } as const)[type];

    // Only types the user has actually selected are shown; each such row is an override, so it carries the
    // modified bar. A single "Reset All" clears every selection, mirroring the Available Capabilities section.
    const shownTypes = capabilityTypes.filter(type => (savedSelections?.[type]?.length ?? 0) > 0);
    return <>
        {shownTypes.length > 0 && <div className='capability-reset-all-container'>
            <button
                className='theia-button secondary'
                onClick={handleResetAll}
                disabled={loading}
                title={nls.localize('theia/ai/ide/agentConfiguration/resetAllGenericCapabilities', 'Reset all generic capability selections')}>
                {nls.localize('theia/ai/ide/agentConfiguration/resetAllDefaults', 'Reset All to Defaults')}
            </button>
        </div>}
        <div className='ai-configuration-item-list'>
            {shownTypes.map(type => <AiConfigurationItemRow
                key={type}
                label={getDisplayName(type)}
                description={(savedSelections?.[type] ?? []).join(', ')}
                modified={true}
                onOpenMenu={gear => settingsRowService.openResetMenu(gear, () => handleReset(type))}
            />)}
        </div>
    </>;
};
