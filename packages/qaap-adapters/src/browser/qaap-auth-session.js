"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_AUTH_SESSION_ID_KEY = exports.QAAP_AUTH_USER_KEY = exports.QAAP_AUTH_PROVIDER_KEY = exports.QAAP_AUTH_SIGNED_IN_KEY = void 0;
exports.qaapAuthStoragePrefix = qaapAuthStoragePrefix;
exports.qaapAuthStorageKey = qaapAuthStorageKey;
exports.readQaapSignedIn = readQaapSignedIn;
exports.readQaapAuthProvider = readQaapAuthProvider;
exports.readQaapAuthUser = readQaapAuthUser;
exports.placeholderQaapAuthUser = placeholderQaapAuthUser;
exports.readQaapAuthSessionId = readQaapAuthSessionId;
exports.writeQaapAuthSession = writeQaapAuthSession;
exports.writeQaapSignedIn = writeQaapSignedIn;
exports.clearQaapAuthSession = clearQaapAuthSession;
exports.qaapAuthUserInitials = qaapAuthUserInitials;
exports.QAAP_AUTH_SIGNED_IN_KEY = 'qaap.auth.signedIn';
exports.QAAP_AUTH_PROVIDER_KEY = 'qaap.auth.provider';
exports.QAAP_AUTH_USER_KEY = 'qaap.auth.user';
exports.QAAP_AUTH_SESSION_ID_KEY = 'qaap.auth.sessionId';
/** Mirrors {@link LocalStorageService} key prefix (browser vs electron). */
function qaapAuthStoragePrefix() {
    var electron = typeof window !== 'undefined'
        && typeof window.electronTheiaCore !== 'undefined';
    if (electron) {
        return 'theia:';
    }
    var pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    return "theia:".concat(pathname, ":");
}
function qaapAuthStorageKey(suffix) {
    return "".concat(qaapAuthStoragePrefix()).concat(suffix);
}
/** True if any pathname variant has a stored Qaap sign-in flag. */
function readQaapSignedIn() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return false;
    }
    try {
        for (var i = 0; i < window.localStorage.length; i++) {
            var key = window.localStorage.key(i);
            if (!(key === null || key === void 0 ? void 0 : key.includes(exports.QAAP_AUTH_SIGNED_IN_KEY))) {
                continue;
            }
            var raw = window.localStorage.getItem(key);
            if (raw === null) {
                continue;
            }
            var value = JSON.parse(raw);
            if (value === true || value === 'true') {
                return true;
            }
        }
    }
    catch (_a) {
        return false;
    }
    return false;
}
function readQaapAuthProvider() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return undefined;
    }
    try {
        var raw = window.localStorage.getItem(qaapAuthStorageKey(exports.QAAP_AUTH_PROVIDER_KEY));
        if (raw === null) {
            return undefined;
        }
        var value = JSON.parse(raw);
        return value === 'github' || value === 'gitlab' ? value : undefined;
    }
    catch (_a) {
        return undefined;
    }
}
function readQaapAuthUser() {
    if (!readQaapSignedIn()) {
        return undefined;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            var raw = window.localStorage.getItem(qaapAuthStorageKey(exports.QAAP_AUTH_USER_KEY));
            if (raw !== null) {
                var parsed = JSON.parse(raw);
                if (parsed && (parsed.provider === 'github' || parsed.provider === 'gitlab') && parsed.login) {
                    return parsed;
                }
            }
        }
        catch (_a) {
            /* fall through */
        }
    }
    var provider = readQaapAuthProvider();
    return provider ? placeholderQaapAuthUser(provider) : undefined;
}
/** Placeholder profile until real OAuth returns GitHub/GitLab user metadata. */
function placeholderQaapAuthUser(provider) {
    if (provider === 'gitlab') {
        return {
            provider: 'gitlab',
            login: 'gitlab-user',
            name: 'GitLab',
        };
    }
    return {
        provider: 'github',
        login: 'github-user',
        name: 'GitHub',
    };
}
function readQaapAuthSessionId() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return undefined;
    }
    try {
        var raw = window.localStorage.getItem(qaapAuthStorageKey(exports.QAAP_AUTH_SESSION_ID_KEY));
        if (raw === null) {
            return undefined;
        }
        var value = JSON.parse(raw);
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }
    catch (_a) {
        return undefined;
    }
}
function writeQaapAuthSession(provider, user, sessionId) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }
    var profile = user !== null && user !== void 0 ? user : placeholderQaapAuthUser(provider);
    window.localStorage.setItem(qaapAuthStorageKey(exports.QAAP_AUTH_SIGNED_IN_KEY), JSON.stringify(true));
    window.localStorage.setItem(qaapAuthStorageKey(exports.QAAP_AUTH_PROVIDER_KEY), JSON.stringify(provider));
    window.localStorage.setItem(qaapAuthStorageKey(exports.QAAP_AUTH_USER_KEY), JSON.stringify(profile));
    if (sessionId) {
        window.localStorage.setItem(qaapAuthStorageKey(exports.QAAP_AUTH_SESSION_ID_KEY), JSON.stringify(sessionId));
    }
    window.dispatchEvent(new CustomEvent('qaap-auth-session-changed'));
}
/** @deprecated Use {@link writeQaapAuthSession}. */
function writeQaapSignedIn(provider) {
    writeQaapAuthSession(provider);
}
function clearQaapAuthSession() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }
    var keysToRemove = [];
    for (var i = 0; i < window.localStorage.length; i++) {
        var key = window.localStorage.key(i);
        if (key && (key.includes('qaap.auth') || key.endsWith(exports.QAAP_AUTH_SIGNED_IN_KEY) || key.endsWith(exports.QAAP_AUTH_PROVIDER_KEY) || key.endsWith(exports.QAAP_AUTH_USER_KEY))) {
            keysToRemove.push(key);
        }
    }
    for (var _i = 0, keysToRemove_1 = keysToRemove; _i < keysToRemove_1.length; _i++) {
        var key = keysToRemove_1[_i];
        window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent('qaap-auth-session-changed'));
}
function qaapAuthUserInitials(user) {
    var source = user.name.trim() || user.login.trim();
    if (!source) {
        return '?';
    }
    var parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
}
