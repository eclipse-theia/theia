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
    Agent,
    LanguageModel,
    NotificationType,
    PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
    GenericCapabilitySelections,
} from '@theia/ai-core/lib/common';
import { LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { isChatAgent } from '@theia/ai-chat/lib/common';
import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { OPEN_AI_CONFIG_VIEW } from '../ai-configuration-view-contribution';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemDetailHeader } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AiConfigurationItemRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-row';
import { AiConfigurationItemStatus } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiToggleSwitch } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';
import { VariantSetCard } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/variant-set-card';
import { LanguageModelRenderer } from '../language-model-renderer';
import { AgentNotificationSettings } from '../components/agent-notification-settings';
import { getAgentIconClass } from '../agent-icon';
import { AgentDetailServices, AgentDetailState, loadAgentDetail } from './agent-detail-model';
import { AgentCapabilitiesSettings, AgentGenericCapabilitiesSettings, AgentServerToolsSettings } from './agent-capabilities-settings';

export interface AgentDetailViewProps {
    readonly agent: Agent;
    readonly services: AgentDetailServices;
    /** Category-wide model/alias caches, resolved by the owning category. */
    readonly languageModels: LanguageModel[] | undefined;
    readonly languageModelAliases: LanguageModelAlias[];
    /** Bumped by the owning category on every upstream change, to re-run the async detail load. */
    readonly revision: number;
    /**
     * Reveals a capability's prompt fragment on the Prompt Snippets page, which owns the (global) text.
     * Provided by the category, which has the navigation context.
     */
    readonly onOpenPromptSnippet: (fragmentId: string) => void;
    /** Reveals a tool on the Tools page, where its confirmation mode is set. */
    readonly onOpenTool: (toolName: string) => void;
}

/**
 * The Agents item-detail page: enable/show-in-chat toggles, description, prompt
 * templates, LLM requirements, used variables/functions, capabilities and
 * notification settings. Owns its async state (parsed prompt parts + agent
 * settings), reloading whenever {@link AgentDetailViewProps.revision} changes.
 */
