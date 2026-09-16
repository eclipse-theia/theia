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
    ServerToolDescriptor,
} from '@theia/ai-core/lib/common';
import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiToggleSwitch } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';

/**
 * An agent-detail subsection header with an optional trailing action, so a section-wide action (e.g. its
 * reset) rides on the title line instead of taking a prominent row of its own above the list.
 */
const AgentSectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
    <div className='settings-section-subcategory-title ai-settings-section-subcategory-title ai-agent-section-header'>
        <span>{title}</span>
        {action}
    </div>
);

/**
 * The section-wide reset: the same discard icon button the prompt variant rows use, rather than a text
 * button, so it reads as a Theia reset affordance. Its tooltip says what the section-wide reset does.
 */
const ResetAllButton: React.FC<{ title: string; disabled?: boolean; onReset: () => void }> = ({ title, disabled, onReset }) => (
    <button
        className='ai-variant-action-button ai-agent-section-header-action'
        onClick={onReset}
        disabled={disabled}
        title={title}
        aria-label={title}
    >
        <span aria-hidden='true' className={codicon('discard')}></span>
    </button>
);

export interface AgentCapabilitiesSettingsProps {
    capabilities: ParsedCapability[];
    agentId: string;
    savedOverrides: Record<string, boolean> | undefined;
    aiSettingsService: AISettingsService;
    settingsRowService: AiSettingsRowService;
    /**
     * Reveals the capability's prompt fragment on the Prompt Snippets page. The text is global, shared by
     * every agent that references it, which is why the row links there instead of editing it in place.
     */
    onOpenPromptSnippet: (fragmentId: string) => void;
}

/**
 * The "Available Capabilities" section of the agent detail page: one toggle per capability the prompt
 * declares. Each toggle writes an override only when it differs from the agent's default; a per-row
 * reset (gear menu) and a "Reset All to Defaults" button clear overrides back to the declared defaults.
 */
