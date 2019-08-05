/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

/**
 * Namespace for the decoration data and the styling refinements for the decorated widgets.
 */
export namespace WidgetDecoration {

    /**
     * CSS styles for the decorators.
     */
    export namespace Styles {
        export const CAPTION_HIGHLIGHT_CLASS = 'theia-caption-highlight';
        export const CAPTION_PREFIX_CLASS = 'theia-caption-prefix';
        export const CAPTION_SUFFIX_CLASS = 'theia-caption-suffix';
        export const ICON_WRAPPER_CLASS = 'theia-icon-wrapper';
        export const DECORATOR_SIZE_CLASS = 'theia-decorator-size';
        export const DECORATOR_SIDEBAR_SIZE_CLASS = 'theia-decorator-sidebar-size';
        export const TOP_RIGHT_CLASS = 'theia-top-right';
        export const BOTTOM_RIGHT_CLASS = 'theia-bottom-right';
        export const BOTTOM_RIGHT_SIDEBAR_CLASS = 'theia-bottom-right-sidebar';
        export const BOTTOM_LEFT_CLASS = 'theia-bottom-left';
        export const TOP_LEFT_CLASS = 'theia-top-left';
    }
    /**
     * For the sake of simplicity, we have merged the `font-style`, `font-weight`, and the `text-decoration` together.
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
     * Encapsulates styling information of the font.
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
    export interface BaseTailDecoration {
        /**
         * Optional tooltip for the tail decoration.
         */
        readonly tooltip?: string;
    }
    /**
     * Unlike caption suffixes, tail decorations appears right-aligned after the caption and the caption suffixes (is any).
     */
    export interface TailDecoration extends BaseTailDecoration {
        /**
         * The text content of the tail decoration.
         */
        readonly data: string;
        /**
         * Font data for customizing the content.
         */
        readonly fontData?: FontData;
    }
    export interface TailDecorationIcon extends BaseTailDecoration {
        /**
         * This should be the name of the Font Awesome icon with out the `fa fa-` prefix, just the name, for instance `paw`.
         * For the existing icons, see here: https://fontawesome.com/v4.7.0/icons/.
         */
        readonly icon: string;
        /**
         * The color of the icon.
         */
        readonly color?: Color;
    }
    export interface TailDecorationIconClass extends BaseTailDecoration {
        /**
         * This should be the entire Font Awesome class array, for instance ['fa', 'fa-paw']
         * For the existing icons, see here: https://fontawesome.com/v4.7.0/icons/.
         */
        readonly iconClass: string[];
        /**
         * The color of the icon.
         */
        readonly color?: Color;
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
        export function getStyle(position: IconOverlayPosition, inSideBar?: boolean): string {
            switch (position) {
                case IconOverlayPosition.TOP_RIGHT:
                    return WidgetDecoration.Styles.TOP_RIGHT_CLASS;
                case IconOverlayPosition.BOTTOM_RIGHT:
                    return inSideBar ? WidgetDecoration.Styles.BOTTOM_RIGHT_SIDEBAR_CLASS : WidgetDecoration.Styles.BOTTOM_RIGHT_CLASS;
                case IconOverlayPosition.BOTTOM_LEFT:
                    return WidgetDecoration.Styles.BOTTOM_LEFT_CLASS;
                case IconOverlayPosition.TOP_LEFT:
                    return WidgetDecoration.Styles.TOP_LEFT_CLASS;
            }
        }
    }
    /**
     * A shape that can be optionally rendered behind the overlay icon. Can be used to further refine colors.
     */
    export interface IconOverlayBackground {
        /**
         * Either `circle` or `square`.
         */
        readonly shape: 'circle' | 'square';
        /**
         * The color of the background shape.
         */
        readonly color?: Color;
    }
    /**
     * Has not effect if the widget being decorated has no associated icon.
     */
    export interface BaseOverlay {
        /**
         * The position where the decoration will be placed on the top of the original icon.
         */
        readonly position: IconOverlayPosition;
        /**
         * The color of the overlaying icon. If not specified, then the default icon color will be used.
         */
        readonly color?: Color;
        /**
         * The optional background color of the overlay icon.
         */
        readonly background?: IconOverlayBackground;
    }
    export interface IconOverlay extends BaseOverlay {
        /**
         * This should be the name of the Font Awesome icon with out the `fa fa-` prefix, just the name, for instance `paw`.
         * For the existing icons, see here: https://fontawesome.com/v4.7.0/icons/.
         */
        readonly icon: string;
    }
    export interface IconClassOverlay extends BaseOverlay {
        /**
         * This should be the entire Font Awesome class array, for instance ['fa', 'fa-paw']
         * For the existing icons, see here: https://fontawesome.com/v4.7.0/icons/.
         */
        readonly iconClass: string[];
    }
    /**
     * The caption highlighting with the highlighted ranges and an optional background color.
     */
    export interface CaptionHighlight {
        /**
         * The ranges to highlight in the caption.
         */
        readonly ranges: CaptionHighlight.Range[];
        /**
         * The optional color of the text data that is being highlighted. Falls back to the default `mark` color values defined under a widget segment class.
         */
        readonly color?: Color;
        /**
         * The optional background color of the text data that is being highlighted.
         */
        readonly backgroundColor?: Color;
    }
    export namespace CaptionHighlight {
        /**
         * A pair of offset and length that has to be highlighted as a range.
         */
        export interface Range {
            /**
             * Zero based offset of the highlighted region.
             */
            readonly offset: number;
            /**
             * The length of the highlighted region.
             */
            readonly length: number;
        }
        export namespace Range {
            /**
             * `true` if the `arg` is contained in the range. The ranges are closed ranges, hence the check is inclusive.
             */
            export function contains(arg: number, range: Range): boolean {
                return arg >= range.offset && arg <= (range.offset + range.length);
            }
        }
        /**
         * The result of a caption splitting based on the highlighting information.
         */
        export interface Fragment {
            /**
             * The text data of the fragment.
             */
            readonly data: string;
            /**
             * Has to be highlighted if defined.
             */
            readonly highligh?: true;
        }
        /**
         * Splits the `caption` argument based on the ranges from the `highlight` argument.
         */
        export function split(caption: string, highlight: CaptionHighlight): Fragment[] {
            const result: Fragment[] = [];
            const ranges = highlight.ranges.slice();
            const containerOf = (index: number) => ranges.findIndex(range => Range.contains(index, range));
            let data = '';
            for (let i = 0; i < caption.length; i++) {
                const containerIndex = containerOf(i);
                if (containerIndex === -1) {
                    data += caption[i];
                } else {
                    if (data.length > 0) {
                        result.push({ data });
                    }
                    const { length } = ranges.splice(containerIndex, 1).shift()!;
                    result.push({ data: caption.substr(i, length), highligh: true });
                    data = '';
                    i = i + length - 1;
                }
            }
            if (data.length > 0) {
                result.push({ data });
            }
            if (ranges.length !== 0) {
                throw new Error('Error occurred when splitting the caption. There was a mismatch between the caption and the corresponding highlighting ranges.');
            }
            return result;
        }
    }
    /**
     * Encapsulates styling information that has to be applied on the widget which we decorate.
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
         * Optional, leading prefixes right before the caption.
         */
        readonly captionPrefixes?: CaptionAffix[];
        /**
         * Suffixes that might come after the caption as an additional information.
         */
        readonly captionSuffixes?: CaptionAffix[];
        /**
         * Optional right-aligned decorations that appear after the widget caption and after the caption suffixes (is any).
         */
        readonly tailDecorations?: Array<TailDecoration | TailDecorationIcon | TailDecorationIconClass>;
        /**
         * Custom tooltip for the decorated item. Tooltip will be appended to the original tooltip, if any.
         */
        readonly tooltip?: string;
        /**
         * Sets the color of the icon. Ignored if the decorated item has no icon.
         */
        readonly iconColor?: Color;
        /**
         * Has not effect if given, but the widget does not have an associated image.
         */
        readonly iconOverlay?: IconOverlay | IconClassOverlay;
        /**
         * An array of ranges to highlight the caption.
         */
        readonly highlight?: CaptionHighlight;
    }
    export namespace Data {
        /**
         * Compares the decoration data based on the priority. Lowest priorities come first.
         */
        export const comparePriority = (left: Data, right: Data): number => (left.priority || 0) - (right.priority || 0);
    }
}
