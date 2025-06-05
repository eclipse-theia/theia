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
import { Agent, AISettingsService, LanguageModel, LanguageModelRegistry, LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { Mutable } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';

export interface LanguageModelSettingsProps {
    agent: Agent;
    languageModels?: LanguageModel[];
    aiSettingsService: AISettingsService;
    languageModelRegistry: LanguageModelRegistry;
    languageModelAliases: LanguageModelAlias[];
}

export const LanguageModelRenderer: React.FC<LanguageModelSettingsProps> = (
    { agent, languageModels, aiSettingsService, languageModelRegistry, languageModelAliases: aliases }) => {

    const findLanguageModelRequirement = async (purpose: string): Promise<LanguageModelRequirement | undefined> => {
        const requirementSetting = await aiSettingsService.getAgentSettings(agent.id);
        return requirementSetting?.languageModelRequirements?.find(e => e.purpose === purpose);
    };

    const [lmRequirementMap, setLmRequirementMap] = React.useState<Record<string, LanguageModelRequirement>>({});

    React.useEffect(() => {
        const computeLmRequirementMap = async () => {
            const map = await agent.languageModelRequirements.reduce(async (accPromise, curr) => {
                const acc = await accPromise;
                // take the agents requirements and override them with the user settings if present
                const lmRequirement = await findLanguageModelRequirement(curr.purpose) ?? curr;
                // if no llm is selected through the identifier, see what would be the default
                if (!lmRequirement.identifier) {
                    const llm = await languageModelRegistry.selectLanguageModel({ agent: agent.id, ...lmRequirement });
                    (lmRequirement as Mutable<LanguageModelRequirement>).identifier = llm?.id;
                }
                acc[curr.purpose] = lmRequirement;
                return acc;
            }, Promise.resolve({} as Record<string, LanguageModelRequirement>));
            setLmRequirementMap(map);
        };
        computeLmRequirementMap();
    }, []);

    const renderLanguageModelMetadata = (requirement: LanguageModelRequirement, index: number) => {
        const languageModel = languageModels?.find(model => model.id === requirement.identifier);
        if (!languageModel) {
            return <div></div>;
        }

        return <>
            <div>{requirement.purpose}</div>
            <div key={index}>
                {languageModel.id && <p><strong>{nls.localizeByDefault('Identifier')}: </strong> {languageModel.id}</p>}
                {languageModel.name && <p><strong>{nls.localizeByDefault('Name')}: </strong> {languageModel.name}</p>}
                {languageModel.vendor && <p><strong>{nls.localize('theia/ai/core/languageModelRenderer/vendor', 'Vendor')}: </strong> {languageModel.vendor}</p>}
                {languageModel.version && <p><strong>{nls.localizeByDefault('Version')}: </strong> {languageModel.version}</p>}
                {languageModel.family && <p><strong>{nls.localize('theia/ai/core/languageModelRenderer/family', 'Family')}: </strong> {languageModel.family}</p>}
                {languageModel.maxInputTokens &&
                    <p><strong>
                        {nls.localize('theia/ai/core/languageModelRenderer/minInputTokens', 'Min Input Tokens')}:
                    </strong> {languageModel.maxInputTokens}</p>}
                {languageModel.maxOutputTokens &&
                    <p><strong>
                        {nls.localize('theia/ai/core/languageModelRenderer/maxOutputTokens', 'Max Output Tokens')}:
                    </strong> {languageModel.maxOutputTokens}</p>}
            </div>
        </>;

    };

    const onSelectedModelChange = (purpose: string, event: React.ChangeEvent<HTMLSelectElement>): void => {
        const newLmRequirementMap = { ...lmRequirementMap, [purpose]: { purpose, identifier: event.target.value } };
        aiSettingsService.updateAgentSettings(agent.id, { languageModelRequirements: Object.values(newLmRequirementMap) });
        setLmRequirementMap(newLmRequirementMap);
    };

    return <div className='language-model-container'>
        {Object.values(lmRequirementMap).map((requirements, index) => (
            <React.Fragment key={index}>
                <div><strong>{nls.localize('theia/ai/core/languageModelRenderer/purpose', 'Purpose')}:</strong></div>
                <div>
                    {/* language model metadata */}
                    {renderLanguageModelMetadata(requirements, index)}
                    {/* language model selector */}
                    <>
                        <label
                            className="theia-header no-select"
                            htmlFor={`model-select-${agent.id}`}>
                            {nls.localize('theia/ai/core/languageModelRenderer/languageModel', 'Language Model')}:
                        </label>
                        <select
                            className="theia-select"
                            id={`model-select-${agent.id}-${requirements.purpose}`}
                            value={requirements.identifier}
                            onChange={event => onSelectedModelChange(requirements.purpose, event)}
                        >
                            <option value=""></option>
                            {/* Aliases first, then languange models */}
                            {aliases?.sort((a, b) => a.id.localeCompare(b.id)).map(alias => (
                                <option key={`alias/${alias.id}`} value={alias.id}>{`[alias] ${alias.id}`}</option>
                            ))}
                            {languageModels?.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)).map(model => (
                                <option key={model.id} value={model.id}>{model.name ?? model.id}</option>
                            ))}
                        </select>
                    </>
                    <hr />
                </div>
            </React.Fragment>
        ))}

    </div>;
};
