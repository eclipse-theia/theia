// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Snapshot of a DOM element captured by the in-iframe element picker.
 * Designed to be JSON-serialisable so it can travel through `window.postMessage`.
 */
export interface PickedElement {
    readonly tagName: string;
    readonly id?: string;
    readonly classes: ReadonlyArray<string>;
    readonly attributes: ReadonlyArray<{ name: string; value: string }>;
    readonly textPreview: string;
    readonly outerHTML: string;
    readonly domPath: string;
    readonly position: { top: number; left: number; width: number; height: number };
    readonly computedStyles: Readonly<Record<string, string>>;
    readonly ancestors: ReadonlyArray<{ tagName: string; id?: string; classes: ReadonlyArray<string> }>;
    readonly pageUrl: string;
}

/** Message type emitted from inside the iframe through `postMessage`. */
export const ELEMENT_PICKER_MESSAGE_TYPE = 'theia-mini-browser:element-picker';
export const ELEMENT_PICKER_CANCEL_TYPE = 'theia-mini-browser:element-picker-cancel';

/** Subset of computed CSS properties surfaced in the inspector "Design" tab. */
export const TRACKED_COMPUTED_STYLES: ReadonlyArray<string> = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'flex-direction', 'justify-content', 'align-items', 'gap', 'flex',
    'grid-template-columns', 'grid-template-rows',
    'background-color', 'color', 'opacity',
    'border-radius', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-color', 'border-style',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align',
    'box-shadow'
];

export interface ElementInspectorState {
    readonly picked?: PickedElement;
    readonly history: ReadonlyArray<PickedElement>;
}
