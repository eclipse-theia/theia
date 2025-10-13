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

export interface LanguageModelSettingsProps {
    agent: Agent;
    languageModels?: LanguageModel[];
    aiSettingsService: AISettingsService;
    languageModelRegistry: FrontendLanguageModelRegistry;
    languageModelAliases: LanguageModelAlias[];
}

export const LanguageModelRenderer: React.FC<LanguageModelSettingsProps> = (
    { agent, languageModels, aiSettingsService, languageModelRegistry, languageModelAliases: aliases }) => {

    const findLanguageModelRequirement = async (purpose: string): Promise<LanguageModelRequirement | undefined> => {
        const requirementSetting = await aiSettingsService.getAgentSettings(agent.id);
        return requirementSetting?.languageModelRequirements?.find(e => e.purpose === purpose);
    };

    const [lmRequirementMap, setLmRequirementMap] = React.useState<Record<string, LanguageModelRequirement>>({});
    const [resolvedAliasModels, setResolvedAliasModels] = React.useState<Record<string, LanguageModel | undefined>>({});

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

    const onSelectedModelChange = (purpose: string, event: React.ChangeEvent<HTMLSelectElement>): void => {
        const newLmRequirementMap = { ...lmRequirementMap, [purpose]: { purpose, identifier: event.target.value } };
        aiSettingsService.updateAgentSettings(agent.id, { languageModelRequirements: Object.values(newLmRequirementMap) });
        setLmRequirementMap(newLmRequirementMap);
    };

    return <div className='language-model-container'>
        {Object.values(lmRequirementMap).map((requirement, index) => {
            const isAlias = requirement.identifier && aliases.some(a => a.id === requirement.identifier);
            const resolvedModel = isAlias ? resolvedAliasModels[requirement.identifier] : undefined;
            return (
                <React.Fragment key={index}>
                    <div className="ai-alias-evaluates-to-container">
                        <strong>{nls.localize('theia/ai/core/languageModelRenderer/purpose', 'Purpose')}:</strong> {requirement.purpose}
                    </div>
                    <div>
                        <div className="ai-alias-evaluates-to-container">
                            <label
                                className="theia-header no-select"
                                htmlFor={`model-select-${agent.id}`}>
                                {nls.localize('theia/ai/core/languageModelRenderer/languageModel', 'Language Model') + ': '}
                            </label>
                            <select
                                className="theia-select"
                                id={`model-select-${agent.id}-${requirement.purpose}`}
                                value={requirement.identifier}
                                onChange={event => onSelectedModelChange(requirement.purpose, event)}
                            >
                                <option value=""></option>
                                {/* Aliases first, then languange models */}
                                {aliases?.sort((a, b) => a.id.localeCompare(b.id)).map(alias => (
                                    <option key={`alias/${alias.id}`} value={alias.id} className='ai-language-model-item-ready'>
                                        {nls.localize('theia/ai/core/languageModelRenderer/alias', '[alias] {0}', alias.id)}
                                    </option>
                                ))}
                                {languageModels?.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)).map(model => {
                                    const isNotReady = model.status.status !== 'ready';
                                    return (
                                        <option
                                            key={model.id}
                                            value={model.id}
                                            className={isNotReady ? 'ai-language-model-item-not-ready' : 'ai-language-model-item-ready'}
                                            title={isNotReady && model.status.message ? model.status.message : undefined}
                                        >
                                            {model.name ?? model.id} {isNotReady ? '✗' : '✓'}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        {/* If alias is selected, show what it currently evaluates to */}
                        {isAlias && (
                            <div className="ai-alias-evaluates-to-container">
                                <label className="ai-alias-evaluates-to-label">{nls.localize('theia/ai/core/modelAliasesConfiguration/evaluatesTo', 'Evaluates to')}:</label>
                                {resolvedModel ? (
                                    <span className="ai-alias-evaluates-to-value">
                                        {resolvedModel.name ?? resolvedModel.id}
                                        {resolvedModel.status.status === 'ready' ? (
                                            <span className="ai-model-status-ready"
                                                title={nls.localize('theia/ai/core/modelAliasesConfiguration/modelReadyTooltip', 'Ready')}>✓</span>
                                        ) : (
                                            <span className="ai-model-status-not-ready" title={resolvedModel.status.message
                                                || nls.localize('theia/ai/core/modelAliasesConfiguration/modelNotReadyTooltip', 'Not ready')}>✗</span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="ai-alias-evaluates-to-unresolved">
                                        {nls.localize('theia/ai/core/modelAliasesConfiguration/noResolvedModel', 'No model ready for this alias.')}
                                        <span className="ai-model-status-not-ready"
                                            title={nls.localize('theia/ai/core/modelAliasesConfiguration/noModelReadyTooltip', 'No model ready')}>✗</span>
                                    </span>
                                )}
                            </div>
                        )}
                        <hr />
                    </div>
                </React.Fragment>
            );
        })}
    </div>;
};
