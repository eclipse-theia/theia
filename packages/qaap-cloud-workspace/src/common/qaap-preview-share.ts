// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { normalizePublicOrigin } from '@theia/qaap-mobile-shell/lib/common/qaap-dev-preview';

/** Stable public preview path (port hidden behind token). */
export const QAAP_DEV_PREVIEW_PUBLIC_PREFIX = '/qaap-dev/public';

export function buildQaapPublicPreviewShareUrl(publicOrigin: string, token: string): string {
    const base = normalizePublicOrigin(publicOrigin);
    return `${base}${QAAP_DEV_PREVIEW_PUBLIC_PREFIX}/${token}/`;
}

export function parseQaapPublicPreviewSharePath(pathname: string): { token: string; targetPath: string } | undefined {
    const match = /^\/qaap-dev\/public\/([a-zA-Z0-9_-]{8,64})(\/.*)?$/.exec(pathname);
    if (!match) {
        return undefined;
    }
    return { token: match[1], targetPath: match[2] || '/' };
}