export const AgentCapabilitiesSettings = ({
    capabilities, agentId, savedOverrides, aiSettingsService, settingsRowService, onOpenPromptSnippet
}: AgentCapabilitiesSettingsProps) => {
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
    const snippetLinkTooltip = nls.localize('theia/ai/ide/agentConfiguration/showCapabilitySnippet', 'Show snippet');

    return <>
        <AgentSectionHeader
            title={nls.localize('theia/ai/core/agentConfiguration/availableCapabilities', 'Available Capabilities')}
            action={hasAnyOverrides && <ResetAllButton
                onReset={handleResetAll}
                disabled={loading}
                title={nls.localize('theia/ai/ide/agentConfiguration/resetAllCapabilities', 'Reset all capabilities to their default values')}
            />}
        />
        <div className='ai-configuration-item-list'>
            {capabilities.map(capability => <AiConfigurationItemRow
                key={capability.fragmentId}
                label={labelFor(capability)}
                description={capability.description}
                modified={hasOverride(capability)}
                onOpenMenu={hasOverride(capability)
                    ? gear => settingsRowService.openResetMenu(gear, () => resetCapability(capability.fragmentId))
                    : undefined}
                onActivateLabel={() => onOpenPromptSnippet(capability.fragmentId)}
                labelTooltip={snippetLinkTooltip}
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
    /** Reveals the snippet that wraps this capability type's selections, as in {@link AgentCapabilitiesSettings}. */
    onOpenPromptSnippet: (fragmentId: string) => void;
}

/**
 * The "Generic Capabilities" section of the agent detail page: one row per capability type the user has
 * selected (skills, MCP functions, functions, prompt fragments, agent delegation, variables). Only
 * selected types are shown; each row is an override with a per-type reset and a shared "Reset All".
 */
export const AgentGenericCapabilitiesSettings = ({
    agentId, savedSelections, aiSettingsService, settingsRowService, onOpenPromptSnippet
}: AgentGenericCapabilitiesSettingsProps) => {
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
    const promptIdFor = (type: keyof GenericCapabilitySelections): string =>
        CAPABILITY_TYPE_PROMPT_MAP.find(entry => entry.type === type)!.promptId;
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
        <AgentSectionHeader
            title={nls.localize('theia/ai/ide/agentConfiguration/genericCapabilitiesSettings', 'Generic Capabilities')}
            action={shownTypes.length > 0 && <ResetAllButton
                onReset={handleResetAll}
                disabled={loading}
                title={nls.localize('theia/ai/ide/agentConfiguration/resetAllGenericCapabilities', 'Reset all generic capability selections')}
            />}
        />
        <div className='ai-configuration-item-list'>
            {shownTypes.map(type => <AiConfigurationItemRow
                key={type}
                label={getDisplayName(type)}
                description={(savedSelections?.[type] ?? []).join(', ')}
                modified={true}
                onOpenMenu={gear => settingsRowService.openResetMenu(gear, () => handleReset(type))}
                onActivateLabel={() => onOpenPromptSnippet(promptIdFor(type))}
                labelTooltip={nls.localize('theia/ai/ide/agentConfiguration/showCapabilitySnippet', 'Show snippet')}
            />)}
        </div>
    </>;
};

export interface AgentServerToolsSettingsProps {
    agentId: string;
    /** Server tools the agent's model offers. */
    tools: ServerToolDescriptor[];
    /** Vendor the selections are keyed by: the vendor of the model offering the tools. */
    vendor: string;
    savedSelections: Record<string, string[]> | undefined;
    aiSettingsService: AISettingsService;
    /** Backs each enabled row's gear menu, whose "Reset Setting" switches that tool back off. */
    settingsRowService: AiSettingsRowService;
}

/**
 * The "Server Tools" section of the agent detail page: one toggle per tool the agent's model offers, executed
 * by the provider rather than by Theia. The same per-agent setting the chat input's capabilities popup writes,
 * keyed by model vendor because the tools are vendor-specific.
 *
 * Nothing is enabled unless it is listed, so an enabled tool is the deviation from the default and carries the
 * modified indicator; "Reset All to Defaults" drops this vendor's selections, leaving other vendors' alone.
 */
export const AgentServerToolsSettings = ({
    agentId, tools, vendor, savedSelections, aiSettingsService, settingsRowService
}: AgentServerToolsSettingsProps) => {
    const [loading, setLoading] = React.useState(false);
    const enabledIds = savedSelections?.[vendor] ?? [];

    const update = async (ids: string[]): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            // Drop the vendor's entry entirely once nothing is enabled, rather than leaving an empty array behind.
            const next = { ...savedSelections };
            if (ids.length > 0) {
                next[vendor] = ids;
            } else {
                delete next[vendor];
            }
            await aiSettingsService.updateAgentSettings(agentId, {
                serverToolSelections: Object.keys(next).length > 0 ? next : undefined
            });
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (toolId: string, enabled: boolean): Promise<void> =>
        update(enabled ? [...enabledIds, toolId] : enabledIds.filter(id => id !== toolId));

    return <>
        <AgentSectionHeader
            title={nls.localize('theia/ai/core/languageModelRenderer/serverTools', 'Server Tools')}
            action={enabledIds.length > 0 && <ResetAllButton
                onReset={() => update([])}
                disabled={loading}
                title={nls.localize('theia/ai/ide/agentConfiguration/resetAllServerTools', 'Turn off every server tool of this provider')}
            />}
        />
        {/* Same warning the capabilities popup shows on its Server Tools group, since enabling one here has
            exactly that consequence. Reuses that key so both read identically in every language. */}
        <div className='ai-agent-section-warning'>
            <span aria-hidden='true' className={codicon('warning')}></span>
            <span>{nls.localize('theia/ai/chat-ui/serverToolsWarning',
                'These tools are auto-approved when selected. They may be executed by the model at any time.')}</span>
        </div>
        <div className='ai-configuration-item-list'>
            {tools.map(tool => {
                const enabled = enabledIds.includes(tool.id);
                return <AiConfigurationItemRow
                    key={tool.id}
                    label={tool.name}
                    description={tool.description}
                    modified={enabled}
                    onOpenMenu={enabled
                        ? gear => settingsRowService.openResetMenu(gear, () => handleToggle(tool.id, false))
                        : undefined}
                    trailing={<AiToggleSwitch
                        checked={enabled}
                        disabled={loading}
                        ariaLabel={tool.name}
                        onChange={checked => handleToggle(tool.id, checked)}
                    />}
                />;
            })}
        </div>
    </>;
};
