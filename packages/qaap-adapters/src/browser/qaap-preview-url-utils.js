"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_DEV_PREVIEW_PATH_PREFIX = void 0;
exports.normalizePreviewUrlForSameOrigin = normalizePreviewUrlForSameOrigin;
exports.buildSameOriginDevPreviewUrl = buildSameOriginDevPreviewUrl;
exports.parsePreviewProxyPath = parsePreviewProxyPath;
exports.toPreviewHistoryDisplayUrl = toPreviewHistoryDisplayUrl;
exports.canonicalPreviewHistoryKey = canonicalPreviewHistoryKey;
/** Same prefix as {@link QAAP_DEV_PREVIEW_PREFIX} in qaap-mobile-shell (keep in sync). */
exports.QAAP_DEV_PREVIEW_PATH_PREFIX = '/qaap-dev';
var LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);
var BARE_LOCAL_DEV_URL_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):(\d{2,5})(\/.*)?$/i;
function normalizeBareLocalDevUrl(url) {
    var _a;
    var match = BARE_LOCAL_DEV_URL_PATTERN.exec(url.trim());
    if (!match) {
        return url;
    }
    var host = match[1].replace(/^\[?::1\]?$/i, '[::1]');
    return "http://".concat(host, ":").concat(match[2]).concat((_a = match[3]) !== null && _a !== void 0 ? _a : '/');
}
function parseDevPort(raw) {
    var port = Number(raw);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        return undefined;
    }
    return port;
}
function ideOrigin() {
    var _a;
    if (typeof window === 'undefined' || !((_a = window.location) === null || _a === void 0 ? void 0 : _a.origin)) {
        return undefined;
    }
    return window.location.origin.replace(/\/+$/, '');
}
/**
 * Rewrites direct `http://localhost:5173/...` dev-server URLs to the same-origin
 * `/qaap-dev/:port/...` proxy so the element picker and inspector can access the iframe DOM.
 */
function normalizePreviewUrlForSameOrigin(url, publicOrigin) {
    var _a;
    var trimmed = normalizeBareLocalDevUrl(url.trim());
    if (!trimmed) {
        return trimmed;
    }
    var origin = (_a = (publicOrigin !== null && publicOrigin !== void 0 ? publicOrigin : ideOrigin())) === null || _a === void 0 ? void 0 : _a.replace(/\/+$/, '');
    if (!origin) {
        return trimmed;
    }
    try {
        var parsed = new URL(trimmed, origin);
        var ide = new URL(origin);
        if (parsed.origin === ide.origin && parsed.pathname.startsWith("".concat(exports.QAAP_DEV_PREVIEW_PATH_PREFIX, "/"))) {
            return parsed.toString();
        }
        if (!LOCAL_DEV_HOSTS.has(parsed.hostname)) {
            return trimmed;
        }
        var devPort = parseDevPort(parsed.port || undefined);
        var idePort = parseDevPort(ide.port || (ide.protocol === 'https:' ? '443' : '80'));
        if (devPort === undefined || devPort === idePort) {
            return trimmed;
        }
        var suffix = "".concat(parsed.pathname).concat(parsed.search).concat(parsed.hash) || '/';
        var path = suffix.startsWith('/') ? suffix : "/".concat(suffix);
        return "".concat(origin).concat(exports.QAAP_DEV_PREVIEW_PATH_PREFIX, "/").concat(devPort).concat(path);
    }
    catch (_b) {
        return trimmed;
    }
}
function buildSameOriginDevPreviewUrl(port, publicOrigin) {
    var _a;
    var origin = (_a = (publicOrigin !== null && publicOrigin !== void 0 ? publicOrigin : ideOrigin())) === null || _a === void 0 ? void 0 : _a.replace(/\/+$/, '');
    if (!origin) {
        return "http://127.0.0.1:".concat(port, "/");
    }
    return "".concat(origin).concat(exports.QAAP_DEV_PREVIEW_PATH_PREFIX, "/").concat(port, "/");
}
/** Parses `/qaap-dev/5173/...` paths on the IDE origin. */
function parsePreviewProxyPath(pathname) {
    var match = /^\/qaap-dev\/(\d+)(\/.*)?$/.exec(pathname);
    if (!match) {
        return undefined;
    }
    var port = parseDevPort(match[1]);
    if (port === undefined) {
        return undefined;
    }
    return { port: port, targetPath: match[2] || '/' };
}
/**
 * User-facing URL for browsing history (direct `localhost:PORT` instead of `/qaap-dev/:port/`).
 */
function stripPreviewHistoryCacheBust(url) {
    url.searchParams.delete('_qaap_cache_bust');
    if (!url.searchParams.toString()) {
        url.search = '';
    }
}
function toPreviewHistoryDisplayUrl(url, publicOrigin) {
    var _a;
    var trimmed = url.trim();
    if (!trimmed) {
        return trimmed;
    }
    var origin = (_a = (publicOrigin !== null && publicOrigin !== void 0 ? publicOrigin : ideOrigin())) === null || _a === void 0 ? void 0 : _a.replace(/\/+$/, '');
    try {
        var parsed = new URL(trimmed, origin);
        stripPreviewHistoryCacheBust(parsed);
        var proxy = parsePreviewProxyPath(parsed.pathname);
        if (proxy) {
            var suffix = "".concat(proxy.targetPath).concat(parsed.search).concat(parsed.hash) || '/';
            var path = suffix.startsWith('/') ? suffix : "/".concat(suffix);
            return "http://localhost:".concat(proxy.port).concat(path);
        }
        if (origin) {
            var ide = new URL(origin);
            if (parsed.origin !== ide.origin) {
                return parsed.toString();
            }
        }
        if (LOCAL_DEV_HOSTS.has(parsed.hostname)) {
            var port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
            var suffix = "".concat(parsed.pathname).concat(parsed.search).concat(parsed.hash) || '/';
            var path = suffix.startsWith('/') ? suffix : "/".concat(suffix);
            return "http://localhost:".concat(port).concat(path);
        }
        return parsed.toString();
    }
    catch (_b) {
        return trimmed;
    }
}
/** Stable key so proxy and direct dev URLs dedupe to one history row. */
function canonicalPreviewHistoryKey(url, publicOrigin) {
    var display = toPreviewHistoryDisplayUrl(url, publicOrigin);
    if (!display) {
        return '';
    }
    try {
        var parsed = new URL(display);
        var port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
        var path = parsed.pathname.replace(/\/+$/, '') || '/';
        return "".concat(parsed.protocol, "//").concat(parsed.hostname, ":").concat(port).concat(path).concat(parsed.search);
    }
    catch (_a) {
        return display.toLowerCase();
    }
}
