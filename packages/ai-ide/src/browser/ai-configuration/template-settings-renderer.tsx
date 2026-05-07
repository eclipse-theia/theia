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
import { isCustomizedPromptFragment, PromptService, PromptVariantSet } from '@theia/ai-core/lib/common';
import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';

export interface PromptVariantRendererProps {
    agentId: string;
    promptVariantSet: PromptVariantSet;
    promptService: PromptService;
}

export const PromptVariantRenderer: React.FC<PromptVariantRendererProps> = ({
    agentId,
    promptVariantSet,
    promptService,
}) => {
    const variantIds = promptService.getVariantIds(promptVariantSet.id);
    const defaultVariantId = promptService.getDefaultVariantId(promptVariantSet.id);
    const [selectedVariant, setSelectedVariant] = React.useState<string>(defaultVariantId!);

    const isVariantCustomized = (variantId: string): boolean => {
        const fragment = promptService.getRawPromptFragment(variantId);
        return fragment ? isCustomizedPromptFragment(fragment) : false;
    };

    React.useEffect(() => {
        const currentVariant = promptService.getSelectedVariantId(promptVariantSet.id);
        setSelectedVariant(currentVariant ?? defaultVariantId!);

        const disposable = promptService.onSelectedVariantChange(notification => {
            if (notification.promptVariantSetId === promptVariantSet.id) {
                setSelectedVariant(notification.variantId ?? defaultVariantId!);
            }
        });
        return () => {
            disposable.dispose();
        };
    }, [promptVariantSet.id, promptService, defaultVariantId]);

    const isInvalidVariant = !variantIds.includes(selectedVariant);

    const handleVariantChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newVariant = event.target.value;
        setSelectedVariant(newVariant);
        promptService.updateSelectedVariantId(agentId, promptVariantSet.id, newVariant);
    };

    const openTemplate = () => {
        promptService.editBuiltInCustomization(selectedVariant);
    };

    const resetTemplate = () => {
        promptService.resetToBuiltIn(selectedVariant);
    };

    return (
        <>
            <tr>
                <td className="template-name-cell">{promptVariantSet.id}</td>
                <td className="template-variant-cell">
                    {(variantIds.length > 1 || isInvalidVariant) && (
                        <select
                            id={`variant-selector-${promptVariantSet.id}`}
                            className={`theia-select template-variant-selector ${isInvalidVariant ? 'error' : ''}`}
                            value={isInvalidVariant ? 'invalid' : selectedVariant}
                            onChange={handleVariantChange}
                        >
                            {isInvalidVariant && (
                                <option value="invalid" disabled>
                                    {nls.localize('theia/ai/core/templateSettings/unavailableVariant', 'Unavailable')}
                                </option>
                            )}
                            {variantIds.map(variantId => {
                                const isEdited = isVariantCustomized(variantId);
                                const editedPrefix = isEdited ? `[${nls.localize('theia/ai/core/templateSettings/edited', 'edited')}] ` : '';
                                const defaultSuffix = variantId === defaultVariantId ? ' ' + nls.localizeByDefault('(default)') : '';
                                return (
                                    <option key={variantId} value={variantId}>
                                        {editedPrefix}{variantId}{defaultSuffix}
                                    </option>
                                );
                            })}
                        </select>
                    )}
                    {variantIds.length === 1 && !isInvalidVariant && (
                        <span>
                            {isVariantCustomized(selectedVariant)
                                ? `[${nls.localize('theia/ai/core/templateSettings/edited', 'edited')}] ${selectedVariant}`
                                : selectedVariant}
                        </span>
                    )}
                </td>
                <td className="template-actions-cell">
                    <button
                        className="template-action-icon-button codicon codicon-edit"
                        onClick={openTemplate}
                        disabled={isInvalidVariant}
                        title={nls.localizeByDefault('Edit')}
                    />
                    {isVariantCustomized(selectedVariant) &&
                        (<button
                            className="template-action-icon-button codicon codicon-discard"
                            onClick={resetTemplate}
                            disabled={isInvalidVariant || !isVariantCustomized(selectedVariant)}
                            title={nls.localizeByDefault('Reset')}
                        />)}
                </td>
            </tr>
        </>
    );
};
