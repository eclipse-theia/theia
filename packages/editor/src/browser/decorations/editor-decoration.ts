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

import { Range } from '../editor';

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
