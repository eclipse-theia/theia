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
import {
    AiConfigurationEmptyState,
    AiConfigurationFilterInput,
    AiConfigurationSection
} from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';

/** One expandable row of a {@link CollapsibleList}. */
export interface CollapsibleRow {
    readonly id: string;
    /** Header title (e.g. a variable reference, a skill name, a `/command`). */
    readonly title: React.ReactNode;
    /** One-line description; shown inline while collapsed and as a paragraph while expanded. */
    readonly description?: string;
    /** Short count pills shown at the trailing edge of the header. */
    readonly pills?: string[];
    /** A single action rendered in the header (must stop click propagation so it does not toggle the row). */
    readonly headerAction?: React.ReactNode;
    /** Content revealed when the row is expanded (below the description). */
    readonly body?: React.ReactNode;
    /** Lower-cased haystack used by the in-list filter. */
    readonly filterText: string;
}

/** A titled group of {@link CollapsibleRow}s. */
export interface CollapsibleGroup {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    readonly rows: CollapsibleRow[];
}

export interface CollapsibleListProps {
    readonly groups: CollapsibleGroup[];
    readonly filterPlaceholder: string;
    /** Shown when there are no rows at all. */
    readonly emptyMessage: string;
    /** Shown when the filter query matches nothing. */
    readonly filterEmptyMessage: (query: string) => string;
}

/**
 * A filterable list of expandable rows grouped under titled sections, as used by the Variables and
 * the Skills & Slash Commands pages. Owns the local filter and per-row expansion state so both reset
 * when the page is navigated away from (the component unmounts).
 */
export const CollapsibleList: React.FC<CollapsibleListProps> = ({ groups, filterPlaceholder, emptyMessage, filterEmptyMessage }) => {
    const [filter, setFilter] = React.useState('');
    const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set<string>());
    const toggle = React.useCallback((id: string) => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return next;
    }), []);

    const query = filter.trim().toLocaleLowerCase();
    const filtering = query.length > 0;
    const visibleGroups = groups
        .map(group => ({ group, rows: filtering ? group.rows.filter(row => row.filterText.includes(query)) : group.rows }))
        .filter(entry => entry.rows.length > 0);

    return <div className='ai-variable-list'>
        <AiConfigurationFilterInput value={filter} onChange={setFilter} placeholder={filterPlaceholder} />
        {visibleGroups.length === 0
            ? <AiConfigurationEmptyState
                iconClass={codicon('search')}
                message={filtering ? filterEmptyMessage(filter.trim()) : emptyMessage}
            />
            : <div className='ai-configuration-sections'>
                {visibleGroups.map(({ group, rows }) => <CollapsibleGroupView
                    key={group.id}
                    title={group.title}
                    description={group.description}
                    rows={rows}
                    expanded={expanded}
                    onToggle={toggle}
                />)}
            </div>}
    </div>;
};

interface CollapsibleGroupViewProps {
    readonly title: string;
    readonly description?: string;
    readonly rows: CollapsibleRow[];
    readonly expanded: ReadonlySet<string>;
    readonly onToggle: (id: string) => void;
}

const CollapsibleGroupView: React.FC<CollapsibleGroupViewProps> = ({ title, description, rows, expanded, onToggle }) =>
    <AiConfigurationSection title={title} className='ai-variable-group'>
        {description && <div className='ai-variable-group-description'>{description}</div>}
        {rows.map(row => <CollapsibleRowView key={row.id} row={row} expanded={expanded.has(row.id)} onToggle={onToggle} />)}
    </AiConfigurationSection>;

interface CollapsibleRowViewProps {
    readonly row: CollapsibleRow;
    readonly expanded: boolean;
    readonly onToggle: (id: string) => void;
}

const CollapsibleRowView: React.FC<CollapsibleRowViewProps> = ({ row, expanded, onToggle }) => {
    const bodyId = `ai-collapsible-body-${row.id}`;
    const toggle = React.useCallback(() => onToggle(row.id), [onToggle, row.id]);
    // Only toggle when the header itself has focus; keystrokes on nested controls (the action button)
    // must not bubble up and collapse the row.
    const onHeaderKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggle();
        }
    }, [toggle]);
    return <div className='ai-variable-row' data-ai-config-row-id={row.id}>
        <div
            className={`ai-variable-row-header ${expanded ? 'expanded' : ''}`}
            role='button'
            tabIndex={0}
            aria-expanded={expanded}
            aria-controls={expanded ? bodyId : undefined}
            onClick={toggle}
            onKeyDown={onHeaderKeyDown}
        >
            <span aria-hidden='true' className={`ai-variable-expansion-icon ${codicon(expanded ? 'chevron-down' : 'chevron-right')}`}></span>
            <span className='ai-variable-name'>{row.title}</span>
            {row.headerAction}
            {/* The description reads in the header only while collapsed (single line + tooltip); when
                expanded it moves into the body, leaving a flex spacer so the header layout is stable. */}
            {expanded
                ? <span className='ai-variable-inline-description-spacer' aria-hidden='true'></span>
                : <span className='ai-variable-inline-description' title={row.description || undefined}>{row.description}</span>}
            {row.pills && row.pills.length > 0 && <div className='ai-variable-row-meta'>
                {row.pills.map((pill, index) => <span key={index} className='ai-variable-count-pill'>{pill}</span>)}
            </div>}
        </div>
        {expanded && <div className='ai-variable-row-body' id={bodyId}>
            {row.description && <p className='ai-variable-full-description'>{row.description}</p>}
            {row.body}
        </div>}
    </div>;
};
