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
import { HoverService } from '@theia/core/lib/browser';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { TypeBadge } from '@theia/vsx-registry/lib/browser/type-badge';
import { ExtensionCard, ExtensionCardTrust } from '@theia/vsx-registry/lib/browser/extension-card';
import { MCPServerDescription } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { ClassificationResult, ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';

/**
 * Per-entry action callbacks provided by the contribution. Entries close over
 * these so their card render functions can dispatch user actions without
 * pulling the install service through dependency injection at the React level.
 */
export interface MCPEntryHandlers {
    install(entry: ResolvedRegistryEntry): Promise<void>;
    uninstall(serverKey: string): Promise<void>;
    unlink(serverKey: string): Promise<void>;
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
        readonly handlers: MCPEntryHandlers,
        readonly hoverService: HoverService
    ) {
        this.id = `mcp-installed-${local.name}`;
    }

    render(): React.ReactNode {
        const localVersion = this.local.registryMetadata?.version;
        return (
            <MCPCard
                // When the registry knows this server we prefer its display name / description;
                // otherwise fall back to whatever the user-edited local entry has.
                title={this.matchedEntry?.name ?? this.local.name}
                description={this.matchedEntry?.description}
                // Show what the user has actually installed; fall back to the registry range
                // for the unusual case where the local entry is missing a recorded version.
                version={localVersion ?? this.matchedEntry?.version}
                identifier={this.matchedEntry?.serverId ?? this.local.registryMetadata?.serverId}
                verified={this.matchedEntry?.mcpRegistryVerified}
                hoverService={this.hoverService}
                actions={renderActions(this.state, this.matchedEntry, this.local.name, this.handlers, localVersion)}
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
        readonly handlers: MCPEntryHandlers,
        readonly hoverService: HoverService
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
                hoverService={this.hoverService}
                actions={renderActions(this.state, this.entry, this.entry.localName, this.handlers)}
            />
        );
    }
}

interface MCPCardProps {
    title: string;
    description?: string;
    version?: string;
    /** Stable identifier shown in the publisher-row slot - typically the registry serverId. */
    identifier?: string;
    /** Drives the trust icon next to `identifier`: verified -> filled check, otherwise question mark. */
    verified?: boolean;
    hoverService: HoverService;
    actions?: React.ReactNode;
}

/** Build the markdown tooltip shown on hover, mirroring the depth of the VSX card's tooltip. */
function buildHoverContent(props: MCPCardProps): MarkdownStringImpl {
    const lines = [`**${props.title}**`];
    if (props.version) {
        lines.push('', `_${props.version}_`);
    }
    if (props.description) {
        lines.push('', props.description);
    }
    if (props.identifier) {
        lines.push('', `_${props.identifier}_`);
    }
    return new MarkdownStringImpl(lines.join('\n'));
}

/**
 * MCP entry card. Renders against the shared {@link ExtensionCard} shell so MCP entries
 * sit visually alongside extensions in the unified Extensions view, sharing the layout,
 * trust icon and hover tooltip. The MCP-specific bits are the codicon icon, the type
 * badge, the derived trust state and the action set.
 *
 * The trailing invisible settings-gear element reserves the same layout space VSX cards
 * use for their context-menu gear, so MCP and VSX action bars align across the view.
 */
const MCPCard: React.FC<MCPCardProps> = props => {
    const trust: ExtensionCardTrust = props.verified === true ? 'verified' : 'unknown';
    return (
        <ExtensionCard
            title={props.title}
            version={props.version}
            description={props.description}
            icon={<i className="codicon codicon-mcp" />}
            iconClassName="theia-mcp-extension-icon"
            typeBadge={
                <TypeBadge
                    icon={<i className="codicon codicon-mcp" />}
                    label={nls.localizeByDefault('MCP')}
                    variant="mcp"
                />
            }
            publisher={props.identifier}
            publisherTitle={props.identifier}
            trust={trust}
            hover={{ content: buildHoverContent(props), hoverService: props.hoverService }}
            actions={
                <div className="theia-mcp-extension-actions">
                    {props.actions}
                    <div
                        className="codicon codicon-settings-gear action theia-mcp-extension-gear-placeholder"
                        aria-hidden="true"
                    />
                </div>
            }
        />
    );
};

/**
 * Buttons are state-driven and identical in the Installed and Search sections, mirroring
 * how VSX renders extension actions. State conveys itself through which buttons appear:
 *
 * - `not-installed`              -> [Install]
 * - `installed-from-registry`    -> [Update?] [Uninstall]      (Update only when newer version is available)
 * - `installed-manually`         -> [Link to registry]         (no Uninstall - user wanted only the link affordance)
 * - `fix-config`                 -> warning [Fix config] [Uninstall]
 * - `installed-link-stale`       -> warning "Not in registry" [Unlink] [Uninstall]
 * - `installed-user-added`       -> filtered out before reaching this view
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
            // No Uninstall here by design - the only meaningful action is to link
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
        case 'installed-link-stale': {
            // The registry no longer lists the linked serverId. The server itself may
            // still work, so we offer Unlink (drop the registry link, keep the config)
            // as the soft option and keep Uninstall available for users who want the
            // server gone. Wording stays cautious - we don't assert the server works,
            // we let the user decide.
            const tooltip = nls.localize(
                'theia/ai-registry/warning/linkStale',
                'This server was installed from the registry, but the registry no longer lists it. '
                + 'If you are sure you want to keep it and it still works for you, click Unlink to drop '
                + 'the registry link. Otherwise click Uninstall to remove the server.'
            );
            return (
                <>
                    <span className="theia-mcp-extension-link-stale-message" title={tooltip}>
                        <i className="codicon codicon-warning theia-mcp-extension-warning" />
                        {nls.localize('theia/ai-registry/warning/notInRegistry', 'Not in registry')}
                    </span>
                    <button
                        className="theia-button action"
                        title={tooltip}
                        onClick={() => handlers.unlink(localName)}
                    >
                        {nls.localize('theia/ai-registry/action/unlink', 'Unlink')}
                    </button>
                    <button className="theia-button action" onClick={() => handlers.uninstall(localName)}>
                        {nls.localizeByDefault('Uninstall')}
                    </button>
                </>
            );
        }
        case 'installed-user-added':
            // Filtered out of resolveInstalled and never returned from search; render nothing defensively.
            return undefined;
    }
}
