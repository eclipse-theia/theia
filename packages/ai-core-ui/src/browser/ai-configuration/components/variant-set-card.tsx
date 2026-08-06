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

import { nls } from '@theia/core';
import { codicon, ConfirmDialog } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { isCustomizedPromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { AiConfigurationItemRow } from './ai-configuration-item-row';
import { AiEnumSelect } from './ai-configuration-controls';
import { AiSettingsRowService } from './ai-settings-row-service';

export interface VariantSetCardProps {
    /** The agent that owns this prompt variant set; the selection is stored per agent. */
    readonly agentId: string;
    /** The prompt variant set id (e.g. `coder-system`). */
    readonly promptVariantSetId: string;
    readonly promptService: PromptService;
    /** Backs the row's gear menu, whose "Reset Setting" reverts the selected variant to the default. */
    readonly settingsRowService: AiSettingsRowService;
    /**
     * Optional display names per variant id, as shown in the chat mode switcher (an agent's
     * `ChatMode` names). Falls back to the fragment name and then the variant id.
     */
    readonly variantLabels?: Record<string, string>;
}

/**
 * The reusable prompt-variant-set component rendered inside an agent's detail page: a single list row per
 * variant set, showing the set id, a select that picks the variant this agent uses (with `(default)` and
 * `[edited]` markers), an edit action to customize the selected variant, and a reset action that reverts a
 * customized variant to built-in. The agent detail is the single source of truth for prompt variant sets.
 */
export const VariantSetCard: React.FC<VariantSetCardProps> = ({ agentId, promptVariantSetId, promptService, settingsRowService, variantLabels }) => {
    const variantIds = promptService.getVariantIds(promptVariantSetId);
    const defaultVariantId = promptService.getDefaultVariantId(promptVariantSetId);

    const [selectedVariantId, setSelectedVariantId] = React.useState<string | undefined>(
        promptService.getSelectedVariantId(promptVariantSetId) ?? defaultVariantId);

    React.useEffect(() => {
        setSelectedVariantId(promptService.getSelectedVariantId(promptVariantSetId) ?? defaultVariantId);
        const disposable = promptService.onSelectedVariantChange(notification => {
            if (notification.promptVariantSetId === promptVariantSetId) {
                setSelectedVariantId(notification.variantId ?? defaultVariantId);
            }
        });
        return () => disposable.dispose();
    }, [promptVariantSetId, defaultVariantId, promptService]);

    const selected = selectedVariantId && variantIds.includes(selectedVariantId)
        ? selectedVariantId
        : defaultVariantId ?? variantIds[0];

    if (!selected) {
        return <AiConfigurationItemRow
            label={promptVariantSetId}
            description={nls.localize('theia/ai/core/promptFragmentsConfiguration/variantSetError',
                'The selected variant does not exist and no default could be found. Please check your configuration.')}
            status={{ kind: 'error', label: nls.localizeByDefault('Error') }}
        />;
    }

    const isVariantCustomized = (variantId: string): boolean => {
        const fragment = promptService.getRawPromptFragment(variantId);
        return fragment ? isCustomizedPromptFragment(fragment) : false;
    };
    const variantName = (variantId: string): string =>
        variantLabels?.[variantId] ?? promptService.getRawPromptFragment(variantId)?.name ?? variantId;

    const selectVariant = (variantId: string): void => {
        promptService.updateSelectedVariantId(agentId, promptVariantSetId, variantId);
    };
    const customize = (variantId: string): void => {
        const fragment = promptService.getRawPromptFragment(variantId);
        if (fragment && isCustomizedPromptFragment(fragment)) {
            promptService.editCustomization(fragment.id, fragment.customizationId);
        } else {
            promptService.createBuiltInCustomization(variantId);
        }
    };
    const resetVariant = async (variantId: string): Promise<void> => {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToBuiltInDialogTitle', 'Reset to Built-in'),
            msg: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToBuiltInDialogMsg',
                'Are you sure you want to reset the prompt fragment "{0}" to its built-in version? This will remove all customizations.', variantId),
            ok: nls.localizeByDefault('Reset'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            await promptService.resetToBuiltIn(variantId);
        }
    };

    const explicitSelection = promptService.getSelectedVariantId(promptVariantSetId);
    const invalidSelection = explicitSelection !== undefined && !variantIds.includes(explicitSelection);
    const selectedCustomized = isVariantCustomized(selected);
    // The agent's selection deviates from the built-in default; the gear "Reset Setting" reverts it. (A
    // customized variant is a separate, global edit, surfaced by the `[edited]` marker and the reset icon.)
    const modified = defaultVariantId !== undefined && selected !== defaultVariantId;
    const variantCountLabel = variantIds.length === 1
        ? nls.localize('theia/ai/core/variantSet/variantCountSingular', '1 variant')
        : nls.localize('theia/ai/core/variantSet/variantCount', '{0} variants', variantIds.length);

    // Each option shows the variant name plus `(default)`/`[edited]` markers, so the collapsed select surfaces
    // the selected variant's state and the dropdown reveals which variants are customized.
    const options = variantIds.map(variantId => {
        const markers = [variantName(variantId)];
        if (variantId === defaultVariantId) {
            markers.push(`(${nls.localizeByDefault('Default')})`);
        }
        if (isVariantCustomized(variantId)) {
            markers.push(`[${nls.localize('theia/ai/chat-ui/edited', 'edited')}]`);
        }
        return { value: variantId, label: markers.join(' ') };
    });

    const editLabel = nls.localize('theia/ai/core/promptFragmentsConfiguration/editPromptTemplate', 'Edit prompt template');
    const resetLabel = nls.localize('theia/ai/core/promptFragmentsConfiguration/resetPromptTemplate', 'Reset prompt template');

    return <AiConfigurationItemRow
        label={promptVariantSetId}
        description={variantCountLabel}
        modified={modified}
        onOpenMenu={modified && defaultVariantId
            ? gear => settingsRowService.openResetMenu(gear, () => selectVariant(defaultVariantId))
            : undefined}
        status={invalidSelection
            ? {
                kind: 'warn',
                label: nls.localizeByDefault('Default'),
                tooltip: nls.localize('theia/ai/core/promptFragmentsConfiguration/variantSetWarning',
                    'The selected variant does not exist. The default variant is being used instead.')
            }
            : undefined}
        trailing={<div className='ai-variant-controls'>
            <AiEnumSelect
                value={selected}
                ariaLabel={nls.localize('theia/ai/core/variantSet/templateLabel', 'Template')}
                options={options}
                onCommit={selectVariant}
            />
            <button
                className='ai-variant-action-button'
                title={editLabel}
                aria-label={editLabel}
                onClick={() => customize(selected)}>
                <span className={codicon('edit')}></span>
            </button>
            {selectedCustomized && <button
                className='ai-variant-action-button'
                title={resetLabel}
                aria-label={resetLabel}
                onClick={() => resetVariant(selected)}>
                <span className={codicon('discard')}></span>
            </button>}
        </div>}
    />;
};
