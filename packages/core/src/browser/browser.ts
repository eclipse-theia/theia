/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isIE = (userAgent.indexOf('Trident') >= 0);
export const isEdge = (userAgent.indexOf('Edge/') >= 0);
export const isEdgeOrIE = isIE || isEdge;

export const isOpera = (userAgent.indexOf('Opera') >= 0);
export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (userAgent.indexOf('Chrome') === -1) && (userAgent.indexOf('Safari') >= 0);
export const isIPad = (userAgent.indexOf('iPad') >= 0);
// tslint:disable-next-line:no-any
export const isNative = typeof (window as any).process !== 'undefined';
// tslint:disable-next-line:no-any
export const isBasicWasmSupported = typeof (window as any).WebAssembly !== 'undefined';

/**
 * Parse a magnitude value (e.g. width, height, left, top) from a CSS attribute value.
 * Returns the given default value (or undefined) if the value cannot be determined,
 * e.g. because it is a relative value like `50%` or `auto`.
 */
export function parseCssMagnitude(value: string | null, defaultValue: number): number;
export function parseCssMagnitude(value: string | null, defaultValue?: number): number | undefined {
    if (value) {
        let parsed: number;
        if (value.endsWith('px')) {
            parsed = parseFloat(value.substring(0, value.length - 2));
        } else {
            parsed = parseFloat(value);
        }
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return defaultValue;
}

/**
 * Parse the number of milliseconds from a CSS time value.
 * Returns the given default value (or undefined) if the value cannot be determined.
 */
export function parseCssTime(time: string | null, defaultValue: number): number;
export function parseCssTime(time: string | null, defaultValue?: number): number | undefined {
    if (time) {
        let parsed: number;
        if (time.endsWith('ms')) {
            parsed = parseFloat(time.substring(0, time.length - 2));
        } else if (time.endsWith('s')) {
            parsed = parseFloat(time.substring(0, time.length - 1)) * 1000;
        } else {
            parsed = parseFloat(time);
        }
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return defaultValue;
}

interface ElementScroll {
    left: number
    top: number
    maxLeft: number
    maxTop: number
}

function getMonacoEditorScroll(elem: HTMLElement): ElementScroll | undefined {
    const linesContent = elem.querySelector('.lines-content') as HTMLElement;
    const viewLines = elem.querySelector('.view-lines') as HTMLElement;
    if (linesContent === null || viewLines === null) {
        return undefined;
    }
    const linesContentStyle = linesContent.style;
    const elemStyle = elem.style;
    const viewLinesStyle = viewLines.style;
    return {
        left: -parseCssMagnitude(linesContentStyle.left, 0),
        top: -parseCssMagnitude(linesContentStyle.top, 0),
        maxLeft: parseCssMagnitude(viewLinesStyle.width, 0) - parseCssMagnitude(elemStyle.width, 0),
        maxTop: parseCssMagnitude(viewLinesStyle.height, 0) - parseCssMagnitude(elemStyle.height, 0)
    };
}

/**
 * Prevent browser back/forward navigation of a mouse wheel event.
 */
export function preventNavigation(event: WheelEvent): void {
    const { currentTarget, deltaX, deltaY } = event;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    let elem = event.target as Element | null;

    while (elem && elem !== currentTarget) {
        let scroll: ElementScroll | undefined;
        if (elem.classList.contains('monaco-scrollable-element')) {
            scroll = getMonacoEditorScroll(elem as HTMLElement);
        } else {
            scroll = {
                left: elem.scrollLeft,
                top: elem.scrollTop,
                maxLeft: elem.scrollWidth - elem.clientWidth,
                maxTop: elem.scrollHeight - elem.clientHeight
            };
        }
        if (scroll) {
            const scrollH = scroll.maxLeft > 0 && (deltaX < 0 && scroll.left > 0 || deltaX > 0 && scroll.left < scroll.maxLeft);
            const scrollV = scroll.maxTop > 0 && (deltaY < 0 && scroll.top > 0 || deltaY > 0 && scroll.top < scroll.maxTop);
            if (scrollH && scrollV || scrollH && absDeltaX > absDeltaY || scrollV && absDeltaY > absDeltaX) {
                // The event is consumed by the scrollable child element
                return;
            }
        }
        elem = elem.parentElement;
    }

    event.preventDefault();
    event.stopPropagation();
}
