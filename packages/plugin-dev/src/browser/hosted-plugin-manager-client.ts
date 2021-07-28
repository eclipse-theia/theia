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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Path } from '@theia/core/lib/common/path';
import { MessageService, Command, Emitter, Event, UriSelection } from '@theia/core/lib/common';
import { LabelProvider, isNative, AbstractDialog } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { OpenFileDialogFactory, DirNode } from '@theia/filesystem/lib/browser';
import { HostedPluginServer } from '../common/plugin-dev-protocol';
import { DebugPluginConfiguration, LaunchVSCodeArgument, LaunchVSCodeRequest, LaunchVSCodeResult } from '@theia/debug/lib/browser/debug-contribution';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { HostedPluginPreferences } from './hosted-plugin-preferences';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { DebugSessionConnection } from '@theia/debug/lib/browser/debug-session-connection';

/**
 * Commands to control Hosted plugin instances.
 */
export namespace HostedPluginCommands {
    const HOSTED_PLUGIN_CATEGORY = 'Hosted Plugin';
    export const START: Command = {
        id: 'hosted-plugin:start',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Start Instance'
    };

    export const DEBUG: Command = {
        id: 'hosted-plugin:debug',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Debug Instance'
    };

    export const STOP: Command = {
        id: 'hosted-plugin:stop',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Stop Instance'
    };
    export const RESTART: Command = {
        id: 'hosted-plugin:restart',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Restart Instance'
    };
    export const SELECT_PATH: Command = {
        id: 'hosted-plugin:select-path',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Select Path'
    };
}

/**
 * Available states of hosted plugin instance.
 */
export enum HostedInstanceState {
    STOPPED = 'stopped',
    STARTING = 'starting',
    RUNNING = 'running',
    STOPPING = 'stopping',
    FAILED = 'failed'
}

export interface HostedInstanceData {
    state: HostedInstanceState;
    pluginLocation: URI;
}

/**
 * Responsible for UI to set up and control Hosted Plugin Instance.
 */
@injectable()
export class HostedPluginManagerClient {
    private openNewTabAskDialog: OpenHostedInstanceLinkDialog;

    private connection: DebugSessionConnection;

    // path to the plugin on the file system
    protected pluginLocation: URI | undefined;

    // URL to the running plugin instance
    protected pluginInstanceURL: string | undefined;

    protected isDebug = false;

    protected readonly stateChanged = new Emitter<HostedInstanceData>();

    get onStateChanged(): Event<HostedInstanceData> {
        return this.stateChanged.event;
    }

    @inject(HostedPluginServer)
    protected readonly hostedPluginServer: HostedPluginServer;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(OpenFileDialogFactory)
    protected readonly openFileDialogFactory: OpenFileDialogFactory;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(WindowService)
    protected readonly windowService: WindowService;
    @inject(FileService)
    protected readonly fileService: FileService;
    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;
    @inject(HostedPluginPreferences)
    protected readonly hostedPluginPreferences: HostedPluginPreferences;

    @postConstruct()
    protected async init(): Promise<void> {
        this.openNewTabAskDialog = new OpenHostedInstanceLinkDialog(this.windowService);

        // is needed for case when page is loaded when hosted instance is already running.
        if (await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            this.pluginLocation = new URI(await this.hostedPluginServer.getHostedPluginURI());
        }
    }

    get lastPluginLocation(): string | undefined {
        if (this.pluginLocation) {
            return this.pluginLocation.toString();
        }
        return undefined;
    }

    async start(debugConfig?: DebugPluginConfiguration): Promise<void> {
        if (await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            this.messageService.warn('Hosted instance is already running.');
            return;
        }

        if (!this.pluginLocation) {
            await this.selectPluginPath();
            if (!this.pluginLocation) {
                // selection was cancelled
                return;
            }
        }

        try {
            this.stateChanged.fire({ state: HostedInstanceState.STARTING, pluginLocation: this.pluginLocation });
            this.messageService.info('Starting hosted instance server ...');

            if (debugConfig) {
                this.isDebug = true;
                this.pluginInstanceURL = await this.hostedPluginServer.runDebugHostedPluginInstance(this.pluginLocation.toString(), debugConfig);
            } else {
                this.isDebug = false;
                this.pluginInstanceURL = await this.hostedPluginServer.runHostedPluginInstance(this.pluginLocation.toString());
            }
            await this.openPluginWindow();

            this.messageService.info('Hosted instance is running at: ' + this.pluginInstanceURL);
            this.stateChanged.fire({ state: HostedInstanceState.RUNNING, pluginLocation: this.pluginLocation });
        } catch (error) {
            this.messageService.error('Failed to run hosted plugin instance: ' + this.getErrorMessage(error));
            this.stateChanged.fire({ state: HostedInstanceState.FAILED, pluginLocation: this.pluginLocation });
            this.stop();
        }
    }

