// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { codicon, LabelProvider, LabelProviderContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CellKind } from '../../common';
import { NotebookService } from '../service/notebook-service';
import { NotebookCellOutlineNode } from './notebook-outline-contribution';

@injectable()
export class NotebookLabelProviderContribution implements LabelProviderContribution {

    @inject(NotebookService)
    protected readonly notebookService: NotebookService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    canHandle(element: object): number {
        if (NotebookCellOutlineNode.is(element)) {
            return 200;
        }
        return 0;
    }

    getIcon(element: NotebookCellOutlineNode): string {
        return element.notebookCell.cellKind === CellKind.Markup ? codicon('markdown') : codicon('code');
    }

    getName(element: NotebookCellOutlineNode): string {
        return element.notebookCell.text.split('\n')[0];
    }

    getLongName(element: NotebookCellOutlineNode): string {
        return element.notebookCell.text.split('\n')[0];
    }

}
