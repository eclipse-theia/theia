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
import { MarkdownString, MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { OS, ContributionProvider, DisposableCollection } from '@theia/core';
import { Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { PreferenceChange, PreferenceSchemaService, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, named, postConstruct, preDestroy } from '@theia/core/shared/inversify';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import {
    WorkspaceTrustPreferences, WORKSPACE_TRUST_EMPTY_WINDOW, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_STARTUP_PROMPT, WORKSPACE_TRUST_TRUSTED_FOLDERS, WorkspaceTrustPrompt
} from '../common/workspace-trust-preferences';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WorkspaceService } from './workspace-service';
import { WorkspaceCommands } from './workspace-commands';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { WorkspaceTrustDialog } from './workspace-trust-dialog';

const STORAGE_TRUSTED = 'trusted';
export const WORKSPACE_TRUST_STATUS_BAR_ID = 'workspace-trust-status';

/**
 * Contribution interface for features that are restricted in untrusted workspaces.
 * Implementations can provide information about what is being restricted.
 */
export const WorkspaceRestrictionContribution = Symbol('WorkspaceRestrictionContribution');
export interface WorkspaceRestrictionContribution {
    /**
     * Returns the restrictions currently active due to workspace trust.
     * Called when building the restricted mode status bar tooltip.
     */
    getRestrictions(): WorkspaceRestriction[];
}

export interface WorkspaceRestriction {
    /** Display name of the feature being restricted */
    label: string;
    /** Optional details (e.g., list of blocked items) */
    details?: string[];
}

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

    @inject(PreferenceSchemaService)
    protected readonly preferenceSchemaService: PreferenceSchemaService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(ContributionProvider) @named(WorkspaceRestrictionContribution)
    protected readonly restrictionContributions: ContributionProvider<WorkspaceRestrictionContribution>;

    protected workspaceTrust = new Deferred<boolean>();
    protected currentTrust: boolean | undefined;
    protected pendingTrustDialog: Deferred<boolean> | undefined;

    protected readonly onDidChangeWorkspaceTrustEmitter = new Emitter<boolean>();
    readonly onDidChangeWorkspaceTrust: Event<boolean> = this.onDidChangeWorkspaceTrustEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeWorkspaceTrustEmitter);

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        await this.workspaceService.ready;
        await this.workspaceTrustPref.ready;
        await this.preferenceSchemaService.ready;
        await this.resolveWorkspaceTrust();
        this.toDispose.push(
            this.preferences.onPreferenceChanged(change => this.handlePreferenceChange(change))
        );
        this.toDispose.push(
            this.workspaceService.onWorkspaceChanged(() => this.handleWorkspaceChanged())
        );

        // Show status bar item if starting in restricted mode
        const initialTrust = await this.getWorkspaceTrust();
        this.updateRestrictedModeIndicator(initialTrust);

        // React to trust changes
        this.toDispose.push(
            this.onDidChangeWorkspaceTrust(trust => {
                this.updateRestrictedModeIndicator(trust);
            })
        );
    }

    @preDestroy()
    protected onStop(): void {
        this.toDispose.dispose();
    }

    getWorkspaceTrust(): Promise<boolean> {
        // Return current trust if already resolved, otherwise wait for initial resolution
        if (this.currentTrust !== undefined) {
            return Promise.resolve(this.currentTrust);
        }
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
                if (trust && this.workspaceTrustPref[WORKSPACE_TRUST_ENABLED]) {
                    await this.addToTrustedFolders();
                }
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
        const trustEnabled = this.workspaceTrustPref[WORKSPACE_TRUST_ENABLED];
        if (!trustEnabled) {
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
        // If dialog is already open, wait for its result
        if (this.pendingTrustDialog) {
            return this.pendingTrustDialog.promise;
        }

        this.pendingTrustDialog = new Deferred<boolean>();
        try {
            const folderPath = this.workspaceService.workspace?.resource?.path?.toString() ?? '';

            const dialog = new WorkspaceTrustDialog(folderPath);

            const result = await dialog.open();
            const trusted = result === true;
            this.pendingTrustDialog.resolve(trusted);
            return trusted;
        } catch (e) {
            this.pendingTrustDialog.resolve(false);
            throw e;
        } finally {
            this.pendingTrustDialog = undefined;
        }
    }

    async addToTrustedFolders(): Promise<void> {
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

    async removeFromTrustedFolders(): Promise<void> {
        const workspaceUri = this.workspaceService.workspace?.resource;
        if (!workspaceUri) {
            return;
        }
        if (this.isWorkspaceInTrustedFolders()) {
            const currentFolders = this.workspaceTrustPref[WORKSPACE_TRUST_TRUSTED_FOLDERS] || [];
            const caseSensitive = !OS.backend.isWindows;
            const normalizedWorkspaceUri = workspaceUri.normalizePath();
            const updatedFolders = currentFolders.filter(folder => {
                try {
                    const folderUri = new URI(folder).normalizePath();
                    return !normalizedWorkspaceUri.isEqual(folderUri, caseSensitive);
                } catch {
                    return true; // Keep invalid URIs
                }
            });
            await this.preferences.set(
                WORKSPACE_TRUST_TRUSTED_FOLDERS,
                updatedFolders,
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
            try {
                const folderUri = new URI(folder).normalizePath();
                return workspaceUri.normalizePath().isEqual(folderUri, caseSensitive);
            } catch {
                return false; // Invalid URI in preferences
            }
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
            // For empty windows with emptyWindow setting enabled, trust should remain true
            if (this.workspaceTrustPref[WORKSPACE_TRUST_EMPTY_WINDOW] && !this.workspaceService.workspace) {
                return;
            }
            const isNowInTrustedFolders = this.isWorkspaceInTrustedFolders();
            if (isNowInTrustedFolders !== this.currentTrust) {
                this.setWorkspaceTrust(isNowInTrustedFolders);
            }
            return;
        }

        if (change.scope === PreferenceScope.User) {
            if (change.preferenceName === WORKSPACE_TRUST_STARTUP_PROMPT && this.workspaceTrustPref[WORKSPACE_TRUST_STARTUP_PROMPT] !== WorkspaceTrustPrompt.ONCE) {
                this.storage.setData(STORAGE_TRUSTED, undefined);
            }

            if (change.preferenceName === WORKSPACE_TRUST_ENABLED && this.isWorkspaceTrustResolved() && await this.confirmRestart()) {
                this.windowService.setSafeToShutDown();
                this.windowService.reload();
            }

            if (change.preferenceName === WORKSPACE_TRUST_ENABLED) {
                this.resolveWorkspaceTrust();
            }

            // Handle emptyWindow setting change for empty windows
            if (change.preferenceName === WORKSPACE_TRUST_EMPTY_WINDOW && !this.workspaceService.workspace) {
                // For empty windows, directly update trust based on the new setting value
                const shouldTrust = !!this.workspaceTrustPref[WORKSPACE_TRUST_EMPTY_WINDOW];
                if (this.currentTrust !== shouldTrust) {
                    this.setWorkspaceTrust(shouldTrust);
                }
            }
        }
    }

    protected async handleWorkspaceChanged(): Promise<void> {
        // Reset trust state for the new workspace
        this.workspaceTrust = new Deferred<boolean>();
        this.currentTrust = undefined;

        // Re-evaluate trust for the new workspace
        await this.resolveWorkspaceTrust();

        // Update status bar indicator
        const trust = await this.getWorkspaceTrust();
        this.updateRestrictedModeIndicator(trust);
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

    protected updateRestrictedModeIndicator(trusted: boolean): void {
        if (trusted) {
            this.hideRestrictedModeStatusBarItem();
        } else {
            this.showRestrictedModeStatusBarItem();
        }
    }

    protected showRestrictedModeStatusBarItem(): void {
        this.statusBar.setElement(WORKSPACE_TRUST_STATUS_BAR_ID, {
            text: '$(shield) ' + nls.localizeByDefault('Restricted Mode'),
            alignment: StatusBarAlignment.LEFT,
            backgroundColor: 'var(--theia-statusBarItem-prominentBackground)',
            color: 'var(--theia-statusBarItem-prominentForeground)',
            priority: 5000,
            tooltip: this.createRestrictedModeTooltip(),
            command: WorkspaceCommands.MANAGE_WORKSPACE_TRUST.id
        });
    }

    protected createRestrictedModeTooltip(): MarkdownString {
        const md = new MarkdownStringImpl('', { supportThemeIcons: true });

        md.appendMarkdown(`**${nls.localizeByDefault('Restricted Mode')}**\n\n`);

        md.appendMarkdown(nls.localize('theia/workspace/restrictedModeDescription',
            'Some features are disabled because this workspace is not trusted.'));
        md.appendMarkdown('\n\n');
        md.appendMarkdown(nls.localize('theia/workspace/restrictedModeNote',
            '*Please note: Workspace trust is under development; not all features (e.g., debug, tasks) are yet restricted.*'));

        const restrictions = this.collectRestrictions();
        if (restrictions.length > 0) {
            md.appendMarkdown('\n\n---\n\n');
            for (const restriction of restrictions) {
                md.appendMarkdown(`**${restriction.label}**\n\n`);
                if (restriction.details && restriction.details.length > 0) {
                    for (const detail of restriction.details) {
                        md.appendMarkdown(`- ${detail}\n`);
                    }
                    md.appendMarkdown('\n');
                }
            }
        }

        md.appendMarkdown('\n\n---\n\n');
        md.appendMarkdown(nls.localize('theia/workspace/clickToManageTrust', 'Click to manage trust settings.'));

        return md;
    }

    protected collectRestrictions(): WorkspaceRestriction[] {
        const restrictions: WorkspaceRestriction[] = [];
        for (const contribution of this.restrictionContributions.getContributions()) {
            restrictions.push(...contribution.getRestrictions());
        }
        return restrictions;
    }

    protected hideRestrictedModeStatusBarItem(): void {
        this.statusBar.removeElement(WORKSPACE_TRUST_STATUS_BAR_ID);
    }

    /**
     * Refreshes the restricted mode status bar item.
     * Call this when restriction contributions change.
     */
    refreshRestrictedModeIndicator(): void {
        if (this.currentTrust === false) {
            this.showRestrictedModeStatusBarItem();
        }
    }

    async requestWorkspaceTrust(): Promise<boolean | undefined> {
        if (!this.isWorkspaceTrustResolved()) {
            const trusted = await this.showTrustPromptDialog();
            await this.resolveWorkspaceTrust(trusted);
        }
        return this.workspaceTrust.promise;
    }
}
