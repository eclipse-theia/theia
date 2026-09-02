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
import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemStatus } from '../ai-configuration-category';
import { AiConfigurationKindBadge, AiConfigurationStatusBadge } from './ai-configuration-primitives';
import { AiConfigurationOrigin, AiConfigurationOriginBadges } from './ai-configuration-origin-badge';
import { AiSettingGearButton } from './ai-configuration-setting-row';

export interface AiConfigurationItemRowProps {
    readonly label: string;
    /**
     * Anchors the row for deep links: rendered as `data-ai-config-row-id`, which is what a
     * {@link AiConfigurationSelection.highlight} scrolls to and flashes.
     */
    readonly rowId?: string;
    /** Renders the label in the code/monospace font (e.g. for shell command patterns), like the Variables list. */
    readonly monospaceLabel?: boolean;
    /** `codicon(...)` class shown before the label. */
    readonly iconClass?: string;
    readonly description?: string;
    /** Short badges shown after the label, for what the item *is*. Use {@link origins} for where it came from. */
    readonly tags?: string[];
    /** Where the item came from, shown after the tags as {@link AiConfigurationOriginBadge}s. */
    readonly origins?: AiConfigurationOrigin[];
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
    /**
     * Turns the label into a link that navigates somewhere related to the row without being the row's own
     * detail, e.g. an agent capability pointing at the (globally shared) snippet it pulls in. Distinct from
     * {@link onSelect}: the row itself stays non-navigable, so a row can keep hosting its own control.
     */
    readonly onActivateLabel?: () => void;
    /** Tooltip for an {@link onActivateLabel} label, explaining where the link goes. */
    readonly labelTooltip?: string;
}

/**
 * A row's description, clamped to two lines so a long list stays scannable, with a toggle that reveals the
 * rest in place. Without it the remainder of a long description (a tool's, in particular, often runs to
 * several sentences) was simply unreachable; showing every description in full instead made the Tools page
 * far too long to scroll.
 *
 * The toggle appears only once the text is measured as actually clamped, since that depends on the rendered
 * width; measuring is skipped while expanded, where the clamp is lifted and nothing overflows.
 */
const AiConfigurationItemRowDescription: React.FC<{ description: string }> = ({ description }) => {
    const [expanded, setExpanded] = React.useState(false);
    const [clamped, setClamped] = React.useState(false);
    // eslint-disable-next-line no-null/no-null
    const descriptionRef = React.useRef<HTMLSpanElement>(null);

    React.useLayoutEffect(() => {
        const element = descriptionRef.current;
        if (!element || expanded) {
            return;
        }
        // Sub-pixel line heights make an unclamped element report a slightly larger scroll height.
        const measure = () => setClamped(element.scrollHeight - element.clientHeight > 1);
        measure();
        // Narrowing the view can clamp a description that fit before, so re-measure on width changes.
        // Guarded because JSDOM, which the component specs render into, has no `ResizeObserver`.
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [description, expanded]);

    const onToggle = (event: React.MouseEvent): void => {
        // A navigable row would otherwise also handle the click and open its own detail.
        event.stopPropagation();
        setExpanded(previous => !previous);
    };

    return <>
        <span
            ref={descriptionRef}
            className={`ai-configuration-item-row-description${expanded ? ' expanded' : ''}`}
        >{description}</span>
        {clamped && <button
            type='button'
            className='ai-configuration-item-row-description-toggle'
            aria-expanded={expanded}
            onClick={onToggle}
        >{expanded ? nls.localizeByDefault('Show Less') : nls.localizeByDefault('Show More')}</button>}
    </>;
};

/**
 * Overview row for a collection item: an icon, a label with an optional description, and a right-hand slot
 * for a status badge / stats / an inline control. When {@link AiConfigurationItemRowProps.onSelect} is given
 * the whole row is a single navigable control (click or Enter/Space) that opens the item's detail page,
 * ending in a chevron; without it the row simply presents its trailing control. A flat, list-style
 * alternative to a card grid, matching the Settings and extensions lists; every non-label slot is optional.
 */
export const AiConfigurationItemRow: React.FC<AiConfigurationItemRowProps> = ({
    label, rowId, tags, origins, monospaceLabel, iconClass, description, status, modified, trailing, onOpenMenu, onSelect, onActivateLabel, labelTooltip
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
        data-ai-config-row-id={rowId}
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
            {/* Name and badges share a line, so a badge reads as part of the name rather than as a second row. */}
            <div className='ai-configuration-item-row-heading'>
                {onActivateLabel
                    ? <button
                        type='button'
                        className={`ai-configuration-item-row-label link${monospaceLabel ? ' mono' : ''}`}
                        title={labelTooltip}
                        onClick={event => {
                            // A navigable row would otherwise also handle the click and open its own detail.
                            event.stopPropagation();
                            onActivateLabel();
                        }}
                    >{label}</button>
                    : <span className={`ai-configuration-item-row-label${monospaceLabel ? ' mono' : ''}`}>{label}</span>}
                {tags && tags.length > 0 && <span className='ai-configuration-item-row-tags'>
                    {tags.map(tag => <AiConfigurationKindBadge key={tag} label={tag} variant='outline' />)}
                </span>}
                <AiConfigurationOriginBadges origins={origins} />
            </div>
            {description && <AiConfigurationItemRowDescription description={description} />}
        </div>
        <div className='ai-configuration-item-row-trailing'>
            {status && <AiConfigurationStatusBadge status={status} />}
            {trailing}
            {navigable && <span className={`ai-configuration-item-row-chevron ${codicon('chevron-right')}`} aria-hidden={true}></span>}
        </div>
    </div>;
};
