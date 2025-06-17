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

import { injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core';
import { Autorun } from '@theia/core/lib/common/observable';
import { EditorDecoration, Range } from '@theia/editor/lib/browser';
import { MergeEditorPane } from './merge-editor-pane';
import { MergeRange } from '../../model/merge-range';
import { LineRange } from '../../model/line-range';

@injectable()
export class MergeEditorBasePane extends MergeEditorPane {

    constructor() {
        super();
        this.addClass('base');
    }

    override getLineRangeForMergeRange(mergeRange: MergeRange): LineRange {
        return mergeRange.baseRange;
    }

    protected override translateBaseRange(range: Range): Range {
        return range;
    }

    protected override onAfterMergeEditorSet(): void {
        super.onAfterMergeEditorSet();
        this.toDispose.push(Autorun.create(() => {
            const { currentPane, side1Pane, side1Title, side2Pane, side2Title } = this.mergeEditor;
            this.header.description = currentPane === this ? '' : nls.localizeByDefault('Comparing with {0}',
                currentPane === side1Pane ? side1Title : currentPane === side2Pane ? side2Title : nls.localizeByDefault('Result')
            );
        }));
    }

    protected override computeEditorDecorations(): EditorDecoration[] {
        const result: EditorDecoration[] = [];

        const { model, currentPane, side1Pane, side2Pane, currentMergeRange } = this.mergeEditor;

        for (const mergeRange of model.mergeRanges) {
            const lineRange = mergeRange.baseRange;
            result.push(this.toMergeRangeDecoration(lineRange, {
                isHandled: model.isMergeRangeHandled(mergeRange),
                isFocused: mergeRange === currentMergeRange,
                isAfterEnd: lineRange.startLineNumber > model.baseDocument.lineCount,
            }));
        }

        if (currentPane !== this) {
            const changes = currentPane === side1Pane ? model.side1Changes : currentPane === side2Pane ? model.side2Changes : model.resultChanges;
            result.push(...this.toChangeDecorations(changes, { diffSide: 'original' }));
        }
        return result;
    }
}
