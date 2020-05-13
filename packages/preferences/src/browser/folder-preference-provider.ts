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
import { PreferenceScope, PreferenceResolveResult } from '@theia/core/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { JsonSchemaConfiguration } from '@theia/core/src/browser/json-schema-store';
import { Path } from '@theia/core';
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
            this._folderUri = new URI(this.folder.uri);
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

    resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T> {
        // resolve relative paths for json schema settings in workspace scope
        if (preferenceName === 'json.schemas' && this.getScope() === PreferenceScope.Workspace) {
            const workspaceSettings = this.getPreferences(resourceUri)[preferenceName];
            if (workspaceSettings && resourceUri) {
                const rootPath = new URI(resourceUri).path.toString();
                workspaceSettings.forEach((schemaConfig: JsonSchemaConfiguration) => {
                    let url = schemaConfig.url;
                    if (url.match(rootPath)) {
                        url = new URI(new Path(url).toString()).toString();
                    } else if ((url.startsWith('.') || url.startsWith('/') || url.match(/^\w+\//))) {
                        url = new URI(rootPath).resolve(url).normalizePath().toString();
                    }
                    if (url) {
                        schemaConfig.url = url;
                    }
                });
            }
            return {
                value: workspaceSettings,
                configUri: this.getConfigUri(resourceUri)
            };
        }
        return super.resolve(preferenceName, resourceUri);
    }
}
