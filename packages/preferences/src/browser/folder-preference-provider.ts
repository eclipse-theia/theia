/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PreferenceScope } from '@theia/core/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { SectionPreferenceProvider } from './section-preference-provider';

export const FolderPreferenceProviderFactory = Symbol('FolderPreferenceProviderFactory');
export interface FolderPreferenceProviderFactory {
    (uri: URI, section: string, folder: FileStat): FolderPreferenceProvider;
}

export const FolderPreferenceProviderFolder = Symbol('FolderPreferenceProviderFolder');
export interface FolderPreferenceProviderOptions {
    readonly configUri: URI;
    readonly sectionName: string | undefined;
}

@injectable()
export class FolderPreferenceProvider extends SectionPreferenceProvider {

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FolderPreferenceProviderFolder) protected readonly folder: FileStat;

    private _folderUri: URI;

    get folderUri(): URI {
        if (!this._folderUri) {
            this._folderUri = this.folder.resource;
        }
        return this._folderUri;
    }
    protected getScope(): PreferenceScope {
        if (!this.workspaceService.isMultiRootWorkspaceOpened) {
            // when FolderPreferenceProvider is used as a delegate of WorkspacePreferenceProvider in a one-folder workspace
            return PreferenceScope.Workspace;
        }
        return PreferenceScope.Folder;
    }

    getDomain(): string[] {
        return [this.folderUri.toString()];
    }
}
