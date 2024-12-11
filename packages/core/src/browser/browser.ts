// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, environment } from '../common';

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * @deprecated use Environment.electron.is
 */
export const isNative = environment.electron.is();
/**
 * Determines whether the backend is running in a remote environment.
 * I.e. we use the browser version or connect to a remote Theia instance in Electron.
 */
export const isRemote = !environment.electron.is() || new URL(location.href).searchParams.has('localPort');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isBasicWasmSupported = typeof (window as any).WebAssembly !== 'undefined';

/**
 * Resolves after the next animation frame if no parameter is given,
 * or after the given number of animation frames.
 */
export function animationFrame(n: number = 1): Promise<void> {
    return new Promise(resolve => {
        function frameFunc(): void {
            if (n <= 0) {
                resolve();
            } else {
                n--;
                requestAnimationFrame(frameFunc);
            }
        }
        frameFunc();
    });
}

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
    // eslint-disable-next-line no-null/no-null
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

export type PartialCSSStyle = Omit<Partial<CSSStyleDeclaration>,
    'visibility' |
    'display' |
    'parentRule' |
    'getPropertyPriority' |
    'getPropertyValue' |
    'item' |
    'removeProperty' |
    'setProperty'>;

export function measureTextWidth(text: string | string[], style?: PartialCSSStyle): number {
    const measureElement = getMeasurementElement(style);
    text = Array.isArray(text) ? text : [text];
    let width = 0;
    for (const item of text) {
        measureElement.textContent = item;
        width = Math.max(measureElement.getBoundingClientRect().width, width);
    }
    return width;
}

export function measureTextHeight(text: string | string[], style?: PartialCSSStyle): number {
    const measureElement = getMeasurementElement(style);
    text = Array.isArray(text) ? text : [text];
    let height = 0;
    for (const item of text) {
        measureElement.textContent = item;
        height = Math.max(measureElement.getBoundingClientRect().height, height);
    }
    return height;
}

const defaultStyle = document.createElement('div').style;
defaultStyle.fontFamily = 'var(--theia-ui-font-family)';
defaultStyle.fontSize = 'var(--theia-ui-font-size1)';
defaultStyle.visibility = 'hidden';

function getMeasurementElement(style?: PartialCSSStyle): HTMLElement {
    let measureElement = document.getElementById('measure');
    if (!measureElement) {
        measureElement = document.createElement('span');
        measureElement.id = 'measure';
        measureElement.style.fontFamily = defaultStyle.fontFamily;
        measureElement.style.fontSize = defaultStyle.fontSize;
        measureElement.style.visibility = defaultStyle.visibility;
        document.body.appendChild(measureElement);
    }
    const measureStyle = measureElement.style;
    // Reset styling first
    for (let i = 0; i < measureStyle.length; i++) {
        const property = measureStyle[i];
        measureStyle.setProperty(property, defaultStyle.getPropertyValue(property));
    }
    // Apply new styling
    if (style) {
        for (const [key, value] of Object.entries(style)) {
            measureStyle.setProperty(key, value as string);
        }
    }
    return measureElement;
}

export function onDomEvent<K extends keyof HTMLElementEventMap>(
    element: Node,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions): Disposable {
    element.addEventListener(type, listener, options);
    return { dispose: () => element.removeEventListener(type, listener, options) };
}
