// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { ContextMenuRenderer, HoverService } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { TypeBadge } from '@theia/vsx-registry/lib/browser/type-badge';
import { ExtensionCard } from '@theia/vsx-registry/lib/browser/extension-card';
import { RegistryArtifactKind } from '../../common/ai-registry-preferences';
import { InstalledPluginInfo, PluginClassificationResult, ResolvedPluginEntry } from '../../common/plugin/plugin-registry-types';
import { RegistryEntryContext } from '../registry-entry-context';
import { RegistryEntryGear, RegistryEntryMenuEvent, showEntryMenu } from '../registry-entry-menu';

export const AGENT_PLUGINS_LABEL = nls.localizeByDefault('Agent Plugins');

export interface PluginLinkTarget {
    readonly entry: ResolvedPluginEntry;
    readonly directoryName: string;
}

/** Entries close over these, so no React-level component injects the install service. */
export interface PluginEntryHandlers {
    install(entry: ResolvedPluginEntry): Promise<void>;
    update(entry: ResolvedPluginEntry): Promise<void>;
    fixPlugin(entry: ResolvedPluginEntry): Promise<void>;
    link(target: PluginLinkTarget): Promise<void>;
    unlink(pluginId: string): Promise<void>;
    uninstall(pluginId: string): Promise<void>;
}

export class PluginInstalledEntry implements TreeElement, RegistryEntryContext {

    readonly id: string;
    readonly artifactKind: RegistryArtifactKind = 'plugin';
    /** Precomputed so the Link action's argument stays stable across renders. */
    protected readonly linkTarget: PluginLinkTarget | undefined;

    constructor(
        readonly local: InstalledPluginInfo,
        readonly matchedEntry: ResolvedPluginEntry | undefined,
        readonly state: PluginClassificationResult,
        readonly handlers: PluginEntryHandlers,
        readonly hoverService: HoverService,
        readonly markdownRenderer: MarkdownRenderer,
        readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        this.id = `agent-plugin-installed-${local.directoryName}`;
        this.linkTarget = matchedEntry && { entry: matchedEntry, directoryName: local.directoryName };
    }

    get copyableId(): string | undefined {
        return this.local.pluginId ?? this.matchedEntry?.pluginId ?? this.local.directoryName;
    }

    get autoUpdateId(): string | undefined {
        return RegistryEntryContext.autoUpdateId(this.state, this.local.pluginId ?? this.matchedEntry?.pluginId);
    }

    render(): React.ReactNode {
        const identifier = this.local.pluginId ?? this.matchedEntry?.pluginId ?? this.local.directoryName;
        const diagnostics = buildDiagnostics(this.local);
        const serverNames = this.local.servers.map(server => server.name);
        return (
            <PluginCard
                title={this.local.name ?? this.matchedEntry?.name ?? this.local.directoryName}
                description={this.matchedEntry?.description}
                identifier={identifier}
                // From the root, which is authoritative once on disk and wins over the feed.
                stat={buildStat(this.local.skills, serverNames)}
                version={this.local.version ?? this.matchedEntry?.version}
                skills={this.local.skills}
                servers={serverNames}
                diagnostics={diagnostics}
                hoverService={this.hoverService}
                markdownRenderer={this.markdownRenderer}
                onManage={event => showEntryMenu(event, this, this.contextMenuRenderer)}
                actions={renderActions(this.state, this.matchedEntry, identifier, this.linkTarget, this.handlers)}
            />
        );
    }
}

export class PluginSearchResultEntry implements TreeElement, RegistryEntryContext {

    readonly id: string;
    readonly artifactKind: RegistryArtifactKind = 'plugin';
    protected readonly linkTarget: PluginLinkTarget | undefined;

    constructor(
        readonly entry: ResolvedPluginEntry,
        readonly state: PluginClassificationResult,
        readonly handlers: PluginEntryHandlers,
        readonly hoverService: HoverService,
        readonly markdownRenderer: MarkdownRenderer,
        readonly contextMenuRenderer: ContextMenuRenderer,
        /** Directory of an unlinked local copy of this plugin, when there is one to adopt. */
        readonly linkDirectoryName?: string
    ) {
        this.id = `agent-plugin-search-${entry.pluginId}`;
        this.linkTarget = linkDirectoryName !== undefined ? { entry, directoryName: linkDirectoryName } : undefined;
    }

    get copyableId(): string | undefined {
        return this.entry.pluginId;
    }

    get autoUpdateId(): string | undefined {
        return RegistryEntryContext.autoUpdateId(this.state, this.entry.pluginId);
    }

    render(): React.ReactNode {
        const skills = this.entry.containedSkills.map(skill => skill.name);
        const servers = this.entry.containedMcpServers.map(server => server.name);
        return (
            <PluginCard
                title={this.entry.name}
                description={this.entry.description}
                identifier={this.entry.pluginId}
                // Nothing on disk yet, so these are what the registry last found.
                stat={buildStat(skills, servers)}
                version={this.entry.version}
                skills={skills}
                servers={servers}
                hoverService={this.hoverService}
                markdownRenderer={this.markdownRenderer}
                onManage={event => showEntryMenu(event, this, this.contextMenuRenderer)}
                actions={renderActions(this.state, this.entry, this.entry.pluginId, this.linkTarget, this.handlers)}
            />
        );
    }
}

