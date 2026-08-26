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

import { AiConfigurationService } from '@theia/ai-core';
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { PROMPT_VARIABLE } from '@theia/ai-core/lib/browser/prompt-variable-contribution';
import { Emitter, Event, ILogger, MessageService, nls, PreferenceScope } from '@theia/core';
import { codicon, ConfirmDialog } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, named, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationItemStatus,
    AiConfigurationRenderContext,
    AiConfigurationTools,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider,
    AiConfigurationTreeItem
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { CollectionCategoryRenderer, AiConfigurationAddDescriptor } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/collection-category-renderer';
import { AiConfigurationItemDetailHeader, AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AiConfigurationOrigin } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-origin-badge';
import { AiConfigurationItemRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-row';
import { AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiArrayInput, AiTextInput, AiToggleSwitch } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';
import type { MCPServerFormData } from './mcp-server-edit-dialog';
import { MCP_SERVERS_PREF, MCP_USE_WORKSPACE_AS_ROOT_PREF } from '../common/mcp-preferences';
import {
    isLocalMCPServerDescription,
    isRemoteMCPServerDescription,
    MCPFrontendNotificationService,
    MCPFrontendService,
    MCPServerDescription,
    MCPServerStatus
} from '../common/mcp-server-manager';
import { MCPRegistryUiBridge } from './mcp-registry-ui-bridge';
import { MCPServerEditor } from './mcp-server-editor';
import { MCPOAuthConfig } from '../common/mcp-oauth';
import { isHttpOrHttpsUrl } from '../common/mcp-server-preference-validator';

/**
 * The MCP Servers category (in `@theia/ai-mcp`): a `collection` porting the MCP server surface
 * onto the shared primitives. Servers are the tree children (status dot from {@link MCPServerStatus});
 * the per-server configuration and tool list are rendered as the item detail.
 */
@injectable()
export class McpServersConfigurationCategory extends CollectionCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.MCP_SERVERS;
    readonly label = nls.localizeByDefault('MCP Servers');
    readonly iconClass = codicon('mcp');
    readonly order = AiConfigurationCategoryOrder.MCP_SERVERS;
    readonly kind = 'collection' as const;

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    @inject(MCPFrontendNotificationService)
    protected readonly mcpFrontendNotificationService: MCPFrontendNotificationService;

    @inject(ILogger) @named('ai-mcp:McpServersConfigurationCategory')
    protected readonly logger: ILogger;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    @inject(MCPServerEditor)
    protected readonly serverEditor: MCPServerEditor;

    @inject(AiSettingsRowService)
    protected readonly settingsRowService: AiSettingsRowService;

    @inject(MCPRegistryUiBridge) @optional()
    protected readonly registryBridge?: MCPRegistryUiBridge;

    @inject(AgentPluginUiBridge) @optional()
    protected readonly agentPluginBridge?: AgentPluginUiBridge;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected servers: MCPServerDescription[] = [];
    protected oauthCredentialStates: Record<string, boolean> = {};

    get renderer(): this {
        return this;
    }

    getOwnedPreferenceIds(): string[] {
        return [MCP_SERVERS_PREF, MCP_USE_WORKSPACE_AS_ROOT_PREF];
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.mcpFrontendNotificationService.onDidUpdateMCPServers(() => this.loadServers()));
        if (this.agentPluginBridge) {
            // An install changes which plugin names resolve, so the provenance labels must re-render.
            this.toDispose.push(this.agentPluginBridge.onDidChange(() => this.onDidChangeEmitter.fire()));
        }
        this.loadServers();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async loadServers(): Promise<void> {
        const serverNames = (await this.mcpFrontendService.getServerNames()).sort((a, b) => a.localeCompare(b));
        const descriptions = await Promise.all(serverNames.map(name => this.mcpFrontendService.getServerDescription(name)));
        this.servers = descriptions.filter((description): description is MCPServerDescription => description !== undefined);
        this.oauthCredentialStates = Object.fromEntries(await Promise.all(this.servers.map(async server => [
            server.name,
            isRemoteMCPServerDescription(server) && server.oauth
                ? await this.mcpFrontendService.hasStoredOAuthCredentials(server.name)
                : false
        ] as const)));
        this.onDidChangeEmitter.fire();
    }

    protected get categoryId(): string {
        return this.id;
    }

    getTreeChildren(): AiConfigurationTreeItem[] {
        return this.servers.map(server => ({
            id: server.name,
            label: server.name,
            iconClass: this.iconClass,
            description: this.getServerSummary(server),
            // Provenance belongs in the list too, not just on the detail page: it is how you tell a server you
            // configured by hand from one installed from the registry without opening each of them.
            origins: this.getServerOrigins(server),
            status: this.getServerStatus(server)
        } satisfies AiConfigurationTreeItem));
    }

    /**
     * The registry entry and/or the Agent Plugin a server came from. Both, when it carries both: a
     * plugin-contributed server can also be linked to a registry approval of its own, and the two lead to
     * different places. Empty for a server the user configured by hand, which is the common case.
     */
    protected getServerOrigins(server: MCPServerDescription): AiConfigurationOrigin[] | undefined {
        const origins: AiConfigurationOrigin[] = [];
        const registryId = server.registryMetadata?.serverId;
        const bridge = this.registryBridge;
        if (registryId) {
            // Stated even without `@theia/ai-registry`, which is what would open it: the server did come
            // from the registry, and the preference it was written into says so whether or not we can link.
            origins.push(AiConfigurationOrigin.registry(registryId, bridge && (() => bridge.openRegistry(registryId))));
        }
        const plugin = this.getOwningPlugin(server);
        if (plugin) {
            origins.push(AiConfigurationOrigin.agentPlugin(plugin, () => this.agentPluginBridge?.revealPlugin(plugin.pluginId)));
        }
        return origins.length > 0 ? origins : undefined;
    }

    /**
     * The Agent Plugin that contributed a server, or `undefined` when the server is the user's own, when the
     * owning plugin is not installed - a bare identifier is not worth an affordance - or when no bridge is
     * bound, i.e. in a product without `@theia/ai-registry`.
     */
    protected getOwningPlugin(server: MCPServerDescription): InstalledAgentPluginInfo | undefined {
        const pluginId = server.registryMetadata?.pluginId;
        return pluginId ? this.agentPluginBridge?.getPlugin(pluginId) : undefined;
    }

    /** Overview subtitle: the server type (Local/Remote) and, once known, its tool count — not the raw command/URL. */
    protected getServerSummary(server: MCPServerDescription): string | undefined {
        const type = isLocalMCPServerDescription(server)
            ? nls.localizeByDefault('Local')
            : isRemoteMCPServerDescription(server)
                ? nls.localizeByDefault('Remote')
                : undefined;
        const toolCount = server.tools?.length ?? 0;
        const tools = toolCount > 0 ? nls.localizeByDefault('{0} tools', toolCount) : undefined;
        return [type, tools].filter(entry => entry !== undefined).join(' · ') || undefined;
    }

    protected getServerStatus(server: MCPServerDescription): AiConfigurationItemStatus {
        const status = server.status;
        switch (status) {
            case MCPServerStatus.Running:
            case MCPServerStatus.Connected:
                return { kind: 'on', label: status };
            case MCPServerStatus.Starting:
            case MCPServerStatus.Connecting:
            case MCPServerStatus.AuthenticationRequired:
                return { kind: 'warn', label: status };
            case MCPServerStatus.Errored:
                return { kind: 'error', label: MCPServerStatus.Errored, tooltip: server.error ?? status };
            default:
                return { kind: 'off', label: status ?? MCPServerStatus.NotRunning };
        }
    }

    protected override renderCategorySettings(ctx: AiConfigurationRenderContext): React.ReactNode {
        return <>
            <AiConfigurationSection title={nls.localizeByDefault('Settings')}>
                <AiSettingsRow
                    service={this.settingsRowService}
                    preferenceId={MCP_USE_WORKSPACE_AS_ROOT_PREF}
                    scope={ctx.scope}
                    control={this.settingsRowService.controlFor(MCP_USE_WORKSPACE_AS_ROOT_PREF)}
                    onDidChange={ctx.update}
                />
            </AiConfigurationSection>
            {this.registryBridge && <div className='mcp-header-actions'>
                <button
                    className='theia-button secondary'
                    title={nls.localize('theia/ai/mcpConfiguration/browseAIRegistryTooltip', 'Open the Extensions view to browse AI registry entries')}
                    onClick={() => this.registryBridge?.openRegistry()}
                >
                    <i className={codicon('link-external')}></i>
                    {nls.localize('theia/ai/mcpConfiguration/browseAIRegistry', 'Browse AI registry')}
                </button>
            </div>}
        </>;
    }

    override getAddAction(): AiConfigurationAddDescriptor {
        return {
            label: nls.localizeByDefault('Add MCP Server'),
            iconClass: codicon('add'),
            run: () => { this.serverEditor.openAddServer(); }
        };
    }

    protected override get overviewListTitle(): string {
        return nls.localize('theia/ai/mcpConfiguration/serversListTitle', 'Servers');
    }

    protected override getEmptyMessage(): string {
        return nls.localizeByDefault('No MCP servers configured');
    }

    protected override renderItemHeader(item: AiConfigurationTreeItem): React.ReactNode {
        const server = this.servers.find(candidate => candidate.name === item.id);
        if (!server) {
            return undefined;
        }
        // Use the shared detail header (icon + title), matching the other detail pages. The origin badges sit
        // next to the title; the status badge is grouped with the lifecycle/delete controls on the right.
        return <AiConfigurationItemDetailHeader
            title={server.name}
            iconClass={this.iconClass}
            subtitle={this.getServerSummary(server)}
            origins={this.getServerOrigins(server)}
            status={this.getServerStatus(server)}
            actions={this.renderServerActions(server)}
        />;
    }

    protected renderItemSections(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode {
        const server = this.servers.find(candidate => candidate.name === item.id);
        if (!server) {
            return undefined;
        }
        return <>
            <AiConfigurationSection className='mcp-config-form'>
                {this.renderConfigForm(server)}
            </AiConfigurationSection>
            {this.renderToolsSection(server, ctx)}
        </>;
    }

    /** Lifecycle (start/stop/sign-in/sign-out), registry-origin link and delete controls for the header action slot. */
    protected renderServerActions(server: MCPServerDescription): React.ReactNode {
        const isStoppable = server.status === MCPServerStatus.Running
            || server.status === MCPServerStatus.Connected
            || server.status === MCPServerStatus.AuthenticationRequired;
        const isStarting = server.status === MCPServerStatus.Starting || server.status === MCPServerStatus.Connecting;
        const isStartable = server.status === MCPServerStatus.NotRunning
            || server.status === MCPServerStatus.NotConnected
            || server.status === MCPServerStatus.AuthenticationRequired
            || server.status === MCPServerStatus.Errored;
        const isRemote = isRemoteMCPServerDescription(server);
        const isOAuthEnabled = isRemote && !!server.oauth;
        const startIcon = isRemote ? 'plug' : 'play';
        const stopIcon = isRemote ? 'debug-disconnect' : 'debug-stop';
        const startLabel = isRemote ? nls.localizeByDefault('Connect') : nls.localizeByDefault('Start Server');
        const startingLabel = isRemote ? nls.localizeByDefault('Connecting...') : nls.localizeByDefault('Starting...');
        const stopLabel = isRemote ? nls.localizeByDefault('Disconnect') : nls.localizeByDefault('Stop Server');
        return <>
            {isStartable && <button className={`mcp-action-button ${codicon(startIcon)}`} onClick={() => this.handleStartServer(server)} title={startLabel} />}
            {isStarting && <button className={`mcp-action-button ${codicon('loading')} theia-animation-spin`} disabled title={startingLabel} />}
            {isStoppable && <button className={`mcp-action-button ${codicon(stopIcon)}`} onClick={() => this.handleStopServer(server.name)} title={stopLabel} />}
            {isOAuthEnabled && isStartable &&
                <button className={`mcp-action-button ${codicon('sign-in')}`} onClick={() => this.handleSignInServer(server.name)} title={nls.localizeByDefault('Sign In')} />}
            {isOAuthEnabled && this.oauthCredentialStates[server.name] && <button
                className={`mcp-action-button ${codicon('sign-out')}`}
                onClick={() => this.handleSignOutServer(server.name)}
                title={nls.localizeByDefault('Sign Out')}
            />}
            <button
                className={`mcp-action-button mcp-delete-button ${codicon('trash')}`}
                onClick={() => this.handleDeleteServer(server.name)}
                title={nls.localize('theia/ai/mcpConfiguration/deleteServer', 'Delete Server')}
            />
        </>;
    }

    /**
     * The per-server configuration, edited in place. Each field patches the server's form representation and
     * re-persists it via {@link MCPServerEditor.save} — the same write path (and stale-key cleanup) the Add
     * dialog uses — so there is no separate Edit dialog. The server type is shown read-only: changing it means
     * deleting and re-adding the server, which the Add dialog handles cleanly.
     */
    protected renderConfigForm(server: MCPServerDescription): React.ReactNode {
        const local = isLocalMCPServerDescription(server);
        const remote = isRemoteMCPServerDescription(server);
        const oauth = remote ? server.oauth : undefined;
        return <>
            {this.renderFieldRow(nls.localizeByDefault('Server Type'),
                <span className='mcp-field-static'>{this.getServerTypeLabel(server)}</span>)}
            {local && this.renderTextField(nls.localizeByDefault('Command'), server.command, false, false,
                value => this.updateServer(server, { command: value }),
                server.command.trim() ? undefined : nls.localize('theia/ai/mcpConfiguration/form/commandRequired', 'Command is required for local servers'))}
            {local && this.renderArrayField(nls.localizeByDefault('Arguments'), server.args ?? [],
                nls.localize('theia/ai/mcpConfiguration/addArgument', 'Add argument…'),
                values => this.updateServer(server, { args: values }))}
            {local && this.renderKeyValueField(nls.localize('theia/ai/mcpConfiguration/environmentVariables', 'Environment Variables'), server.env ?? {},
                lines => this.updateServer(server, { env: lines }))}
            {local && this.renderPluginPathsSection(server)}
            {remote && this.renderTextField(nls.localize('theia/ai/mcpConfiguration/serverUrl', 'Server URL'), server.serverUrl, false, false,
                value => this.updateServer(server, { serverUrl: value }),
                server.serverUrl.trim() ? undefined : nls.localize('theia/ai/mcpConfiguration/form/serverUrlRequired', 'Server URL is required for remote servers'))}
            {remote && !oauth && this.renderTextField(
                nls.localize('theia/ai/mcpConfiguration/serverAuthTokenHeader', 'Auth Header Name'), server.serverAuthTokenHeader ?? '', false, false,
                value => this.updateServer(server, { serverAuthTokenHeader: value }))}
            {remote && !oauth && this.renderTextField(nls.localize('theia/ai/mcpConfiguration/serverAuthToken', 'Auth Token'), server.serverAuthToken ?? '', false, true,
                value => this.updateServer(server, { serverAuthToken: value }))}
            {remote && this.renderKeyValueField(nls.localizeByDefault('Headers'), server.headers ?? {},
                lines => this.updateServer(server, { headers: lines }))}
            {oauth && this.renderOAuthFields(server, oauth)}
            {this.renderToggleField(nls.localize('theia/ai/mcpConfiguration/autostart', 'Autostart'), server.autostart ?? false,
                value => this.updateServer(server, { autostart: value }))}
            {this.renderToggleField(nls.localize('theia/ai/mcpConfiguration/deferLoading', 'Defer tool loading'), server.deferLoading ?? false,
                value => this.updateServer(server, { deferLoading: value }))}
        </>;
    }

    protected renderOAuthFields(server: MCPServerDescription, oauth: MCPOAuthConfig): React.ReactNode {
        return <>
            {this.renderTextField(nls.localize('theia/ai/mcpConfiguration/oauthClientId', 'OAuth Client ID'), oauth.clientId ?? '', false, false,
                value => this.updateServer(server, { oauthClientId: value }))}
            {this.renderTextField(nls.localize('theia/ai/mcpConfiguration/oauthClientSecret', 'OAuth Client Secret'), oauth.clientSecret ?? '', false, true,
                value => this.updateServer(server, { oauthClientSecret: value }))}
            {this.renderArrayField(nls.localize('theia/ai/mcpConfiguration/oauthScopes', 'OAuth Scopes'), oauth.scopes ?? [],
                nls.localize('theia/ai/mcpConfiguration/addScope', 'Add scope…'),
                values => this.updateServer(server, { oauthScopes: values.join(' ') }))}
            {this.renderTextField(nls.localize('theia/ai/mcpConfiguration/oauthAuthorizationServer', 'Authorization Server'), oauth.authorizationServer ?? '', false, false,
                value => this.updateServer(server, { oauthAuthorizationServer: value }),
                oauth.authorizationServer && !isHttpOrHttpsUrl(oauth.authorizationServer)
                    ? nls.localize('theia/ai/mcpConfiguration/form/oauthAuthorizationServerInvalid', 'OAuth Authorization Server must be a valid http(s) URL')
                    : undefined)}
            {this.renderTextField(nls.localize('theia/ai/mcpConfiguration/oauthResource', 'OAuth Resource'), oauth.resource ?? '', false, false,
                value => this.updateServer(server, { oauthResource: value }),
                oauth.resource && !isHttpOrHttpsUrl(oauth.resource)
                    ? nls.localize('theia/ai/mcpConfiguration/form/oauthResourceInvalid', 'OAuth Resource must be a valid http(s) URL')
                    : undefined)}
        </>;
    }

    /** Patches the server's editable form and re-saves it (reusing the dialog's persistence path). */
    protected updateServer(server: MCPServerDescription, patch: Partial<MCPServerFormData>): void {
        const form = this.serverEditor.toFormData(server);
        if (!form) {
            return;
        }
        this.serverEditor.save({ ...form, ...patch }).catch(error =>
            this.messageService.error(nls.localize('theia/ai/mcpConfiguration/saveServerError', 'Failed to save MCP server configuration: {0}', String(error))));
    }

    protected getServerTypeLabel(server: MCPServerDescription): string {
        if (isLocalMCPServerDescription(server)) {
            return nls.localizeByDefault('Local');
        }
        if (isRemoteMCPServerDescription(server)) {
            return server.oauth ? nls.localize('theia/ai/mcpConfiguration/typeRemoteOAuth', 'Remote (OAuth)') : nls.localizeByDefault('Remote');
        }
        return nls.localizeByDefault('Unknown');
    }

    /**
     * Read-only on purpose: all three are derived from where `@theia/ai-registry` installed the Agent
     * Plugin, so there is nothing for the user to author. Shown rather than hidden because they decide
     * where the process runs and what `PLUGIN_ROOT` and `PLUGIN_DATA` point at.
     */
    protected renderPluginPathsSection(server: MCPServerDescription): React.ReactNode {
        if (!isLocalMCPServerDescription(server)) {
            return undefined;
        }
        return <>
            {this.renderReadOnlyPath(nls.localizeByDefault('Working Directory'), server.cwd)}
            {this.renderReadOnlyPath(nls.localize('theia/ai/mcpConfiguration/pluginRoot', 'Plugin Root'), server.pluginRoot, 'PLUGIN_ROOT')}
            {this.renderReadOnlyPath(nls.localize('theia/ai/mcpConfiguration/pluginData', 'Plugin Data'), server.pluginData, 'PLUGIN_DATA')}
        </>;
    }

    /** @param variable the environment variable the value is exported as, when it is one. */
    protected renderReadOnlyPath(label: string, value: string | undefined, variable?: string): React.ReactNode {
        if (!value) {
            return undefined;
        }
        return this.renderFieldRow(label, <code className='mcp-property-readonly' title={value}>
            {value}
            {variable && <span className='mcp-property-variable'>{variable}</span>}
        </code>);
    }

    protected renderFieldRow(label: string, control: React.ReactNode): React.ReactNode {
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{label}:</span>
            <div className='mcp-property-value mcp-field-control'>{control}</div>
        </div>;
    }

    protected renderTextField(
        label: string, value: string, monospace: boolean, password: boolean, onCommit: (value: string) => void, error?: string
    ): React.ReactNode {
        return this.renderFieldRow(label, <AiTextInput
            value={value} ariaLabel={label} monospace={monospace} password={password} invalid={!!error} errorMessage={error} onCommit={onCommit}
        />);
    }

    protected renderArrayField(label: string, values: string[], addPlaceholder: string, onChange: (values: string[]) => void): React.ReactNode {
        return this.renderFieldRow(label, <AiArrayInput values={values} ariaLabel={label} addPlaceholder={addPlaceholder} onChange={onChange} />);
    }

    protected renderKeyValueField(label: string, entries: Record<string, string>, onChange: (lines: string) => void): React.ReactNode {
        const lines = Object.entries(entries).map(([key, value]) => `${key}=${value}`);
        return this.renderFieldRow(label, <AiArrayInput
            values={lines}
            ariaLabel={label}
            addPlaceholder={nls.localize('theia/ai/mcpConfiguration/addKeyValue', 'Add KEY=value…')}
            onChange={next => onChange(next.join('\n'))}
        />);
    }

    protected renderToggleField(label: string, checked: boolean, onChange: (checked: boolean) => void): React.ReactNode {
        return this.renderFieldRow(label, <AiToggleSwitch checked={checked} ariaLabel={label} onChange={onChange} />);
    }

    /**
     * The server's tools, shown (once available) as a plain, non-collapsible list matching the Variables list,
     * each row offering a per-tool copy action and linking to the Tools page. The "copy all" variants stay in
     * a small toolbar in the header.
     */
    protected renderToolsSection(server: MCPServerDescription, ctx: AiConfigurationRenderContext): React.ReactNode {
        if (!server.tools || server.tools.length === 0) {
            return undefined;
        }
        const tools = server.tools;
        const copy = (text: string, info: string): void => {
            navigator.clipboard.writeText(text);
            this.messageService.info(info);
        };
        return <AiConfigurationSection title={nls.localizeByDefault('Tools')} actions={<div className='mcp-tools-actions'>
            <button
                className='mcp-copy-tool-button'
                title={nls.localize('theia/ai/mcpConfiguration/copyAllList', 'Copy all (list of all tools)')}
                onClick={() => copy(tools.map(tool => `~{mcp_${server.name}_${tool.name}}`).join('\n'),
                    nls.localize('theia/ai/mcpConfiguration/copiedAllList', 'Copied all tools to clipboard (list of all tools)'))}
            ><i className={codicon('versions')}></i></button>
            <button
                className='mcp-copy-tool-button'
                title={nls.localize('theia/ai/mcpConfiguration/copyForPromptTemplate', 'Copy all for prompt template (single prompt fragment with all tools)')}
                onClick={() => copy(`{{${PROMPT_VARIABLE.name}:${this.mcpFrontendService.getPromptTemplateId(server.name)}}}`,
                    nls.localize('theia/ai/mcpConfiguration/copiedForPromptTemplate',
                        'Copied all tools to clipboard for prompt template (single prompt fragment with all tools)'))}
            ><i className={codicon('bracket')}></i></button>
            <button
                className='mcp-copy-tool-button'
                title={nls.localize('theia/ai/mcpConfiguration/copyAllSingle', 'Copy all for chat (single prompt fragment with all tools)')}
                onClick={() => copy(`#${PROMPT_VARIABLE.name}:${this.mcpFrontendService.getPromptTemplateId(server.name)}`,
                    nls.localize('theia/ai/mcpConfiguration/copiedAllSingle', 'Copied all tools to clipboard (single prompt fragment with all tools)'))}
            ><i className={codicon('copy')}></i></button>
        </div>}>
            <div className='ai-configuration-item-list'>
                {tools.map(tool => {
                    const token = `~{mcp_${server.name}_${tool.name}}`;
                    return <AiConfigurationItemRow
                        key={tool.name}
                        label={tool.name}
                        description={tool.description}
                        // The registry prefixes an MCP tool with its server, which is how the Tools page lists it.
                        onActivateLabel={() => ctx.navigate(AiConfigurationTools.selectionFor(`mcp_${server.name}_${tool.name}`))}
                        labelTooltip={nls.localize('theia/ai/mcpConfiguration/showToolSettings', 'Show tool')}
                        trailing={<button
                            className='mcp-copy-tool-button'
                            title={nls.localize('theia/ai/mcpConfiguration/copyForPrompt', 'Copy tool (for chat or prompt template)')}
                            onClick={() => copy(token,
                                nls.localize('theia/ai/mcpConfiguration/copiedForPrompt', 'Copied {0} to clipboard (for chat or prompt template)', token))}
                        ><i className={codicon('copy')}></i></button>}
                    />;
                })}
            </div>
        </AiConfigurationSection>;
    }

    protected async handleStartServer(server: MCPServerDescription): Promise<void> {
        try {
            if (server.status === MCPServerStatus.AuthenticationRequired) {
                await this.mcpFrontendService.stopServer(server.name);
            }
            await this.mcpFrontendService.startServerInteractive(server.name);
        } catch (error) {
            this.logger.error(`Failed to start MCP server "${server.name}"`, error);
            this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/startServerFailed', 'Failed to start MCP server "{0}".', server.name));
        }
    }

    protected async handleStopServer(serverName: string): Promise<void> {
        try {
            await this.mcpFrontendService.stopServer(serverName);
        } catch (error) {
            this.logger.error(`Failed to stop MCP server "${serverName}"`, error);
            this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/stopServerFailed', 'Failed to stop MCP server "{0}".', serverName));
        }
    }

    protected async handleSignInServer(serverName: string): Promise<void> {
        try {
            const signedIn = await this.mcpFrontendService.signIn(serverName);
            if (signedIn) {
                this.messageService.info(nls.localize('theia/ai/mcpConfiguration/signInServerSucceeded', 'Signed in to MCP server "{0}".', serverName));
            } else {
                this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/signInServerNotCompleted', 'Sign-in to MCP server "{0}" was not completed.', serverName));
            }
        } catch (error) {
            this.logger.error(`Failed to sign in to MCP server "${serverName}"`, error);
            this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/signInServerFailed', 'Failed to sign in to MCP server "{0}".', serverName));
        }
    }

    protected async handleSignOutServer(serverName: string): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/mcpConfiguration/signOutServerDialogTitle', 'Sign Out from MCP Server'),
            msg: nls.localize('theia/ai/mcpConfiguration/signOutServerDialogMsg',
                'Are you sure you want to sign out from the server "{0}"? This deletes the stored OAuth tokens for this server.', serverName),
            ok: nls.localizeByDefault('Sign Out'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if ((await dialog.open()) === true) {
            try {
                await this.mcpFrontendService.signOut(serverName);
            } catch (error) {
                this.logger.error(`Failed to sign out from MCP server "${serverName}"`, error);
                this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/signOutServerFailed', 'Failed to sign out from MCP server "{0}".', serverName));
            }
        }
    }

    protected async handleDeleteServer(serverName: string): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/mcpConfiguration/deleteServerDialogTitle', 'Delete MCP Server'),
            msg: nls.localize('theia/ai/mcpConfiguration/deleteServerDialogMsg', 'Are you sure you want to delete the server "{0}"?', serverName),
            ok: nls.localizeByDefault('Delete'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            try {
                const currentServers = this.aiConfigurationService.get<Record<string, object>>(MCP_SERVERS_PREF, {}) ?? {};
                const newServers = { ...currentServers };
                delete newServers[serverName];
                await this.aiConfigurationService.set(MCP_SERVERS_PREF, newServers, PreferenceScope.User);
            } catch (error) {
                this.messageService.error(nls.localize('theia/ai/mcpConfiguration/deleteServerError', 'Failed to delete MCP server: {0}', String(error)));
            }
        }
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const serverTypeLabel = nls.localize('theia/ai/mcpConfiguration/serverTypeLabel', 'MCP server');
        const toolTypeLabel = nls.localizeByDefault('Tool');
        const items: AiConfigurationSearchItem[] = [];
        for (const server of this.servers) {
            items.push({
                label: server.name,
                typeLabel: serverTypeLabel,
                categoryId: this.id,
                target: { categoryId: this.id, itemId: server.name },
                keywords: server.tools?.map(tool => tool.name).join(' ') ?? ''
            });
            for (const tool of server.tools ?? []) {
                items.push({
                    label: tool.name,
                    typeLabel: toolTypeLabel,
                    categoryId: this.id,
                    target: { categoryId: this.id, itemId: server.name },
                    keywords: `${server.name} ${tool.description ?? ''}`
                });
            }
        }
        return items;
    }
}
