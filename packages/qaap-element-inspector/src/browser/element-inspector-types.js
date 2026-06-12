"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.PICKED_ATTRIBUTE = exports.ELEMENT_REFRESH_RESPONSE_TYPE = exports.ELEMENT_REFRESH_REQUEST_TYPE = exports.ELEMENT_UPDATE_TEXT_TYPE = exports.ELEMENT_UPDATE_STYLE_TYPE = exports.ELEMENT_PICKER_CANCEL_TYPE = exports.ELEMENT_PICKER_MESSAGE_TYPE = void 0;
/** Iframe → parent: a new element has been picked. */
exports.ELEMENT_PICKER_MESSAGE_TYPE = 'theia-mini-browser:element-picker';
/** Iframe → parent: the picker was cancelled by the user. */
exports.ELEMENT_PICKER_CANCEL_TYPE = 'theia-mini-browser:element-picker-cancel';
/** Parent → iframe: apply a CSS declaration to the previously picked element. */
exports.ELEMENT_UPDATE_STYLE_TYPE = 'theia-mini-browser:element-update-style';
/** Parent → iframe: replace `textContent` for the previously picked element. */
exports.ELEMENT_UPDATE_TEXT_TYPE = 'theia-mini-browser:element-update-text';
/** Parent → iframe: request a fresh snapshot for the previously picked element. */
exports.ELEMENT_REFRESH_REQUEST_TYPE = 'theia-mini-browser:element-refresh-request';
/** Iframe → parent: fresh snapshot after a refresh request or after a mutation. */
exports.ELEMENT_REFRESH_RESPONSE_TYPE = 'theia-mini-browser:element-refresh-response';
/** Stamp set on every DOM node we hand back to the parent so we can locate it again later. */
exports.PICKED_ATTRIBUTE = 'data-theia-mini-browser-picked';
