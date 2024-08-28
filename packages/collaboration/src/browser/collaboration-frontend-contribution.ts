// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import '../../src/browser/style/index.css';

import {
    CancellationToken, CancellationTokenSource, Command, CommandContribution, CommandRegistry, MessageService, nls, Progress, QuickInputService, QuickPickItem
} from '@theia/core';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { ConnectionProvider, SocketIoTransportProvider } from 'open-collaboration-protocol';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { CollaborationInstance, CollaborationInstanceFactory } from './collaboration-instance';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { CollaborationWorkspaceService } from './collaboration-workspace-service';
import { StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser/status-bar';
import { codiconArray } from '@theia/core/lib/browser/widgets/widget';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';

export const COLLABORATION_CATEGORY = 'Collaboration';

export namespace CollaborationCommands {
    export const CREATE_ROOM: Command = {
        id: 'collaboration.create-room'
    };
    export const JOIN_ROOM: Command = {
        id: 'collaboration.join-room'
    };
}

export const COLLABORATION_STATUS_BAR_ID = 'statusBar.collaboration';

export const COLLABORATION_AUTH_TOKEN = 'THEIA_COLLAB_AUTH_TOKEN';
export const COLLABORATION_SERVER_URL = 'COLLABORATION_SERVER_URL';
export const DEFAULT_COLLABORATION_SERVER_URL = 'https://api.open-collab.tools/';

@injectable()
export class CollaborationFrontendContribution implements CommandContribution {

    protected readonly connectionProvider = new Deferred<ConnectionProvider>();

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService?: QuickInputService;

    @inject(EnvVariablesServer)
    protected readonly envVariables: EnvVariablesServer;

    @inject(CollaborationWorkspaceService)
    protected readonly workspaceService: CollaborationWorkspaceService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(CollaborationInstanceFactory)
    protected readonly collaborationInstanceFactory: CollaborationInstanceFactory;

    protected currentInstance?: CollaborationInstance;

    @postConstruct()
    protected init(): void {
        this.setStatusBarEntryDefault();
        this.getCollaborationServerUrl().then(serverUrl => {
            const authHandler = new ConnectionProvider({
                url: serverUrl,
                client: FrontendApplicationConfigProvider.get().applicationName,
                fetch: window.fetch.bind(window),
                opener: url => this.windowService.openNewWindow(url, { external: true }),
                transports: [SocketIoTransportProvider],
                userToken: localStorage.getItem(COLLABORATION_AUTH_TOKEN) ?? undefined
            });
            this.connectionProvider.resolve(authHandler);
        }, err => this.connectionProvider.reject(err));
    }

    protected async onStatusDefaultClick(): Promise<void> {
        const items: QuickPickItem[] = [];
        if (this.workspaceService.opened) {
            items.push({
                label: nls.localize('theia/collaboration/createRoom', 'Create New Collaboration Session'),
                iconClasses: codiconArray('add'),
                execute: () => this.commands.executeCommand(CollaborationCommands.CREATE_ROOM.id)
            });
        }
        items.push({
            label: nls.localize('theia/collaboration/joinRoom', 'Join Collaboration Session'),
            iconClasses: codiconArray('vm-connect'),
            execute: () => this.commands.executeCommand(CollaborationCommands.JOIN_ROOM.id)
        });
        await this.quickInputService?.showQuickPick(items, {
            placeholder: nls.localize('theia/collaboration/selectCollaboration', 'Select collaboration option')
        });
    }

    protected async onStatusSharedClick(code: string): Promise<void> {
        const items: QuickPickItem[] = [{
            label: nls.localize('theia/collaboration/invite', 'Invite Others'),
            detail: nls.localize('theia/collaboration/inviteDetail', 'Copy the invitation code for sharing it with others to join the session.'),
            iconClasses: codiconArray('clippy'),
            execute: () => this.displayCopyNotification(code)
        }];
        if (this.currentInstance) {
            // TODO: Implement readonly mode
            // if (this.currentInstance.readonly) {
            //     items.push({
            //         label: nls.localize('theia/collaboration/enableEditing', 'Enable Workspace Editing'),
            //         detail: nls.localize('theia/collaboration/enableEditingDetail', 'Allow collaborators to modify content in your workspace.'),
            //         iconClasses: codiconArray('unlock'),
            //         execute: () => {
            //             if (this.currentInstance) {
            //                 this.currentInstance.readonly = false;
            //             }
            //         }
            //     });
            // } else {
            //     items.push({
            //         label: nls.localize('theia/collaboration/disableEditing', 'Disable Workspace Editing'),
            //         detail: nls.localize('theia/collaboration/disableEditingDetail', 'Restrict others from making changes to your workspace.'),
            //         iconClasses: codiconArray('lock'),
            //         execute: () => {
            //             if (this.currentInstance) {
            //                 this.currentInstance.readonly = true;
            //             }
            //         }
            //     });
            // }
        }
        items.push({
            label: nls.localize('theia/collaboration/end', 'End Collaboration Session'),
            detail: nls.localize('theia/collaboration/endDetail', 'Terminate the session, cease content sharing, and revoke access for others.'),
            iconClasses: codiconArray('circle-slash'),
            execute: () => this.currentInstance?.dispose()
        });
        await this.quickInputService?.showQuickPick(items, {
            placeholder: nls.localize('theia/collaboration/whatToDo', 'What would you like to do with other collaborators?')
        });
    }

    protected async onStatusConnectedClick(code: string): Promise<void> {
        const items: QuickPickItem[] = [{
            label: nls.localize('theia/collaboration/invite', 'Invite Others'),
            detail: nls.localize('theia/collaboration/inviteDetail', 'Copy the invitation code for sharing it with others to join the session.'),
            iconClasses: codiconArray('clippy'),
            execute: () => this.displayCopyNotification(code)
        }];
        items.push({
            label: nls.localize('theia/collaboration/leave', 'Leave Collaboration Session'),
            detail: nls.localize('theia/collaboration/leaveDetail', 'Disconnect from the current collaboration session and close the workspace.'),
            iconClasses: codiconArray('circle-slash'),
            execute: () => this.currentInstance?.dispose()
        });
        await this.quickInputService?.showQuickPick(items, {
            placeholder: nls.localize('theia/collaboration/whatToDo', 'What would you like to do with other collaborators?')
        });
    }

    protected async setStatusBarEntryDefault(): Promise<void> {
        await this.setStatusBarEntry({
            text: '$(codicon-live-share) ' + nls.localize('theia/collaboration/collaborate', 'Collaborate'),
            tooltip: nls.localize('theia/collaboration/startSession', 'Start or join collaboration session'),
            onclick: () => this.onStatusDefaultClick()
        });
    }

    protected async setStatusBarEntryShared(code: string): Promise<void> {
        await this.setStatusBarEntry({
            text: '$(codicon-broadcast) ' + nls.localizeByDefault('Shared'),
            tooltip: nls.localize('theia/collaboration/sharedSession', 'Shared a collaboration session'),
            onclick: () => this.onStatusSharedClick(code)
        });
    }

    protected async setStatusBarEntryConnected(code: string): Promise<void> {
        await this.setStatusBarEntry({
            text: '$(codicon-broadcast) ' + nls.localize('theia/collaboration/connected', 'Connected'),
            tooltip: nls.localize('theia/collaboration/connectedSession', 'Connected to a collaboration session'),
            onclick: () => this.onStatusConnectedClick(code)
        });
    }

    protected async setStatusBarEntry(entry: Omit<StatusBarEntry, 'alignment'>): Promise<void> {
        await this.statusBar.setElement(COLLABORATION_STATUS_BAR_ID, {
            ...entry,
            alignment: StatusBarAlignment.LEFT,
            priority: 5
        });
    }

    protected async getCollaborationServerUrl(): Promise<string> {
        const serverUrlVariable = await this.envVariables.getValue(COLLABORATION_SERVER_URL);
        return serverUrlVariable?.value || DEFAULT_COLLABORATION_SERVER_URL;
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CollaborationCommands.CREATE_ROOM, {
            execute: async () => {
                const cancelTokenSource = new CancellationTokenSource();
                const progress = await this.messageService.showProgress({
                    text: nls.localize('theia/collaboration/creatingRoom', 'Creating Session'),
                    options: {
                        cancelable: true
                    }
                }, () => cancelTokenSource.cancel());
                try {
                    const authHandler = await this.connectionProvider.promise;
                    const roomClaim = await authHandler.createRoom({
                        reporter: info => progress.report({ message: info.message }),
                        abortSignal: this.toAbortSignal(cancelTokenSource.token)
                    });
                    if (roomClaim.loginToken) {
                        localStorage.setItem(COLLABORATION_AUTH_TOKEN, roomClaim.loginToken);
                    }
                    this.currentInstance?.dispose();
                    const connection = await authHandler.connect(roomClaim.roomToken);
                    this.currentInstance = this.collaborationInstanceFactory({
                        role: 'host',
                        connection
                    });
                    this.currentInstance.onDidClose(() => {
                        this.setStatusBarEntryDefault();
                    });
                    const roomCode = roomClaim.roomId;
                    this.setStatusBarEntryShared(roomCode);
                    this.displayCopyNotification(roomCode, true);
                } catch (err) {
                    await this.messageService.error(nls.localize('theia/collaboration/failedCreate', 'Failed to create room: {0}', err.message));
                } finally {
                    progress.cancel();
                }
            }
        });
        commands.registerCommand(CollaborationCommands.JOIN_ROOM, {
            execute: async () => {
                let joinRoomProgress: Progress | undefined;
                const cancelTokenSource = new CancellationTokenSource();
                try {
                    const authHandler = await this.connectionProvider.promise;
                    const id = await this.quickInputService?.input({
                        placeHolder: nls.localize('theia/collaboration/enterCode', 'Enter collaboration session code')
                    });
                    if (!id) {
                        return;
                    }
                    joinRoomProgress = await this.messageService.showProgress({
                        text: nls.localize('theia/collaboration/joiningRoom', 'Joining Session'),
                        options: {
                            cancelable: true
                        }
                    }, () => cancelTokenSource.cancel());
                    const roomClaim = await authHandler.joinRoom({
                        roomId: id,
                        reporter: info => joinRoomProgress?.report({ message: info.message }),
                        abortSignal: this.toAbortSignal(cancelTokenSource.token)
                    });
                    joinRoomProgress.cancel();
                    if (roomClaim.loginToken) {
                        localStorage.setItem(COLLABORATION_AUTH_TOKEN, roomClaim.loginToken);
                    }
                    this.currentInstance?.dispose();
                    const connection = await authHandler.connect(roomClaim.roomToken, roomClaim.host);
                    this.currentInstance = this.collaborationInstanceFactory({
                        role: 'guest',
                        connection
                    });
                    this.currentInstance.onDidClose(() => {
                        this.setStatusBarEntryDefault();
                    });
                    this.setStatusBarEntryConnected(roomClaim.roomId);
                } catch (err) {
                    joinRoomProgress?.cancel();
                    await this.messageService.error(nls.localize('theia/collaboration/failedJoin', 'Failed to join room: {0}', err.message));
                }
            }
        });
    }

    protected toAbortSignal(...tokens: CancellationToken[]): AbortSignal {
        const controller = new AbortController();
        tokens.forEach(token => token.onCancellationRequested(() => controller.abort()));
        return controller.signal;
    }

    protected async displayCopyNotification(code: string, firstTime = false): Promise<void> {
        navigator.clipboard.writeText(code);
        const notification = nls.localize('theia/collaboration/copiedInvitation', 'Invitation code copied to clipboard.');
        if (firstTime) {
            // const makeReadonly = nls.localize('theia/collaboration/makeReadonly', 'Make readonly');
            const copyAgain = nls.localize('theia/collaboration/copyAgain', 'Copy Again');
            const copyResult = await this.messageService.info(
                notification,
                // makeReadonly,
                copyAgain
            );
            // if (copyResult === makeReadonly && this.currentInstance) {
            //     this.currentInstance.readonly = true;
            // }
            if (copyResult === copyAgain) {
                navigator.clipboard.writeText(code);
            }
        } else {
            await this.messageService.info(
                notification
            );
        }
    }
}
