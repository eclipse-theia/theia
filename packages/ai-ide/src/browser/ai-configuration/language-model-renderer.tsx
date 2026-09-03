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
import * as React from '@theia/core/shared/react';
import {
    Agent,
    AISettingsService,
    FrontendLanguageModelRegistry,
    LanguageModel,
    LanguageModelRequirement,
    PREFERENCE_NAME_REASONING,
    ReasoningLevel,
    ReasoningPreferenceEntry,
    ReasoningSupport
} from '@theia/ai-core/lib/common';
import { mergeReasoningSettings } from '@theia/ai-core/lib/browser/frontend-language-model-service';
import { LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { Mutable } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { AiConfigurationSettingRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-setting-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';

export interface LanguageModelSettingsProps {
    agent: Agent;
    languageModels?: LanguageModel[];
    aiSettingsService: AISettingsService;
    languageModelRegistry: FrontendLanguageModelRegistry;
    languageModelAliases: LanguageModelAlias[];
    /** Backs each purpose row's gear menu (its "Reset Setting" drops that purpose's override). */
    settingsRowService: AiSettingsRowService;
}

/**
 * The model/alias picker for a single requirement, backed by the shared {@link SelectComponent}.
 * Extracted so its `onChange` can be a stable, purpose-bound callback (rather than an inline closure)
 * per the React guideline.
 */
const ModelSelect: React.FC<{
    id: string;
    purpose: string;
    value: string | undefined;
    options: SelectOption[];
    onSelect: (purpose: string, identifier: string) => void;
}> = ({ id, purpose, value, options, onSelect }) => {
    const handleChange = React.useCallback((option: SelectOption): void => {
        onSelect(purpose, option.value ?? '');
    }, [onSelect, purpose]);
    return <SelectComponent
        id={id}
        className='ai-config-select'
        options={options}
        defaultValue={value}
        onChange={handleChange}
    />;
};

/** Same wording as the chat input's selector, so a level reads identically wherever it is set. */
const reasoningLevelLabel = (level: ReasoningLevel): string => {
    switch (level) {
        case 'off': return nls.localizeByDefault('Off');
        case 'minimal': return nls.localizeByDefault('Minimal');
        case 'low': return nls.localizeByDefault('Low');
        case 'medium': return nls.localizeByDefault('Medium');
        case 'high': return nls.localizeByDefault('High');
        case 'auto': return nls.localizeByDefault('Auto');
    }
};

/**
 * The agent's persisted reasoning level, shown right below its models because that is the model
 * capability it depends on. The chat input's selector writes this same per-agent setting, so without this
 * row there is no way to see what it stored, change it outside a chat, or clear it again.
 *
 * Shown only while the resolved model declares reasoning support, matching the chat input, which hides its
 * selector in that case. The select carries `theia-ReasoningLevelSelector` so it shows the same per-level
 * lightbulb glyphs as the chat input.
 *
 * Exported for tests: the glyph class it builds is the contract with `ai-chat-ui`'s shared CSS.
 */
export const ReasoningRow: React.FC<{
    support: ReasoningSupport;
    /** Level stored for this agent; `undefined` means the level is inherited. */
    savedLevel?: ReasoningLevel;
    /** Level that applies when nothing is stored: the matching preference default, else the model's. */
    inheritedLevel: ReasoningLevel;
    onSelect: (level: ReasoningLevel) => void;
    onReset: () => void;
    settingsRowService: AiSettingsRowService;
}> = ({ support, savedLevel, inheritedLevel, onSelect, onReset, settingsRowService }) => {
    const options = React.useMemo<SelectOption[]>(
        () => support.supportedLevels.map(level => ({ value: level, label: reasoningLevelLabel(level) })),
        [support]
    );
    const handleChange = React.useCallback((option: SelectOption): void => {
        if (option.value) {
            onSelect(option.value as ReasoningLevel);
        }
    }, [onSelect]);
    const effectiveLevel = savedLevel ?? inheritedLevel;
    return <AiConfigurationSettingRow
        title={nls.localizeByDefault('Reasoning')}
        description={savedLevel
            ? nls.localize('theia/ai/core/languageModelRenderer/reasoningStored',
                'Reasoning effort this agent asks the model for. Set here or by the chat input\'s selector, which writes the same setting.')
            : nls.localize('theia/ai/core/languageModelRenderer/reasoningInherited',
                'Reasoning effort this agent asks the model for. Not set, so "{0}" applies, from the reasoning defaults preference or the model.',
                reasoningLevelLabel(inheritedLevel))}
        modified={savedLevel !== undefined}
        below={<SelectComponent
            className={`ai-config-select theia-ReasoningLevelSelector reasoning-level-${effectiveLevel}`}
            options={options}
            defaultValue={effectiveLevel}
            onChange={handleChange}
        />}
        onOpenMenu={savedLevel !== undefined ? gear => settingsRowService.openResetMenu(gear, onReset) : undefined}
    />;
};

export const LanguageModelRenderer: React.FC<LanguageModelSettingsProps> = (
    { agent, languageModels, aiSettingsService, languageModelRegistry, languageModelAliases: aliases, settingsRowService }) => {

    const [lmRequirementMap, setLmRequirementMap] = React.useState<Record<string, LanguageModelRequirement>>({});
    const [overriddenPurposes, setOverriddenPurposes] = React.useState<ReadonlySet<string>>(new Set());
    const [resolvedAliasModels, setResolvedAliasModels] = React.useState<Record<string, LanguageModel | undefined>>({});
    /** Level stored for this agent, as the chat input's selector persists it; `undefined` means inherited. */
    const [savedReasoningLevel, setSavedReasoningLevel] = React.useState<ReasoningLevel | undefined>(undefined);

    // Merge the agent's declared requirements with the user's per-purpose overrides, resolving a default model
    // where none is selected, and track which purposes the user has explicitly overridden (for the reset action).
    const loadRequirements = React.useCallback(async (): Promise<void> => {
        const settings = await aiSettingsService.getAgentSettings(agent.id);
        const userRequirements = settings?.languageModelRequirements ?? [];
        const overrides = new Set<string>();
        const map: Record<string, LanguageModelRequirement> = {};
        for (const declared of agent.languageModelRequirements) {
            const userRequirement = userRequirements.find(e => e.purpose === declared.purpose);
            if (userRequirement) {
                overrides.add(declared.purpose);
            }
            const lmRequirement = userRequirement ?? declared;
            if (!lmRequirement.identifier) {
                const llm = await languageModelRegistry.selectLanguageModel({ agent: agent.id, ...lmRequirement });
                (lmRequirement as Mutable<LanguageModelRequirement>).identifier = llm?.id;
            }
            map[declared.purpose] = lmRequirement;
        }
        setLmRequirementMap(map);
        setOverriddenPurposes(overrides);
        setSavedReasoningLevel(settings?.reasoning?.level);
    }, [agent, aiSettingsService, languageModelRegistry]);

    React.useEffect(() => { loadRequirements(); }, [loadRequirements]);

    // Effect to resolve alias to model whenever requirements.identifier or aliases change
    React.useEffect(() => {
        const resolveAliases = async () => {
            const newResolved: Record<string, LanguageModel | undefined> = {};
            await Promise.all(Object.values(lmRequirementMap).map(async requirements => {
                const id = requirements.identifier;
                if (id && aliases.some(a => a.id === id)) {
                    newResolved[id] = await languageModelRegistry.getReadyLanguageModel(id);
                }
            }));
            setResolvedAliasModels(newResolved);
        };
        resolveAliases();
    }, [lmRequirementMap, aliases]);

    /**
     * The model behind the agent's requirements that declares reasoning support, and the id it is known by.
     * Mirrors the chat input, which takes the first supporting model it resolves for the receiving agent.
     */
    const reasoningModel = React.useMemo<LanguageModel | undefined>(() => {
        for (const requirement of Object.values(lmRequirementMap)) {
            const identifier = requirement.identifier;
            if (!identifier) {
                continue;
            }
            const model = aliases.some(alias => alias.id === identifier)
                ? resolvedAliasModels[identifier]
                : languageModels?.find(candidate => candidate.id === identifier);
            if (model?.reasoningSupport) {
                return model;
            }
        }
        return undefined;
    }, [lmRequirementMap, resolvedAliasModels, aliases, languageModels]);

    /** What applies while the agent stores no level: the matching reasoning default, else the model's own. */
    const inheritedReasoningLevel = React.useMemo<ReasoningLevel>(() => {
        const support = reasoningModel?.reasoningSupport;
        if (!support) {
            return 'off';
        }
        const entries = settingsRowService.inspect(PREFERENCE_NAME_REASONING, 'user').value as ReasoningPreferenceEntry[] | undefined;
        const [providerId, modelId] = (reasoningModel?.id ?? '').split('/');
        const fromPreference = entries?.length
            ? mergeReasoningSettings(entries, modelId, providerId, agent.id)?.reasoning?.level
            : undefined;
        return fromPreference ?? support.defaultLevel ?? support.supportedLevels[0] ?? 'off';
    }, [reasoningModel, settingsRowService, agent.id]);

    const onReasoningChange = React.useCallback(async (level: ReasoningLevel): Promise<void> => {
        await aiSettingsService.updateAgentSettings(agent.id, { reasoning: { level } });
        setSavedReasoningLevel(level);
    }, [aiSettingsService, agent.id]);

    // Drop the stored level so the preference default (or the model's) applies again.
    const onResetReasoning = React.useCallback(async (): Promise<void> => {
        await aiSettingsService.updateAgentSettings(agent.id, { reasoning: undefined });
        setSavedReasoningLevel(undefined);
    }, [aiSettingsService, agent.id]);

    const onSelectedModelChange = React.useCallback((purpose: string, identifier: string): void => {
        const newLmRequirementMap = { ...lmRequirementMap, [purpose]: { purpose, identifier } };
        aiSettingsService.updateAgentSettings(agent.id, { languageModelRequirements: Object.values(newLmRequirementMap) });
        setLmRequirementMap(newLmRequirementMap);
        setOverriddenPurposes(previous => new Set(previous).add(purpose));
    }, [lmRequirementMap, aiSettingsService, agent.id]);

    // Reset a purpose: drop the user override so it falls back to the agent's declared requirement.
    const onResetPurpose = React.useCallback(async (purpose: string): Promise<void> => {
        const settings = await aiSettingsService.getAgentSettings(agent.id);
        const remaining = (settings?.languageModelRequirements ?? []).filter(requirement => requirement.purpose !== purpose);
        await aiSettingsService.updateAgentSettings(agent.id, { languageModelRequirements: remaining });
        await loadRequirements();
    }, [aiSettingsService, agent.id, loadRequirements]);

    // The empty entry preserves the "no selection" choice; aliases are listed first, then language models.
    const modelSelectOptions = React.useMemo<SelectOption[]>(() => {
        const options: SelectOption[] = [{ value: '', label: '' }];
        aliases?.slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(alias => {
            options.push({
                value: alias.id,
                label: nls.localize('theia/ai/core/languageModelRenderer/alias', '[alias] {0}', alias.id)
            });
        });
        languageModels?.slice().sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)).forEach(model => {
            const isNotReady = model.status.status !== 'ready';
            options.push({
                value: model.id,
                label: `${model.name ?? model.id} ${isNotReady ? '✗' : '✓'}`,
                description: isNotReady && model.status.message ? model.status.message : undefined
            });
        });
        return options;
    }, [aliases, languageModels]);

    return <div className='language-model-container'>
        {lmRequirementMap && Object.keys(lmRequirementMap).length > 0 ? (
            <div className="settings-section-subcategory-title ai-settings-section-subcategory-title">
                {nls.localizeByDefault('Language Models')}
            </div>
        ) : undefined}
        {Object.values(lmRequirementMap).map(requirement => {
            const isAlias = !!requirement.identifier && aliases.some(a => a.id === requirement.identifier);
            const resolvedModel = isAlias && requirement.identifier ? resolvedAliasModels[requirement.identifier] : undefined;
            const isOverridden = overriddenPurposes.has(requirement.purpose);
            return <AiConfigurationSettingRow
                key={requirement.purpose}
                title={nls.localize('theia/ai/core/languageModelRenderer/purposeTitle', 'Purpose: {0}', requirement.purpose)}
                modified={isOverridden}
                below={<>
                    <ModelSelect
                        id={`model-select-${agent.id}-${requirement.purpose}`}
                        purpose={requirement.purpose}
                        value={requirement.identifier}
                        options={modelSelectOptions}
                        onSelect={onSelectedModelChange}
                    />
                    {isAlias && <div className='ai-lm-evaluates-to'>
                        <span className='ai-lm-evaluates-to-label'>{nls.localize('theia/ai/core/modelAliasesConfiguration/evaluatesTo', 'Evaluates to')}:</span>
                        {resolvedModel
                            ? <span>{resolvedModel.name ?? resolvedModel.id} {resolvedModel.status.status === 'ready' ? '✓' : '✗'}</span>
                            : <span className='ai-alias-evaluates-to-unresolved'>
                                {nls.localize('theia/ai/core/modelAliasesConfiguration/noResolvedModel', 'No model ready for this alias.')}</span>}
                    </div>}
                </>}
                onOpenMenu={gear => settingsRowService.openResetMenu(gear, () => onResetPurpose(requirement.purpose))}
            />;
        })}
        {reasoningModel?.reasoningSupport && <ReasoningRow
            support={reasoningModel.reasoningSupport}
            savedLevel={savedReasoningLevel}
            inheritedLevel={inheritedReasoningLevel}
            onSelect={onReasoningChange}
            onReset={onResetReasoning}
            settingsRowService={settingsRowService}
        />}
    </div>;
};
