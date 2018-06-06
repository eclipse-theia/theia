/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { StatusBarAlignment, StatusBarEntry, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { HostedPluginServer } from '../../common/plugin-protocol';
import { ConnectionStatusService, ConnectionState } from '@theia/core/lib/browser/connection-status-service';
import URI from '@theia/core/lib/common/uri';
import { FileStat } from '@theia/filesystem/lib/common';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';

/**
 * Informs the user whether Theia is running with hosted plugin.
 * Adds 'Development Host' status bar element and appends the same prefix to window title.
 */
@injectable()
export class HostedPluginInformer implements FrontendApplicationContribution {

    public static readonly DEVELOPMENT_HOST_TITLE = "Development Host";

    public static readonly DEVELOPMENT_HOST = "development-host";

    public static readonly DEVELOPMENT_HOST_OFFLINE = "development-host-offline";

    private entry: StatusBarEntry;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(HostedPluginServer)
    protected readonly hostedPluginServer: HostedPluginServer;

    @inject(ConnectionStatusService)
    protected readonly connectionStatusService: ConnectionStatusService;

    @inject(FrontendApplicationStateService)
    protected readonly frontendApplicationStateService: FrontendApplicationStateService;

    public initialize(): void {
        this.workspaceService.root.then(root => {
            this.hostedPluginServer.getHostedPlugin().then(pluginMetadata => {
                if (pluginMetadata) {
                    this.updateTitle(root);

                    this.entry = {
                        text: `$(cube) ${HostedPluginInformer.DEVELOPMENT_HOST_TITLE}`,
                        tooltip: `Hosted Plugin '${pluginMetadata.model.name}'`,
                        alignment: StatusBarAlignment.LEFT,
                        priority: 100
                    };

                    this.frontendApplicationStateService.reachedState('ready').then(() => {
                        this.updateStatusBarElement();
                    });

                    this.connectionStatusService.onStatusChange(() => this.updateStatusBarElement());
                }
            });
        });
    }

    private updateStatusBarElement(): void {
        if (this.connectionStatusService.currentState.state === ConnectionState.OFFLINE) {
            this.entry.className = HostedPluginInformer.DEVELOPMENT_HOST_OFFLINE;
        } else {
            this.entry.className = HostedPluginInformer.DEVELOPMENT_HOST;
        }

        this.statusBar.setElement(HostedPluginInformer.DEVELOPMENT_HOST, this.entry);
    }

    private updateTitle(root: FileStat | undefined): void {
        if (root) {
            const uri = new URI(root.uri);
            document.title = HostedPluginInformer.DEVELOPMENT_HOST_TITLE + " - " + uri.displayName;
        } else {
            document.title = HostedPluginInformer.DEVELOPMENT_HOST_TITLE;
        }
    }

}
