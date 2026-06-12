"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_AUTH_SESSION_ID_STORAGE_KEY = exports.QAAP_AUTH_SESSION_HEADER = exports.QAAP_AUTH_SESSION_COOKIE = exports.QAAP_GITHUB_OAUTH_CALLBACK_PATH = exports.QAAP_GITHUB_OAUTH_START_PATH = exports.QAAP_GITHUB_API_PATH = exports.QAAP_AUTH_API_PATH = void 0;
exports.QAAP_AUTH_API_PATH = '/qaap/api/auth';
exports.QAAP_GITHUB_API_PATH = '/qaap/api/github';
exports.QAAP_GITHUB_OAUTH_START_PATH = '/qaap/oauth/github/start';
/** Must match GitHub OAuth App «Authorization callback URL». */
exports.QAAP_GITHUB_OAUTH_CALLBACK_PATH = '/qaap/oauth/github/callback';
exports.QAAP_AUTH_SESSION_COOKIE = 'qaap_sid';
/** Fallback when HttpOnly cookies are dropped (e.g. after a container restart with a stale browser cookie). */
exports.QAAP_AUTH_SESSION_HEADER = 'x-qaap-session-id';
exports.QAAP_AUTH_SESSION_ID_STORAGE_KEY = 'qaap.auth.sessionId';
