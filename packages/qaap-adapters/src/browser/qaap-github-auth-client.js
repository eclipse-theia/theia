"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_REQUIRE_LOGIN_EVENT = void 0;
exports.qaapAuthenticatedFetchInit = qaapAuthenticatedFetchInit;
exports.reconcileQaapAuthSessionHeader = reconcileQaapAuthSessionHeader;
exports.fetchQaapAuthConfig = fetchQaapAuthConfig;
exports.fetchQaapAuthSession = fetchQaapAuthSession;
exports.fetchQaapProjectSessions = fetchQaapProjectSessions;
exports.upsertQaapProjectSession = upsertQaapProjectSession;
exports.fetchQaapGithubRepositories = fetchQaapGithubRepositories;
exports.fetchQaapGithubPullRequests = fetchQaapGithubPullRequests;
exports.mergeQaapGithubPullRequest = mergeQaapGithubPullRequest;
exports.openQaapGithubRepository = openQaapGithubRepository;
exports.createQaapGithubRepository = createQaapGithubRepository;
exports.cloneQaapGithubRepository = cloneQaapGithubRepository;
exports.startGithubOAuth = startGithubOAuth;
exports.signOutQaapAuth = signOutQaapAuth;
exports.syncQaapAuthSessionFromServer = syncQaapAuthSessionFromServer;
exports.peekQaapOAuthReturnFromUrl = peekQaapOAuthReturnFromUrl;
exports.revealQaapWorkbenchAfterAuth = revealQaapWorkbenchAfterAuth;
exports.stripQaapOAuthParamsFromUrl = stripQaapOAuthParamsFromUrl;
exports.completeQaapGithubOAuthReturn = completeQaapGithubOAuthReturn;
exports.peekQaapOAuthErrorReasonFromUrl = peekQaapOAuthErrorReasonFromUrl;
exports.consumeQaapOAuthReturnFromUrl = consumeQaapOAuthReturnFromUrl;
var qaap_github_api_types_1 = require("../common/qaap-github-api-types");
var qaap_auth_session_1 = require("./qaap-auth-session");
/** Include session cookie and, when known, the stored session id for VPS/container restarts. */
function qaapAuthenticatedFetchInit(extra) {
    var headers = new Headers(extra === null || extra === void 0 ? void 0 : extra.headers);
    var sessionId = (0, qaap_auth_session_1.readQaapAuthSessionId)();
    if (sessionId) {
        headers.set(qaap_github_api_types_1.QAAP_AUTH_SESSION_HEADER, sessionId);
    }
    return __assign(__assign({ credentials: 'include' }, extra), { headers: headers });
}
/** Drop a stale session id that no longer exists on the server (avoids 401 loops). */
function reconcileQaapAuthSessionHeader() {
    return __awaiter(this, void 0, void 0, function () {
        var sessionId, session, config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sessionId = (0, qaap_auth_session_1.readQaapAuthSessionId)();
                    if (!sessionId) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, fetchQaapAuthSession()];
                case 1:
                    session = _a.sent();
                    if (session.signedIn && session.sessionId) {
                        if (session.sessionId !== sessionId) {
                            (0, qaap_auth_session_1.writeQaapAuthSession)(session.user.provider, session.user, session.sessionId);
                        }
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, fetchQaapAuthConfig().catch(function () { return ({ skipAuth: false, githubOAuth: false }); })];
                case 2:
                    config = _a.sent();
                    if (config.skipAuth) {
                        return [2 /*return*/];
                    }
                    if (!(0, qaap_auth_session_1.readQaapSignedIn)()) return [3 /*break*/, 4];
                    return [4 /*yield*/, syncQaapAuthSessionFromServer()];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
exports.QAAP_REQUIRE_LOGIN_EVENT = 'qaap-require-login';
function fetchQaapAuthConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_AUTH_API_PATH, "/config"), qaapAuthenticatedFetchInit())];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        return [2 /*return*/, { githubOAuth: false }];
                    }
                    return [2 /*return*/, response.json()];
            }
        });
    });
}
function fetchQaapAuthSession() {
    return __awaiter(this, void 0, void 0, function () {
        var response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_AUTH_API_PATH, "/session"), qaapAuthenticatedFetchInit())];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        return [2 /*return*/, { signedIn: false }];
                    }
                    return [2 /*return*/, response.json()];
            }
        });
    });
}
function fetchQaapProjectSessions() {
    return __awaiter(this, void 0, void 0, function () {
        var response, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, reconcileQaapAuthSessionHeader()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/project-sessions"), qaapAuthenticatedFetchInit())];
                case 2:
                    response = _a.sent();
                    if (!(response.status === 401)) return [3 /*break*/, 4];
                    return [4 /*yield*/, reconcileQaapAuthSessionHeader()];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { sessions: [] }];
                case 4:
                    if (!response.ok) {
                        return [2 /*return*/, { sessions: [] }];
                    }
                    return [4 /*yield*/, response.json()];
                case 5:
                    body = _a.sent();
                    return [2 /*return*/, { sessions: Array.isArray(body.sessions) ? body.sessions : [] }];
            }
        });
    });
}
function upsertQaapProjectSession(patch) {
    return __awaiter(this, void 0, void 0, function () {
        var response, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/project-sessions"), qaapAuthenticatedFetchInit({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(patch),
                    }))];
                case 1:
                    response = _a.sent();
                    if (!response.ok) {
                        return [2 /*return*/, undefined];
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    body = _a.sent();
                    return [2 /*return*/, body.session];
            }
        });
    });
}
function fetchQaapGithubRepositories() {
    return __awaiter(this, void 0, void 0, function () {
        var response, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/repositories"), qaapAuthenticatedFetchInit())];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                case 2:
                    body = _a.sent();
                    throw new Error(body.error || "Failed to load GitHub repositories (".concat(response.status, ")"));
                case 3: return [2 /*return*/, response.json()];
            }
        });
    });
}
function fetchQaapGithubPullRequests(repositories) {
    return __awaiter(this, void 0, void 0, function () {
        var reposQuery, response, body_1, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    reposQuery = (repositories === null || repositories === void 0 ? void 0 : repositories.length)
                        ? "?repos=".concat(encodeURIComponent(repositories.join(',')))
                        : '';
                    return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/pull-requests").concat(reposQuery), qaapAuthenticatedFetchInit())];
                case 1:
                    response = _a.sent();
                    if (response.status === 401) {
                        return [2 /*return*/, { pullRequests: [], signedIn: false }];
                    }
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                case 2:
                    body_1 = _a.sent();
                    throw new Error(body_1.error || "Failed to load GitHub pull requests (".concat(response.status, ")"));
                case 3: return [4 /*yield*/, response.json()];
                case 4:
                    body = _a.sent();
                    return [2 /*return*/, {
                            pullRequests: Array.isArray(body.pullRequests) ? body.pullRequests : [],
                            currentRepository: body.currentRepository,
                            signedIn: body.signedIn !== false,
                        }];
            }
        });
    });
}
function mergeQaapGithubPullRequest(request) {
    return __awaiter(this, void 0, void 0, function () {
        var response, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/pull-requests/merge"), qaapAuthenticatedFetchInit({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(request),
                    }))];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                case 2:
                    body = _a.sent();
                    if (!response.ok) {
                        throw new Error(body.error || "Failed to merge pull request (".concat(response.status, ")"));
                    }
                    return [2 /*return*/, body];
            }
        });
    });
}
function openQaapGithubRepository(owner, name) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/repositories/").concat(encodeURIComponent(owner), "/").concat(encodeURIComponent(name), "/open");
                    return [4 /*yield*/, fetch(url, qaapAuthenticatedFetchInit())];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                case 2:
                    body = _a.sent();
                    throw new Error(body.error || "Failed to open GitHub repository (".concat(response.status, ")"));
                case 3: return [2 /*return*/, response.json()];
            }
        });
    });
}
function createQaapGithubRepository(request) {
    return __awaiter(this, void 0, void 0, function () {
        var response, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/repositories"), qaapAuthenticatedFetchInit({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(request),
                    }))];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                case 2:
                    body = _a.sent();
                    throw new Error(body.error || "Failed to create GitHub repository (".concat(response.status, ")"));
                case 3: return [2 /*return*/, response.json()];
            }
        });
    });
}
function cloneQaapGithubRepository(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var request, response, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    request = { repository: repository };
                    return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_GITHUB_API_PATH, "/repositories/open"), qaapAuthenticatedFetchInit({
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(request),
                        }))];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.json().catch(function () { return ({}); })];
                case 2:
                    body = _a.sent();
                    throw new Error(body.error || "Failed to clone GitHub repository (".concat(response.status, ")"));
                case 3: return [2 /*return*/, response.json()];
            }
        });
    });
}
function startGithubOAuth() {
    window.location.assign(qaap_github_api_types_1.QAAP_GITHUB_OAUTH_START_PATH);
}
function signOutQaapAuth() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fetch("".concat(qaap_github_api_types_1.QAAP_AUTH_API_PATH, "/signout"), qaapAuthenticatedFetchInit({ method: 'POST' }))];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3:
                    (0, qaap_auth_session_1.clearQaapAuthSession)();
                    return [2 /*return*/];
            }
        });
    });
}
/** Apply server session to local storage; returns true when signed in. */
function syncQaapAuthSessionFromServer() {
    return __awaiter(this, void 0, void 0, function () {
        var config, session;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetchQaapAuthConfig().catch(function () { return ({ skipAuth: false, githubOAuth: false }); })];
                case 1:
                    config = _a.sent();
                    return [4 /*yield*/, fetchQaapAuthSession()];
                case 2:
                    session = _a.sent();
                    if (!session.signedIn || !session.user) {
                        if (!config.skipAuth) {
                            (0, qaap_auth_session_1.clearQaapAuthSession)();
                        }
                        return [2 /*return*/, false];
                    }
                    (0, qaap_auth_session_1.writeQaapAuthSession)(session.user.provider, session.user, session.sessionId);
                    return [2 /*return*/, true];
            }
        });
    });
}
/** True while the URL still carries OAuth return params (before {@link consumeQaapOAuthReturnFromUrl}). */
function peekQaapOAuthReturnFromUrl() {
    if (typeof window === 'undefined') {
        return undefined;
    }
    var params = new URLSearchParams(window.location.search);
    if (params.has('qaap_oauth_error')) {
        return 'error';
    }
    if (params.get('qaap_oauth') === 'github') {
        return 'github';
    }
    return undefined;
}
/** Remove login gate DOM/CSS so the workbench is visible again. */
function revealQaapWorkbenchAfterAuth() {
    var _a;
    if (typeof document === 'undefined') {
        return;
    }
    document.body.classList.remove('qaap-login-active');
    (_a = document.getElementById('qaap-login-host')) === null || _a === void 0 ? void 0 : _a.remove();
}
/**
 * Clean OAuth query params from the URL. When `clearHash` is true (fresh GitHub sign-in),
 * drop the hash so Theia does not boot into a stale workspace route before the shell is ready.
 */
