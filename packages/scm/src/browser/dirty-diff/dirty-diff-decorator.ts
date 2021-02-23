/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import {
    Range,
    Position,
    EditorDecoration,
    EditorDecorationOptions,
    OverviewRulerLane,
    EditorDecorator,
    TextEditor,
    MinimapPosition
} from '@theia/editor/lib/browser';
import { DirtyDiff, LineRange } from './diff-computer';

export enum DirtyDiffDecorationType {
    AddedLine = 'dirty-diff-added-line',
    RemovedLine = 'dirty-diff-removed-line',
    ModifiedLine = 'dirty-diff-modified-line',
}

const AddedLineDecoration = <EditorDecorationOptions>{
    linesDecorationsClassName: 'dirty-diff-glyph dirty-diff-added-line',
    overviewRuler: {
        color: {
            id: 'editorOverviewRuler.addedForeground'
        },
        position: OverviewRulerLane.Left,
    },
    minimap: {
        color: {
            id: 'minimapGutter.addedBackground'
        },
        position: MinimapPosition.Gutter
    },
    isWholeLine: true
};

const RemovedLineDecoration = <EditorDecorationOptions>{
    linesDecorationsClassName: 'dirty-diff-glyph dirty-diff-removed-line',
    overviewRuler: {
        color: {
            id: 'editorOverviewRuler.deletedForeground'
        },
        position: OverviewRulerLane.Left,
    },
    minimap: {
        color: {
            id: 'minimapGutter.deletedBackground'
        },
        position: MinimapPosition.Gutter
    },
    isWholeLine: false
};

const ModifiedLineDecoration = <EditorDecorationOptions>{
    linesDecorationsClassName: 'dirty-diff-glyph dirty-diff-modified-line',
    overviewRuler: {
        color: {
            id: 'editorOverviewRuler.modifiedForeground'
        },
        position: OverviewRulerLane.Left,
    },
    minimap: {
        color: {
            id: 'minimapGutter.modifiedBackground'
        },
        position: MinimapPosition.Gutter
    },
    isWholeLine: true
};

export interface DirtyDiffUpdate extends DirtyDiff {
    readonly editor: TextEditor;
}

@injectable()
export class DirtyDiffDecorator extends EditorDecorator {

    applyDecorations(update: DirtyDiffUpdate): void {
        const modifications = update.modified.map(range => this.toDeltaDecoration(range, ModifiedLineDecoration));
        const additions = update.added.map(range => this.toDeltaDecoration(range, AddedLineDecoration));
        const removals = update.removed.map(line => this.toDeltaDecoration(line, RemovedLineDecoration));
        const decorations = [...modifications, ...additions, ...removals];
        this.setDecorations(update.editor, decorations);
    }

    protected toDeltaDecoration(from: LineRange | number, options: EditorDecorationOptions): EditorDecoration {
        const [start, end] = (typeof from === 'number') ? [from, from] : [from.start, from.end];
        const range = Range.create(Position.create(start, 0), Position.create(end, 0));
        return { range, options };
    }
}