    async debug(config?: DebugPluginConfiguration): Promise<string | undefined> {
        await this.start(this.setDebugConfig(config));
        await this.startDebugSessionManager();

        return this.pluginInstanceURL;
    }

    async startDebugSessionManager(): Promise<void> {
        let outFiles: string[] | undefined = undefined;
        if (this.pluginLocation && this.hostedPluginPreferences['hosted-plugin.launchOutFiles'].length > 0) {
            const fsPath = await this.fileService.fsPath(this.pluginLocation);
            if (fsPath) {
                outFiles = this.hostedPluginPreferences['hosted-plugin.launchOutFiles'].map(outFile =>
                    outFile.replace('${pluginPath}', new Path(fsPath).toString())
                );
            }
        }
        await this.debugSessionManager.start({
            configuration: {
                type: 'node',
                request: 'attach',
                timeout: 30000,
                name: 'Hosted Plugin',
                smartStep: true,
                sourceMaps: !!outFiles,
                outFiles
            }
        });
    }

    async stop(checkRunning: boolean = true): Promise<void> {
        if (checkRunning && !await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            this.messageService.warn('Hosted instance is not running.');
            return;
        }
        try {
            this.stateChanged.fire({ state: HostedInstanceState.STOPPING, pluginLocation: this.pluginLocation! });
            await this.hostedPluginServer.terminateHostedPluginInstance();
            this.messageService.info((this.pluginInstanceURL ? this.pluginInstanceURL : 'The instance') + ' has been terminated.');
            this.stateChanged.fire({ state: HostedInstanceState.STOPPED, pluginLocation: this.pluginLocation! });
        } catch (error) {
            this.messageService.error(this.getErrorMessage(error));
        }
    }

