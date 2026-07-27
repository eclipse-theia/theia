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

import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemStatus } from '../ai-configuration-category';
import { AiConfigurationStatusBadge } from './ai-configuration-primitives';
import { AiSettingGearButton } from './ai-configuration-setting-row';

export interface AiConfigurationItemRowProps {
    readonly label: string;
    /** Renders the label in the code/monospace font (e.g. for shell command patterns), like the Variables list. */
    readonly monospaceLabel?: boolean;
    /** `codicon(...)` class shown before the label. */
    readonly iconClass?: string;
    readonly description?: string;
    /** Status badge shown on the right (e.g. an alias' resolved model). */
    readonly status?: AiConfigurationItemStatus;
    /** `true` reveals the modified edge (left indicator bar), matching {@link AiConfigurationSettingRow}. */
    readonly modified?: boolean;
    /** Optional trailing content (extra stats, or an inline control such as a select) shown on the right. */
    readonly trailing?: React.ReactNode;
    /**
     * Opens the row's gear context menu (e.g. "Reset Setting") anchored at the cog, which appears on hover in
     * the row's left gutter (mirroring {@link AiConfigurationSettingRow}). Wired the same way as
     * {@link AiConfigurationSettingRow.onOpenMenu} (typically to {@link AiSettingsRowService.openResetMenu}).
     * Omit to hide the gear.
     */
    readonly onOpenMenu?: (gear: HTMLElement) => void;
    /**
     * Invoked when the row is clicked or activated via keyboard; typically `ctx.navigate(...)`. When provided
     * the whole row is a navigable control ending in a chevron. Omit it for rows that only host an inline
     * control (e.g. the Tools page's per-tool confirmation select): the row is then not clickable and shows
     * no chevron.
     */
    readonly onSelect?: () => void;
}

/**
 * Overview row for a collection item: an icon, a label with an optional description, and a right-hand slot
 * for a status badge / stats / an inline control. When {@link AiConfigurationItemRowProps.onSelect} is given
 * the whole row is a single navigable control (click or Enter/Space) that opens the item's detail page,
 * ending in a chevron; without it the row simply presents its trailing control. A flat, list-style
 * alternative to a card grid, matching the Settings and extensions lists; every non-label slot is optional.
 */
export const AiConfigurationItemRow: React.FC<AiConfigurationItemRowProps> = ({
    label, monospaceLabel, iconClass, description, status, modified, trailing, onOpenMenu, onSelect
}) => {
    const navigable = onSelect !== undefined;
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onSelect();
        }
    };
    return <div
        className={`ai-configuration-item-row${navigable ? ' navigable' : ''}${modified ? ' modified' : ''}`}
        role={navigable ? 'button' : undefined}
        tabIndex={navigable ? 0 : undefined}
        onClick={onSelect}
        onKeyDown={navigable ? onKeyDown : undefined}
    >
        {onOpenMenu && <div className='ai-configuration-item-row-actions'>
            <AiSettingGearButton onOpenMenu={onOpenMenu} />
        </div>}
        {iconClass && <span className={`ai-configuration-item-row-icon ${iconClass}`}></span>}
        <div className='ai-configuration-item-row-text'>
            <span className={`ai-configuration-item-row-label${monospaceLabel ? ' mono' : ''}`}>{label}</span>
            {description && <span className='ai-configuration-item-row-description'>{description}</span>}
        </div>
        <div className='ai-configuration-item-row-trailing'>
            {status && <AiConfigurationStatusBadge status={status} />}
            {trailing}
            {navigable && <span className={`ai-configuration-item-row-chevron ${codicon('chevron-right')}`} aria-hidden={true}></span>}
        </div>
    </div>;
};
