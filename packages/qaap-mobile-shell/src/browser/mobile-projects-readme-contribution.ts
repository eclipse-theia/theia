// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { OpenerService, open } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { PreviewContribution } from '@theia/preview/lib/browser/preview-contribution';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    clearMobileProjectReadmeOpenRequest,
    consumeMobileProjectReadmeOpenRequest,
    peekMobileProjectReadmeOpenRequest,
} from './mobile-projects-open';

const README_CANDIDATE_NAMES = [
    'README.md',
    'readme.md',
    'Readme.md',
    'README.MD',
    'README',
    'readme.markdown',
    'README.markdown',
];

@injectable()
export class MobileProjectsReadmeContribution implements FrontendApplicationContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(PreviewContribution)
    protected readonly previewContribution: PreviewContribution;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected pendingFlagOpen: Promise<void> | undefined;

    onStart(): void {
        this.workspaceService.onWorkspaceChanged(() => {
            void this.handlePendingOpenRequest();
        });
    }

    onDidInitializeLayout(_app: FrontendApplication): void {
        void this.handlePendingOpenRequest();
    }

    /**
     * Opens the README of the currently opened workspace, regardless of whether the open-request flag
     * is set. Safe to call from UI handlers (e.g. tapping the current project in the Projects panel).
     */
    async openReadmeForCurrentWorkspace(): Promise<boolean> {
        clearMobileProjectReadmeOpenRequest();
        return this.tryOpenReadme();
    }

    /**
     * Handles the cross-reload README-open flag without consuming it until the workspace is ready and a
     * README is actually located. Multiple lifecycle hooks can call this safely.
     */
    protected async handlePendingOpenRequest(): Promise<void> {
        if (!peekMobileProjectReadmeOpenRequest()) {
            return;
        }
        if (this.pendingFlagOpen) {
            await this.pendingFlagOpen;
            return;
        }
        this.pendingFlagOpen = (async () => {
            try {
                const opened = await this.tryOpenReadme();
                if (opened) {
                    consumeMobileProjectReadmeOpenRequest();
                }
                // If no README exists (or workspace is not opened yet) we keep the flag so a later
                // workspace-changed event can still satisfy it.
            } finally {
                this.pendingFlagOpen = undefined;
            }
        })();
        await this.pendingFlagOpen;
    }

    protected async tryOpenReadme(): Promise<boolean> {
        await this.workspaceService.roots;
        if (!this.workspaceService.opened) {
            return false;
        }
        const readmeUri = await this.findReadmeUri();
        if (!readmeUri) {
            return false;
        }
        try {
            if (await this.previewContribution.canHandle(readmeUri)) {
                await this.previewContribution.open(readmeUri, { mode: 'activate' });
            } else {
                await open(this.openerService, readmeUri, { mode: 'activate' });
            }
            return true;
        } catch {
            // Fall back to the generic opener so a misbehaving preview does not break navigation.
            try {
                await open(this.openerService, readmeUri, { mode: 'activate' });
                return true;
            } catch {
                return false;
            }
        }
    }

    protected async findReadmeUri(): Promise<URI | undefined> {
        const roots = await this.workspaceService.roots;
        for (const folder of roots) {
            const uri = await this.findReadmeInRoot(folder.resource);
            if (uri) {
                return uri;
            }
        }
        return undefined;
    }

    protected async findReadmeInRoot(root: URI): Promise<URI | undefined> {
        for (const name of README_CANDIDATE_NAMES) {
            const candidate = root.resolve(name);
            if (await this.fileService.exists(candidate)) {
                return candidate;
            }
        }
        try {
            const folderStat = await this.fileService.resolve(root);
            const children = folderStat.children ?? [];
            const sorted = [...children].sort((a, b) => a.name.localeCompare(b.name));
            const match = sorted.find(entry => !entry.isDirectory && entry.name.toLowerCase() === 'readme.md')
                ?? sorted.find(entry => !entry.isDirectory && entry.name.toLowerCase().startsWith('readme'));
            return match?.resource;
        } catch {
            return undefined;
        }
    }
}
