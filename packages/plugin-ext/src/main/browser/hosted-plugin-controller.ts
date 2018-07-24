/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import { StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { StatusBarAlignment, StatusBarEntry, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { HostedPluginServer } from '../../common/plugin-protocol';
import { HostedPluginManagerClient, HostedPluginState, HostedPluginCommands } from './plugin-manager-client';
import { CommandRegistry } from '@phosphor/commands';
import { Menu } from '@phosphor/widgets';
import { setTimeout } from 'timers';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { ConnectionStatusService, ConnectionStatus } from '@theia/core/lib/browser/connection-status-service';
import { HostedPluginLogViewer } from '../../hosted/browser/hosted-plugin-log-viewer';

/**
 * Adds a status bar element displaying the state of secondary Theia instance with hosted plugin and
 * allows controlling the instance by simple clicking on the status bar element.
 */
@injectable()
export class HostedPluginController implements FrontendApplicationContribution {

    public static readonly HOSTED_PLUGIN = "hosted-plugin";
    public static readonly HOSTED_PLUGIN_OFFLINE = "hosted-plugin-offline";
    public static readonly HOSTED_PLUGIN_FAILED = "hosted-plugin-failed";

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(FrontendApplicationStateService)
    protected readonly frontendApplicationStateService: FrontendApplicationStateService;

    @inject(HostedPluginServer)
    protected readonly hostedPluginServer: HostedPluginServer;

    @inject(HostedPluginManagerClient)
    protected readonly hostedPluginManagerClient: HostedPluginManagerClient;

    @inject(ConnectionStatusService)
    protected readonly connectionStatusService: ConnectionStatusService;

    @inject(HostedPluginLogViewer)
    protected readonly hostedPluginLogViewer: HostedPluginLogViewer;

    private pluginState: HostedPluginState = HostedPluginState.Stopped;

    private entry: StatusBarEntry | undefined;

    public initialize(): void {
        this.hostedPluginServer.getHostedPlugin().then(pluginMetadata => {
            if (!pluginMetadata) {
                this.frontendApplicationStateService.reachedState('ready').then(() => {
                    this.hostedPluginManagerClient.onStateChanged(e => {
                        if (e === 'starting') {
                            this.onHostedPluginStarting();
                        } else if (e === 'running') {
                            this.onHostedPluginRunning();
                        } else if (e === 'stopped') {
                            this.onHostedPluginStopped();
                        } else if (e === 'failed') {
                            this.onHostedPluginFailed();
                        }
                    });

                    this.hostedPluginServer.isHostedTheiaRunning().then(running => {
                        if (running) {
                            this.onHostedPluginRunning();
                        }
                    });
                });

                this.connectionStatusService.onStatusChange(() => this.onConnectionStatusChanged());
            }
        });
    }

    /**
     * Display status bar element for stopped plugin.
     */
    protected async onHostedPluginStopped(): Promise<void> {
        this.pluginState = HostedPluginState.Stopped;

        this.entry = {
            text: `Hosted Plugin: Stopped $(angle-up)`,
            alignment: StatusBarAlignment.LEFT,
            priority: 100,
            onclick: e => {
                this.showMenu(e.clientX, e.clientY);
            }
        };

        this.entry.className = HostedPluginController.HOSTED_PLUGIN;
        await this.statusBar.setElement(HostedPluginController.HOSTED_PLUGIN, this.entry);
    }

    /**
     * Display status bar element for starting plugin.
     */
    protected async onHostedPluginStarting(): Promise<void> {
        this.pluginState = HostedPluginState.Starting;

        this.hostedPluginLogViewer.showLogConsole();

        this.entry = {
            text: `$(cog~spin) Hosted Plugin: Starting`,
            alignment: StatusBarAlignment.LEFT,
            priority: 100
        };

        this.entry.className = HostedPluginController.HOSTED_PLUGIN;
        await this.statusBar.setElement(HostedPluginController.HOSTED_PLUGIN, this.entry);
    }

    /**
     * Display status bar element for running plugin.
     */
    protected async onHostedPluginRunning(): Promise<void> {
        this.pluginState = HostedPluginState.Running;

        this.entry = {
            text: `$(cog~spin) Hosted Plugin: Running $(angle-up)`,
            alignment: StatusBarAlignment.LEFT,
            priority: 100,
            onclick: e => {
                this.showMenu(e.clientX, e.clientY);
            }
        };

        this.entry.className = HostedPluginController.HOSTED_PLUGIN;
        await this.statusBar.setElement(HostedPluginController.HOSTED_PLUGIN, this.entry);
    }

    /**
     * Display status bar element for failed plugin.
     */
    protected async onHostedPluginFailed(): Promise<void> {
        this.pluginState = HostedPluginState.Failed;

        this.entry = {
            text: `Hosted Plugin: Stopped $(angle-up)`,
            alignment: StatusBarAlignment.LEFT,
            priority: 100,
            onclick: e => {
                this.showMenu(e.clientX, e.clientY);
            }
        };

        this.entry.className = HostedPluginController.HOSTED_PLUGIN_FAILED;
        await this.statusBar.setElement(HostedPluginController.HOSTED_PLUGIN, this.entry);
    }

    /**
     * Updaing status bar element when changing connection status.
     */
    private onConnectionStatusChanged(): void {
        if (this.connectionStatusService.currentStatus === ConnectionStatus.OFFLINE) {
            // Re-set the element only if it's visible on status bar
            if (this.entry) {
                const offlineElement = {
                    text: `Hosted Plugin: Stopped`,
                    alignment: StatusBarAlignment.LEFT,
                    priority: 100
                };

                this.entry.className = HostedPluginController.HOSTED_PLUGIN_OFFLINE;
                this.statusBar.setElement(HostedPluginController.HOSTED_PLUGIN, offlineElement);
            }
        } else {
            // ask state of hosted plugin when switching to Online
            if (this.entry) {
                this.hostedPluginServer.isHostedTheiaRunning().then(running => {
                    if (running) {
                        this.onHostedPluginRunning();
                    } else {
                        this.onHostedPluginStopped();
                    }
                });
            }
        }
    }

    /**
     * Show menu containing actions to start/stop/restart hosted plugin.
     */
    protected showMenu(x: number, y: number): void {
        const commands = new CommandRegistry();
        const menu = new Menu({
            commands
        });

        if (this.pluginState === 'running') {
            this.addCommandsForRunningPlugin(commands, menu);
        } else if (this.pluginState === 'stopped' || this.pluginState === 'failed') {
            this.addCommandsForStoppedPlugin(commands, menu);
        }

        menu.open(x, y);
    }

    /**
     * Adds commands to the menu for running plugin.
     */
    protected addCommandsForRunningPlugin(commands: CommandRegistry, menu: Menu): void {
        commands.addCommand(HostedPluginCommands.STOP.id, {
            label: 'Stop Instance',
            icon: 'fa fa-stop',
            execute: () => setTimeout(() => this.hostedPluginManagerClient.stop(), 100)
        });

        menu.addItem({
            type: 'command',
            command: HostedPluginCommands.STOP.id
        });

        commands.addCommand(HostedPluginCommands.RESTART.id, {
            label: 'Restart Instance',
            icon: 'fa fa-repeat',
            execute: () => setTimeout(() => this.hostedPluginManagerClient.restart(), 100)
        });

        menu.addItem({
            type: 'command',
            command: HostedPluginCommands.RESTART.id
        });
    }

    /**
     * Adds command to the menu for stopped plugin.
     */
    protected addCommandsForStoppedPlugin(commands: CommandRegistry, menu: Menu): void {
        commands.addCommand(HostedPluginCommands.START.id, {
            label: "Start Instance",
            icon: 'fa fa-play',
            execute: () => setTimeout(() => this.hostedPluginManagerClient.start(), 100)
        });

        menu.addItem({
            type: 'command',
            command: HostedPluginCommands.START.id
        });
    }

}
