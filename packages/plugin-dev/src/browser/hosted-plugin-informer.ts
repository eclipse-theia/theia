// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { StatusBarAlignment, StatusBarEntry, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { PluginDevServer } from '../common/plugin-dev-protocol';
import { ConnectionStatusService, ConnectionStatus } from '@theia/core/lib/browser/connection-status-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { nls } from '@theia/core/lib/common/nls';
import { WindowTitleService } from '@theia/core/lib/browser/window/window-title-service';

/**
 * Informs the user whether Theia is running with hosted plugin.
 * Adds 'Development Host' status bar element and appends the same prefix to window title.
 */
@injectable()
export class HostedPluginInformer implements FrontendApplicationContribution {

    public static readonly DEVELOPMENT_HOST_TITLE = nls.localize('theia/plugin-dev/devHost', 'Development Host');

    public static readonly DEVELOPMENT_HOST = 'development-host';

    public static readonly DEVELOPMENT_HOST_OFFLINE = 'development-host-offline';

    private entry: StatusBarEntry;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(PluginDevServer)
    protected readonly hostedPluginServer: PluginDevServer;

    @inject(ConnectionStatusService)
    protected readonly connectionStatusService: ConnectionStatusService;

    @inject(FrontendApplicationStateService)
    protected readonly frontendApplicationStateService: FrontendApplicationStateService;

    @inject(WindowTitleService)
    protected readonly windowTitleService: WindowTitleService;

    public initialize(): void {
        this.hostedPluginServer.getHostedPlugin().then(pluginMetadata => {
            if (pluginMetadata) {
                this.windowTitleService.update({
                    developmentHost: HostedPluginInformer.DEVELOPMENT_HOST_TITLE
                });

                this.entry = {
                    text: `$(cube) ${HostedPluginInformer.DEVELOPMENT_HOST_TITLE}`,
                    tooltip: `${nls.localize('theia/plugin-dev/hostedPlugin', 'Hosted Plugin')} '${pluginMetadata.model.name}'`,
                    alignment: StatusBarAlignment.LEFT,
                    priority: 100
                };

                this.frontendApplicationStateService.reachedState('ready').then(() => {
                    this.updateStatusBarElement();
                });

                this.connectionStatusService.onStatusChange(() => this.updateStatusBarElement());
            }
        });
    }

    private updateStatusBarElement(): void {
        if (this.connectionStatusService.currentStatus === ConnectionStatus.OFFLINE) {
            this.entry.className = HostedPluginInformer.DEVELOPMENT_HOST_OFFLINE;
        } else {
            this.entry.className = HostedPluginInformer.DEVELOPMENT_HOST;
        }

        this.statusBar.setElement(HostedPluginInformer.DEVELOPMENT_HOST, this.entry);
    }

}
