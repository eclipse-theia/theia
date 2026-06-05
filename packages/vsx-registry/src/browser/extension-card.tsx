// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { codicon, HoverPosition, HoverService } from '@theia/core/lib/browser';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';

/**
 * Trust state for the publisher-row icon. Both the OVSX and MCP entry types map their
 * own notion of "verified" onto these three states:
 *
 * - `verified`   -> filled check (namespace-verified / registry-approved)
 * - `unverified` -> outline check (known but not verified)
 * - `unknown`    -> question mark (no trust information)
 */
export type ExtensionCardTrust = 'verified' | 'unverified' | 'unknown';

/** Markdown (or plain text) tooltip shown when hovering the card. */
export interface ExtensionCardHover {
    readonly content: string | MarkdownString;
    readonly hoverService: HoverService;
    /** Defaults to `'right'`. */
    readonly position?: HoverPosition;
}

export interface ExtensionCardProps {
    readonly title: string;
    readonly version?: string;
    readonly description?: string;

    /** Custom icon content (e.g. a codicon). Ignored when {@link iconUrl} is set. */
    readonly icon?: React.ReactNode;
    /** When set, the icon is rendered as an `<img>` from this URL. */
    readonly iconUrl?: string;
    /** Extra class on the icon element (e.g. `theia-mcp-extension-icon`). */
    readonly iconClassName?: string;

    /** Pill rendered next to the version indicating which contribution produced the entry. */
    readonly typeBadge: React.ReactNode;
    /** Extra inline labels after the type badge (e.g. `(disabled)`, `(Restricted Mode)`). */
    readonly titleLabels?: React.ReactNode;
    /** Right-aligned stat block in the title row (e.g. download count + rating). */
    readonly stat?: React.ReactNode;

    readonly publisher?: string;
    /** Tooltip on the publisher row (typically the full identifier). */
    readonly publisherTitle?: string;
    readonly trust: ExtensionCardTrust;

    /** Per-type action controls rendered at the end of the action bar. */
    readonly actions: React.ReactNode;

    /** Extra class on the card root (e.g. `theia-vsx-extension-disabled-by-trust`). */
    readonly extraClassName?: string;
    readonly hover?: ExtensionCardHover;
    readonly onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
}

function trustIconClass(trust: ExtensionCardTrust): string {
    switch (trust) {
        case 'verified':
            return codicon('verified-filled');
        case 'unverified':
            return codicon('verified');
        case 'unknown':
            return codicon('question');
    }
}

/**
 * Visual shell shared by the OVSX extension card and the MCP server card in the unified
 * Extensions view. Owns the layout, the icon slot, the title row (name + version + type
 * badge), the description, the publisher row with its trust icon, and the hover tooltip.
 *
 * State and actions stay per-type: callers pass their own `actions` node and map their
 * domain trust signal onto {@link ExtensionCardTrust}. This keeps both card types
 * visually consistent (and makes adding future artifact types straightforward) without
 * coupling their behaviour.
 */
export const ExtensionCard: React.FC<ExtensionCardProps> = props => {
    const className = `theia-vsx-extension noselect${props.extraClassName ? ' ' + props.extraClassName : ''}`;
    const onMouseEnter = props.hover
        ? (event: React.MouseEvent<HTMLElement>) => props.hover!.hoverService.requestHover({
            content: props.hover!.content,
            target: event.currentTarget,
            position: props.hover!.position ?? 'right'
        })
        : undefined;
    return (
        <div
            className={className}
            onMouseEnter={onMouseEnter}
            onContextMenu={props.onContextMenu}
        >
            {props.iconUrl
                ? <img className="theia-vsx-extension-icon" src={props.iconUrl} />
                : (
                    <div className={`theia-vsx-extension-icon placeholder${props.iconClassName ? ' ' + props.iconClassName : ''}`}>
                        {props.icon}
                    </div>
                )}
            <div className="theia-vsx-extension-content">
                <div className="title">
                    <div className="noWrapInfo">
                        <span className="name">{props.title}</span>&nbsp;
                        {props.version && <><span className="version">{props.version}</span>&nbsp;</>}
                        {props.typeBadge}
                        {props.titleLabels}
                    </div>
                    {props.stat && <div className="stat">{props.stat}</div>}
                </div>
                {props.description !== undefined && (
                    <div className="noWrapInfo theia-vsx-extension-description">{props.description}</div>
                )}
                <div className="theia-vsx-extension-action-bar">
                    <div className="theia-vsx-extension-publisher-container">
                        <i className={trustIconClass(props.trust)} title={props.publisherTitle} />
                        {props.publisher && (
                            <span className="noWrapInfo theia-vsx-extension-publisher" title={props.publisherTitle}>
                                {props.publisher}
                            </span>
                        )}
                    </div>
                    {props.actions}
                </div>
            </div>
        </div>
    );
};
