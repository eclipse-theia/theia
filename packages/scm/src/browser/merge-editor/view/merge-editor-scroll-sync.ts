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
        return ScrollState.get(this.mergeEditor.resultPane.editor);
    }

    restoreScrollState(state: unknown): void {
        if (state instanceof ScrollState) {
            const { editor } = this.mergeEditor.resultPane;
            if (state.isEqual(ScrollState.get(editor))) {
                this.update();
            } else {
                state.restore(editor);
            }
        }
    }

    update(): void {
        if (this.isSyncing) {
            return;
        }
        this.isSyncing = true;
        try {
            const scrollTop = this.mergeEditor.resultPane.editor.getControl().getScrollTop();
            this.handleResultScrollTopChanged(scrollTop);
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
            const targetScrollTop = Math.min(
                this.computeTargetScrollTop(resultPane.editor, side1Pane.editor, model.resultToSide1LineRangeMap),
                this.computeTargetScrollTop(resultPane.editor, side2Pane.editor, model.resultToSide2LineRangeMap),
                shouldAlignBase ? this.computeTargetScrollTop(resultPane.editor, basePane.editor, model.resultToBaseLineRangeMap) : +Infinity
            );
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
            const targetScrollTop = Math.min(
                this.computeTargetScrollTop(basePane.editor, side1Pane.editor, model.baseToSide1LineRangeMap),
                this.computeTargetScrollTop(basePane.editor, side2Pane.editor, model.baseToSide2LineRangeMap),
                shouldAlignResult ? this.computeTargetScrollTop(basePane.editor, resultPane.editor, model.baseToResultLineRangeMap) : +Infinity
            );
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

        // The implementation ensures that, when the top or bottom of a line that is unchanged according to the given lineRangeMap
        // is displayed at the top of the source editor viewport, the top or bottom (respectively) of the corresponding line
        // according to the given lineRangeMap will be displayed at the top of the target editor viewport.
        // The implementation does its best to align all the other scrollTop positions proportionally.

        const visibleRanges = sourceEditor.getVisibleRanges();
        if (visibleRanges.length === 0) {
            return 0;
        }

        let topLineNumber = visibleRanges[0].start.line;
        const scrollTop = sourceEditor.getControl().getScrollTop();
        if (topLineNumber > 0 && scrollTop < sourceEditor.getControl().getTopForLineNumber(topLineNumber + 1)) {
            --topLineNumber;
        }

        let sourceStartPx: number;
        let sourceEndPx: number;
        let targetStartPx: number;
        let targetEndPx: number;

        if (topLineNumber === 0 && scrollTop <= sourceEditor.getControl().getTopForLineNumber(1)) { // special case: scrollTop is before or at the top of the first line
            sourceStartPx = 0;
            sourceEndPx = sourceEditor.getControl().getTopForLineNumber(1);

            targetStartPx = 0;
            targetEndPx = targetEditor.getControl().getTopForLineNumber(1);
        } else {
            const projectionResult = lineRangeMap.projectLine(topLineNumber);

            if (typeof projectionResult === 'number') { // the line is unchanged
                const targetLineNumber = projectionResult;

                sourceStartPx = sourceEditor.getControl().getTopForLineNumber(topLineNumber + 1);
                sourceEndPx = sourceEditor.getControl().getBottomForLineNumber(topLineNumber + 1);

                targetStartPx = targetEditor.getControl().getTopForLineNumber(targetLineNumber + 1);
                targetEndPx = targetEditor.getControl().getBottomForLineNumber(targetLineNumber + 1);

                if (scrollTop > sourceEndPx) { // scrollTop is in a view zone directly after the line
                    sourceStartPx = sourceEndPx;
                    sourceEndPx = sourceEditor.getControl().getTopForLineNumber(topLineNumber + 2);

                    targetStartPx = targetEndPx;
                    targetEndPx = targetEditor.getControl().getTopForLineNumber(targetLineNumber + 2);
                }
            } else {
                const { originalRange: sourceRange, modifiedRange: targetRange } = projectionResult;

                sourceStartPx = sourceEditor.getControl().getTopForLineNumber(sourceRange.startLineNumber + 1);
                sourceEndPx = sourceEditor.getControl().getTopForLineNumber(sourceRange.endLineNumberExclusive + 1);

                targetStartPx = targetEditor.getControl().getTopForLineNumber(targetRange.startLineNumber + 1);
                targetEndPx = targetEditor.getControl().getTopForLineNumber(targetRange.endLineNumberExclusive + 1);
            }
        }

        const factor = Math.min(sourceEndPx === sourceStartPx ? 0 : (scrollTop - sourceStartPx) / (sourceEndPx - sourceStartPx), 1);
        const targetScrollTop = targetStartPx + (targetEndPx - targetStartPx) * factor;

        return targetScrollTop;
    }
}

class ScrollState {

    static get(editor: MonacoEditor): ScrollState {
        const visibleRanges = editor.getVisibleRanges();
        if (visibleRanges.length === 0) {
            return new ScrollState(0, 0);
        }
        const scrollTop = editor.getControl().getScrollTop();
        let topLineNumber = visibleRanges[0].start.line;
        if (topLineNumber > 0 && scrollTop < editor.getControl().getTopForLineNumber(topLineNumber + 1, true)) {
            --topLineNumber;
        }
        return new ScrollState(scrollTop, topLineNumber);
    }

    restore(editor: MonacoEditor): void {
        editor.getControl().setScrollTop(this.scrollTop);
        if (this.topLineNumber !== ScrollState.get(editor).topLineNumber) { // this.scrollTop no longer corresponds to this.topLineNumber e.g. due to view zones having been changed
            // make sure that the top line position is restored, even if not precisely
            editor.getControl().setScrollTop(editor.getControl().getTopForLineNumber(this.topLineNumber + 1));
        }
    }

    isEqual(other: ScrollState): boolean {
        return this.scrollTop === other.scrollTop && this.topLineNumber === other.topLineNumber;
    }

    private constructor(
        private readonly scrollTop: number,
        private readonly topLineNumber: number
    ) { }
}