interface PluginDiagnostics {
    readonly summary: string;
    readonly detail: string;
}

interface PluginCardProps {
    title: string;
    description?: string;
    /** Shown in the publisher-row slot. */
    identifier: string;
    version?: string;
    stat?: string;
    /** Names, not a count: the hover is where the user finds out what a plugin actually brings. */
    skills: string[];
    servers: string[];
    diagnostics?: PluginDiagnostics;
    hoverService: HoverService;
    markdownRenderer: MarkdownRenderer;
    onManage: (event: RegistryEntryMenuEvent) => void;
    actions?: React.ReactNode;
}

/**
 * Markdown while the plugin loaded cleanly, which is the common case. A plugin with diagnostics gets
 * an element instead, because the markdown renderer escapes HTML and the reasons have to read as
 * warnings rather than as more description.
 */
function buildHoverContent(props: PluginCardProps): MarkdownStringImpl | HTMLElement {
    const lines = [`**${props.title}**`];
    if (props.description) {
        lines.push('', props.description);
    }
    appendNamedList(lines, nls.localizeByDefault('Skills'), props.skills);
    appendNamedList(lines, nls.localizeByDefault('MCP Servers'), props.servers);
    lines.push('', `_${props.identifier}_`);
    const markdown = new MarkdownStringImpl(lines.join('\n'));
    if (!props.diagnostics) {
        return markdown;
    }
    const host = document.createElement('div');
    host.appendChild(props.markdownRenderer.render(markdown).element);
    const warning = document.createElement('div');
    warning.className = 'theia-agent-plugin-hover-warning';
    // One reason per line; `textContent` keeps the reasons out of the markup, and the class carries
    // the colour so a skipped component does not read like part of the description.
    warning.textContent = props.diagnostics.detail;
    host.appendChild(warning);
    return host;
}

/** A heading and one bullet per name, so the hover answers "what is in this plugin". */
function appendNamedList(lines: string[], heading: string, names: string[]): void {
    if (names.length === 0) {
        return;
    }
    lines.push('', `**${heading}**`, ...names.map(name => `- ${name}`));
}

