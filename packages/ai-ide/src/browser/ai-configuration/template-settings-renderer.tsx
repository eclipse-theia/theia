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
import { AISettingsService, PromptService, SystemPrompt } from '@theia/ai-core/lib/common';
import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';

export interface SystemPromptRendererProps {
    agentId: string;
    systemPrompt: SystemPrompt;
    promptService: PromptService;
    aiSettingsService: AISettingsService;
}

export const SystemPromptRenderer: React.FC<SystemPromptRendererProps> = ({
    agentId,
    systemPrompt,
    promptService,
    aiSettingsService,
}) => {
    const variantIds = promptService.getVariantIds(systemPrompt.id);
    const defaultVariantId = promptService.getDefaultVariantId(systemPrompt.id);
    const [selectedVariant, setSelectedVariant] = React.useState<string>(defaultVariantId!);

    React.useEffect(() => {
        (async () => {
            const currentVariant =
                await promptService.getActiveVariantId(systemPrompt.id);
            setSelectedVariant(currentVariant!);
        })();
    }, [systemPrompt.id, aiSettingsService, agentId]);

    const isInvalidVariant = !variantIds.includes(selectedVariant);

    const handleVariantChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newVariant = event.target.value;
        setSelectedVariant(newVariant);
        promptService.updateActiveVariantId(agentId, systemPrompt.id, newVariant);
    };

    const openTemplate = () => {
        const templateId = selectedVariant === defaultVariantId ? systemPrompt.id : selectedVariant;
        promptService.editBuiltInCustomization(templateId);
    };

    const resetTemplate = () => {
        const templateId = selectedVariant === defaultVariantId ? systemPrompt.id : selectedVariant;
        promptService.resetToBuiltIn(templateId);
    };

    return (
        <div className="template-renderer">
            <div className="settings-section-title template-header">
                <strong>{systemPrompt.id}</strong>
            </div>
            <div className="template-controls">
                {(variantIds.length > 1 || isInvalidVariant) && (
                    <>
                        <label htmlFor={`variant-selector-${systemPrompt.id}`} className="template-select-label">
                            {nls.localize('theia/ai/core/templateSettings/selectVariant', 'Select Variant:')}
                        </label>
                        <select
                            id={`variant-selector-${systemPrompt.id}`}
                            className={`theia-select template-variant-selector ${isInvalidVariant ? 'error' : ''}`}
                            value={isInvalidVariant ? 'invalid' : selectedVariant}
                            onChange={handleVariantChange}
                        >
                            {isInvalidVariant && (
                                <option value="invalid" disabled>
                                    {nls.localize('theia/ai/core/templateSettings/unavailableVariant', 'The selected variant is no longer available')}
                                </option>
                            )}
                            {variantIds.map(variantId => (
                                <option key={variantId} value={variantId}>
                                    {variantId === defaultVariantId ? variantId + ' (default)' : variantId}
                                </option>
                            ))}
                        </select>
                    </>
                )}
                <button
                    className="theia-button main"
                    onClick={openTemplate}
                    disabled={isInvalidVariant}
                >
                    {nls.localizeByDefault('Edit')}
                </button>
                <button
                    className="theia-button secondary"
                    onClick={resetTemplate}
                    disabled={isInvalidVariant}
                >
                    {nls.localizeByDefault('Reset')}
                </button>
            </div>
        </div>
    );
};
