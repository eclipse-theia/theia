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
import { Agent, AISettingsService, FrontendLanguageModelRegistry, LanguageModel, LanguageModelRequirement } from '@theia/ai-core/lib/common';
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
        className='ai-config-select ai-configuration-value-row-value'
        options={options}
        defaultValue={value}
        onChange={handleChange}
    />;
};

export const LanguageModelRenderer: React.FC<LanguageModelSettingsProps> = (
    { agent, languageModels, aiSettingsService, languageModelRegistry, languageModelAliases: aliases, settingsRowService }) => {

    const [lmRequirementMap, setLmRequirementMap] = React.useState<Record<string, LanguageModelRequirement>>({});
    const [overriddenPurposes, setOverriddenPurposes] = React.useState<ReadonlySet<string>>(new Set());
    const [resolvedAliasModels, setResolvedAliasModels] = React.useState<Record<string, LanguageModel | undefined>>({});

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
    </div>;
};
