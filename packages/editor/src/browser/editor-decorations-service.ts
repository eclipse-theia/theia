/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { Range, DeltaDecorationParams, SetDecorationParams, TextEditor } from "./editor";
import { EditorManager } from "./editor-manager";
import { ContributionProvider } from "@theia/core";
import { DiffUris } from "./diff-uris";
import URI from "@theia/core/lib/common/uri";

export const EditorDecorationTypeProvider = Symbol('EditorDecorationTypeProvider');

@injectable()
export class EditorDecorationsService {

    constructor(
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(ContributionProvider) @named(EditorDecorationTypeProvider)
        protected readonly decorationTypeProviderContributions: ContributionProvider<EditorDecorationTypeProvider>
    ) { }

    /**
     * Applies decorations for given type and options in all visible editors, which opened a resource of the given uri.
     * Previous decoration of the same type are not preserved.
     *
     * To remove decorations of a type, pass an empty options array.
     */
    async setDecorations(params: SetDecorationParams): Promise<void> {
        const editor = await this.findEditorByUri(params.uri);
        if (editor) {
            editor.setDecorations(params);
        }
    }

    /**
     * Removes old decorations and applies new decorations in all visible editors, which opened a resource of the given uri.
     *
     * @returns identifiers of applied decorations, which can be used for removal in next call,
     * or `undefined` if no visible editor could be found for the given uri.
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

    protected _decorationTypes: DecorationType[] | undefined;
    getDecorationTypes(): DecorationType[] {
        if (!this._decorationTypes) {
            this._decorationTypes = [];
            const providers = this.decorationTypeProviderContributions.getContributions();
            for (const provider of providers) {
                this._decorationTypes.push(...provider.get());
            }
        }
        return this._decorationTypes;
    }
}

export interface EditorDecorationTypeProvider {
    get(): DecorationType[];
}

export interface DecorationType {
    type: string;

    /**
     * should the decoration be rendered for the whole line.
     * default is `false`.
     */
    isWholeLine?: boolean;
    /**
     * CSS property `background-color`, to be applied to a decoration.
     * use `rgba` values to play well with other decorations.
     */
    backgroundColor?: string;
    /**
     * CSS property `outline`.
     */
    outline?: string;
    /**
     * CSS property `outline-color`, to be applied to the text within a decoration.
     */
    outlineColor?: string;
    /**
     * CSS property `outline-style`, to be applied to the text within a decoration.
     */
    outlineStyle?: string;
    /**
     * CSS property `outline-width`, to be applied to the text within a decoration.
     */
    outlineWidth?: string;
    /**
     * CSS property `border`, to be applied to the text within a decoration.
     */
    border?: string;
    /**
     * CSS property `border-color`, to be applied to the text within a decoration.
     */
    borderColor?: string;
    /**
     * CSS property `border-style`, to be applied to the text within a decoration.
     */
    borderStyle?: string;
    /**
     * CSS property `border-width`, to be applied to the text within a decoration.
     */
    borderWidth?: string;
    /**
     * CSS property `color`.
     */
    color?: string;
    /**
     * CSS property `cursor`.
     */
    cursor?: string;
    /**
     * CSS property `font-style`.
     */
    fontStyle?: string;
    /**
     * CSS property `font-weight`.
     */
    fontWeight?: string;
    /**
     * CSS property `text-decoration`.
     */
    textDecoration?: string;
    /**
     * render this decoration in the overview ruler.
     */
    overviewRuler?: DecorationOverviewRulerOptions;
    /**
     * behavior of decorations when typing/editing near their edges.
     */
    rangeBehavior?: TrackedRangeStickiness;
    /**
     * options of the attachment to be inserted before the decorated text.
     */
    before?: AttachmentDecorationOptions;
    /**
     * options of the attachment to be inserted after the decorated text.
     */
    after?: AttachmentDecorationOptions;
}

export interface AttachmentDecorationOptions {
    /**
     * text content of the attachment to be inserted.
     */
    contentText?: string;
    /**
     * CSS property `color`, to be applied to the attachment.
     */
    color?: string;
    /**
     * CSS property `background-color`, to be applied to the attachment.
     */
    backgroundColor?: string;
    /**
     * CSS property `border`, to be applied to the attachment.
     */
    border?: string;
    /**
     * CSS property `height`, to be applied to the attachment.
     */
    height?: string;
    /**
     * CSS property `width`, to be applied to the attachment.
     */
    width?: string;
    /**
     * CSS property `margin`.
     */
    margin?: string;
    /**
     * CSS property `font-style`.
     */
    fontStyle?: string;
    /**
     * CSS property `font-weight`.
     */
    fontWeight?: string;
    /**
     * CSS property `text-decoration`.
     */
    textDecoration?: string;
}

export interface DecorationOptions {
    /**
     * range to which this decoration instance is applied.
     */
    range: Range;
    /**
     * hover message for this decoration.
     */
    hoverMessage?: string;
    /**
     * render options to be applied to this decoration instance.
     * if possible, `DecorationType` render options should be used.
     */
    renderOptions?: DecorationInstanceRenderOptions;
}

export interface DecorationInstanceRenderOptions {
    /**
     * options of the attachment to be inserted before the decorated text.
     */
    before?: AttachmentDecorationOptions;
    /**
     * options of the attachment to be inserted after the decorated text.
     */
    after?: AttachmentDecorationOptions;
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

export interface DeltaDecoration {
    /**
     * range to which this decoration instance is applied.
     */
    range: Range;
    /**
     * options to be applied with this decoration.
     */
    options: ModelDecorationOptions
}

export interface ModelDecorationOptions {
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
