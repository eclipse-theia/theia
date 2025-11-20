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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core';
import { Autorun, DerivedObservable, Observable, ObservableFromEvent } from '@theia/core/lib/common/observable';
import { BoxPanel, Message } from '@theia/core/lib/browser';
import { EditorDecoration, EditorWidget, MinimapPosition, OverviewRulerLane, Position, Range, TrackedRangeStickiness } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoToProtocolConverter } from '@theia/monaco/lib/browser/monaco-to-protocol-converter';
import { Selection } from '@theia/monaco-editor-core';
import { MergeEditorPaneHeader, MergeEditorPaneToolbarItem } from './merge-editor-pane-header';
import { MergeEditor } from '../../merge-editor';
import { MergeRange } from '../../model/merge-range';
import { DetailedLineRangeMapping } from '../../model/range-mapping';
import { LineRange } from '../../model/line-range';
import { RangeUtils } from '../../model/range-utils';
import { ScmColors } from '../../../scm-colors';

@injectable()
export abstract class MergeEditorPane extends BoxPanel {

    @inject(MergeEditorPaneHeader)
    readonly header: MergeEditorPaneHeader;

    @inject(EditorWidget)
    readonly editorWidget: EditorWidget;

    @inject(MonacoToProtocolConverter)
    private readonly m2p: MonacoToProtocolConverter;

    get editor(): MonacoEditor {
        return MonacoEditor.get(this.editorWidget)!;
    }

    protected _mergeEditor: MergeEditor;

    protected cursorPositionObservable: Observable<Position>;
    protected cursorLineObservable: Observable<number>;
    protected selectionObservable: Observable<Range[] | undefined>;

    protected readonly toDispose = new DisposableCollection();

    constructor() {
        super({ spacing: 0 });
        this.addClass('editor-pane');
    }

    @postConstruct()
    protected init(): void {
        this.cursorPositionObservable = ObservableFromEvent.create(this.editor.onCursorPositionChanged, () => this.editor.cursor);
        this.cursorLineObservable = DerivedObservable.create(() => this.cursorPositionObservable.get().line);
        this.selectionObservable = ObservableFromEvent.create(this.editor.getControl().onDidChangeCursorSelection, () => {
            const selections = this.editor.getControl().getSelections();
            return selections?.map(selection => this.m2p.asRange(selection));
        });

        BoxPanel.setStretch(this.header, 0);
        BoxPanel.setStretch(this.editorWidget, 1);

        this.addWidget(this.header);
        this.addWidget(this.editorWidget);
    }

    override dispose(): void {
        super.dispose();
        this.toDispose.dispose();
    }

    get mergeEditor(): MergeEditor {
        return this._mergeEditor;
    }

    set mergeEditor(mergeEditor: MergeEditor) {
        if (this._mergeEditor) {
            throw new Error('Merge editor has already been set');
        }
        this._mergeEditor = mergeEditor;
        this.onAfterMergeEditorSet();
    }

    protected onAfterMergeEditorSet(): void {
        this.initContextKeys();

        const toolbarItems = DerivedObservable.create(() => this.getToolbarItems());
        this.toDispose.push(Autorun.create(() => {
            this.header.toolbarItems = toolbarItems.get();
        }));

        this.initSelectionSynchronizer();

        let decorationIds: string[] = [];
        const decorations = DerivedObservable.create(() => this.computeEditorDecorations());
        const isVisible = ObservableFromEvent.create(this.editorWidget.onDidChangeVisibility, () => this.editorWidget.isVisible);

        this.toDispose.push(Autorun.create(() => {
            if (this.mergeEditor.isShown && isVisible.get()) {
                decorationIds = this.editor.deltaDecorations({ oldDecorations: decorationIds, newDecorations: decorations.get() });
            }
        }));
        this.toDispose.push(Disposable.create(() =>
            decorationIds = this.editor.deltaDecorations({ oldDecorations: decorationIds, newDecorations: [] })
        ));
    }

    get cursorPosition(): Position {
        return this.cursorPositionObservable.get();
    }

    get cursorLine(): number {
        return this.cursorLineObservable.get();
    }

