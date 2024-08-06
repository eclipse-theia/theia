// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { CellEditType, CellKind } from '../../common';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';

/**
 * a collection of different reusable notbook cell operations
 */

export function changeCellType(notebookModel: NotebookModel, cell: NotebookCellModel, type: CellKind, language?: string): void {
    if (cell.cellKind === type) {
        return;
    }
    if (type === CellKind.Markup) {
        language = 'markdown';
    } else {
        language ??= cell.language;
    }
    notebookModel.applyEdits([{
        editType: CellEditType.Replace,
        index: notebookModel.cells.indexOf(cell),
        count: 1,
        cells: [{
            ...cell.getData(),
            cellKind: type,
            language
        }]
    }], true);
}
