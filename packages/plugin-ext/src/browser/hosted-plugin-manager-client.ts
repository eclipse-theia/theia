/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { MessageService } from '@theia/core/lib/common';
import { LabelProvider, isNative } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileDialogFactory, DirNode } from '@theia/filesystem/lib/browser';
import { HostedPluginServer } from '../common/plugin-protocol';
import { HostedPluginCommands } from './plugin-api-frontend-contribution';

/**
 * Responsible for UI to set up and control Hosted Plugin Instance.
 */
@injectable()
export class HostedPluginManagerClient {
    @inject(HostedPluginServer)
    protected readonly hostedPluginServer: HostedPluginServer;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(FileDialogFactory)
    protected readonly fileDialogFactory: FileDialogFactory;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(WindowService)
    protected readonly windowService: WindowService;
    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected pluginLocation: URI | undefined;
    protected pluginInstanceUri: string | undefined;

    async start(): Promise<void> {
        if (!this.pluginLocation) {
            await this.selectPluginPath();
            if (!this.pluginLocation) {
                // selection was cancelled
                return;
            }
        }
        try {
            this.messageService.info('Starting hosted instance server ...');
            await this.doRunRequest(this.pluginLocation);
            this.messageService.info('Hosted instance is running at: ' + this.pluginInstanceUri);
        } catch (error) {
            this.messageService.error('Failed to run hosted plugin instance: ' + this.getErrorMessage(error));
        }
    }

    async stop(): Promise<void> {
        try {
            await this.hostedPluginServer.terminateHostedPluginInstance();
            this.messageService.info((this.pluginInstanceUri ? this.pluginInstanceUri : 'The instance') + ' has been terminated.');
        } catch (error) {
            this.messageService.warn(this.getErrorMessage(error));
        }
    }

    async restart(): Promise<void> {
        if (await this.hostedPluginServer.isHostedTheiaRunning()) {
            await this.stop();

            this.messageService.info('Starting hosted instance server ...');
            // It takes some time before OS released all resources e.g. port.
            // Keeping tries to run hosted instance with delay.
            let lastError;
            for (let tries = 0; tries < 15; tries++) {
                try {
                    await this.doRunRequest(this.pluginLocation!);
                    this.messageService.info('Hosted instance is running at: ' + this.pluginInstanceUri);
                    return;
                } catch (error) {
                    lastError = error;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            this.messageService.error('Failed to run hosted plugin instance: ' + this.getErrorMessage(lastError));
        } else {
            this.messageService.warn('Hosted Plugin instance is not running.');
        }
    }

    /**
     * Creates directory choose dialog and set selected folder into pluginLocation field.
     */
    async selectPluginPath(): Promise<void> {
        const root = await this.workspaceService.root || await this.fileSystem.getCurrentUserHome();
        const rootUri = new URI(root.uri);
        const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
        const name = this.labelProvider.getName(rootUri);
        const label = await this.labelProvider.getIcon(root);
        const rootNode = DirNode.createRoot(rootStat, name, label);
        const dialog = this.fileDialogFactory({ title: HostedPluginCommands.SELECT_PLUGIN_PATH.label! });
        dialog.model.navigateTo(rootNode);
        const node = await dialog.open();
        if (node) {
            if (await this.hostedPluginServer.isPluginValid(node.uri.toString())) {
                this.pluginLocation = node.uri;
                this.messageService.info('Plugin folder is set to: ' + node.uri.toString());
            } else {
                this.messageService.error('Specified folder does not contain valid plugin.');
            }
        }
    }

    /**
     * Send run command to backend. Throws an error if start failed.
     * Sets hosted instance uri into pluginInstanceUri field.
     *
     * @param pluginLocation uri to plugin binaries
     */
    protected async doRunRequest(pluginLocation: URI): Promise<void> {
        const uri = await this.hostedPluginServer.runHostedPluginInstance(pluginLocation.toString());
        this.pluginInstanceUri = uri;
        if (!isNative) {
            // Open a new tab in case of browser
            this.windowService.openNewWindow(uri);
        }
    }

    protected getErrorMessage(error: Error): string {
        return error.message.substring(error.message.indexOf(':') + 1);
    }
}
