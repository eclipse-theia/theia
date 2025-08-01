// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/view/scrollSynchronizer.ts

import { Disposable, DisposableCollection } from '@theia/core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MergeEditor } from '../merge-editor';
import { DocumentLineRangeMap } from '../model/range-mapping';

export class MergeEditorScrollSync implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    protected isSyncing = false;

    constructor(protected readonly mergeEditor: MergeEditor) {
        const { side1Pane, side2Pane, resultPane, basePane } = mergeEditor;

        const syncingHandler = <T>(handler: (event: T) => void) => (event: T) => {
            if (this.isSyncing) {
                return;
            }
            this.isSyncing = true;
            try {
                handler(event);
            } finally {
                this.isSyncing = false;
            }
        };

        this.toDispose.push(side1Pane.editor.getControl().onDidScrollChange(syncingHandler(event => {
            if (event.scrollTopChanged) {
                this.handleSide1ScrollTopChanged(event.scrollTop);
            }
            if (event.scrollLeftChanged) {
                basePane.editor.getControl().setScrollLeft(event.scrollLeft);
                side2Pane.editor.getControl().setScrollLeft(event.scrollLeft);
                resultPane.editor.getControl().setScrollLeft(event.scrollLeft);
            }
        })));

        this.toDispose.push(side2Pane.editor.getControl().onDidScrollChange(syncingHandler(event => {
            if (event.scrollTopChanged) {
                this.handleSide2ScrollTopChanged(event.scrollTop);
            }
            if (event.scrollLeftChanged) {
                basePane.editor.getControl().setScrollLeft(event.scrollLeft);
                side1Pane.editor.getControl().setScrollLeft(event.scrollLeft);
                resultPane.editor.getControl().setScrollLeft(event.scrollLeft);
            }
        })));

        this.toDispose.push(resultPane.editor.getControl().onDidScrollChange(syncingHandler(event => {
            if (event.scrollTopChanged) {
                this.handleResultScrollTopChanged(event.scrollTop);
            }
            if (event.scrollLeftChanged) {
                basePane.editor.getControl().setScrollLeft(event.scrollLeft);
                side1Pane.editor.getControl().setScrollLeft(event.scrollLeft);
                side2Pane.editor.getControl().setScrollLeft(event.scrollLeft);
            }
        })));

        this.toDispose.push(basePane.editor.getControl().onDidScrollChange(syncingHandler(event => {
            if (event.scrollTopChanged) {
                this.handleBaseScrollTopChanged(event.scrollTop);
            }
            if (event.scrollLeftChanged) {
                side1Pane.editor.getControl().setScrollLeft(event.scrollLeft);
                side2Pane.editor.getControl().setScrollLeft(event.scrollLeft);
                resultPane.editor.getControl().setScrollLeft(event.scrollLeft);
            }
        })));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    storeScrollState(): unknown {
        return this.mergeEditor.side1Pane.editor.getControl().getScrollTop();
    }

    restoreScrollState(state: unknown): void {
        if (typeof state === 'number') {
            const scrollTop = this.mergeEditor.side1Pane.editor.getControl().getScrollTop();
            if (state !== scrollTop) {
                this.mergeEditor.side1Pane.editor.getControl().setScrollTop(state);
            } else {
                this.update();
            }
        }
    }

    update(): void {
        if (this.isSyncing) {
            return;
        }
        this.isSyncing = true;
        try {
            const scrollTop = this.mergeEditor.side1Pane.editor.getControl().getScrollTop();
            this.handleSide1ScrollTopChanged(scrollTop);
        } finally {
            this.isSyncing = false;
        }
    }

    protected handleSide1ScrollTopChanged(scrollTop: number): void {
        const { side1Pane, side2Pane, resultPane, basePane, shouldAlignBase, shouldAlignResult, model } = this.mergeEditor;

        side2Pane.editor.getControl().setScrollTop(scrollTop);

        if (shouldAlignResult) {
            resultPane.editor.getControl().setScrollTop(scrollTop);
        } else {
            const targetScrollTop = this.computeTargetScrollTop(side1Pane.editor, resultPane.editor, model.side1ToResultLineRangeMap);
            resultPane.editor.getControl().setScrollTop(targetScrollTop);
        }

        if (shouldAlignBase) {
            basePane.editor.getControl().setScrollTop(scrollTop);
        } else {
            const targetScrollTop = this.computeTargetScrollTop(side1Pane.editor, basePane.editor, model.side1ToBaseLineRangeMap);
            basePane.editor.getControl().setScrollTop(targetScrollTop);
        }
    }

    protected handleSide2ScrollTopChanged(scrollTop: number): void {
        const { side1Pane, side2Pane, resultPane, basePane, shouldAlignBase, shouldAlignResult, model } = this.mergeEditor;

        side1Pane.editor.getControl().setScrollTop(scrollTop);

        if (shouldAlignResult) {
            resultPane.editor.getControl().setScrollTop(scrollTop);
        } else {
            const targetScrollTop = this.computeTargetScrollTop(side2Pane.editor, resultPane.editor, model.side2ToResultLineRangeMap);
            resultPane.editor.getControl().setScrollTop(targetScrollTop);
        }

        if (shouldAlignBase) {
            basePane.editor.getControl().setScrollTop(scrollTop);
        } else {
            const targetScrollTop = this.computeTargetScrollTop(side2Pane.editor, basePane.editor, model.side2ToBaseLineRangeMap);
            basePane.editor.getControl().setScrollTop(targetScrollTop);
        }
    }

    protected handleResultScrollTopChanged(scrollTop: number): void {
        const { side1Pane, side2Pane, resultPane, basePane, shouldAlignBase, shouldAlignResult, model } = this.mergeEditor;

        if (shouldAlignResult) {
            side1Pane.editor.getControl().setScrollTop(scrollTop);
            side2Pane.editor.getControl().setScrollTop(scrollTop);
        } else {
            const targetScrollTop = this.computeTargetScrollTop(resultPane.editor, side1Pane.editor, model.resultToSide1LineRangeMap);
            side1Pane.editor.getControl().setScrollTop(targetScrollTop);
            side2Pane.editor.getControl().setScrollTop(targetScrollTop);
            if (shouldAlignBase) {
                basePane.editor.getControl().setScrollTop(targetScrollTop);
            }
        }

        if (!shouldAlignBase) {
            const targetScrollTop = this.computeTargetScrollTop(resultPane.editor, basePane.editor, model.resultToBaseLineRangeMap);
            basePane.editor.getControl().setScrollTop(targetScrollTop);
        }
    }

    protected handleBaseScrollTopChanged(scrollTop: number): void {
        const { side1Pane, side2Pane, resultPane, basePane, shouldAlignBase, shouldAlignResult, model } = this.mergeEditor;

        if (shouldAlignBase) {
            side1Pane.editor.getControl().setScrollTop(scrollTop);
            side2Pane.editor.getControl().setScrollTop(scrollTop);
        } else {
            const targetScrollTop = this.computeTargetScrollTop(basePane.editor, side1Pane.editor, model.baseToSide1LineRangeMap);
            side1Pane.editor.getControl().setScrollTop(targetScrollTop);
            side2Pane.editor.getControl().setScrollTop(targetScrollTop);
            if (shouldAlignResult) {
                resultPane.editor.getControl().setScrollTop(targetScrollTop);
            }
        }

        if (!shouldAlignResult) {
            const targetScrollTop = this.computeTargetScrollTop(basePane.editor, resultPane.editor, model.baseToResultLineRangeMap);
            resultPane.editor.getControl().setScrollTop(targetScrollTop);
        }
    }

    protected computeTargetScrollTop(sourceEditor: MonacoEditor, targetEditor: MonacoEditor, lineRangeMap: DocumentLineRangeMap): number {
        const visibleRanges = sourceEditor.getVisibleRanges();
        if (visibleRanges.length === 0) {
            return 0;
        }

        const topLineNumber = visibleRanges[0].start.line;
        const scrollTop = sourceEditor.getControl().getScrollTop();

        let sourceStartTopPx: number;
        let sourceEndPx: number;
        let targetStartTopPx: number;
        let targetEndPx: number;

        if (topLineNumber === 0 && scrollTop <= sourceEditor.getControl().getTopForLineNumber(1)) { // special case: scrollTop is before or at the top of the first line
            sourceStartTopPx = 0;
            sourceEndPx = sourceEditor.getControl().getTopForLineNumber(1);

            targetStartTopPx = 0;
            targetEndPx = targetEditor.getControl().getTopForLineNumber(1);
        } else {
            const { originalRange: sourceRange, modifiedRange: targetRange } = lineRangeMap.projectLine(Math.max(topLineNumber - 1, 0));

            sourceStartTopPx = sourceEditor.getControl().getTopForLineNumber(sourceRange.startLineNumber + 1);
            sourceEndPx = sourceEditor.getControl().getTopForLineNumber(sourceRange.endLineNumberExclusive + 1);

            targetStartTopPx = targetEditor.getControl().getTopForLineNumber(targetRange.startLineNumber + 1);
            targetEndPx = targetEditor.getControl().getTopForLineNumber(targetRange.endLineNumberExclusive + 1);
        }

        const factor = Math.min(sourceEndPx === sourceStartTopPx ? 0 : (scrollTop - sourceStartTopPx) / (sourceEndPx - sourceStartTopPx), 1);
        const targetScrollTop = targetStartTopPx + (targetEndPx - targetStartTopPx) * factor;

        return targetScrollTop;
    }
}