    async restart(): Promise<void> {
        if (await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            await this.stop(false);

            this.messageService.info('Starting hosted instance server ...');

            // It takes some time before OS released all resources e.g. port.
            // Keep trying to run hosted instance with delay.
            this.stateChanged.fire({ state: HostedInstanceState.STARTING, pluginLocation: this.pluginLocation! });
            let lastError;
            for (let tries = 0; tries < 15; tries++) {
                try {
                    if (this.isDebug) {
                        this.pluginInstanceURL = await this.hostedPluginServer.runDebugHostedPluginInstance(this.pluginLocation!.toString(), {
                            debugMode: this.hostedPluginPreferences['hosted-plugin.debugMode']
                        });
                        await this.startDebugSessionManager();
                    } else {
                        this.pluginInstanceURL = await this.hostedPluginServer.runHostedPluginInstance(this.pluginLocation!.toString());
                    }
                    await this.openPluginWindow();
                    this.messageService.info('Hosted instance is running at: ' + this.pluginInstanceURL);
                    this.stateChanged.fire({
                        state: HostedInstanceState.RUNNING,
                        pluginLocation: this.pluginLocation!
                    });
                    return;
                } catch (error) {
                    lastError = error;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            this.messageService.error('Failed to run hosted plugin instance: ' + this.getErrorMessage(lastError));
            this.stateChanged.fire({ state: HostedInstanceState.FAILED, pluginLocation: this.pluginLocation! });
            this.stop();
        } else {
            this.messageService.warn('Hosted Plugin instance was not running.');
            this.start();
        }
    }

    /**
     * Creates directory choose dialog and set selected folder into pluginLocation field.
     */
    async selectPluginPath(): Promise<void> {
        const workspaceFolder = (await this.workspaceService.roots)[0] || await this.fileService.resolve(new URI(await this.environments.getHomeDirUri()));
        if (!workspaceFolder) {
            throw new Error('Unable to find the root');
        }

        const rootNode = DirNode.createRoot(workspaceFolder);

        const dialog = this.openFileDialogFactory({
            title: HostedPluginCommands.SELECT_PATH.label!,
            openLabel: 'Select',
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        });
        dialog.model.navigateTo(rootNode);
        const result = await dialog.open();

        if (UriSelection.is(result)) {
            if (await this.hostedPluginServer.isPluginValid(result.uri.toString())) {
                this.pluginLocation = result.uri;
                this.messageService.info('Plugin folder is set to: ' + this.labelProvider.getLongName(result.uri));
            } else {
                this.messageService.error('Specified folder does not contain valid plugin.');
            }
        }
    }

    register(configType: string, connection: DebugSessionConnection): void {
        if (configType === 'pwa-extensionHost') {
            this.connection = connection;
            this.connection.onRequest('launchVSCode', (request: LaunchVSCodeRequest) => this.launchVSCode(request));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.connection.on('exited', async (args: any) => {
                await this.stop();
            });
        }
    }

    /**
     * Opens window with URL to the running plugin instance.
     */
    protected async openPluginWindow(): Promise<void> {
        // do nothing for electron browser
        if (isNative) {
            return;
        }

        if (this.pluginInstanceURL) {
            try {
                this.windowService.openNewWindow(this.pluginInstanceURL);
            } catch (err) {
                // browser blocked opening of a new tab
                this.openNewTabAskDialog.showOpenNewTabAskDialog(this.pluginInstanceURL);
            }
        }
    }

    protected async launchVSCode({ arguments: { args } }: LaunchVSCodeRequest): Promise<LaunchVSCodeResult> {
        let result = {};
        let instanceURI;

        const sessions = this.debugSessionManager.sessions.filter(session => session.id !== this.connection.sessionId);

        /* if `launchVSCode` is invoked and sessions do not exist - it means that `start` debug was invoked.
           if `launchVSCode` is invoked and sessions do exist - it means that `restartSessions()` was invoked,
           which invoked `this.sendRequest('restart', {})`, which restarted `vscode-builtin-js-debug` plugin which is
           connected to first session (sessions[0]), which means that other existing (child) sessions need to be terminated
           and new ones will be created by running `startDebugSessionManager()`
         */
        if (sessions.length > 0) {
            sessions.forEach(session => session.terminate(false));
            await this.startDebugSessionManager();
            instanceURI = this.pluginInstanceURL;
        } else {
            instanceURI = await this.debug(this.getDebugPluginConfig(args));
        }

        if (instanceURI) {
            const instanceURL = new URL(instanceURI);
            if (instanceURL.port) {
                result = Object.assign(result, { rendererDebugPort: instanceURL.port });
            }
        }
        return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected getErrorMessage(error: any): string {
        return error?.message?.substring(error.message.indexOf(':') + 1) || '';
    }

    private setDebugConfig(config?: DebugPluginConfiguration): DebugPluginConfiguration {
        config = Object.assign(config || {}, { debugMode: this.hostedPluginPreferences['hosted-plugin.debugMode'] });
        if (config.pluginLocation) {
            this.pluginLocation = new URI((!config.pluginLocation.startsWith('/') ? '/' : '') + config.pluginLocation.replace(/\\/g, '/')).withScheme('file');
        }
        return config;
    }

    private getDebugPluginConfig(args: LaunchVSCodeArgument[]): DebugPluginConfiguration {
        let pluginLocation;
        for (const arg of args) {
            if (arg?.prefix === '--extensionDevelopmentPath=') {
                pluginLocation = arg.path;
            }
        }

        return {
            pluginLocation
        };
    }
}

class OpenHostedInstanceLinkDialog extends AbstractDialog<string> {
    protected readonly windowService: WindowService;
    protected readonly openButton: HTMLButtonElement;
    protected readonly messageNode: HTMLDivElement;
    protected readonly linkNode: HTMLAnchorElement;
    value: string;

    constructor(windowService: WindowService) {
        super({
            title: 'Your browser prevented opening of a new tab'
        });
        this.windowService = windowService;

        this.linkNode = document.createElement('a');
        this.linkNode.target = '_blank';
        this.linkNode.setAttribute('style', 'color: var(--theia-editorWidget-foreground);');
        this.contentNode.appendChild(this.linkNode);

        const messageNode = document.createElement('div');
        messageNode.innerText = 'Hosted instance is started at: ';
        messageNode.appendChild(this.linkNode);
        this.contentNode.appendChild(messageNode);

        this.appendCloseButton();
        this.openButton = this.appendAcceptButton('Open');
    }

    showOpenNewTabAskDialog(uri: string): void {
        this.value = uri;

        this.linkNode.innerHTML = uri;
        this.linkNode.href = uri;
        this.openButton.onclick = () => {
            this.windowService.openNewWindow(uri);
        };

        this.open();
    }
}
