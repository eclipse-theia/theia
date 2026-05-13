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
    /** Stable id stamped onto the picked node so we can mutate it later (set by the iframe bridge). */
    readonly pickedId: string;
    readonly tagName: string;
    readonly id?: string;
    readonly classes: ReadonlyArray<string>;
    readonly attributes: ReadonlyArray<{ name: string; value: string }>;
    readonly textPreview: string;
    readonly outerHTML: string;
    readonly domPath: string;
    readonly position: { top: number; left: number; width: number; height: number };
    /** Full `getComputedStyle` map (all longhands/shorthands the engine exposes). */
    readonly computedStyles: Readonly<Record<string, string>>;
    readonly ancestors: ReadonlyArray<{ tagName: string; id?: string; classes: ReadonlyArray<string> }>;
    readonly pageUrl: string;
}

/** Iframe → parent: a new element has been picked. */
export const ELEMENT_PICKER_MESSAGE_TYPE = 'theia-mini-browser:element-picker';
/** Iframe → parent: the picker was cancelled by the user. */
export const ELEMENT_PICKER_CANCEL_TYPE = 'theia-mini-browser:element-picker-cancel';
/** Parent → iframe: apply a CSS declaration to the previously picked element. */
export const ELEMENT_UPDATE_STYLE_TYPE = 'theia-mini-browser:element-update-style';
/** Parent → iframe: replace `textContent` for the previously picked element. */
export const ELEMENT_UPDATE_TEXT_TYPE = 'theia-mini-browser:element-update-text';
/** Parent → iframe: request a fresh snapshot for the previously picked element. */
export const ELEMENT_REFRESH_REQUEST_TYPE = 'theia-mini-browser:element-refresh-request';
/** Iframe → parent: fresh snapshot after a refresh request or after a mutation. */
export const ELEMENT_REFRESH_RESPONSE_TYPE = 'theia-mini-browser:element-refresh-response';

/** Stamp set on every DOM node we hand back to the parent so we can locate it again later. */
export const PICKED_ATTRIBUTE = 'data-theia-mini-browser-picked';

export interface ElementInspectorState {
    readonly picked?: PickedElement;
    readonly history: ReadonlyArray<PickedElement>;
}
