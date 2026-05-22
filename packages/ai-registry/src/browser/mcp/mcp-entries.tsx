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
import { nls } from '@theia/core';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { TypeBadge } from '@theia/vsx-registry/lib/browser/type-badge';
import { MCPServerDescription } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { ClassificationResult, ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';

/**
 * Per-entry action callbacks provided by the contribution. Entries close over
 * these so their card render functions can dispatch user actions without
 * pulling the install service through dependency injection at the React level.
 */
export interface MCPEntryHandlers {
    install(entry: ResolvedRegistryEntry): Promise<void>;
    uninstall(slug: string): Promise<void>;
    update(entry: ResolvedRegistryEntry): Promise<void>;
    link(entry: ResolvedRegistryEntry): Promise<void>;
    fixConfig(entry: ResolvedRegistryEntry): Promise<void>;
}

/** An entry surfacing a locally installed MCP server in the Installed section. */
export class MCPInstalledEntry implements TreeElement {

    readonly id: string;

    constructor(
        readonly local: MCPServerDescription,
        readonly matchedEntry: ResolvedRegistryEntry | undefined,
        readonly state: ClassificationResult,
        readonly handlers: MCPEntryHandlers
    ) {
        this.id = `mcp-installed-${local.name}`;
    }

    render(): React.ReactNode {
        return (
            <MCPCard
                // When the registry knows this server we prefer its display name / description;
                // otherwise fall back to whatever the user-edited local entry has.
                title={this.matchedEntry?.name ?? this.local.name}
                description={this.matchedEntry?.description}
                // Show what the user has actually installed; fall back to the registry range
                // for the unusual case where the local entry is missing a recorded version.
                version={this.local.registryVersion ?? this.matchedEntry?.version}
                identifier={this.matchedEntry?.serverId ?? this.local.registryServerId}
                verified={this.matchedEntry?.mcpRegistryVerified}
                actions={renderActions(this.state, this.matchedEntry, this.local.name, this.handlers, this.local.registryVersion)}
            />
        );
    }
}

/** An entry surfacing a registry-resolved MCP server in the Search Results section. */
export class MCPSearchResultEntry implements TreeElement {

    readonly id: string;

    constructor(
        readonly entry: ResolvedRegistryEntry,
        readonly state: ClassificationResult,
        readonly handlers: MCPEntryHandlers
    ) {
        this.id = `mcp-search-${entry.serverId}`;
    }

    render(): React.ReactNode {
        return (
            <MCPCard
                title={this.entry.name}
                description={this.entry.description}
                version={this.entry.version}
                identifier={this.entry.serverId}
                verified={this.entry.mcpRegistryVerified}
                actions={renderActions(this.state, this.entry, this.entry.localSlug, this.handlers)}
            />
        );
    }
}

interface MCPCardProps {
    title: string;
    description?: string;
    version?: string;
    /** Stable identifier shown in the publisher-row slot — typically the registry serverId. */
    identifier?: string;
    /** Drives the trust icon next to `identifier`: verified → filled check, unverified → question mark. */
    verified?: boolean;
    actions?: React.ReactNode;
}

/**
 * MCP entry card. Reuses the VSX extension card's CSS classes so MCP entries
 * sit visually alongside extensions in the unified Extensions view without
 * duplicating styles. The MCP-specific bits are the codicon-based icon
 * placeholder, the type badge and the publisher-row trust icon.
 */
const MCPCard: React.FC<MCPCardProps> = props => (
    <div className="theia-vsx-extension noselect">
        <div className="theia-vsx-extension-icon placeholder theia-mcp-extension-icon">
            <i className="codicon codicon-mcp" />
        </div>
        <div className="theia-vsx-extension-content">
            <div className="title">
                <div className="noWrapInfo">
                    <span className="name">{props.title}</span>&nbsp;
                    {props.version && <><span className="version">{props.version}</span>&nbsp;</>}
                    <TypeBadge
                        icon={<i className="codicon codicon-mcp" />}
                        label={nls.localizeByDefault('MCP')}
                        variant="mcp"
                    />
                </div>
            </div>
            {props.description && (
                <div className="noWrapInfo theia-vsx-extension-description">{props.description}</div>
            )}
            <div className="theia-vsx-extension-action-bar">
                <div className="theia-vsx-extension-publisher-container">
                    <i className={`codicon codicon-${props.verified === true ? 'verified-filled' : 'question'}`} />
                    {props.identifier && (
                        <span className="noWrapInfo theia-vsx-extension-publisher" title={props.identifier}>
                            {props.identifier}
                        </span>
                    )}
                </div>
                <div className="theia-mcp-extension-actions">
                    {props.actions}
                </div>
            </div>
        </div>
    </div>
);

/**
 * Buttons are state-driven and identical in the Installed and Search sections, mirroring
 * how VSX renders extension actions. State conveys itself through which buttons appear:
 *
 * - `not-installed`              → [Install]
 * - `installed-from-registry`    → [Update?] [Uninstall]      (Update only when newer version is available)
 * - `installed-manually`         → [Link to registry]         (no Uninstall — user wanted only the link affordance)
 * - `fix-config`                 → ⚠︎ [Fix config] [Uninstall]
 * - `installed-registry-revoked` → ⚠︎ "no longer in registry" [Remove]
 * - `installed-user-added`       → filtered out before reaching this view
 */
function renderActions(
    state: ClassificationResult,
    registryEntry: ResolvedRegistryEntry | undefined,
    localName: string,
    handlers: MCPEntryHandlers,
    localVersion?: string
): React.ReactNode {
    switch (state.kind) {
        case 'not-installed':
            return registryEntry && (
                <button className="theia-button prominent action" onClick={() => handlers.install(registryEntry)}>
                    {nls.localizeByDefault('Install')}
                </button>
            );
        case 'installed-from-registry':
            return (
                <>
                    {state.updateAvailable && registryEntry && (
                        <button
                            className="theia-button prominent action"
                            title={
                                registryEntry.version && registryEntry.version !== localVersion
                                    ? nls.localize(
                                        'theia/ai-registry/action/updateTooltip',
                                        'Update from {0} to {1}',
                                        localVersion ?? '?',
                                        registryEntry.version
                                    )
                                    : nls.localizeByDefault('Update')
                            }
                            onClick={() => handlers.update(registryEntry)}
                        >
                            {nls.localizeByDefault('Update')}
                        </button>
                    )}
                    <button className="theia-button action" onClick={() => handlers.uninstall(localName)}>
                        {nls.localizeByDefault('Uninstall')}
                    </button>
                </>
            );
        case 'installed-manually':
            // No Uninstall here by design — the only meaningful action is to link
            // the existing local server to the registry so future updates are tracked.
            return registryEntry && (
                <button className="theia-button action" onClick={() => handlers.link(registryEntry)}>
                    {nls.localize('theia/ai-registry/action/link', 'Link to registry')}
                </button>
            );
        case 'fix-config':
            return (
                <>
                    <i
                        className="codicon codicon-warning theia-mcp-extension-warning"
                        title={nls.localize(
                            'theia/ai-registry/warning/fixConfig',
                            "This server's configuration differs from the registry. Click 'Fix config' to restore it."
                        )}
                    />
                    {registryEntry && (
                        <button className="theia-button prominent action" onClick={() => handlers.fixConfig(registryEntry)}>
                            {nls.localize('theia/ai-registry/action/fix', 'Fix config')}
                        </button>
                    )}
                    <button className="theia-button action" onClick={() => handlers.uninstall(localName)}>
                        {nls.localizeByDefault('Uninstall')}
                    </button>
                </>
            );
        case 'installed-registry-revoked':
            return (
                <>
                    <span
                        className="theia-mcp-extension-revoked-message"
                        title={nls.localize(
                            'theia/ai-registry/warning/revokedTitle',
                            "This MCP server no longer exists in the registry. Click 'Remove' to uninstall."
                        )}
                    >
                        <i className="codicon codicon-warning theia-mcp-extension-warning" />
                        {nls.localize('theia/ai-registry/warning/revoked', 'No longer in registry')}
                    </span>
                    <button className="theia-button action theia-mcp-extension-remove" onClick={() => handlers.uninstall(localName)}>
                        {nls.localizeByDefault('Remove')}
                    </button>
                </>
            );
        case 'installed-user-added':
            // Filtered out of resolveInstalled and never returned from search; render nothing defensively.
            return undefined;
    }
}
