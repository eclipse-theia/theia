/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { SelectionService, UriSelection } from '@theia/core/lib/common';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Command } from '@theia/core/lib/common/command';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';

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
    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(OpenerService) protected openerService: OpenerService,
        @inject(MessageService) protected readonly notifications: MessageService,
    ) {
    }

    protected _firstCompare: URI;
    protected get firstCompareFile(): URI {
        return this._firstCompare;
    }
    protected set firstCompareFile(uri: URI) {
        this._firstCompare = uri;
        this._isFirstFileSelected = true;
    }

    protected _isFirstFileSelected: boolean;
    get isFirstFileSelected(): boolean {
        return this._isFirstFileSelected;
    }

    protected async isDirectory(uri: URI): Promise<boolean> {
        const stat = await this.fileSystem.getFileStat(uri.path.toString());
        if (!stat || stat.isDirectory) {
            return true;
        }

        return false;
    }

    async addFirstComparisonFile() {
        const uri = UriSelection.getUri(this.selectionService.selection);
        if (!uri) {
            return;
        }

        if (await this.isDirectory(uri)) {
            return;
        }

        this.firstCompareFile = uri;
    }

    async compareFiles() {
        const uri = UriSelection.getUri(this.selectionService.selection);
        if (!uri) {
            return;
        }

        if (await this.isDirectory(uri)) {
            return;
        }

        const diffUri = DiffUris.encode(this.firstCompareFile, uri);

        if (diffUri) {
            open(this.openerService, diffUri).catch(e => {
                this.notifications.error(e.message);
            });
        }
    }
}
