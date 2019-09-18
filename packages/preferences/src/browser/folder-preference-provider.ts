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

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { PreferenceScope } from '@theia/core/lib/browser';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';
import { FileStat } from '@theia/filesystem/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export const FolderPreferenceProviderFactory = Symbol('FolderPreferenceProviderFactory');
export interface FolderPreferenceProviderFactory {
    (options: FolderPreferenceProviderOptions): FolderPreferenceProvider;
}

export const FolderPreferenceProviderOptions = Symbol('FolderPreferenceProviderOptions');
export interface FolderPreferenceProviderOptions {
    readonly folder: FileStat;
    readonly configUri: URI;
}

@injectable()
export class FolderPreferenceProvider extends AbstractResourcePreferenceProvider {

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FolderPreferenceProviderOptions) protected readonly options: FolderPreferenceProviderOptions;

    private _folderUri: URI;

    get folderUri(): URI {
        if (!this._folderUri) {
            this._folderUri = new URI(this.options.folder.uri);
        }
        return this._folderUri;
    }

    protected getUri(): URI {
        return this.options.configUri;
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
