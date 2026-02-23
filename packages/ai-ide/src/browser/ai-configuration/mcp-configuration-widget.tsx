// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { codicon, ConfirmDialog, ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { HoverService } from '@theia/core/lib/browser/hover-service';
import {
    isLocalMCPServerDescription,
    isRemoteMCPServerDescription,
    LocalMCPServerDescription,
    MCPFrontendNotificationService,
    MCPFrontendService,
    MCPServerDescription,
    MCPServerStatus,
    RemoteMCPServerDescription
} from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { MessageService, nls, PreferenceScope, PreferenceService } from '@theia/core';
import { PROMPT_VARIABLE } from '@theia/ai-core/lib/browser/prompt-variable-contribution';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { DialogProps } from '@theia/core/lib/browser/dialogs';
import { SelectComponent } from '@theia/core/lib/browser/widgets/select-component';

type ServerType = 'local' | 'remote';

interface MCPServerFormData {
    name: string;
    serverType: ServerType;
    command: string;
    args: string;
    env: string;
    serverUrl: string;
    serverAuthToken: string;
    serverAuthTokenHeader: string;
    headers: string;
    autostart: boolean;
}

const DEFAULT_FORM_DATA: MCPServerFormData = {
    name: '',
    serverType: 'local',
    command: '',
    args: '',
    env: '',
    serverUrl: '',
    serverAuthToken: '',
    serverAuthTokenHeader: '',
    headers: '',
    autostart: true
};

class MCPServerDialog extends ReactDialog<MCPServerFormData | undefined> {
    protected formData: MCPServerFormData;
    protected existingServerNames: string[];
    protected isEditing: boolean;

    constructor(
        props: DialogProps,
        initialData: MCPServerFormData,
        existingServerNames: string[],
        isEditing: boolean
    ) {
        super(props);
        this.formData = { ...initialData };
        this.existingServerNames = existingServerNames;
        this.isEditing = isEditing;
        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(isEditing
            ? nls.localize('theia/ai/mcpConfiguration/form/saveChanges', 'Save Changes')
            : nls.localizeByDefault('Add Server'));
    }

    get value(): MCPServerFormData | undefined {
        return this.formData;
    }

    protected override isValid(): string {
        const errors: string[] = [];

        if (!this.formData.name.trim()) {
            errors.push(nls.localize('theia/ai/mcpConfiguration/form/nameRequired', 'Server name is required'));
        } else if (!this.isEditing && this.existingServerNames.includes(this.formData.name.trim())) {
            errors.push(nls.localize('theia/ai/mcpConfiguration/form/nameExists', 'A server with this name already exists'));
        }

        if (this.formData.serverType === 'local') {
            if (!this.formData.command.trim()) {
                errors.push(nls.localize('theia/ai/mcpConfiguration/form/commandRequired', 'Command is required for local servers'));
            }
        } else {
            if (!this.formData.serverUrl.trim()) {
                errors.push(nls.localize('theia/ai/mcpConfiguration/form/serverUrlRequired', 'Server URL is required for remote servers'));
            }
        }

        return errors.join('. ');
    }

    protected handleFormChange = (field: keyof MCPServerFormData, value: string | boolean): void => {
        this.formData = { ...this.formData, [field]: value };
        this.update();
    };