export const AgentDetailView: React.FC<AgentDetailViewProps> = ({
    agent, services, languageModels, languageModelAliases, revision, onOpenPromptSnippet, onOpenTool
}) => {
    const { agentService, aiSettingsService, variableService, promptService, languageModelRegistry, toolInvocationRegistry, commandService, settingsRowService } = services;
    const [state, setState] = React.useState<AgentDetailState | undefined>(undefined);

    React.useEffect(() => {
        let disposed = false;
        loadAgentDetail(agent, services).then(loaded => {
            if (!disposed) {
                setState(loaded);
            }
        });
        return () => { disposed = true; };
    }, [agent, revision, aiSettingsService, promptService, variableService]);

    const enabled = agentService.isEnabled(agent.id);

    const toggleEnabled = React.useCallback(() => {
        if (enabled) {
            agentService.disableAgent(agent.id);
        } else {
            agentService.enableAgent(agent.id);
        }
    }, [agent, agentService, enabled]);

    const toggleShowInChat = React.useCallback(() => {
        if (!enabled || !state) {
            return;
        }
        aiSettingsService.updateAgentSettings(agent.id, { showInChat: !state.showInChat });
    }, [agent, aiSettingsService, enabled, state]);

    const handleNotificationTypeChange = React.useCallback(async (agentId: string, notificationType: NotificationType | undefined): Promise<void> => {
        await aiSettingsService.updateAgentSettings(agentId, { completionNotification: notificationType });
    }, [aiSettingsService]);

    const openNotificationSettings = React.useCallback((): void => {
        commandService.executeCommand(OPEN_AI_CONFIG_VIEW.id, PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE);
    }, [commandService]);

    const header = <AiConfigurationItemDetailHeader
        title={agent.name}
        iconClass={getAgentIconClass(agent)}
        subtitle={nls.localizeByDefault('Id: {0}', agent.id)}
        actions={<AgentDetailToggles
            enabled={enabled}
            showInChat={state?.showInChat ?? true}
            showInChatVisible={isChatAgent(agent)}
            onToggleEnabled={toggleEnabled}
            onToggleShowInChat={toggleShowInChat}
        />}
    />;

    if (!state) {
        return <>
            {header}
            <div className='ai-agent-detail-loading'>{nls.localizeByDefault('Loading...')}</div>
        </>;
    }

    const globalVariables = Array.from(new Set([...state.parsed.globalVariables, ...agent.variables]));
    const functions = Array.from(new Set([...state.parsed.functions, ...agent.functions]));

    // Rows for the "Used by this agent" lists, rendered with the shared list so global variables,
    // agent-specific variables and functions all look the same (replacing three custom renderers). Each
    // shows a description when it has one and the lists are sorted alphabetically by label.
    const byLabel = <T extends { label: string }>(rows: T[]): T[] => [...rows].sort((a, b) => a.label.localeCompare(b.label));
    const allVariables = variableService.getVariables();
    const globalVariableRows = byLabel(globalVariables.map(id => {
        const variable = allVariables.find(candidate => candidate.id === id);
        return { id, label: variable?.name ?? id, description: variable?.description || undefined };
    }));
    const functionRows = byLabel(functions.map(id => ({ id, label: id, description: toolInvocationRegistry.getFunction(id)?.description || undefined })));
    const agentSpecificNames = Array.from(new Set([...state.parsed.agentSpecificVariables, ...agent.agentSpecificVariables.map(v => v.name)]));
    const agentSpecificRows = byLabel(agentSpecificNames.map(name => {
        const declared = agent.agentSpecificVariables.find(v => v.name === name);
        const undeclared = declared === undefined;
        const notUsed = !state.parsed.agentSpecificVariables.includes(name) && declared?.usedInPrompt === true;
        const status: AiConfigurationItemStatus | undefined = undeclared
            ? {
                kind: 'warn', label: nls.localize('theia/ai/core/agentConfiguration/undeclared', 'Undeclared'),
                tooltip: nls.localize('theia/ai/core/agentConfiguration/undeclaredTooltip', 'This variable is used in the prompt but has no description declared by the agent.')
            }
            : notUsed
                ? {
                    kind: 'warn', label: nls.localize('theia/ai/core/agentConfiguration/notUsedInPrompt', 'Not used in prompt'),
                    tooltip: nls.localize('theia/ai/core/agentConfiguration/notUsedInPromptTooltip',
                        'This variable is declared by the agent but not referenced in the current prompt template.')
                }
                : undefined;
        return { id: name, label: name, description: undeclared ? undefined : declared?.description || undefined, status };
    }));

    // Map each variant id to the display name used by the chat mode switcher (the agent's ChatMode names).
    const variantLabels: Record<string, string> = {};
    if (isChatAgent(agent) && agent.modes) {
        for (const mode of agent.modes) {
            variantLabels[mode.id] = mode.name;
        }
    }

    return <div key={agent.id} className='ai-agent-detail'>
        {header}

        {agent.description && <div className='ai-agent-description'>{agent.description}</div>}

        {agent.prompts.length > 0 && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localizeByDefault('Prompts')}
            </div>
            <div className='ai-configuration-item-list'>
                {agent.prompts.map(prompt => <VariantSetCard
                    key={agent.id + '.' + prompt.id}
                    agentId={agent.id}
                    promptVariantSetId={prompt.id}
                    promptService={promptService}
                    settingsRowService={settingsRowService}
                    variantLabels={variantLabels}
                />)}
            </div>
        </>}

        <div className='ai-lm-requirements'>
            <LanguageModelRenderer
                agent={agent}
                languageModels={languageModels}
                aiSettingsService={aiSettingsService}
                languageModelRegistry={languageModelRegistry}
                languageModelAliases={languageModelAliases}
                settingsRowService={settingsRowService}
            />
        </div>

        {isChatAgent(agent) && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localize('theia/ai/core/agentConfiguration/notificationSettings', 'Notification Settings')}
            </div>
            <AgentNotificationSettings
                agentId={agent.id}
                currentNotificationType={state.completionNotification}
                onNotificationTypeChange={handleNotificationTypeChange}
                onOpenNotificationSettings={openNotificationSettings}
                settingsRowService={settingsRowService}
            />
        </>}

        {state.parsed.capabilities.length > 0 && <AgentCapabilitiesSettings
                capabilities={state.parsed.capabilities}
                agentId={agent.id}
                savedOverrides={state.capabilityOverrides}
                aiSettingsService={aiSettingsService}
                settingsRowService={settingsRowService}
                onOpenPromptSnippet={onOpenPromptSnippet}
        />}

        {GenericCapabilitySelections.hasSelections(state.genericCapabilitySelections) && <AgentGenericCapabilitiesSettings
                agentId={agent.id}
                savedSelections={state.genericCapabilitySelections}
                aiSettingsService={aiSettingsService}
                settingsRowService={settingsRowService}
                onOpenPromptSnippet={onOpenPromptSnippet}
        />}

        {state.serverTools && state.serverTools.length > 0 && state.serverToolVendor && <AgentServerToolsSettings
            agentId={agent.id}
            tools={state.serverTools}
            vendor={state.serverToolVendor}
            savedSelections={state.serverToolSelections}
            aiSettingsService={aiSettingsService}
            settingsRowService={settingsRowService}
        />}

        {globalVariableRows.length > 0 && <CollapsibleSubsection
            title={nls.localize('theia/ai/core/agentConfiguration/usedGlobalVariables', 'Used Global Variables')}
            count={globalVariableRows.length}>
            <div className='ai-configuration-item-list'>
                {globalVariableRows.map(row => <AiConfigurationItemRow key={row.id} label={row.label} description={row.description} />)}
            </div>
        </CollapsibleSubsection>}

        {agentSpecificRows.length > 0 && <CollapsibleSubsection
            title={nls.localize('theia/ai/core/agentConfiguration/usedAgentSpecificVariables', 'Used Agent-Specific Variables')}
            count={agentSpecificRows.length}>
            <div className='ai-configuration-item-list'>
                {agentSpecificRows.map(row => <AiConfigurationItemRow key={row.id} label={row.label} description={row.description} status={row.status} />)}
            </div>
        </CollapsibleSubsection>}

        {functionRows.length > 0 && <CollapsibleSubsection
            title={nls.localize('theia/ai/core/agentConfiguration/usedTools', 'Used Tools')}
            count={functionRows.length}>
            <div className='ai-configuration-item-list'>
                {/* The label links to the Tools page, where the tool's confirmation mode is configured. */}
                {functionRows.map(row => <AiConfigurationItemRow
                    key={row.id}
                    label={row.label}
                    description={row.description}
                    onActivateLabel={() => onOpenTool(row.id)}
                    labelTooltip={nls.localize('theia/ai/ide/agentConfiguration/showToolSettings', 'Show tool')}
                />)}
            </div>
        </CollapsibleSubsection>}
    </div>;
};

