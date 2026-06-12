"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_DEFAULT_PREVIEW_INPUT_URL = void 0;
exports.isMiniBrowserPreviewPlaceholderUrl = isMiniBrowserPreviewPlaceholderUrl;
/** Shown in the mini-browser URL bar when opening an empty preview (no navigation). */
exports.QAAP_DEFAULT_PREVIEW_INPUT_URL = 'http://localhost:3000';
function isMiniBrowserPreviewPlaceholderUrl(url) {
    return !!url && url.includes('__minibrowser__preview__');
}
