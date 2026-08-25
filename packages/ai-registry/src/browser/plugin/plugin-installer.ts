// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { MessageService, nls, Progress } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { InstalledPluginInfo, ResolvedPluginEntry, StagedPluginInstall } from '../../common/plugin/plugin-registry-types';
import { PluginHashMismatchDialogFactory, PluginInstallDialogFactory } from './plugin-install-dialog';
import { PluginInstallService } from './plugin-install-service';
import { PluginMcpRegistrar } from './plugin-mcp-registrar';

export interface PluginInstallOptions {
    /** True for update and fix, where the existing root is removed before the staged download lands. */
    readonly replaceExisting: boolean;
    /** True for a first install; cleared for update and fix, where the user already accepted once. */
    readonly confirm: boolean;
}

export const PluginInstaller = Symbol('PluginInstaller');
/**
 * Drives the two-phase install to completion. Both the Extensions view and the `install-plugin` deep
 * link go through here, so either path shows the same dialogs and registers the same way.
 */
export interface PluginInstaller {
    /** @returns true when the plugin was installed, false when the user cancelled either dialog. */
    install(entry: ResolvedPluginEntry, options: PluginInstallOptions): Promise<boolean>;
}

@injectable()
export class PluginInstallerImpl implements PluginInstaller {

    @inject(PluginInstallService)
    protected readonly installService: PluginInstallService;

    @inject(PluginMcpRegistrar)
    protected readonly mcpRegistrar: PluginMcpRegistrar;

    @inject(PluginInstallDialogFactory)
    protected readonly installDialogFactory: PluginInstallDialogFactory;

    @inject(PluginHashMismatchDialogFactory)
    protected readonly mismatchDialogFactory: PluginHashMismatchDialogFactory;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    async install(entry: ResolvedPluginEntry, options: PluginInstallOptions): Promise<boolean> {
        if (options.confirm && !await this.confirmInstall(entry)) {
            return false;
        }
        // Downloading a repository tarball is slow enough that silence reads as a hang. The progress
        // is closed around the mismatch dialog so it never sits behind a modal waiting on the user.
        const staged = await this.withProgress(entry,
            nls.localizeByDefault('Downloading...'),
            () => this.installService.stage(entry));
        // Nothing is in the plugins root yet, so the user can still decide.
        if (staged.mismatch && !await this.confirmMismatch(entry, staged)) {
            await this.installService.discard(staged.stagingId);
            return false;
        }
        await this.withProgress(entry,
            nls.localizeByDefault('Installing...'),
            async () => {
                const installed = await this.installService.commit(staged.stagingId, options.replaceExisting);
                // Only the MCP servers; the skill root is picked up by `PluginSkillDirectoryContribution`.
                await this.register(installed, entry);
            });
        return true;
    }

    protected async withProgress<T>(entry: ResolvedPluginEntry, message: string, run: () => Promise<T>): Promise<T> {
        const progress = await this.startProgress(entry, message);
        try {
            return await run();
        } finally {
            progress.cancel();
        }
    }

    protected startProgress(entry: ResolvedPluginEntry, message: string): Promise<Progress> {
        return this.messageService.showProgress({
            text: nls.localize('theia/ai-registry/plugin/progress/text', 'Agent Plugin "{0}": {1}', entry.name, message)
        });
    }

    /**
     * Fails loudly: the root is already in place, so a silent failure leaves a plugin that looks
     * installed while the servers it declared never run.
     */
    protected async register(installed: InstalledPluginInfo, entry: ResolvedPluginEntry): Promise<void> {
        try {
            await this.mcpRegistrar.register(installed);
        } catch (error) {
            // Names Uninstall and Install, not Update: this state classifies as up to date, so the
            // Extensions view renders no Update button to point the user at.
            throw new Error(nls.localize(
                'theia/ai-registry/plugin/registrationFailed',
                'Agent Plugin "{0}" was installed, but its MCP servers could not be registered: {1}. '
                + 'Uninstall and install it again to retry.',
                entry.name,
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async confirmInstall(entry: ResolvedPluginEntry): Promise<boolean> {
        return !!await this.installDialogFactory({ entry }).open();
    }

    protected async confirmMismatch(entry: ResolvedPluginEntry, staged: StagedPluginInstall): Promise<boolean> {
        return !!await this.mismatchDialogFactory({ entry, mismatch: staged.mismatch! }).open();
    }
}
