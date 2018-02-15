/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { Event, Emitter } from '../../common/event';

/**
 * Tree decorator that can change the outlook and the style of the tree items within a widget.
 */
export const TreeDecorator = Symbol('TreeDecorator');
export interface TreeDecorator {

    /**
     * The unique identifier of the decorator. Ought to be unique in the application.
     */
    readonly id: string;

    /**
     * Fired when this decorator has calculated all the decoration data for the tree nodes. Keys are the unique identifier of the tree nodes.
     */
    readonly onDidChangeDecorations: Event<Map<string, TreeDecoration.Data>>;

}

/**
 * Decorator service which emits events from all known tree decorators.
 */
export const TreeDecoratorService = Symbol('TreeDecoratorService');
export interface TreeDecoratorService {

    /**
     * Fired when any of the available tree decorators has changes. Keys are the unique tree node IDs and the values
     * are the decoration data collected from all the decorators known by this service.
     */
    readonly onDidChangeDecorations: Event<Map<string, TreeDecoration.Data[]>>;

}

/**
 * The default tree decorator service. Does nothing at all. One has to rebind to a concrete implementation
 * if decorators have to be supported in the tree widget.
 */
@injectable()
export class NoopTreeDecoratorService implements TreeDecoratorService {

    private emitter: Emitter<Map<string, TreeDecoration.Data[]>> = new Emitter();

    readonly onDidChangeDecorations = this.emitter.event;

}

/**
 * Abstract decorator service implementation which emits events from all known tree decorators and caches the current state.
 */
@injectable()
export abstract class AbstractTreeDecoratorService implements TreeDecoratorService {

    protected readonly emitter: Emitter<Map<string, TreeDecoration.Data[]>>;
    protected readonly decorations: Map<string, Map<string, TreeDecoration.Data>>;

    constructor(protected readonly decorators: ReadonlyArray<TreeDecorator>) {
        this.emitter = new Emitter();
        this.decorations = new Map();
        this.decorators.forEach(decorator => {
            const { id } = decorator;
            decorator.onDidChangeDecorations(data => {
                this.decorations.set(id, data);
                const changes = new Map();
                Array.from(this.decorations.values()).forEach(decorations => {
                    Array.from(decorations.entries()).forEach(keyIdPair => {
                        const [nodeId, nodeData] = keyIdPair;
                        if (changes.has(nodeId)) {
                            changes.get(nodeId)!.push(nodeData);
                        } else {
                            changes.set(nodeId, [nodeData]);
                        }
                    });
                });
                this.emitter.fire(changes);
            });
        });
    }

    get onDidChangeDecorations(): Event<Map<string, TreeDecoration.Data[]>> {
        return this.emitter.event;
    }

}

/**
 * Namespace for the decoration data and the styling refinements for the decorated tree nodes.
 */
export namespace TreeDecoration {

    /**
     * CSS styles for the tree decorators.
     */
    export namespace Styles {
        export const CAPTION_PREFIX_CLASS = 'theia-caption-prefix';
        export const CAPTION_SUFFIX_CLASS = 'theia-caption-suffix';
        export const ICON_WRAPPER_CLASS = 'theia-icon-wrapper';
        export const DECORATOR_SIZE_CLASS = 'theia-decorator-size';
        export const TOP_RIGHT_CLASS = 'theia-top-right';
        export const BOTTOM_RIGHT_CLASS = 'theia-bottom-right';
        export const BOTTOM_LEFT_CLASS = 'theia-bottom-left';
        export const TOP_LEFT_CLASS = 'theia-top-left';
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
                case IconOverlayPosition.TOP_RIGHT: return TreeDecoration.Styles.TOP_RIGHT_CLASS;
                case IconOverlayPosition.BOTTOM_RIGHT: return TreeDecoration.Styles.BOTTOM_RIGHT_CLASS;
                case IconOverlayPosition.BOTTOM_LEFT: return TreeDecoration.Styles.BOTTOM_LEFT_CLASS;
                case IconOverlayPosition.TOP_LEFT: return TreeDecoration.Styles.TOP_LEFT_CLASS;
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
    export interface Data {

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
        readonly captionSuffixes?: CaptionAffix[];

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

    export namespace Data {

        /**
         * Compares the decoration data based on the priority. Lowest priorities come first.
         */
        export const comparePriority = (left: Data, right: Data): number => (left.priority || 0) - (right.priority || 0);

    }

}
