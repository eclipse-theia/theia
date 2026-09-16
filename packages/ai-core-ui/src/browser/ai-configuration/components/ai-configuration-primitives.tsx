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
import { AiConfigurationOrigin, AiConfigurationOriginBadges } from './ai-configuration-origin-badge';

/**
 * Presentational, DI-free display primitives shared across the AI configuration pages: badges, the
 * titled section container, the empty-state placeholder, the "Add …" action, the markdown description
 * host, the in-list filter input and the item detail header. Grouped here (rather than one file per
 * component) so that the small, stateless building blocks live together. Controls that edit a
 * preference value live in `ai-configuration-controls.tsx`, and larger composites (item rows, setting
 * rows and cards) keep their own files.
 *
 * All classes are prefixed `ai-configuration-` and are styled in `ai-configuration-components.css`.
 */

export interface AiConfigurationStatusBadgeProps {
    readonly status: AiConfigurationItemStatus;
}

/**
 * Labeled status affordance: a colored dot paired with its text label, so the
 * state is legible at a glance rather than encoded in color alone. The full
 * detail (if any) stays on hover.
 */
export const AiConfigurationStatusBadge: React.FC<AiConfigurationStatusBadgeProps> = ({ status }) => (
    <span className='ai-configuration-status-badge' title={status.tooltip ?? status.label}>
        <span className='ai-configuration-status-badge-label'>{status.label}</span>
        <span className={`ai-configuration-status ai-configuration-status-${status.kind}`} aria-hidden={true}></span>
    </span>
);

/**
 * Visual weight of a {@link AiConfigurationKindBadge}. `info` for the primary kind of a page
 * (e.g. "Slash Command"), `outline` for secondary/scope labels (e.g. "Built-in", "User"),
 * `default` for neutral tags.
 */
export type AiConfigurationKindBadgeVariant = 'default' | 'info' | 'outline';

export interface AiConfigurationKindBadgeProps {
    readonly label: string;
    readonly variant?: AiConfigurationKindBadgeVariant;
    /** `codicon(...)` class shown before the label. */
    readonly iconClass?: string;
    /** Hover text; defaults to {@link label}. */
    readonly title?: string;
}

/**
 * A small labeled pill classifying an item or a customization scope: "Variant Set", "Fragment",
 * "Slash Command", "Skill", "Built-in", "User", "Workspace". Complements the color-coded
 * {@link AiConfigurationStatusBadge} used for on/off/warn/error state.
 */
export const AiConfigurationKindBadge: React.FC<AiConfigurationKindBadgeProps> = ({ label, variant = 'default', iconClass, title }) => (
    <span className={`ai-configuration-kind-badge ai-configuration-kind-badge-${variant}`} title={title ?? label}>
        {iconClass && <span className={`ai-configuration-kind-badge-icon ${iconClass}`} aria-hidden={true}></span>}
        <span className='ai-configuration-kind-badge-label'>{label}</span>
    </span>
);

export interface AiConfigurationSectionProps {
    /** Group title. Omit for an untitled group of rows. */
    readonly title?: string;
    /** Optional short subtitle shown next to the title. */
    readonly subtitle?: string;
    /**
     * Number of entries in the section, shown next to the title. Lets a long list state its size without
     * being scrolled, which is the point of folding it in the first place.
     */
    readonly count?: number;
    /**
     * Lets the user fold the section away by clicking its title line. Sections start expanded: these pages
     * exist to be browsed, so nothing is hidden until the user chooses to hide it.
     */
    readonly collapsible?: boolean;
    /**
     * Keeps the content visible regardless of the user's fold state, e.g. while a filter is active — a match
     * inside a folded section would otherwise be silently unreachable.
     */
    readonly forceExpanded?: boolean;
    /** Optional actions shown on the title line, aligned to the right (e.g. a toolbar of "copy all" buttons). */
    readonly actions?: React.ReactNode;
    readonly children: React.ReactNode;
    readonly className?: string;
}

/**
 * A titled group of settings rows in a detail page. Generalizes the earlier
 * `ConfigurationSection` and adds an optional subtitle and a right-aligned actions slot on the title line,
 * plus an optional entry count and folding for the sections that hold long lists.
 */