    get selection(): Range[] | undefined {
        return this.selectionObservable.get();
    }

    goToMergeRange(mergeRange: MergeRange, options?: { reveal?: boolean }): void {
        const { editor } = this;
        const { startLineNumber, endLineNumberExclusive } = this.getLineRangeForMergeRange(mergeRange);
        editor.cursor = { line: startLineNumber, character: 0 };
        const reveal = options?.reveal ?? true;
        if (reveal) {
            editor.getControl().revealLinesNearTop(startLineNumber + 1, endLineNumberExclusive + 1);
        }
    }

    abstract getLineRangeForMergeRange(mergeRange: MergeRange): LineRange;

    protected abstract translateBaseRange(range: Range): Range;

    protected getToolbarItems(): MergeEditorPaneToolbarItem[] {
        return [];
    }

    protected computeEditorDecorations(): EditorDecoration[] {
        return [];
    }

    protected toMergeRangeDecoration(lineRange: LineRange,
        { isHandled, isFocused, isAfterEnd }: { isHandled: boolean, isFocused: boolean, isAfterEnd: boolean }
    ): EditorDecoration {
        const blockClassNames = ['merge-range'];
        let blockPadding: [top: number, right: number, bottom: number, left: number] = [0, 0, 0, 0];
        if (isHandled) {
            blockClassNames.push('handled');
        }
        if (isFocused) {
            blockClassNames.push('focused');
            blockPadding = [0, 2, 0, 2];
        }
        return {
            range: lineRange.toInclusiveRangeOrEmpty(),
            options: {
                blockClassName: blockClassNames.join(' '),
                blockPadding,
                blockIsAfterEnd: isAfterEnd,
                minimap: {
                    position: MinimapPosition.Gutter,
                    color: { id: isHandled ? ScmColors.handledConflictMinimapOverviewRulerColor : ScmColors.unhandledConflictMinimapOverviewRulerColor },
                },
                overviewRuler: {
                    position: OverviewRulerLane.Center,
                    color: { id: isHandled ? ScmColors.handledConflictMinimapOverviewRulerColor : ScmColors.unhandledConflictMinimapOverviewRulerColor },
                },
                showIfCollapsed: true,
                stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            }
        };
    }

    protected toChangeDecorations(changes: readonly DetailedLineRangeMapping[],
        { diffSide }: { diffSide: 'original' | 'modified' }
    ): EditorDecoration[] {
        const result: EditorDecoration[] = [];
        for (const change of changes) {
            const changeRange = (diffSide === 'original' ? change.originalRange : change.modifiedRange).toInclusiveRange();
            if (changeRange) {
                result.push({
                    range: changeRange,
                    options: {
                        className: 'diff',
                        isWholeLine: true,
                        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                    }
                });
            }

            for (const rangeMapping of change.rangeMappings) {
                const range = diffSide === 'original' ? rangeMapping.originalRange : rangeMapping.modifiedRange;
                result.push({
                    range,
                    options: {
                        className: RangeUtils.isEmpty(range) ? 'diff-empty-word' : 'diff-word',
                        showIfCollapsed: true,
                        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                    },
                });
            }
        }
        return result;
    }

    protected initContextKeys(): void {
        const editor = this.editor.getControl();
        editor.createContextKey('isMergeEditor', true);
        editor.createContextKey('mergeEditorBaseUri', this.mergeEditor.baseUri.toString());
        editor.createContextKey('mergeEditorResultUri', this.mergeEditor.resultUri.toString());
    }

    protected initSelectionSynchronizer(): void {
        const selectionObservable = DerivedObservable.create(() => {
            const { selectionInBase, currentPane } = this.mergeEditor;
            if (!selectionInBase || currentPane === this) {
                return [];
            }
            return selectionInBase.map(range => this.translateBaseRange(range));
        });
        this.toDispose.push(Autorun.create(() => {
            const selection = selectionObservable.get();
            if (selection.length) {
                this.editor.getControl().setSelections(selection.map(
                    ({ start, end }) => new Selection(start.line + 1, start.character + 1, end.line + 1, end.character + 1)
                ));
            }
        }));
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.editorWidget.activate();
    }
}
