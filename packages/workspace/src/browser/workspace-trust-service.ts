// *****************************************************************************
// Copyright (C) 2021 EclipseSource and others.
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

import { ConfirmDialog, Dialog, StorageService } from '@theia/core/lib/browser';
import { OS } from '@theia/core';
import { Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { PreferenceChange, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import {
    WorkspaceTrustPreferences, WORKSPACE_TRUST_EMPTY_WINDOW, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_STARTUP_PROMPT, WORKSPACE_TRUST_TRUSTED_FOLDERS, WorkspaceTrustPrompt
} from '../common/workspace-trust-preferences';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WorkspaceService } from './workspace-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

const STORAGE_TRUSTED = 'trusted';

@injectable()
export class WorkspaceTrustService {
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WorkspaceTrustPreferences)
    protected readonly workspaceTrustPref: WorkspaceTrustPreferences;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected workspaceTrust = new Deferred<boolean>();
    protected currentTrust: boolean | undefined;
    protected restrictedModeNotificationShown = false;

    protected readonly onDidChangeWorkspaceTrustEmitter = new Emitter<boolean>();
    readonly onDidChangeWorkspaceTrust: Event<boolean> = this.onDidChangeWorkspaceTrustEmitter.event;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        await this.workspaceService.ready;
        await this.resolveWorkspaceTrust();
        this.preferences.onPreferenceChanged(change => this.handlePreferenceChange(change));

        // Show notification if starting in restricted mode
        const initialTrust = await this.getWorkspaceTrust();
        this.updateRestrictedModeNotification(initialTrust);

        // React to trust changes
        this.onDidChangeWorkspaceTrust(trust => {
            this.updateRestrictedModeNotification(trust);
        });
    }

    getWorkspaceTrust(): Promise<boolean> {
        return this.workspaceTrust.promise;
    }

    protected async resolveWorkspaceTrust(givenTrust?: boolean): Promise<void> {
        if (!this.isWorkspaceTrustResolved()) {
            const trust = givenTrust ?? await this.calculateWorkspaceTrust();
            if (trust !== undefined) {
                await this.storeWorkspaceTrust(trust);
                this.contextKeyService.setContext('isWorkspaceTrusted', trust);
                this.currentTrust = trust;
                this.workspaceTrust.resolve(trust);
                this.onDidChangeWorkspaceTrustEmitter.fire(trust);
            }
        }
    }

    setWorkspaceTrust(trusted: boolean): void {
        if (this.currentTrust === trusted) {
            return;
        }
        this.currentTrust = trusted;
        this.contextKeyService.setContext('isWorkspaceTrusted', trusted);
        if (this.workspaceTrustPref[WORKSPACE_TRUST_STARTUP_PROMPT] === WorkspaceTrustPrompt.ONCE) {
            this.storeWorkspaceTrust(trusted);
        }
        this.onDidChangeWorkspaceTrustEmitter.fire(trusted);
    }

    protected isWorkspaceTrustResolved(): boolean {
        return this.workspaceTrust.state !== 'unresolved';
    }

    protected async calculateWorkspaceTrust(): Promise<boolean | undefined> {
        if (!this.workspaceTrustPref[WORKSPACE_TRUST_ENABLED]) {
            // in VS Code if workspace trust is disabled, we implicitly trust the workspace
            return true;
        }

        if (this.workspaceTrustPref[WORKSPACE_TRUST_EMPTY_WINDOW] && !this.workspaceService.workspace) {
            return true;
        }

        if (this.isWorkspaceInTrustedFolders()) {
            return true;
        }

        if (this.workspaceTrustPref[WORKSPACE_TRUST_STARTUP_PROMPT] === WorkspaceTrustPrompt.NEVER) {
            return false;
        }

        // For ONCE mode, check stored trust first
        if (this.workspaceTrustPref[WORKSPACE_TRUST_STARTUP_PROMPT] === WorkspaceTrustPrompt.ONCE) {
            const storedTrust = await this.loadWorkspaceTrust();
            if (storedTrust !== undefined) {
                return storedTrust;
            }
        }

        // For ALWAYS mode or ONCE mode with no stored decision, show dialog
        return this.showTrustPromptDialog();
    }

    protected async showTrustPromptDialog(): Promise<boolean> {
        const trust = nls.localizeByDefault('Yes, I trust the authors');
        const dontTrust = nls.localizeByDefault("No, I don't trust the authors");
        const folderPath = this.workspaceService.workspace?.resource?.path?.toString() ?? '';

        const dialog = new ConfirmDialog({
            title: nls.localizeByDefault('Do you trust the authors of the files in this folder?'),
            msg: nls.localize('theia/workspace/trustDialogMessage',
                'If you trust the authors of this folder, code inside may be executed. Only trust folders that you trust the contents of.') +
                (folderPath ? `\n\n${folderPath}` : ''),
            ok: trust,
            cancel: dontTrust,
        });

        const result = await dialog.open();
        const trusted = result === true;

        if (trusted) {
            await this.addToTrustedFolders();
        }
        return trusted;
    }

    protected async addToTrustedFolders(): Promise<void> {
        const workspaceUri = this.workspaceService.workspace?.resource;
        if (!workspaceUri) {
            return;
        }
        if (!this.isWorkspaceInTrustedFolders()) {
            const currentFolders = this.workspaceTrustPref[WORKSPACE_TRUST_TRUSTED_FOLDERS] || [];
            await this.preferences.set(
                WORKSPACE_TRUST_TRUSTED_FOLDERS,
                [...currentFolders, workspaceUri.toString()],
                PreferenceScope.User
            );
        }
    }

    protected isWorkspaceInTrustedFolders(): boolean {
        const workspaceUri = this.workspaceService.workspace?.resource;
        if (!workspaceUri) {
            return false;
        }
        const trustedFolders = this.workspaceTrustPref[WORKSPACE_TRUST_TRUSTED_FOLDERS] || [];
        const caseSensitive = !OS.backend.isWindows;
        return trustedFolders.some(folder => {
            // Strip trailing slash from folder string before creating URI
            const normalizedFolder = folder.endsWith('/') ? folder.slice(0, -1) : folder;
            const folderUri = new URI(normalizedFolder);
            return workspaceUri.isEqual(folderUri, caseSensitive);
        });
    }

    protected async loadWorkspaceTrust(): Promise<boolean | undefined> {
        if (this.workspaceTrustPref[WORKSPACE_TRUST_STARTUP_PROMPT] === WorkspaceTrustPrompt.ONCE) {
            return this.storage.getData<boolean>(STORAGE_TRUSTED);
        }
    }

    protected async storeWorkspaceTrust(trust: boolean): Promise<void> {
        if (this.workspaceTrustPref[WORKSPACE_TRUST_STARTUP_PROMPT] === WorkspaceTrustPrompt.ONCE) {
            return this.storage.setData(STORAGE_TRUSTED, trust);
        }
    }

    protected async handlePreferenceChange(change: PreferenceChange): Promise<void> {
        // Handle trustedFolders changes regardless of scope
        if (change.preferenceName === WORKSPACE_TRUST_TRUSTED_FOLDERS) {
            const isNowInTrustedFolders = this.isWorkspaceInTrustedFolders();
            if (isNowInTrustedFolders !== this.currentTrust) {
                this.setWorkspaceTrust(isNowInTrustedFolders);
            }
            return;
        }

        if (change.scope === PreferenceScope.User) {
            if (change.preferenceName === WORKSPACE_TRUST_STARTUP_PROMPT && change.newValue !== WorkspaceTrustPrompt.ONCE) {
                this.storage.setData(STORAGE_TRUSTED, undefined);
            }

            if (change.preferenceName === WORKSPACE_TRUST_ENABLED && this.isWorkspaceTrustResolved() && await this.confirmRestart()) {
                this.windowService.setSafeToShutDown();
                this.windowService.reload();
            }

            if (change.preferenceName === WORKSPACE_TRUST_ENABLED || change.preferenceName === WORKSPACE_TRUST_EMPTY_WINDOW) {
                this.resolveWorkspaceTrust();
            }
        }
    }

    protected async confirmRestart(): Promise<boolean> {
        const shouldRestart = await new ConfirmDialog({
            title: nls.localizeByDefault('A setting has changed that requires a restart to take effect.'),
            msg: nls.localizeByDefault('Press the restart button to restart {0} and enable the setting.', FrontendApplicationConfigProvider.get().applicationName),
            ok: nls.localizeByDefault('Restart'),
            cancel: Dialog.CANCEL,
        }).open();
        return shouldRestart === true;
    }

    protected updateRestrictedModeNotification(trusted: boolean): void {
        if (!trusted && !this.restrictedModeNotificationShown) {
            this.showRestrictedModeNotification();
            this.restrictedModeNotificationShown = true;
        } else if (trusted) {
            this.restrictedModeNotificationShown = false;
        }
    }

    protected showRestrictedModeNotification(): void {
        this.messageService.warn(
            nls.localize('theia/workspace/restrictedModeBanner',
                'This workspace is in Restricted Mode. Some features may be disabled. Use "Manage Workspace Trust" command to change trust settings.')
        );
    }

    async requestWorkspaceTrust(): Promise<boolean | undefined> {
        if (!this.isWorkspaceTrustResolved()) {
            const isTrusted = await this.messageService.info(nls.localize('theia/workspace/trustRequest',
                'An extension requests workspace trust but the corresponding API is not yet fully supported. Do you want to trust this workspace?'),
                Dialog.YES, Dialog.NO);
            const trusted = isTrusted === Dialog.YES;
            this.resolveWorkspaceTrust(trusted);
        }
        return this.workspaceTrust.promise;
    }
}