export const AiConfigurationSection: React.FC<AiConfigurationSectionProps> = ({
    title, subtitle, count, collapsible, forceExpanded, actions, children, className
}) => {
    const [expanded, setExpanded] = React.useState(true);
    const toggle = React.useCallback(() => setExpanded(previous => !previous), []);
    const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        // Only the title line itself toggles; keystrokes in the actions slot must not fold the section.
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggle();
        }
    }, [toggle]);
    const foldable = collapsible === true && title !== undefined;
    const showContent = !foldable || forceExpanded === true || expanded;
    return <div className={`ai-configuration-section ${className ?? ''}`}>
        {(title !== undefined || actions) && <div
            className={`ai-configuration-section-title${foldable ? ' foldable' : ''}`}
            role={foldable ? 'button' : undefined}
            tabIndex={foldable ? 0 : undefined}
            aria-expanded={foldable ? showContent : undefined}
            onClick={foldable ? toggle : undefined}
            onKeyDown={foldable ? onKeyDown : undefined}
        >
            {foldable && <span
                aria-hidden='true'
                className={`ai-configuration-section-chevron ${codicon(showContent ? 'chevron-down' : 'chevron-right')}`}
            ></span>}
            {title !== undefined && <span className='ai-configuration-section-title-text'>{title}</span>}
            {count !== undefined && <span className='ai-configuration-section-count'>{count}</span>}
            {subtitle !== undefined && <span className='ai-configuration-section-subtitle'>{subtitle}</span>}
            {actions && <span className='ai-configuration-section-title-actions'>{actions}</span>}
        </div>}
        {showContent && <div className='ai-configuration-section-content'>
            {children}
        </div>}
    </div>;
};

export interface AiConfigurationCalloutProps {
    /** What the action does and what it affects; the action is only safe to press once this is read. */
    readonly message: string;
    /** The single action the callout offers, e.g. a "Reset All" button. */
    readonly action: React.ReactNode;
}

/**
 * A page-level offer: one line of explanation next to one action ("allow the default tools", "reset every
 * customization"). Rendered as a box above the page content rather than a bare button on the filter line,
 * so the consequence is stated where the action is.
 */
export const AiConfigurationCallout: React.FC<AiConfigurationCalloutProps> = ({ message, action }) =>
    <div className='ai-configuration-callout'>
        <span className='ai-configuration-callout-text'>{message}</span>
        {action}
    </div>;

export interface AiConfigurationValueRowProps {
    /** Omit when the surrounding section already names the value (e.g. a "Location" section). */
    readonly label?: string;
    /** The value as shown and copied; rendered in the code font since these are ids, paths and patterns. */
    readonly value: string;
    /** Omit to render the value without a copy affordance. */
    readonly onCopy?: (value: string) => void;
}

/**
 * A read-only value with its label — an id, a file path, a frontmatter entry — and an optional copy button.
 * These values exist to be used elsewhere (pasted into a prompt, a terminal, a settings file), so copying
 * them should not require selecting the text by hand.
 */
export const AiConfigurationValueRow: React.FC<AiConfigurationValueRowProps> = ({ label, value, onCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const timeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    React.useEffect(() => () => {
        if (timeout.current !== undefined) {
            clearTimeout(timeout.current);
        }
    }, []);
    const copyLabel = nls.localizeByDefault('Copy');
    return <div className='ai-configuration-value-row'>
        {label !== undefined && <span className='ai-configuration-value-row-label'>{label}</span>}
        {/* Value and button share a wrapper so the button is always immediately beside the box it copies,
            rather than at the trailing edge of however wide the surrounding row happens to be. */}
        <span className='ai-configuration-value-row-field'>
            <code className='ai-configuration-value-row-value'>{value}</code>
            {onCopy && <button
                type='button'
                className='ai-configuration-value-row-copy'
                title={copyLabel}
                aria-label={copyLabel}
                onClick={() => {
                    onCopy(value);
                    setCopied(true);
                    if (timeout.current !== undefined) {
                        clearTimeout(timeout.current);
                    }
                    timeout.current = setTimeout(() => setCopied(false), 1500);
                }}
            >
                <span aria-hidden='true' className={codicon(copied ? 'check' : 'copy')}></span>
            </button>}
        </span>
        {/* Always present so assistive tech announces the change rather than a new element. */}
        <span className='ai-configuration-visually-hidden' aria-live='polite'>{copied ? nls.localizeByDefault('Copied') : ''}</span>
    </div>;
};

export interface AiConfigurationEmptyStateProps {
    readonly message: string;
    /** `codicon(...)` class shown above the message. */
    readonly iconClass?: string;
    /** Optional call-to-action rendered under the message (e.g. an add button). */
    readonly action?: React.ReactNode;
    readonly className?: string;
}

/** Placeholder shown when a collection has no items or a filter matches nothing. */
export const AiConfigurationEmptyState: React.FC<AiConfigurationEmptyStateProps> = ({ message, iconClass, action, className }) => (
    <div className={`ai-configuration-empty-state ${className ?? ''}`}>
        {iconClass && <span className={`ai-configuration-empty-state-icon ${iconClass}`}></span>}
        <span className='ai-configuration-empty-state-message'>{message}</span>
        {action !== undefined && <div className='ai-configuration-empty-state-action'>{action}</div>}
    </div>
);

export interface AiConfigurationAddActionProps {
    readonly label: string;
    /** `codicon(...)` class; defaults to the `add` icon. */
    readonly iconClass?: string;
    readonly disabled?: boolean;
    readonly onClick: () => void;
}

/** "Add …" button used on collection overviews and in empty states. */
export const AiConfigurationAddAction: React.FC<AiConfigurationAddActionProps> = ({ label, iconClass, disabled, onClick }) => (
    <button
        className='theia-button ai-configuration-add-action'
        disabled={disabled}
        onClick={onClick}
    >
        <span className={iconClass ?? codicon('add')}></span>
        <span className='ai-configuration-add-action-label'>{label}</span>
    </button>
);

export interface AiMarkdownDescriptionProps {
    /** Renders (trusted, already-localized) markdown into an element, e.g. via the core `MarkdownRenderer`. */
    readonly renderMarkdown: (markdown: string) => HTMLElement;
    readonly markdown: string;
    /** Wrapper class; defaults to the shared settings-row description styling. */
    readonly className?: string;
}

/**
 * Renders a (trusted, already-localized) markdown description via the provided renderer into a
 * managed element. Shared by every AI configuration page so descriptions render consistently.
 */
export const AiMarkdownDescription: React.FC<AiMarkdownDescriptionProps> = ({ renderMarkdown, markdown, className }) => {
    // eslint-disable-next-line no-null/no-null
    const host = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const node = host.current;
        if (!node) {
            return;
        }
        node.replaceChildren(renderMarkdown(markdown));
        return () => node.replaceChildren();
    }, [renderMarkdown, markdown]);
    return <div className={className ?? 'ai-settings-row-description'} ref={host}></div>;
};

export interface AiConfigurationFilterInputProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly placeholder?: string;
}

/**
 * In-list filter input: a controlled text field (the owning widget holds the value) with a leading filter
 * icon, a trailing clear button, and Escape-to-clear — mirroring the view's search input.
 */
export const AiConfigurationFilterInput: React.FC<AiConfigurationFilterInputProps> = ({ value, onChange, placeholder }) => {
    const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' && value.length > 0) {
            event.preventDefault();
            onChange('');
        }
    }, [value, onChange]);
    const clearLabel = nls.localizeByDefault('Clear');
    return <div className='ai-configuration-filter-input'>
        <span className={`ai-configuration-filter-input-icon ${codicon('filter')}`}></span>
        <input
            className='theia-input'
            type='text'
            spellCheck={false}
            value={value}
            placeholder={placeholder ?? nls.localizeByDefault('Filter')}
            onChange={e => onChange(e.target.value)}
            onKeyDown={onKeyDown}
        />
        {value.length > 0 && <button
            type='button'
            className={`ai-configuration-filter-input-clear ${codicon('close')}`}
            title={clearLabel}
            aria-label={clearLabel}
            onClick={() => onChange('')}
        ></button>}
    </div>;
};

export interface AiConfigurationItemDetailHeaderProps {
    readonly title: string;
    /** `codicon(...)` class shown before the title. */
    readonly iconClass?: string;
    /** Secondary line under the title (e.g. an id or provider). */
    readonly subtitle?: string;
    /** Status badge shown next to the title. */
    readonly status?: AiConfigurationItemStatus;
    /**
     * Where the item came from, shown right after the title - the same badges the overview list shows,
     * so provenance does not get a second look on the detail page.
     */
    readonly origins?: AiConfigurationOrigin[];
    /** Optional inline content shown after the title and the origin badges. */
    readonly titleSuffix?: React.ReactNode;
    /** Trailing slot for header actions and toggles (buttons, switches). */
    readonly actions?: React.ReactNode;
}

/** Header of a collection item's detail page: icon, title, subtitle, status badge and an actions slot. */
export const AiConfigurationItemDetailHeader: React.FC<AiConfigurationItemDetailHeaderProps> = ({
    title, iconClass, subtitle, status, origins, titleSuffix, actions
}) => (
    <div className='ai-configuration-item-detail-header'>
        <div className='ai-configuration-item-detail-header-heading'>
            {iconClass && <span className={`ai-configuration-item-detail-header-icon ${iconClass}`}></span>}
            <div className='ai-configuration-item-detail-header-titles'>
                <span className='ai-configuration-item-detail-header-title-row'>
                    <span className='ai-configuration-item-detail-header-title'>{title}</span>
                    <AiConfigurationOriginBadges origins={origins} />
                    {titleSuffix}
                </span>
                {subtitle !== undefined && <span className='ai-configuration-item-detail-header-subtitle'>{subtitle}</span>}
            </div>
        </div>
        {(status || actions !== undefined) && <div className='ai-configuration-item-detail-header-actions'>
            {status && <AiConfigurationStatusBadge status={status} />}
            {actions}
        </div>}
    </div>
);