/** `3 skills · 1 MCP server`, omitting whichever part is empty. The card renders the version itself. */
function buildStat(skills: string[], servers: string[]): string | undefined {
    const parts: string[] = [];
    if (skills.length > 0) {
        parts.push(skills.length === 1
            ? nls.localizeByDefault('1 skill')
            : nls.localizeByDefault('{0} skills', skills.length));
    }
    if (servers.length > 0) {
        parts.push(servers.length === 1
            ? nls.localize('theia/ai-registry/plugin/stat/oneServer', '1 MCP server')
            : nls.localize('theia/ai-registry/plugin/stat/servers', '{0} MCP servers', servers.length));
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Failures are isolated per component, so without this a half-loaded plugin looks like a loaded one. */
function buildDiagnostics(info: InstalledPluginInfo): PluginDiagnostics | undefined {
    const problems = info.skipped.map(component => nls.localizeByDefault('{0}: {1}', component.name, component.reason));
    if (info.mcpDisabledReason !== undefined) {
        problems.unshift(info.mcpDisabledReason);
    }
    if (problems.length === 0) {
        return undefined;
    }
    const detail = problems.join('\n');
    if (info.skipped.length === 0) {
        return { summary: nls.localize('theia/ai-registry/plugin/diagnostics/mcpDisabled', 'MCP configuration ignored'), detail };
    }
    if (info.skipped.length === 1 && info.mcpDisabledReason === undefined) {
        return {
            summary: nls.localize(
                'theia/ai-registry/plugin/diagnostics/oneSkipped', 'Component "{0}" skipped: {1}', info.skipped[0].name, info.skipped[0].reason
            ),
            detail
        };
    }
    // Skipped components only: a rejected `mcp.json` is the whole type being unusable, so it gets
    // its own clause rather than being added to the tally.
    const skipped = nls.localize('theia/ai-registry/plugin/diagnostics/manySkipped', '{0} components skipped', info.skipped.length);
    return {
        summary: info.mcpDisabledReason === undefined
            ? skipped
            : nls.localize('theia/ai-registry/plugin/diagnostics/mcpDisabledAndSkipped', 'MCP configuration ignored, {0}', skipped),
        detail
    };
}

/** `codicon-package` rather than `codicon-extensions`, which the VS Code extension section owns. */
const PluginCard: React.FC<PluginCardProps> = props => (
    <ExtensionCard
        title={props.title}
        version={props.version}
        description={props.description}
        icon={<i className="codicon codicon-package" />}
        iconClassName="theia-agent-plugin-extension-icon"
        typeBadge={
            <TypeBadge
                icon={<i className="codicon codicon-package" />}
                label={AGENT_PLUGINS_LABEL}
                variant="agent-plugin"
            />
        }
        stat={props.stat}
        publisher={props.identifier}
        publisherTitle={props.identifier}
        // Only endorsed plugins are published and the feed has no per-plugin verified flag.
        trust="verified"
        hover={{ content: buildHoverContent(props), hoverService: props.hoverService }}
        onContextMenu={props.onManage}
        actions={
            <div className="theia-agent-plugin-extension-actions">
                {props.diagnostics && (
                    <span className="theia-agent-plugin-extension-diagnostics" title={props.diagnostics.detail}>
                        <i className="codicon codicon-warning theia-agent-plugin-extension-warning" />
                        {props.diagnostics.summary}
                    </span>
                )}
                {props.actions}
                <RegistryEntryGear className="theia-agent-plugin-extension-gear" onManage={props.onManage} />
            </div>
        }
    />
);

interface ActionButtonProps<T> {
    readonly label: string;
    /** Kept stable by the owning entry so the click handler can be cached. */
    readonly argument: T;
    readonly run: (argument: T) => void;
    readonly prominent?: boolean;
    readonly title?: string;
}

/** The handler comes from a stable `(run, argument)` pair, not an inline arrow, so React can cache it. */
function ActionButton<T>(props: ActionButtonProps<T>): React.ReactElement {
    const { run, argument } = props;
    const onClick = React.useCallback(() => run(argument), [run, argument]);
    return (
        <button
            className={props.prominent ? 'theia-button prominent action' : 'theia-button action'}
            title={props.title}
            onClick={onClick}
        >
            {props.label}
        </button>
    );
}

/** State-driven, and identical in the Installed and Search sections. */
function renderActions(
    state: PluginClassificationResult,
    registryEntry: ResolvedPluginEntry | undefined,
    pluginId: string,
    linkTarget: PluginLinkTarget | undefined,
    handlers: PluginEntryHandlers
): React.ReactNode {
    switch (state.kind) {
        case 'not-installed':
            return registryEntry && (
                <ActionButton argument={registryEntry} run={handlers.install} label={nls.localizeByDefault('Install')} prominent={true} />
            );
        case 'installed-from-registry':
            return (
                <>
                    {state.updateAvailable && registryEntry && (
                        <ActionButton argument={registryEntry} run={handlers.update} label={nls.localizeByDefault('Update')} prominent={true} />
                    )}
                    <ActionButton argument={pluginId} run={handlers.uninstall} label={nls.localizeByDefault('Uninstall')} />
                </>
            );
        case 'installed-manually':
            return linkTarget && (
                <ActionButton
                    argument={linkTarget}
                    run={handlers.link}
                    label={nls.localize('theia/ai-registry/plugin/action/link', 'Link to registry')}
                    title={nls.localize(
                        'theia/ai-registry/plugin/warning/manual',
                        'This directory was not installed from the registry. Linking records where it came from without changing its files.'
                    )}
                />
            );
        case 'fix-plugin': {
            const tooltip = nls.localize(
                'theia/ai-registry/plugin/warning/fix',
                "This plugin's files differ from what was installed. Click 'Fix Plugin' to download the endorsed content again."
            );
            return (
                <>
                    <i className="codicon codicon-warning theia-agent-plugin-extension-warning" title={tooltip} />
                    {registryEntry && (
                        <ActionButton
                            argument={registryEntry}
                            run={handlers.fixPlugin}
                            label={nls.localize('theia/ai-registry/plugin/action/fix', 'Fix Plugin')}
                            prominent={true}
                        />
                    )}
                    <ActionButton argument={pluginId} run={handlers.uninstall} label={nls.localizeByDefault('Uninstall')} />
                </>
            );
        }
        case 'installed-link-stale': {
            const tooltip = nls.localize(
                'theia/ai-registry/plugin/warning/linkStale',
                'This plugin was installed from the registry, but the registry no longer lists it. Click Unlink to drop the registry link and '
                + 'keep the files, or Uninstall to remove the plugin.'
            );
            return (
                <>
                    <span className="theia-agent-plugin-extension-link-stale-message" title={tooltip}>
                        <i className="codicon codicon-warning theia-agent-plugin-extension-warning" />
                        {nls.localize('theia/ai-registry/plugin/warning/notInRegistry', 'Not in registry')}
                    </span>
                    <ActionButton
                        argument={pluginId}
                        run={handlers.unlink}
                        label={nls.localize('theia/ai-registry/plugin/action/unlink', 'Unlink')}
                        title={tooltip}
                    />
                    <ActionButton argument={pluginId} run={handlers.uninstall} label={nls.localizeByDefault('Uninstall')} />
                </>
            );
        }
        case 'installed-user-added':
            // Filtered out by `resolveInstalled`; kept as an exhaustiveness guard.
            return undefined;
    }
}
