// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { DefaultSkillService } from '@theia/ai-core/lib/browser/skill-service';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { Skill } from '@theia/ai-core/lib/common/skill';

@injectable()
export class QaapSkillService extends DefaultSkillService {

    protected override async processSkillDirectoryWithParentWatching(
        directoryPath: string,
        skills: Map<string, Skill>,
        disposables: DisposableCollection,
        watchedDirectories: Set<string>,
        parentWatchers: Map<string, string>
    ): Promise<void> {
        const dirURI = URI.fromFilePath(directoryPath);

        try {
            const dirExists = await this.fileService.exists(dirURI);

            if (dirExists) {
                await this.processExistingSkillDirectory(dirURI, skills, disposables, watchedDirectories);
            } else {
                const parentPath = dirURI.parent.path.fsPath();
                const parentURI = URI.fromFilePath(parentPath);
                const parentExists = await this.fileService.exists(parentURI);

                if (parentExists) {
                    const parentUriString = parentURI.toString();
                    disposables.push(this.fileService.watch(parentURI, { recursive: false, excludes: [] }));
                    parentWatchers.set(parentUriString, directoryPath);
                    this.logger.info(`Watching parent directory '${parentPath}' for skills folder creation`);
                } else {
                    this.logger.debug(`Skipping skills watch for '${directoryPath}': parent directory does not exist yet`);
                }
            }
        } catch (error) {
            this.logger.error(`Error processing directory '${directoryPath}': ${error}`);
        }
    }
}
