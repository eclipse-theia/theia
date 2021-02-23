/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
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

import { Navigatable } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileSelection } from '@theia/filesystem/lib/browser/file-selection';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PropertyDataService } from '../property-data-service';

@injectable()
export class ResourcePropertyDataService implements PropertyDataService {

    readonly id = 'resources';
    readonly label = 'ResourcePropertyDataService';

    @inject(FileService) protected readonly fileService: FileService;

    canHandleSelection(selection: Object | undefined): number {
        return (this.isFileSelection(selection) || this.isNavigatableSelection(selection)) ? 1 : 0;
    }

    protected isFileSelection(selection: Object | undefined): boolean {
        return !!selection && Array.isArray(selection) && FileSelection.is(selection[0]);
    }

    protected isNavigatableSelection(selection: Object | undefined): boolean {
        return !!selection && Navigatable.is(selection);
    }

    protected async getFileStat(uri: URI): Promise<FileStat> {
        return this.fileService.resolve(uri);
    }

    async providePropertyData(selection: Object | undefined): Promise<FileStat | undefined> {
        if (this.isFileSelection(selection) && Array.isArray(selection)) {
            return this.getFileStat(selection[0].fileStat.resource);
        } else if (this.isNavigatableSelection(selection)) {
            const navigatableUri = (selection as Navigatable).getResourceUri();
            if (navigatableUri) {
                return this.getFileStat(navigatableUri);
            }
        }
        return undefined;
    }

}
