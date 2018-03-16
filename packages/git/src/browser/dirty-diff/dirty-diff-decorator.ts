/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { Range, Position, EditorDecoration, EditorDecorationOptions, OverviewRulerLane, TextEditor } from '@theia/editor/lib/browser';
import { DirtyDiffUpdate } from './dirty-diff-manager';
import { LineRange } from './diff-computer';

export enum DirtyDiffDecorationType {
    AddedLine = 'dirty-diff-added-line',
    RemovedLine = 'dirty-diff-removed-line',
    ModifiedLine = 'dirty-diff-modified-line',
}

const AddedLineDecoration = <EditorDecorationOptions>{
    linesDecorationsClassName: 'dirty-diff-glyph dirty-diff-added-line',
    overviewRuler: {
        color: 'rgba(0, 255, 0, 0.8)',
        position: OverviewRulerLane.Left,
    }
};

const RemovedLineDecoration = <EditorDecorationOptions>{
    linesDecorationsClassName: 'dirty-diff-glyph dirty-diff-removed-line',
    overviewRuler: {
        color: 'rgba(230, 0, 0, 0.8)',
        position: OverviewRulerLane.Left,
    }
};

const ModifiedLineDecoration = <EditorDecorationOptions>{
    linesDecorationsClassName: 'dirty-diff-glyph dirty-diff-modified-line',
    overviewRuler: {
        color: 'rgba(0, 100, 150, 0.8)',
        position: OverviewRulerLane.Left,
    }
};

@injectable()
export class DirtyDiffDecorator {

    applyDecorations(update: DirtyDiffUpdate): void {
        const modifications = update.modified.map(range => this.toDeltaDecoration(range, ModifiedLineDecoration));
        const additions = update.added.map(range => this.toDeltaDecoration(range, AddedLineDecoration));
        const removals = update.removed.map(line => this.toDeltaDecoration(line, RemovedLineDecoration));
        const decorations = [...modifications, ...additions, ...removals];
        this.setDecorations(update.editor, decorations);
    }

    protected appliedDecorations = new Map<string, string[]>();

    protected async setDecorations(editor: TextEditor, newDecorations: EditorDecoration[]) {
        const uri = editor.uri.toString();
        const oldDecorations = this.appliedDecorations.get(uri) || [];
        if (oldDecorations.length === 0 && newDecorations.length === 0) {
            return;
        }
        const decorationIds = await editor.deltaDecorations({ uri, oldDecorations, newDecorations });
        this.appliedDecorations.set(uri, decorationIds);
    }

    protected toDeltaDecoration(from: LineRange | number, options: EditorDecorationOptions): EditorDecoration {
        const [start, end] = (typeof from === 'number') ? [from, from] : [from.start, from.end];
        const range = Range.create(Position.create(start, 0), Position.create(end, 0));
        return { range, options };
    }
}
