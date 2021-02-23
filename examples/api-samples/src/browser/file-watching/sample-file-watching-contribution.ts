/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { postConstruct, injectable, inject, interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy, FrontendApplicationContribution, LabelProvider,
    PreferenceContribution, PreferenceProxy, PreferenceSchema, PreferenceService
} from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';

export function bindSampleFileWatching(bind: interfaces.Bind): void {
    bind(FrontendApplicationContribution).to(SampleFileWatchingContribution).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({ schema: FileWatchingPreferencesSchema });
    bind(FileWatchingPreferences).toDynamicValue(
        ctx => createPreferenceProxy(ctx.container.get(PreferenceService), FileWatchingPreferencesSchema)
    );
}

const FileWatchingPreferences = Symbol('FileWatchingPreferences');
type FileWatchingPreferences = PreferenceProxy<FileWatchingPreferencesSchema>;

interface FileWatchingPreferencesSchema {
    'sample.file-watching.verbose': boolean
}
const FileWatchingPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'sample.file-watching.verbose': {
            type: 'boolean',
            default: false,
            description: 'Enable verbose file watching logs.'
        }
    }
};

@injectable()
class SampleFileWatchingContribution implements FrontendApplicationContribution {

    protected verbose: boolean;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileWatchingPreferences)
    protected readonly fileWatchingPreferences: FileWatchingPreferences;

    @postConstruct()
    protected postConstruct(): void {
        this.verbose = this.fileWatchingPreferences['sample.file-watching.verbose'];
        this.fileWatchingPreferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'sample.file-watching.verbose') {
                this.verbose = e.newValue;
            }
        });
    }

    onStart(): void {
        this.fileService.onDidFilesChange(event => {
            // Only log if the verbose preference is set.
            if (this.verbose) {
                // Get the workspace roots for the current frontend:
                const roots = this.workspaceService.tryGetRoots();
                // Create some name to help find out which frontend logged the message:
                const workspace = roots.length > 0
                    ? roots.map(root => this.labelProvider.getLongName(root.resource)).join('+')
                    : '<no workspace>';
                console.log(`Sample File Watching: ${event.changes.length} file(s) changed! ${workspace}`);
            }
        });
    }

}
