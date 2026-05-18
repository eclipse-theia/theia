// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export {
    QAAP_AUTH_PROVIDER_KEY,
    QAAP_AUTH_SIGNED_IN_KEY,
    QAAP_AUTH_USER_KEY,
    clearQaapAuthSession,
    placeholderQaapAuthUser,
    qaapAuthStorageKey,
    qaapAuthStoragePrefix,
    qaapAuthUserInitials,
    readQaapAuthProvider,
    readQaapAuthUser,
    readQaapSignedIn,
    writeQaapAuthSession,
    writeQaapSignedIn,
} from '@theia/qaap-adapters/lib/browser/qaap-auth-session';

export type { QaapAuthProvider, QaapAuthUser } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
