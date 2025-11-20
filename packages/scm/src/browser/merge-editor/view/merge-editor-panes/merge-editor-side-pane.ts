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

import { inject, injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core';
import { ObservableUtils } from '@theia/core/lib/common/observable';
import { codicon, DiffUris, LabelProvider, open, OpenerService } from '@theia/core/lib/browser';
import { EditorDecoration, EditorOpenerOptions, Range } from '@theia/editor/lib/browser';
import { MergeRange, MergeRangeAcceptedState, MergeSide } from '../../model/merge-range';
import { MergeEditorPane } from './merge-editor-pane';
import { MergeEditorPaneToolbarItem } from './merge-editor-pane-header';
import { LineRange } from '../../model/line-range';

@injectable()
export abstract class MergeEditorSidePane extends MergeEditorPane {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    abstract get mergeSide(): MergeSide;

    constructor() {
        super();
        this.addClass('side');
    }

    override getLineRangeForMergeRange(mergeRange: MergeRange): LineRange {
        return mergeRange.getModifiedRange(this.mergeSide);
    }

    protected override translateBaseRange(range: Range): Range {
        return this.mergeEditor.model.translateBaseRangeToSide(range, this.mergeSide);
    }

    async acceptAllChanges(): Promise<void> {
        const { model, resultPane } = this.mergeEditor;
        resultPane.activate();
        const selections = resultPane.editor.getControl().getSelections();
        for (const mergeRange of model.mergeRanges) {
            await ObservableUtils.waitForState(model.isUpToDateObservable);
            resultPane.goToMergeRange(mergeRange, { reveal: false });
            let state = model.getMergeRangeResultState(mergeRange);
            if (state === 'Unrecognized') {
                state = 'Base';
            }
            model.applyMergeRangeAcceptedState(mergeRange, MergeRangeAcceptedState.addSide(state, this.mergeSide));
        }
        if (selections) {
            resultPane.editor.getControl().setSelections(selections);
        }
    }

    compareWithBase(): void {
        let label = this.labelProvider.getName(this.editor.uri);
        if (label) {
            label += ': ';
        }
        label += `${nls.localizeByDefault('Base')} ⟷ ${this.header.title.label}`;
        const options: EditorOpenerOptions = { selection: { start: this.editor.cursor } };
        open(this.openerService, DiffUris.encode(this.mergeEditor.baseUri, this.editor.uri, label), options).catch(e => {
            console.error(e);
        });
    }

    protected override getToolbarItems(): MergeEditorPaneToolbarItem[] {
        return [
            {
                id: 'acceptAllChanges',
                tooltip: nls.localizeByDefault(this.mergeSide === 1 ? 'Accept All Changes from Left' : 'Accept All Changes from Right'),
                className: codicon('check-all', true),
                onClick: () => this.acceptAllChanges()
            },
            {
                id: 'compareWithBase',
                tooltip: nls.localizeByDefault('Compare With Base'),
                className: codicon('compare-changes', true),
                onClick: () => this.compareWithBase()
            }
        ];
    }

    protected override computeEditorDecorations(): EditorDecoration[] {
        const result: EditorDecoration[] = [];

        const { model, currentMergeRange } = this.mergeEditor;
        const document = this.mergeSide === 1 ? model.side1Document : model.side2Document;

        for (const mergeRange of model.mergeRanges) {
            const lineRange = mergeRange.getModifiedRange(this.mergeSide);
            result.push(this.toMergeRangeDecoration(lineRange, {
                isHandled: model.isMergeRangeHandled(mergeRange),
                isFocused: mergeRange === currentMergeRange,
                isAfterEnd: lineRange.startLineNumber > document.lineCount,
            }));
        }

        const changes = this.mergeSide === 1 ? model.side1Changes : model.side2Changes;
        result.push(...this.toChangeDecorations(changes, { diffSide: 'modified' }));
        return result;
    }
}

@injectable()
export class MergeEditorSide1Pane extends MergeEditorSidePane {

    readonly mergeSide = 1;

    constructor() {
        super();
        this.addClass('side1');
    }
}

@injectable()
export class MergeEditorSide2Pane extends MergeEditorSidePane {

    readonly mergeSide = 2;

    constructor() {
        super();
        this.addClass('side2');
    }
}
