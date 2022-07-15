// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Either be a reference to an existing color or a color value as a hex string, rgba, or hsla.
 */
export type Color = string | RGBA | HSLA | ColorTransformation;
export namespace Color {
    export function rgba(r: number, g: number, b: number, a: number = 1): Color {
        return { r, g, b, a };
    }
    export function hsla(h: number, s: number, l: number, a: number = 1): Color {
        return { h, s, l, a };
    }
    export const white = rgba(255, 255, 255, 1);
    export const black = rgba(0, 0, 0, 1);
    export function transparent(v: string, f: number): ColorTransformation {
        return { v, f, kind: 'transparent' };
    }
    export function lighten(v: string, f: number): ColorTransformation {
        return { v, f, kind: 'lighten' };
    }
    export function darken(v: string, f: number): ColorTransformation {
        return { v, f, kind: 'darken' };
    }
}
export interface ColorTransformation {
    kind: 'transparent' | 'lighten' | 'darken'
    v: string
    f: number
}
export interface RGBA {
    /**
     * Red: integer in [0-255]
     */
    readonly r: number;

    /**
     * Green: integer in [0-255]
     */
    readonly g: number;

    /**
     * Blue: integer in [0-255]
     */
    readonly b: number;

    /**
     * Alpha: float in [0-1]
     */
    readonly a: number;
}
export interface HSLA {
    /**
     * Hue: integer in [0, 360]
     */
    readonly h: number;
    /**
     * Saturation: float in [0, 1]
     */
    readonly s: number;
    /**
     * Luminosity: float in [0, 1]
     */
    readonly l: number;
    /**
     * Alpha: float in [0, 1]
     */
    readonly a: number;
}

export interface ColorDefaults {
    light?: Color
    dark?: Color
    /** @deprecated @since 1.28.0 Please use hcDark and hcLight. This field will be ignored unless `hcDark` is absent. */
    hc?: Color
    hcDark?: Color;
    hcLight?: Color;
}

export interface ColorDefinition {
    id: string
    defaults?: ColorDefaults
    description: string
}

export interface ColorCssVariable {
    name: string
    value: string
}
