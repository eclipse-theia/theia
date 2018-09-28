/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';

export const FolderPreferenceProviderFactory = Symbol('FolderPreferenceProviderFactory');
export interface FolderPreferenceProviderFactory {
    (options: FolderPreferenceProviderOptions): FolderPreferenceProvider;
}

export const FolderPreferenceProviderOptions = Symbol('FolderPreferenceProviderOptions');
export interface FolderPreferenceProviderOptions {
    folder: FileStat;
}

@injectable()
export class FolderPreferenceProvider extends AbstractResourcePreferenceProvider {

    private folderUri: URI | undefined;

    constructor(
        @inject(FolderPreferenceProviderOptions) protected readonly options: FolderPreferenceProviderOptions,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        super();
    }

    get uri(): URI | undefined {
        return this.folderUri;
    }

    async getUri(): Promise<URI | undefined> {
        this.folderUri = new URI(this.options.folder.uri);
        if (await this.fileSystem.exists(this.folderUri.toString())) {
            const uri = this.folderUri.resolve('.theia').resolve('settings.json');
            return uri;
        }
    }

    canProvide(preferenceName: string, resourceUri?: string): number {
        const value = this.get(preferenceName);
        if (value === undefined || value === null || !resourceUri || !this.folderUri) {
            return super.canProvide(preferenceName, resourceUri);
        }
        const uri = new URI(resourceUri);
        return this.folderUri.path.relativity(uri.path);
    }

    protected getScope() {
        return PreferenceScope.Folders;
    }

    protected getFolderUris(): string[] {
        return this.folderUri ? [this.folderUri.toString()] : [];
    }
}