    protected render(): React.ReactNode {
        return (
            <div className="mcp-dialog-form">
                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/form/serverName', 'Server Name')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.name}
                        onChange={e => this.handleFormChange('name', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/serverNamePlaceholder', 'e.g., my-mcp-server')}
                        disabled={this.isEditing}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/form/serverType', 'Server Type')}:</label>
                    <SelectComponent
                        className="theia-select"
                        defaultValue={this.formData.serverType}
                        options={[
                            { value: 'local', label: nls.localize('theia/ai/mcpConfiguration/form/localServer', 'Local (Command)') },
                            { value: 'remote', label: nls.localize('theia/ai/mcpConfiguration/form/remoteServer', 'Remote (URL)') }
                        ]}
                        onChange={option => this.handleFormChange('serverType', option.value as ServerType)}
                    />
                </div>

                {this.formData.serverType === 'local' ? this.renderLocalServerFields() : this.renderRemoteServerFields()}

                <div className="mcp-form-field mcp-form-checkbox">
                    <label>
                        <input
                            type="checkbox"
                            className='theia-input'
                            checked={this.formData.autostart}
                            onChange={e => this.handleFormChange('autostart', e.target.checked)}
                        />
                        {nls.localize('theia/ai/mcpConfiguration/form/autostart', 'Autostart')}
                    </label>
                </div>
            </div>
        );
    }

    protected renderLocalServerFields(): React.ReactNode {
        return (
            <>
                <div className="mcp-form-field">
                    <label>{nls.localizeByDefault('Command')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.command}
                        onChange={e => this.handleFormChange('command', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/commandPlaceholder', 'e.g., npx or uvx')}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/arguments', 'Arguments')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.args}
                        onChange={e => this.handleFormChange('args', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/argsPlaceholder', 'Space-separated, e.g., -y @modelcontextprotocol/server-brave-search')}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/environmentVariables', 'Environment Variables')}:</label>
                    <textarea
                        className="theia-input"
                        value={this.formData.env}
                        onChange={e => this.handleFormChange('env', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/envPlaceholder', 'KEY=value (one per line)')}
                        rows={3}
                        spellCheck={false}
                    />
                </div>
            </>
        );
    }

    protected renderRemoteServerFields(): React.ReactNode {
        return (
            <>
                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/serverUrl', 'Server URL')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.serverUrl}
                        onChange={e => this.handleFormChange('serverUrl', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/serverUrlPlaceholder', 'e.g., https://mcp.example.com')}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/serverAuthToken', 'Auth Token')}:</label>
                    <input
                        type="password"
                        className="theia-input"
                        value={this.formData.serverAuthToken}
                        onChange={e => this.handleFormChange('serverAuthToken', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/authTokenPlaceholder', 'Optional authentication token')}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/serverAuthTokenHeader', 'Auth Header Name')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.serverAuthTokenHeader}
                        onChange={e => this.handleFormChange('serverAuthTokenHeader', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/authHeaderPlaceholder', 'Default: Authorization with Bearer')}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/headers', 'Headers')}:</label>
                    <textarea
                        className="theia-input"
                        value={this.formData.headers}
                        onChange={e => this.handleFormChange('headers', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/headersPlaceholder', 'Header-Name=value (one per line)')}
                        rows={3}
                        spellCheck={false}
                    />
                </div>
            </>
        );
    }
}

@injectable()
export class AIMCPConfigurationWidget extends ReactWidget {

    static readonly ID = 'ai-mcp-configuration-container-widget';
    static readonly LABEL = nls.localizeByDefault('MCP Servers');

    protected servers: MCPServerDescription[] = [];
    protected expandedTools: Record<string, boolean> = {};

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    @inject(MCPFrontendNotificationService)
    protected readonly mcpFrontendNotificationService: MCPFrontendNotificationService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @postConstruct()
    protected init(): void {
        this.id = AIMCPConfigurationWidget.ID;
        this.title.label = AIMCPConfigurationWidget.LABEL;
        this.title.closable = false;
        this.toDispose.push(this.mcpFrontendNotificationService.onDidUpdateMCPServers(async () => {
            this.loadServers();
        }));
        this.loadServers();
    }

    protected async loadServers(): Promise<void> {
        const serverNames = (await this.mcpFrontendService.getServerNames()).sort((a, b) => a.localeCompare(b));
        const descriptions = await Promise.all(serverNames.map(name => this.mcpFrontendService.getServerDescription(name)));
        this.servers = descriptions.filter((desc): desc is MCPServerDescription => desc !== undefined);
        this.update();
    }

    protected getStatusColor(status?: MCPServerStatus): { bg: string, fg: string } {
        if (!status) {
            return { bg: 'var(--theia-descriptionForeground)', fg: 'white' };
        }
        switch (status) {
            case MCPServerStatus.Running:
            case MCPServerStatus.Connected:
                return { bg: 'var(--theia-successBackground)', fg: 'var(--theia-successForeground)' };
            case MCPServerStatus.Starting:
            case MCPServerStatus.Connecting:
                return { bg: 'var(--theia-warningBackground)', fg: 'var(--theia-warningForeground)' };
            case MCPServerStatus.Errored:
                return { bg: 'var(--theia-errorBackground)', fg: 'var(--theia-errorForeground)' };
            case MCPServerStatus.NotRunning:
            case MCPServerStatus.NotConnected:
            default:
                return { bg: 'var(--theia-inputValidation-infoBackground)', fg: 'var(--theia-inputValidation-infoForeground)' };
        }
    }

    protected showErrorHover(spanRef: React.RefObject<HTMLSpanElement>, error: string): void {
        this.hoverService.requestHover({ content: error, target: spanRef.current!, position: 'left' });
    }

    protected hideErrorHover(): void {
        this.hoverService.cancelHover();
    }

    protected async handleStartServer(serverName: string): Promise<void> {
        await this.mcpFrontendService.startServer(serverName);
    }

    protected async handleStopServer(serverName: string): Promise<void> {
        await this.mcpFrontendService.stopServer(serverName);
    }

    protected renderButton(text: React.ReactNode,
        title: string,
        onClick: React.MouseEventHandler<HTMLButtonElement>,
        className?: string,
        style?: React.CSSProperties): React.ReactNode {
        return (
            <button className={className} title={title} onClick={onClick} style={style}>
                {text}
            </button>
        );
    }

    protected renderStatusBadge(server: MCPServerDescription): React.ReactNode {
        const colors = this.getStatusColor(server.status);
        let displayStatus = server.status;
        if (!displayStatus) {
            displayStatus = isRemoteMCPServerDescription(server) ? MCPServerStatus.NotConnected : MCPServerStatus.NotRunning;
        }
        const spanRef = React.createRef<HTMLSpanElement>();
        const error = server.error;
        return (
            <div className="mcp-status-container">
                <span className="mcp-status-badge" style={{
                    backgroundColor: colors.bg,
                    color: colors.fg
                }}>
                    {displayStatus}
                </span>
                {error && (
                    <span
                        onMouseEnter={() => this.showErrorHover(spanRef, error)}
                        onMouseLeave={() => this.hideErrorHover()}
                        ref={spanRef}
                        className="mcp-error-indicator"
                    >
                        ?
                    </span>
                )}
            </div>
        );
    }

    protected renderServerHeader(server: MCPServerDescription): React.ReactNode {
        const isStoppable = server.status === MCPServerStatus.Running
            || server.status === MCPServerStatus.Connected;
        const isStarting = server.status === MCPServerStatus.Starting
            || server.status === MCPServerStatus.Connecting;
        const isStartable = server.status === MCPServerStatus.NotRunning
            || server.status === MCPServerStatus.NotConnected
            || server.status === MCPServerStatus.Errored;

        const isRemote = isRemoteMCPServerDescription(server);
        const startIcon = isRemote ? 'plug' : 'play';
        const startingIcon = 'loading';
        const stopIcon = isRemote ? 'debug-disconnect' : 'debug-stop';
        const startLabel = isRemote
            ? nls.localize('theia/ai/mcpConfiguration/connectServer', 'Connect')
            : nls.localizeByDefault('Start Server');
        const startingLabel = isRemote
            ? nls.localize('theia/ai/mcpConfiguration/connectingServer', 'Connecting...')
            : nls.localizeByDefault('Starting...');
        const stopLabel = isRemote
            ? nls.localizeByDefault('Disconnect')
            : nls.localizeByDefault('Stop Server');

        return (
            <div className="mcp-server-header">
                <div className="mcp-server-name">{server.name}</div>
                <div className="mcp-server-header-controls">
                    {this.renderStatusBadge(server)}
                    {isStartable && (
                        <button
                            className={`mcp-action-button ${codicon(startIcon)}`}
                            onClick={() => this.handleStartServer(server.name)}
                            title={startLabel}
                        />
                    )}
                    {isStarting && (
                        <button
                            className={`mcp-action-button ${codicon(startingIcon)} theia-animation-spin`}
                            disabled
                            title={startingLabel}
                        />
                    )}
                    {isStoppable && (
                        <button
                            className={`mcp-action-button ${codicon(stopIcon)}`}
                            onClick={() => this.handleStopServer(server.name)}
                            title={stopLabel}
                        />
                    )}
                    <button
                        className={`mcp-action-button ${codicon('edit')}`}
                        onClick={() => this.openEditServerDialog(server)}
                        title={nls.localize('theia/ai/mcpConfiguration/editServer', 'Edit Server')}
                    />
                    <button
                        className={`mcp-action-button mcp-delete-button ${codicon('trash')}`}
                        onClick={() => this.handleDeleteServer(server.name)}
                        title={nls.localize('theia/ai/mcpConfiguration/deleteServer', 'Delete Server')}
                    />
                </div>
            </div>
        );
    }

    protected renderCommandSection(server: MCPServerDescription): React.ReactNode {
        if (!isLocalMCPServerDescription(server)) {
            return;
        }
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localizeByDefault('Command')}:</span>
                <code className="mcp-property-value">{server.command}</code>
            </div>
        );
    }

    protected renderArgumentsSection(server: MCPServerDescription): React.ReactNode {
        if (!isLocalMCPServerDescription(server) || !server.args || server.args.length === 0) {
            return;
        }
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localize('theia/ai/mcpConfiguration/arguments', 'Arguments')}:</span>
                <code className="mcp-property-value">{server.args.join(' ')}</code>
            </div>
        );
    }

    protected renderEnvironmentSection(server: MCPServerDescription): React.ReactNode {
        if (!isLocalMCPServerDescription(server) || !server.env || Object.keys(server.env).length === 0) {
            return;
        }
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localize('theia/ai/mcpConfiguration/environmentVariables', 'Environment Variables')}:</span>
                <div className="mcp-property-value">
                    {Object.entries(server.env).map(([key, value]) => (
                        <div key={key} className="mcp-env-entry">
                            <code>{key}={key.toLowerCase().includes('token') ? '******' : String(value)}</code>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    protected renderServerUrlSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server)) {
            return;
        }
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localize('theia/ai/mcpConfiguration/serverUrl', 'Server URL')}:</span>
                <code className="mcp-property-value">{server.serverUrl}</code>
            </div>
        );
    }

    protected renderServerAuthTokenHeaderSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server) || !server.serverAuthTokenHeader) {
            return;
        }
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localize('theia/ai/mcpConfiguration/serverAuthTokenHeader', 'Auth Header Name')}:</span>
                <code className="mcp-property-value">{server.serverAuthTokenHeader}</code>
            </div>
        );
    }

    protected renderServerAuthTokenSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server) || !server.serverAuthToken) {
            return;
        }
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localize('theia/ai/mcpConfiguration/serverAuthToken', 'Auth Token')}:</span>
                <code className="mcp-property-value">******</code>
            </div>
        );
    }

    protected renderServerHeadersSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server) || !server.headers) {
            return;
        }
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localize('theia/ai/mcpConfiguration/headers', 'Headers')}:</span>
                <div className="mcp-property-value">
                    {Object.entries(server.headers).map(([key, value]) => (
                        <div key={key} className="mcp-env-entry">
                            <code>{key}={(key.toLowerCase().includes('token') || key.toLowerCase().includes('authorization')) ? '******' : String(value)}</code>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    protected renderAutostartSection(server: MCPServerDescription): React.ReactNode {
        return (
            <div className="mcp-property-row">
                <span className="mcp-property-label">{nls.localize('theia/ai/mcpConfiguration/autostart', 'Autostart')}:</span>
                <span className="mcp-autostart-badge" style={{
                    color: server.autostart ? 'var(--theia-successForeground)' : 'var(--theia-errorForeground)',
                }}>
                    {server.autostart ? nls.localizeByDefault('Enabled') : nls.localizeByDefault('Disabled')}
                </span>
            </div>
        );
    }

    protected renderToolsSection(server: MCPServerDescription): React.ReactNode {
        if (!server.tools || server.tools.length === 0) {
            return;
        }
        const isToolsExpanded = this.expandedTools[server.name] || false;
        return (
            <div className="mcp-tools-section">
                <div className="mcp-tools-header" onClick={() => this.toggleTools(server.name)}>
                    <div className="mcp-toggle-indicator">
                        <span className="mcp-toggle-icon">
                            {isToolsExpanded ? '▼' : '►'}
                        </span>
                    </div>
                    <div className="mcp-tools-label-container">
                        <span className="mcp-section-label">{nls.localize('theia/ai/mcpConfiguration/tools', 'Tools: ')}</span>
                    </div>
                    <div className="mcp-tools-actions">
                        {this.renderButton(
                            <i className="codicon codicon-versions"></i>,
                            nls.localize('theia/ai/mcpConfiguration/copyAllList', 'Copy all (list of all tools)'),
                            e => {
                                e.stopPropagation();
                                if (server.tools) {
                                    const toolNames = server.tools.map(tool => `~{mcp_${server.name}_${tool.name}}`).join('\n');
                                    navigator.clipboard.writeText(toolNames);
                                    this.messageService.info(nls.localize('theia/ai/mcpConfiguration/copiedAllList', 'Copied all tools to clipboard (list of all tools)'));
                                }
                            },
                            'mcp-copy-tool-button'
                        )}
                        {this.renderButton(
                            <i className="codicon codicon-bracket"></i>,
                            nls.localize('theia/ai/mcpConfiguration/copyForPromptTemplate', 'Copy all for prompt template (single prompt fragment with all tools)'),
                            e => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(`{{${PROMPT_VARIABLE.name}:${this.mcpFrontendService.getPromptTemplateId(server.name)}}}`);
                                this.messageService.info(nls.localize('theia/ai/mcpConfiguration/copiedForPromptTemplate', 'Copied all tools to clipboard for prompt template \
                                    (single prompt fragment with all tools)'));
                            },
                            'mcp-copy-tool-button'
                        )}
                        {this.renderButton(
                            <i className="codicon codicon-copy"></i>,
                            nls.localize('theia/ai/mcpConfiguration/copyAllSingle', 'Copy all for chat (single prompt fragment with all tools)'),
                            e => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(`#${PROMPT_VARIABLE.name}:${this.mcpFrontendService.getPromptTemplateId(server.name)}`);
                                this.messageService.info(nls.localize('theia/ai/mcpConfiguration/copiedAllSingle', 'Copied all tools to clipboard (single prompt fragment with \
                                    all tools)'));
                            },
                            'mcp-copy-tool-button'
                        )}
                    </div>
                </div>
                {isToolsExpanded && (
                    <div className="mcp-tools-list">
                        {server.tools.map(tool => (
                            <div key={tool.name} className="mcp-tool-item">
                                <div className="mcp-tool-content">
                                    <strong>{tool.name}:</strong> {tool.description}
                                </div>
                                <div className="mcp-tool-actions">
                                    {this.renderButton(
                                        <i className="codicon codicon-copy"></i>,
                                        nls.localize('theia/ai/mcpConfiguration/copyForPrompt', 'Copy tool (for chat or prompt template)'),
                                        e => {
                                            e.stopPropagation();
                                            const copied = `~{mcp_${server.name}_${tool.name}}`;
                                            navigator.clipboard.writeText(copied);
                                            this.messageService.info(`Copied ${copied} to clipboard (for chat or prompt template)`);
                                        },
                                        'mcp-copy-tool-button'
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    protected toggleTools(serverName: string): void {
        this.expandedTools[serverName] = !this.expandedTools[serverName];
        this.update();
    }

    protected renderServerCard(server: MCPServerDescription): React.ReactNode {
        return (
            <div key={server.name} className="mcp-server-card">
                {this.renderServerHeader(server)}
                <div className="mcp-server-content">
                    {this.renderCommandSection(server)}
                    {this.renderArgumentsSection(server)}
                    {this.renderEnvironmentSection(server)}
                    {this.renderServerUrlSection(server)}
                    {this.renderServerAuthTokenHeaderSection(server)}
                    {this.renderServerAuthTokenSection(server)}
                    {this.renderServerHeadersSection(server)}
                    {this.renderAutostartSection(server)}
                </div>
                {this.renderToolsSection(server)}
            </div>
        );
    }

    protected async openAddServerDialog(): Promise<void> {
        const dialog = new MCPServerDialog(
            { title: nls.localizeByDefault('Add MCP Server'), maxWidth: 500 },
            { ...DEFAULT_FORM_DATA },
            this.servers.map(s => s.name),
            false
        );
        const result = await dialog.open();
        if (result) {
            await this.saveServer(result);
        }
    }

    protected async openEditServerDialog(server: MCPServerDescription): Promise<void> {
        let formData: MCPServerFormData;

        if (isLocalMCPServerDescription(server)) {
            formData = {
                name: server.name,
                serverType: 'local',
                command: server.command,
                args: server.args?.join(' ') ?? '',
                env: server.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
                serverUrl: '',
                serverAuthToken: '',
                serverAuthTokenHeader: '',
                headers: '',
                autostart: server.autostart ?? true
            };
        } else if (isRemoteMCPServerDescription(server)) {
            formData = {
                name: server.name,
                serverType: 'remote',
                command: '',
                args: '',
                env: '',
                serverUrl: server.serverUrl,
                serverAuthToken: server.serverAuthToken ?? '',
                serverAuthTokenHeader: server.serverAuthTokenHeader ?? '',
                headers: server.headers
                    ? Object.entries(server.headers).map(([k, v]) => `${k}=${v}`).join('\n')
                    : '',
                autostart: server.autostart ?? true
            };
        } else {
            return;
        }

        const dialog = new MCPServerDialog(
            { title: nls.localize('theia/ai/mcpConfiguration/editServerTitle', 'Edit MCP Server'), maxWidth: 500 },
            formData,
            this.servers.filter(s => s.name !== server.name).map(s => s.name),
            true
        );
        const result = await dialog.open();
        if (result) {
            await this.saveServer(result);
        }
    }

    protected parseKeyValuePairs(input: string): Record<string, string> | undefined {
        if (!input.trim()) {
            return undefined;
        }
        const result: Record<string, string> = {};
        const lines = input.split('\n').filter(line => line.trim());
        for (const line of lines) {
            const eqIndex = line.indexOf('=');
            if (eqIndex > 0) {
                const key = line.substring(0, eqIndex).trim();
                const value = line.substring(eqIndex + 1).trim();
                if (key) {
                    result[key] = value;
                }
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    protected async saveServer(formData: MCPServerFormData): Promise<void> {
        const currentServers = this.preferenceService.get<Record<string, object>>(MCP_SERVERS_PREF, {});
        const newServers = { ...currentServers };
        const serverName = formData.name.trim();

        if (formData.serverType === 'local') {
            const serverConfig: Partial<LocalMCPServerDescription> = {
                command: formData.command.trim(),
                autostart: formData.autostart
            };
            if (formData.args.trim()) {
                serverConfig.args = formData.args.trim().split(/\s+/);
            }
            const env = this.parseKeyValuePairs(formData.env);
            if (env) {
                serverConfig.env = env;
            }
            newServers[serverName] = serverConfig;
        } else {
            const serverConfig: Partial<RemoteMCPServerDescription> = {
                serverUrl: formData.serverUrl.trim(),
                autostart: formData.autostart
            };
            if (formData.serverAuthToken.trim()) {
                serverConfig.serverAuthToken = formData.serverAuthToken.trim();
            }
            if (formData.serverAuthTokenHeader.trim()) {
                serverConfig.serverAuthTokenHeader = formData.serverAuthTokenHeader.trim();
            }
            const headers = this.parseKeyValuePairs(formData.headers);
            if (headers) {
                serverConfig.headers = headers;
            }
            newServers[serverName] = serverConfig;
        }

        try {
            await this.preferenceService.set(MCP_SERVERS_PREF, newServers, PreferenceScope.User);
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/mcpConfiguration/saveServerError', 'Failed to save MCP server configuration: {0}', String(error)));
        }
    }

    protected async handleDeleteServer(serverName: string): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/mcpConfiguration/deleteServerDialogTitle', 'Delete MCP Server'),
            msg: nls.localize('theia/ai/mcpConfiguration/deleteServerDialogMsg', 'Are you sure you want to delete the server "{0}"?', serverName),
            ok: nls.localizeByDefault('Delete'),
            cancel: nls.localizeByDefault('Cancel')
        });

        const shouldDelete = await dialog.open();
        if (shouldDelete) {
            try {
                const currentServers = this.preferenceService.get<Record<string, object>>(MCP_SERVERS_PREF, {});
                const newServers = { ...currentServers };
                delete newServers[serverName];
                await this.preferenceService.set(MCP_SERVERS_PREF, newServers, PreferenceScope.User);
            } catch (error) {
                this.messageService.error(nls.localize('theia/ai/mcpConfiguration/deleteServerError', 'Failed to delete MCP server: {0}', String(error)));
            }
        }
    }

    protected render(): React.ReactNode {
        return (
            <div className="mcp-configuration-container">
                <div className="mcp-header-actions">
                    <button className="theia-button main" onClick={() => this.openAddServerDialog()}>
                        <i className={codicon('add')}></i>
                        {nls.localizeByDefault('Add MCP Server')}
                    </button>
                </div>
                {this.servers.length === 0 ? (
                    <div className="mcp-no-servers">
                        {nls.localize('theia/ai/mcpConfiguration/noServers', 'No MCP servers configured')}
                    </div>
                ) : (
                    this.servers.map(server => this.renderServerCard(server))
                )}
            </div>
        );
    }
}