function stripQaapOAuthParamsFromUrl(clearHash, forceEmptyWindow) {
    if (clearHash === void 0) { clearHash = false; }
    if (forceEmptyWindow === void 0) { forceEmptyWindow = false; }
    if (typeof window === 'undefined') {
        return;
    }
    var url = new URL(window.location.href);
    url.searchParams.delete('qaap_oauth');
    url.searchParams.delete('qaap_oauth_error');
    if (forceEmptyWindow) {
        url.hash = '!empty';
    }
    else if (clearHash) {
        url.hash = '';
    }
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}
/** Sync session after GitHub redirect; reveal IDE and normalize the URL when successful. */
function completeQaapGithubOAuthReturn() {
    return __awaiter(this, void 0, void 0, function () {
        var ok;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (peekQaapOAuthReturnFromUrl() !== 'github') {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, syncQaapAuthSessionFromServer()];
                case 1:
                    ok = _a.sent();
                    consumeQaapOAuthReturnFromUrl();
                    if (ok) {
                        revealQaapWorkbenchAfterAuth();
                        // Keep #!empty from the OAuth redirect; only strip query params so workspace restore stays stable.
                        stripQaapOAuthParamsFromUrl(false);
                    }
                    return [2 /*return*/, ok];
            }
        });
    });
}
/** Backend-provided machine-readable reason for the last failed OAuth callback. */
function peekQaapOAuthErrorReasonFromUrl() {
    if (typeof window === 'undefined') {
        return undefined;
    }
    var reason = new URLSearchParams(window.location.search).get('qaap_oauth_reason');
    return reason && reason.length > 0 ? reason : undefined;
}
function consumeQaapOAuthReturnFromUrl() {
    if (typeof window === 'undefined') {
        return undefined;
    }
    var params = new URLSearchParams(window.location.search);
    if (params.has('qaap_oauth_error')) {
        var next = new URL(window.location.href);
        next.searchParams.delete('qaap_oauth_error');
        next.searchParams.delete('qaap_oauth_reason');
        window.history.replaceState({}, '', next.pathname + next.search + next.hash);
        return 'error';
    }
    var provider = params.get('qaap_oauth');
    if (provider === 'github') {
        var next = new URL(window.location.href);
        next.searchParams.delete('qaap_oauth');
        window.history.replaceState({}, '', next.pathname + next.search + next.hash);
        return 'github';
    }
    return undefined;
}