/**
 * A read-only detail subsection whose body collapses under a subcategory-styled header (chevron + item
 * count). Collapsed by default to keep the agent page compact; the header matches the non-collapsible
 * subcategory titles above it. Used for the "Used …" reference lists (variables, functions).
 */
const CollapsibleSubsection: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => {
    const [open, setOpen] = React.useState(false);
    const toggle = React.useCallback(() => setOpen(previous => !previous), []);
    const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
        }
    }, [toggle]);
    return <div className='ai-collapsible-subsection'>
        <div
            className='settings-section-subcategory-title ai-settings-section-subcategory-title ai-collapsible-subsection-header'
            role='button'
            tabIndex={0}
            aria-expanded={open}
            onClick={toggle}
            onKeyDown={onKeyDown}>
            <span aria-hidden='true' className={`ai-collapsible-subsection-chevron ${codicon(open ? 'chevron-down' : 'chevron-right')}`}></span>
            <span>{title}</span>
            <span className='ai-collapsible-subsection-count'>{count}</span>
        </div>
        {open && children}
    </div>;
};

interface AgentDetailTogglesProps {
    enabled: boolean;
    showInChat: boolean;
    showInChatVisible: boolean;
    onToggleEnabled: () => void;
    onToggleShowInChat: () => void;
}
const AgentDetailToggles = ({ enabled, showInChat, showInChatVisible, onToggleEnabled, onToggleShowInChat }: AgentDetailTogglesProps) => (
    <div className='agent-toggles'>
        <div className='agent-enable-toggle' title={nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}>
            <span className='toggle-label'>{nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}</span>
            <AiToggleSwitch
                checked={enabled}
                ariaLabel={nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}
                onChange={onToggleEnabled}
            />
        </div>
        {showInChatVisible && <div
            className={`agent-enable-toggle${enabled ? '' : ' disabled'}`}
            title={nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}>
            <span className='toggle-label'>{nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}</span>
            <AiToggleSwitch
                checked={showInChat}
                disabled={!enabled}
                ariaLabel={nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}
                onChange={onToggleShowInChat}
            />
        </div>}
    </div>
);
