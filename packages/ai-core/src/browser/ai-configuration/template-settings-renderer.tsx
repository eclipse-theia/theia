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
import { PromptCustomizationService, PromptService } from '../../common/prompt-service';
import { AISettingsService, PromptTemplate } from '../../common';

const DEFAULT_VARIANT = 'default';

export interface TemplateRendererProps {
    agentId: string;
    template: PromptTemplate;
    promptCustomizationService: PromptCustomizationService;
    promptService: PromptService;
    aiSettingsService: AISettingsService;
}

export const TemplateRenderer: React.FC<TemplateRendererProps> = ({
    agentId,
    template,
    promptCustomizationService,
    promptService,
    aiSettingsService,
}) => {
    const [variantIds, setVariantIds] = React.useState<string[]>([]);
    const [selectedVariant, setSelectedVariant] = React.useState<string>(DEFAULT_VARIANT);

    React.useEffect(() => {
        (async () => {
            const variants = promptService.getVariantIds(template.id);
            setVariantIds([DEFAULT_VARIANT, ...variants]);

            const agentSettings = await aiSettingsService.getAgentSettings(agentId);
            const currentVariant =
                agentSettings?.selectedVariants?.[template.id] || DEFAULT_VARIANT;
            setSelectedVariant(currentVariant);
        })();
    }, [template.id, promptService, aiSettingsService, agentId]);

    const handleVariantChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newVariant = event.target.value;
        setSelectedVariant(newVariant);

        const agentSettings = await aiSettingsService.getAgentSettings(agentId);
        const selectedVariants = agentSettings?.selectedVariants || {};

        const updatedVariants = { ...selectedVariants };
        if (newVariant === DEFAULT_VARIANT) {
            delete updatedVariants[template.id];
        } else {
            updatedVariants[template.id] = newVariant;
        }

        await aiSettingsService.updateAgentSettings(agentId, {
            selectedVariants: updatedVariants,
        });
    };

    const openTemplate = React.useCallback(async () => {
        const templateId = selectedVariant === DEFAULT_VARIANT ? template.id : selectedVariant;
        const selectedTemplate = promptService.getRawPrompt(templateId);
        promptCustomizationService.editTemplate(templateId, selectedTemplate?.template || '');
    }, [selectedVariant, template.id, promptService, promptCustomizationService]);

    const resetTemplate = React.useCallback(async () => {
        const templateId = selectedVariant === DEFAULT_VARIANT ? template.id : selectedVariant;
        promptCustomizationService.resetTemplate(templateId);
    }, [selectedVariant, template.id, promptCustomizationService]);

    return (
        <div className="template-renderer">
            <div className="settings-section-title template-header">
                <strong>{template.id}</strong>
            </div>
            <div className="template-controls">
                {variantIds.length > 1 && (
                    <>
                        <label htmlFor={`variant-selector-${template.id}`} className="template-select-label">
                            Select Variant:
                        </label>
                        <select
                            id={`variant-selector-${template.id}`}
                            className="theia-select template-variant-selector"
                            value={selectedVariant}
                            onChange={handleVariantChange}
                        >
                            {variantIds.map(variantId => (
                                <option key={variantId} value={variantId}>
                                    {variantId}
                                </option>
                            ))}
                        </select>
                    </>
                )}
                <button className="theia-button main" onClick={openTemplate}>
                    Edit
                </button>
                <button className="theia-button secondary" onClick={resetTemplate}>
                    Reset
                </button>
            </div>
        </div>
    );
};
