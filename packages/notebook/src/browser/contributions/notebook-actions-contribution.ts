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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { codicon } from '@theia/core/lib/browser';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookService } from '../service/notebook-service';
import { CellKind } from '../../common';
import { NotebookKernelQuickPickService } from '../service/notebook-kernel-quick-pick-service';

export namespace NotebookCommands {
    export const ADD_NEW_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.add-new-cell',
        iconClass: codicon('add')
    });

    export const SELECT_KERNEL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.selectKernel',
        category: 'Notebook',
        iconClass: codicon('server-environment')
    });
}

@injectable()
export class NotebookActionsContribution implements CommandContribution {

    @inject(NotebookService)
    protected notebookService: NotebookService;

    @inject(NotebookKernelQuickPickService)
    protected notebookKernelQuickPickService: NotebookKernelQuickPickService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookCommands.ADD_NEW_CELL_COMMAND, {
            execute: (notebookModel: NotebookModel, cellKind: CellKind, index?: number) => {
                notebookModel.insertNewCell(index ?? notebookModel.cells.length,
                    [this.notebookService.createEmptyCellModel(notebookModel, cellKind)]);
            }
        });

        commands.registerCommand(NotebookCommands.SELECT_KERNEL_COMMAND, {
            execute: (notebookModel: NotebookModel) => {
                this.notebookKernelQuickPickService.showQuickPick(notebookModel);
            }
        });
    }

}
