// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Shown in the mini-browser URL bar when opening an empty preview (no navigation). */
export const QAAP_DEFAULT_PREVIEW_INPUT_URL = 'http://localhost:3000';

export function isMiniBrowserPreviewPlaceholderUrl(url: string | undefined): boolean {
    return !!url && url.includes('__minibrowser__preview__');
}
