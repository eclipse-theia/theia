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
import { CellKind, CellUri } from '../../common';
import { NotebookService } from '../service/notebook-service';
import { NotebookCellOutlineNode } from './notebook-outline-contribution';
import type Token = require('markdown-it/lib/token');
import markdownit = require('@theia/core/shared/markdown-it');
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { URI } from '@theia/core';

@injectable()
export class NotebookLabelProviderContribution implements LabelProviderContribution {

    @inject(NotebookService)
    protected readonly notebookService: NotebookService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    protected markdownIt = markdownit();

    canHandle(element: object): number {
        if (NotebookCellOutlineNode.is(element)) {
            return 200;
        }
        return 0;
    }

    getIcon(element: NotebookCellOutlineNode): string {
        const cell = this.findCellByUri(element.uri);
        if (cell) {
            return cell.cellKind === CellKind.Markup ? codicon('markdown') : codicon('code');
        }
        return '';
    }

    getName(element: NotebookCellOutlineNode): string {
        const cell = this.findCellByUri(element.uri);
        if (cell) {
            return cell.cellKind === CellKind.Code ?
                cell.text.split('\n')[0] :
                this.extractPlaintext(this.markdownIt.parse(cell.text.split('\n')[0], {}));
        }
        return '';
    }

    getLongName(element: NotebookCellOutlineNode): string {
        const cell = this.findCellByUri(element.uri);
        if (cell) {
            return cell.cellKind === CellKind.Code ?
                cell.text.split('\n')[0] :
                this.extractPlaintext(this.markdownIt.parse(cell.text.split('\n')[0], {}));
        }
        return '';
    }

    extractPlaintext(parsedMarkdown: Token[]): string {
        return parsedMarkdown.map(token => token.children ? this.extractPlaintext(token.children) : token.content).join('');
    }

    findCellByUri(uri: URI): NotebookCellModel | undefined {
        const parsed = CellUri.parse(uri);
        if (parsed) {
            return this.notebookService.getNotebookEditorModel(parsed.notebook)?.cells.find(cell => cell.handle === parsed?.handle);
        }
        return undefined;
    }

}
