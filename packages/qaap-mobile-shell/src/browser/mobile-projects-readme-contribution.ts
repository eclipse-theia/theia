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
import { consumeMobileProjectReadmeOpenRequest } from './mobile-projects-open';

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

    onStart(): void {
        this.workspaceService.onWorkspaceChanged(() => {
            void this.maybeOpenReadme();
        });
    }

    onDidInitializeLayout(_app: FrontendApplication): void {
        void this.maybeOpenReadme();
    }

    protected async maybeOpenReadme(): Promise<void> {
        if (!consumeMobileProjectReadmeOpenRequest()) {
            return;
        }
        await this.workspaceService.roots;
        if (!this.workspaceService.opened) {
            return;
        }
        const readmeUri = await this.findReadmeUri();
        if (!readmeUri) {
            return;
        }
        if (await this.previewContribution.canHandle(readmeUri)) {
            await this.previewContribution.open(readmeUri, { mode: 'activate' });
        } else {
            await open(this.openerService, readmeUri, { mode: 'activate' });
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
