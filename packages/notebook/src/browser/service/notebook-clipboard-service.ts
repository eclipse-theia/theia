// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { environment } from '@theia/core';
import { CellData } from '../../common';

@injectable()
export class NotebookClipboardService {

    protected copiedCell: CellData | undefined;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    copyCell(cell: NotebookCellModel): void {
        this.copiedCell = cell.getData();

        if (environment.electron.is()) {
            this.clipboardService.writeText(cell.text);
        }
    }

    getCell(): CellData | undefined {
        return this.copiedCell;
    }

}
