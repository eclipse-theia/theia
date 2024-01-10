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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as theia from '@theia/plugin';
import { NotebookDocument } from './notebook-document';

export class NotebookEditor {

    public static readonly apiEditorsToExtHost = new WeakMap<theia.NotebookEditor, NotebookEditor>();

    private selections: theia.NotebookRange[] = [];
    private visibleRanges: theia.NotebookRange[] = [];
    private viewColumn?: theia.ViewColumn;

    private internalVisible: boolean = false;

    private editor?: theia.NotebookEditor;

    constructor(
        readonly id: string,
        // private readonly _proxy: MainThreadNotebookEditorsShape,
        readonly notebookData: NotebookDocument,
        visibleRanges: theia.NotebookRange[],
        selections: theia.NotebookRange[],
        viewColumn: theia.ViewColumn | undefined
    ) {
        this.selections = selections;
        this.visibleRanges = visibleRanges;
        this.viewColumn = viewColumn;
    }

    get apiEditor(): theia.NotebookEditor {
        if (!this.editor) {
            const that = this;
            this.editor = {
                get notebook(): theia.NotebookDocument {
                    return that.notebookData.apiNotebook;
                },
                get selection(): theia.NotebookRange {
                    return that.selections[0];
                },
                set selection(selection: theia.NotebookRange) {
                    this.selections = [selection];
                },
                get selections(): theia.NotebookRange[] {
                    return that.selections;
                },
                set selections(value: theia.NotebookRange[]) {
                    // if (!Array.isArray(value) || !value.every(extHostTypes.NotebookRange.isNotebookRange)) {
                    //     throw illegalArgument('selections');
                    // }
                    that.selections = value;
                    that.trySetSelections(value);
                },
                get visibleRanges(): theia.NotebookRange[] {
                    return that.visibleRanges;
                },
                revealRange(range, revealType): void {
                    // that._proxy.$tryRevealRange(
                    //     that.id,
                    //     extHostConverter.NotebookRange.from(range),
                    //     revealType ?? extHostTypes.NotebookEditorRevealType.Default
                    // );
                },
                get viewColumn(): theia.ViewColumn | undefined {
                    return that.viewColumn;
                },
            };

            NotebookEditor.apiEditorsToExtHost.set(this.editor, this);
        }
        return this.editor;
    }

    get visible(): boolean {
        return this.internalVisible;
    }

    acceptVisibility(value: boolean): void {
        this.internalVisible = value;
    }

    acceptVisibleRanges(value: theia.NotebookRange[]): void {
        this.visibleRanges = value;
    }

    acceptSelections(selections: theia.NotebookRange[]): void {
        this.selections = selections;
    }

    private trySetSelections(value: theia.NotebookRange[]): void {
        // NB Unimplemented: implement "selections"
        // this._proxy.$trySetSelections(this.id, value.map(extHostConverter.NotebookRange.from));
    }

    acceptViewColumn(value: theia.ViewColumn | undefined): void {
        this.viewColumn = value;
    }
}
