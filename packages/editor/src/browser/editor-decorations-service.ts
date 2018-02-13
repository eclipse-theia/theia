/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { Range } from "./editor";
import { EditorManager } from "./editor-manager";
import { ContributionProvider } from "@theia/core";
import { DiffUris } from "./diff-uris";

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
     * To remove decorations of a type, pass an empty options array.
     */
    setDecorations(uri: string, type: string, options: DecorationOptions[]): void {
        this.editorManager.editors.forEach(editorWidget => {
            if (!editorWidget.isVisible) {
                return;
            }
            const editorUri = editorWidget.editor.uri;
            if (editorUri.toString() === uri) {
                editorWidget.editor.setDecorations({ type, uri, options });
            } else if (DiffUris.isDiffUri(editorUri)) {
                const [uriLeft, uriRight] = DiffUris.decode(editorUri);
                if (uriLeft.toString() === uri || uriRight.toString() === uri) {
                    editorWidget.editor.setDecorations({ type, uri, options });
                }
            }
        });
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
     * CSS property `border`, to be applied to the text within a decoration.
     */
    border?: string;
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
     * color of the decoration in the overview ruler.
     * use `rgba` values to play well with other decorations.
     */
    overviewRulerColor?: string;
    /**
     * position in the overview ruler.
     */
    overviewRulerLane?: OverviewRulerLane;
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
