// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { HoverService } from '@theia/core/lib/browser/hover-service';
import { MCPFrontendNotificationService, MCPFrontendService, MCPServerDescription, MCPServerStatus } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { MessageService } from '@theia/core';

@injectable()
export class AIMCPConfigurationWidget extends ReactWidget {

    static readonly ID = 'ai-mcp-configuration-container-widget';
    static readonly LABEL = 'MCP Servers';

    servers: MCPServerDescription[] = [];
    expandedTools: Record<string, boolean> = {};

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    @inject(MCPFrontendNotificationService)
    protected readonly mcpFrontendNotificationService: MCPFrontendNotificationService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

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
        const serverNames = await this.mcpFrontendService.getServerNames();
        const promises = serverNames.map(name => this.mcpFrontendService.getServerDescription(name));
        const descriptions = await Promise.all(promises);
        this.servers = descriptions.filter((desc): desc is MCPServerDescription => desc !== undefined);
        this.update();
    }

    protected getStatusColor(status?: MCPServerStatus): { bg: string, fg: string } {
        if (!status) {
            return { bg: 'var(--theia-descriptionForeground)', fg: 'white' };
        }
        switch (status) {
            case MCPServerStatus.Running:
                return { bg: 'var(--theia-successBackground)', fg: 'var(--theia-successForeground)' };
            case MCPServerStatus.Starting:
                return { bg: 'var(--theia-warningBackground)', fg: 'var(--theia-warningForeground)' };
            case MCPServerStatus.Errored:
                return { bg: 'var(--theia-errorBackground)', fg: 'var(--theia-errorForeground)' };
            case MCPServerStatus.NotRunning:
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

    protected renderStatusBadge(status?: MCPServerStatus, error?: string): React.ReactNode {
        const colors = this.getStatusColor(status);
        const displayStatus = status || MCPServerStatus.NotRunning;
        const spanRef = React.createRef<HTMLSpanElement>();
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
        return (
            <div className="mcp-server-header">
                <div className="mcp-server-name">{server.name}</div>
                {this.renderStatusBadge(server.status, server.error)}
            </div>
        );
    }

    protected renderCommandSection(server: MCPServerDescription): React.ReactNode {
        return (
            <div className="mcp-server-section">
                <span className="mcp-section-label">Command: </span>
                <code className="mcp-code-block">{server.command}</code>
            </div>
        );
    }

    protected renderArgumentsSection(server: MCPServerDescription): React.ReactNode {
        if (!server.args || server.args.length === 0) {
            return;
        }
        return (
            <div className="mcp-server-section">
                <span className="mcp-section-label">Arguments: </span>
                <code className="mcp-code-block">{server.args.join(' ')}</code>
            </div>
        );
    }

    protected renderEnvironmentSection(server: MCPServerDescription): React.ReactNode {
        if (!server.env || Object.keys(server.env).length === 0) {
            return;
        }
        return (
            <div className="mcp-server-section">
                <span className="mcp-section-label">Environment Variables: </span>
                <div className="mcp-env-block">
                    {Object.entries(server.env).map(([key, value]) => (
                        <div key={key}>
                            {key}={key.toLowerCase().includes('token') ? '******' : value}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    protected renderAutostartSection(server: MCPServerDescription): React.ReactNode {
        return (
            <div className="mcp-server-section">
                <span className="mcp-section-label">Autostart: </span>
                <span className="mcp-autostart-badge" style={{
                    backgroundColor: server.autostart ? 'var(--theia-successBackground)' : 'var(--theia-errorBackground)',
                    color: server.autostart ? 'var(--theia-successForeground)' : 'var(--theia-errorForeground)',
                }}>
                    {server.autostart ? 'Enabled' : 'Disabled'}
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
                <div style={{ display: 'flex', alignItems: 'center' }} onClick={() => this.toggleTools(server.name)}>
                    <div className="mcp-toggle-indicator" style={{ display: 'flex' }}>
                        <span style={{
                            display: 'inline-block',
                            transition: 'transform 0.2s ease',
                            fontSize: '12px'
                        }}>
                            {isToolsExpanded ? '▼' : '►'}
                        </span>
                    </div>
                    <div style={{ flexGrow: 1 }}>
                        <span className="mcp-section-label">Tools: </span>
                    </div>
                    <div style={{ display: 'flex' }}>
                        {this.renderButton(
                            <i className="codicon codicon-copy"></i>,
                            'Copy all (for prompttemplate)',
                            e => {
                                e.stopPropagation();
                                if (server.tools) {
                                    const toolNames = server.tools.map(tool => `~{mcp_${server.name}_${tool.name}}`).join('\n');
                                    navigator.clipboard.writeText(toolNames);
                                    this.messageService.info('Copied all tools to clipboard (for prompttemplate)');
                                }
                            },
                            'mcp-copy-tool-button'
                        )}
                    </div>
                </div>
                {isToolsExpanded && (
                    <div className="mcp-tools-list">
                        {server.tools.map(tool => (
                            <div key={tool.name} style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{ flexGrow: 1 }}>
                                    <strong>{tool.name}:</strong> {tool.description}
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {this.renderButton(
                                        <i className="codicon codicon-comment"></i>,
                                        'Copy (for Chat)',
                                        e => {
                                            e.stopPropagation();
                                            const copied = `~mcp_${server.name}_${tool.name}`;
                                            navigator.clipboard.writeText(copied);
                                            this.messageService.info(`Copied ${copied} to clipboard (for chat)`);
                                        },
                                        'mcp-copy-tool-button'
                                    )}
                                    {this.renderButton(
                                        <i className="codicon codicon-copy"></i>,
                                        'Copy (for prompttemplate)',
                                        e => {
                                            e.stopPropagation();
                                            const copied = `~{mcp_${server.name}_${tool.name}}`;
                                            navigator.clipboard.writeText(copied);
                                            this.messageService.info(`Copied ${copied} to clipboard (for prompttemplate)`);
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

    protected renderServerControls(server: MCPServerDescription): React.ReactNode {
        const isStoppable = server.status === MCPServerStatus.Running || server.status === MCPServerStatus.Starting;
        const isStartable = server.status === MCPServerStatus.NotRunning || server.status === MCPServerStatus.Errored;
        return (
            <div className="mcp-server-controls">
                {isStartable && this.renderButton(
                    <><i className="codicon codicon-play"></i> Start Server</>,
                    'Start Server',
                    () => this.handleStartServer(server.name),
                    'mcp-server-button play-button'
                )}
                {isStoppable && this.renderButton(
                    <><i className="codicon codicon-debug-stop"></i> Stop Server</>,
                    'Stop Server',
                    () => this.handleStopServer(server.name),
                    'mcp-server-button stop-button'
                )}
            </div>
        );
    }

    protected renderServerCard(server: MCPServerDescription): React.ReactNode {
        return (
            <div key={server.name} className="mcp-server-card">
                {this.renderServerHeader(server)}
                {this.renderCommandSection(server)}
                {this.renderArgumentsSection(server)}
                {this.renderEnvironmentSection(server)}
                {this.renderAutostartSection(server)}
                {this.renderToolsSection(server)}
                {this.renderServerControls(server)}
            </div>
        );
    }

    protected render(): React.ReactNode {
        if (this.servers.length === 0) {
            return (
                <div className="mcp-no-servers">
                    No MCP servers configured
                </div>
            );
        }

        return (
            <div className="mcp-configuration-container">
                <h2 className="mcp-configuration-title">MCP Server Configurations</h2>
                {this.servers.map(server => this.renderServerCard(server))}
            </div>
        );
    }
}
