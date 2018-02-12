/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { Event, Emitter } from '../../common/event';

/**
 * CSS styles for the tree decorators.
 */
export namespace DecoratorStyles {
    export const CAPTION_PREFIX = 'theia-caption-prefix';
    export const CAPTION_SUFFIX = 'theia-caption-suffix';
    export const ICON_WRAPPER = 'theia-icon-wrapper';
    export const DECORATOR_SIZE = 'theia-decorator-size';
    export const TOP_RIGHT = 'theia-top-right';
    export const BOTTOM_RIGHT = 'theia-bottom-right';
    export const BOTTOM_LEFT = 'theia-bottom-left';
    export const TOP_LEFT = 'theia-top-left';
}

/**
 * Tree decorator service that can change the outlook and the style of the tree items within a widget.
 */
export const TreeDecorator = Symbol('TreeDecorator');
export interface TreeDecorator {

    /**
     * The unique identifier of the decorator. Ought to be unique in the application.
     */
    readonly id: string;

    /**
     * Fired when the decoration has calculated all the decoration data. Keys are the identifiers of the tree items.
     */
    onDidChangeDecorations: Event<Map<string, DecorationData>>;

}

/**
 * Decorator service which emits events from all known tree decorators.
 */
export const TreeDecoratorService = Symbol('TreeDecoratorService');
export interface TreeDecoratorService {

    /**
     * Fired when any of the available tree decorators has changes.
     */
    onDidChangeDecorations: Event<Map<string, DecorationData[]>>;

}

/**
 * The default tree decorator service. Does nothing at all. One has to rebind to a concrete implementation
 * if decorators have to be supported in the tree widget.
 */
@injectable()
export class NoopTreeDecoratorService {

    private emitter: Emitter<Map<string, DecorationData[]>> = new Emitter();

    get onDidChangeDecorations() {
        return this.emitter.event;
    }

}

/**
 * Here we have merged the `font-style`, `font-weight`, and the `text-decoration` together.
 */
export type FontStyle = 'normal' | 'bold' | 'italic' | 'oblique' | 'underline' | 'line-through';

/**
 * A string that could be:
 *
 *  - one of the browser colors, (E.g.: `blue`, `red`, `magenta`),
 *  - the case insensitive hexadecimal color code, (for instance, `#ee82ee`, `#20B2AA`, `#f09` ), or
 *  - either the `rgb()` or the `rgba()` functions.
 *
 * For more details, see: https://developer.mozilla.org/en-US/docs/Web/CSS/color_value.
 *
 * Note, it is highly recommended to use one of the predefined colors of Theia, so the desired color will
 * look nice with both the `light` and the `dark` theme too.
 */
export type Color = string;

/**
 * Encapsulates styling and outlook information of the font.
 */
export interface FontData {

    /**
     * Zero to any font style.
     */
    readonly style?: FontStyle | FontStyle[];

    /**
     * The color of the font.
     */
    readonly color?: Color;

}

/**
 * Arbitrary information that has to be shown either before or after the caption as a prefix or a suffix.
 */
export interface CaptionAffix {

    /**
     * The text content of the prefix or the suffix.
     */
    readonly data: string;

    /**
     * Font data for customizing the prefix of the suffix.
     */
    readonly fontData?: FontData;

}

/**
 * Enumeration for the quadrant to overlay the image on.
 */
export enum IconOverlayPosition {

    /**
     * Overlays the top right quarter of the original image.
     */
    TOP_RIGHT,

    /**
     * Overlays the bottom right of the original image.
     */
    BOTTOM_RIGHT,

    /**
     * Overlays the bottom left segment of the original image.
     */
    BOTTOM_LEFT,

    /**
     * Occupies the top left quarter of the original icon.
     */
    TOP_LEFT

}

export namespace IconOverlayPosition {

    /**
     * Returns with the CSS class style for the enum.
     */
    export function getStyle(position: IconOverlayPosition): string {
        switch (position) {
            case IconOverlayPosition.TOP_RIGHT: return DecoratorStyles.TOP_RIGHT;
            case IconOverlayPosition.BOTTOM_RIGHT: return DecoratorStyles.BOTTOM_RIGHT;
            case IconOverlayPosition.BOTTOM_LEFT: return DecoratorStyles.BOTTOM_LEFT;
            case IconOverlayPosition.TOP_LEFT: return DecoratorStyles.TOP_LEFT;
        }
    }

}

/**
 * Has not effect if the tree node being decorated has no associated icon.
 */
export interface IconOverlay {

    /**
     * The position where the decoration will be placed on the top of the original icon.
     */
    readonly position: IconOverlayPosition;

    /**
     * This should be the name of the Font Awesome icon with out the `fa fa-` prefix, just the name, for instance `paw`.
     * For the existing icons, see here: https://fontawesome.com/v4.7.0/icons/.
     */
    readonly icon: string;

    /**
     * The color of the overlaying icon. If not specified, then the default icon color will be used.
     */
    readonly color?: Color;

}

/**
 * Encapsulates outlook and styling information that has to be applied on the tree node which we decorate.
 */
export interface DecorationData {

    /**
     * The higher number has higher priority. If not specified, treated as `0`.
     * When multiple decorators are available for the same item, and decoration data cannot be merged together,
     * then the higher priority item will be applied on the decorated element and the lower priority will be ignored.
     */
    readonly priority?: number;

    /**
     * The font data for the caption.
     */
    readonly fontData?: FontData;

    /**
     * The background color of the entire row.
     */
    readonly backgroundColor?: Color;

    /**
     * Optional prefix of the caption.
     */
    readonly captionPrefix?: CaptionAffix;

    /**
     * Suffixes that might come after the caption as an additional information.
     */
    readonly captionSuffix?: CaptionAffix[];

    /**
     * Custom tooltip for the decorated item. Tooltip will be appended to the original tooltip, if any.
     */
    readonly tooltip?: string;

    /**
     * Sets the color of the icon. Ignored if the decorated item has no icon.
     */
    readonly iconColor?: Color;

    /**
     * Has not effect if given, but the tree node does not have an associated image.
     */
    readonly iconOverlay?: IconOverlay;

}

export namespace DecorationData {
    export const compare = (left: DecorationData, right: DecorationData): number => (left.priority || 0) - (right.priority || 0);
}
