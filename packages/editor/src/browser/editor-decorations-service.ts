/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Range, SetDecorationParams, DeltaDecorationParams, TextEditor } from "./editor";
import { EditorManager } from "./editor-manager";
import { DiffUris } from "./diff-uris";
import URI from "@theia/core/lib/common/uri";

@injectable()
export class EditorDecorationsService {

    protected readonly appliedDecorations = new Map<string, string[]>();

    constructor(
        @inject(EditorManager) protected readonly editorManager: EditorManager,
    ) { }

    /**
     * Applies new decorations of the given kind in an editor opened whith the given uri.
     * Previously applied decoration of the same kind are removed.
     *
     * To remove decorations of a kind, client should pass an empty array for new decorations.
     *
     * Clients should create qualified kinds for decorations to avoid colisions.
     */
    async setDecorations(params: SetDecorationParams): Promise<void> {
        const editor = await this.findEditorByUri(params.uri);
        if (editor) {
            const key = `${params.uri}#${params.kind}`;
            const oldDecorations = this.appliedDecorations.get(key) || [];
            const appliedDecorations = editor.deltaDecorations(<DeltaDecorationParams & SetDecorationParams>{ oldDecorations, ...params });
            this.appliedDecorations.set(key, appliedDecorations);
        }
    }

    /**
     * Removes old decorations and applies new decorations in an editor opened whith the given uri.
     *
     * @returns identifiers of applied decorations, which can be used to remove them in next call,
     * or `undefined` if no editor could be found with the given uri.
     */
    async deltaDecorations(params: DeltaDecorationParams): Promise<string[] | undefined> {
        const editor = await this.findEditorByUri(params.uri);
        if (editor) {
            return editor.deltaDecorations(params);
        }
        return undefined;
    }

    protected async findEditorByUri(uri: string): Promise<TextEditor | undefined> {
        const editorWidget = await this.editorManager.getByUri(new URI(uri));
        if (editorWidget) {
            const editorUri = editorWidget.editor.uri;
            const openedInEditor = editorUri.toString() === uri;
            const openedInDiffEditor = DiffUris.isDiffUri(editorUri) && DiffUris.decode(editorUri).some(u => u.toString() === uri);
            if (openedInEditor || openedInDiffEditor) {
                return editorWidget.editor;
            }
        }
        return undefined;
    }

}

export enum OverviewRulerLane {
    Left = 1,
    Center = 2,
    Right = 4,
    Full = 7
}

export enum TrackedRangeStickiness {
    AlwaysGrowsWhenTypingAtEdges = 0,
    NeverGrowsWhenTypingAtEdges = 1,
    GrowsOnlyWhenTypingBefore = 2,
    GrowsOnlyWhenTypingAfter = 3,
}

export interface EditorDecoration {
    /**
     * range to which this decoration instance is applied.
     */
    range: Range;
    /**
     * options to be applied with this decoration.
     */
    options: EditorDecorationOptions
}

export interface EditorDecorationOptions {
    /**
     * behavior of decorations when typing/editing near their edges.
     */
    stickiness?: TrackedRangeStickiness;
    /**
     * CSS class name of this decoration.
     */
    className?: string;
    /**
     * hover message for this decoration.
     */
    hoverMessage?: string;
    /**
     * the decoration will be rendered in the glyph margin with this class name.
     */
    glyphMarginClassName?: string;
    /**
     * hover message for the glyph margin of this decoration.
     */
    glyphMarginHoverMessage?: string;
    /**
     * should the decoration be rendered for the whole line.
     */
    isWholeLine?: boolean;
    /**
     * the decoration will be rendered in the lines decorations with this class name.
     */
    linesDecorationsClassName?: string;
    /**
     * the decoration will be rendered in the margin in full width with this class name.
     */
    marginClassName?: string;
    /**
     * the decoration will be rendered inline with this class name.
     * to be used only to change text, otherwise use `className`.
     */
    inlineClassName?: string;
    /**
     * the decoration will be rendered before the text with this class name.
     */
    beforeContentClassName?: string;
    /**
     * the decoration will be rendered after the text with this class name.
     */
    afterContentClassName?: string;
    /**
     * render this decoration in the overview ruler.
     */
    overviewRuler?: DecorationOverviewRulerOptions;
}

export interface DecorationOverviewRulerOptions {
    /**
     * color of the decoration in the overview ruler.
     * use `rgba` values to play well with other decorations.
     */
    color: string;
    /**
     * position in the overview ruler.
     */
    position?: OverviewRulerLane;
}
