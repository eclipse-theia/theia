/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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
import { CommentInfoMain } from './comments-service';
import { CommentingRanges, Range } from '../../../common/plugin-api-rpc-model';

@injectable()
export class CommentingRangeDecorator {

    private decorationOptions: monaco.editor.IModelDecorationOptions;
    private commentingRangeDecorations: CommentingRangeDecoration[] = [];

    constructor() {
        this.decorationOptions = {
            isWholeLine: true,
            linesDecorationsClassName: 'comment-range-glyph comment-diff-added'
        };
    }

    public update(editor: monaco.editor.ICodeEditor, commentInfos: CommentInfoMain[]): void {
        const model = editor.getModel();
        if (!model) {
            return;
        }

        const commentingRangeDecorations: CommentingRangeDecoration[] = [];
        for (const info of commentInfos) {
            info.commentingRanges.ranges.forEach(range => {
                commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.owner, info.extensionId, info.label,
                    range, this.decorationOptions, info.commentingRanges));
            });
        }

        const oldDecorations = this.commentingRangeDecorations.map(decoration => decoration.id);
        editor.deltaDecorations(oldDecorations, []);

        this.commentingRangeDecorations = commentingRangeDecorations;
    }

    public getMatchedCommentAction(line: number): { ownerId: string, extensionId: string | undefined, label: string | undefined, commentingRangesInfo: CommentingRanges }[] {
        const result = [];
        for (const decoration of this.commentingRangeDecorations) {
            const range = decoration.getActiveRange();
            if (range && range.startLineNumber <= line && line <= range.endLineNumber) {
                result.push(decoration.getCommentAction());
            }
        }

        return result;
    }
}

class CommentingRangeDecoration {
    private decorationId: string;

    public get id(): string {
        return this.decorationId;
    }

    constructor(private _editor: monaco.editor.ICodeEditor, private _ownerId: string, private _extensionId: string | undefined,
        private _label: string | undefined, private _range: Range, commentingOptions: monaco.editor.IModelDecorationOptions,
        private commentingRangesInfo: CommentingRanges) {
        const startLineNumber = _range.startLineNumber;
        const endLineNumber = _range.endLineNumber;
        const commentingRangeDecorations = [{
            range: {
                startLineNumber: startLineNumber, startColumn: 1,
                endLineNumber: endLineNumber, endColumn: 1
            },
            options: commentingOptions
        }];

        this.decorationId = this._editor.deltaDecorations([], commentingRangeDecorations)[0];
    }

    public getCommentAction(): { ownerId: string, extensionId: string | undefined, label: string | undefined, commentingRangesInfo: CommentingRanges } {
        return {
            extensionId: this._extensionId,
            label: this._label,
            ownerId: this._ownerId,
            commentingRangesInfo: this.commentingRangesInfo
        };
    }

    public getOriginalRange(): Range {
        return this._range;
    }

    public getActiveRange(): Range | undefined {
        const range = this._editor.getModel()!.getDecorationRange(this.decorationId);
        if (range) {
            return range;
        }
    }
}
