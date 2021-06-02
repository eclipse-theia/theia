/********************************************************************************
 * Copyright (C) 2019 David Saunders and others.
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
import { SelectionService, UriSelection } from '@theia/core/lib/common';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Command } from '@theia/core/lib/common/command';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileOperationError, FileOperationResult } from '@theia/filesystem/lib/common/files';

export namespace NavigatorDiffCommands {
    const COMPARE_CATEGORY = 'Compare';
    export const COMPARE_FIRST: Command = {
        id: 'compare:first',
        category: COMPARE_CATEGORY,
        label: 'Select for Compare'
    };
    export const COMPARE_SECOND: Command = {
        id: 'compare:second',
        category: COMPARE_CATEGORY,
        label: 'Compare with Selected'
    };
}

@injectable()
export class NavigatorDiff {
    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected openerService: OpenerService;

    @inject(MessageService)
    protected readonly notifications: MessageService;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    constructor(
    ) {
    }

    protected _firstCompareFile: URI | undefined = undefined;
    protected get firstCompareFile(): URI | undefined {
        return this._firstCompareFile;
    }
    protected set firstCompareFile(uri: URI | undefined) {
        this._firstCompareFile = uri;
        this._isFirstFileSelected = true;
    }

    protected _isFirstFileSelected: boolean;
    get isFirstFileSelected(): boolean {
        return this._isFirstFileSelected;
    }

    protected async isDirectory(uri: URI): Promise<boolean> {
        try {
            const stat = await this.fileService.resolve(uri);
            return stat.isDirectory;
        } catch (e) {
            if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
                return true;
            }
        }

        return false;
    }

    protected async getURISelection(): Promise<URI | undefined> {
        const uri = UriSelection.getUri(this.selectionService.selection);
        if (!uri) {
            return undefined;
        }

        if (await this.isDirectory(uri)) {
            return undefined;
        }

        return uri;
    }

    /**
     * Adds the initial file for comparison
     * @see SelectionService
     * @see compareFiles
     * @returns Promise<boolean> indicating whether the uri is valid
     */
    async addFirstComparisonFile(): Promise<boolean> {
        const uriSelected = await this.getURISelection();

        if (uriSelected === undefined) {
            return false;
        }

        this.firstCompareFile = uriSelected;

        return true;
    }

    /**
     * Compare selected files.  First file is selected through addFirstComparisonFile
     * @see SelectionService
     * @see addFirstComparisonFile
     * @returns Promise<boolean> indicating whether the comparison was completed successfully
     */
    async compareFiles(): Promise<boolean> {
        const uriSelected = await this.getURISelection();

        if (this.firstCompareFile === undefined || uriSelected === undefined) {
            return false;
        }
        const diffUri = DiffUris.encode(this.firstCompareFile, uriSelected);

        open(this.openerService, diffUri).catch(e => {
            this.notifications.error(e.message);
        });
        return true;
    }
}
