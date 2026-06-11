// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** True when the browser tab is foregrounded — transcript background work should pause when false. */
export function isTranscriptDocumentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
}
