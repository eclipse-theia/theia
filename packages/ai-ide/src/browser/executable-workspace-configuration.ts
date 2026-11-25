// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { URI } from '@theia/core/lib/common/uri';
import { PreferenceConfigurations } from '@theia/core/lib/common/preferences/preference-configurations';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceFileService } from '@theia/workspace/lib/common/workspace-file-service';

/**
 * Recognizes workspace configuration files whose agent-written changes wait for the user's review: `tasks.json`,
 * `launch.json` and `settings.json` in a configuration folder (`.theia`, `.vscode`), and workspace files. They can
 * define tasks and launch configurations, and `settings.json` and workspace files can also change settings such as
 * tool confirmation.
 *
 * This is defense in depth, not a complete list: `runTask` also runs tasks that extensions provide from other files,
 * e.g. npm scripts in `package.json`. The confirmation that `runTask` and `runLaunchConfiguration` always ask for is
 * what keeps an agent from running commands it wrote.
 *
 * Names are compared case-insensitively, as case-insensitive file systems resolve any spelling to the same file.
 */
@injectable()
export class ExecutableWorkspaceConfiguration {

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    @inject(WorkspaceFileService)
    protected readonly workspaceFileService: WorkspaceFileService;

    is(uri: URI): boolean {
        // `.vscode/./tasks.json` or `.vscode//tasks.json` name the same file, so only the normalized path tells its folder.
        const normalized = uri.normalizePath();
        return this.isWorkspaceFile(normalized) || this.isConfigurationFile(normalized);
    }

    protected isWorkspaceFile(uri: URI): boolean {
        return this.includesIgnoringCase(this.workspaceFileService.getWorkspaceFileExtensions(true), uri.path.ext);
    }

    protected isConfigurationFile(uri: URI): boolean {
        return uri.path.ext.toLowerCase() === '.json'
            && this.includesIgnoringCase(this.getConfigurationNames(), this.preferenceConfigurations.getName(uri))
            && this.includesIgnoringCase(this.preferenceConfigurations.getPaths(), this.preferenceConfigurations.getPath(uri));
    }

    /** Configuration names, i.e. file names without the `.json` extension, whose content can define commands to run. */
    protected getConfigurationNames(): string[] {
        return ['tasks', 'launch', this.preferenceConfigurations.getConfigName()];
    }

    protected includesIgnoringCase(candidates: string[], value: string): boolean {
        const lowerCaseValue = value.toLowerCase();
        return candidates.some(candidate => candidate.toLowerCase() === lowerCaseValue);
    }
}
