/**
 * Qaap sign-in gate — runs before bundle.js (injected via index.html).
 * Blocks IDE startup until GitHub or GitLab is chosen.
 */
(function () {
    'use strict';

    var SIGNED_IN_SUFFIX = 'qaap.auth.signedIn';
    var PROVIDER_SUFFIX = 'qaap.auth.provider';
    var USER_SUFFIX = 'qaap.auth.user';
    var SESSION_ID_SUFFIX = 'qaap.auth.sessionId';
    var AUTH_MS = 1200;

    function storagePrefix() {
        var pathname = window.location.pathname || '/';
        return 'theia:' + pathname + ':';
    }

    function isSignedIn() {
        try {
            var i, key, raw, value;
            for (i = 0; i < localStorage.length; i++) {
                key = localStorage.key(i);
                if (key && key.indexOf(SIGNED_IN_SUFFIX) !== -1) {
                    raw = localStorage.getItem(key);
                    if (raw === null) {
                        continue;
                    }
                    value = JSON.parse(raw);
                    if (value === true || value === 'true') {
                        return true;
                    }
                }
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function writeSignedIn(provider, user, sessionId) {
        var prefix = storagePrefix();
        localStorage.setItem(prefix + SIGNED_IN_SUFFIX, JSON.stringify(true));
        localStorage.setItem(prefix + PROVIDER_SUFFIX, JSON.stringify(provider));
        if (user) {
            localStorage.setItem(prefix + USER_SUFFIX, JSON.stringify(user));
        }
        if (sessionId) {
            localStorage.setItem(prefix + SESSION_ID_SUFFIX, JSON.stringify(sessionId));
        }
    }

    function loadBundle() {
        if (window.__qaapBundleLoading || window.__qaapBundleLoaded) {
            return;
        }
        window.__qaapBundleLoading = true;
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = './bundle.js';
        script.onload = function () {
            window.__qaapBundleLoaded = true;
        };
        script.onerror = function () {
            window.__qaapBundleLoading = false;
            console.error('[Qaap] Failed to load application bundle.');
        };
        document.body.appendChild(script);
    }

    function appName() {
        var meta = document.querySelector('meta[name="application-name"]');
        return (meta && meta.getAttribute('content') && meta.getAttribute('content').trim()) || 'Qaap';
    }

    function logoUrl() {
        var meta = document.querySelector('meta[name="application-icon"]');
        return (meta && meta.getAttribute('content') && meta.getAttribute('content').trim()) || './media/qaap-logo.svg';
    }

    var GITHUB_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>';
    var GITLAB_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FC6D26" d="M12 22l3.5-10.8H8.5L12 22z"/><path fill="#E24329" d="M12 22L8.5 11.2H3.6L12 22z"/><path fill="#FCA326" d="M3.6 11.2L2.5 14.7a.7.7 0 00.3.8L12 22 3.6 11.2z"/><path fill="#E24329" d="M3.6 11.2h4.9L6.4 4.7c-.1-.4-.6-.4-.7 0L3.6 11.2z"/><path fill="#FC6D26" d="M12 22l3.5-10.8h4.9L12 22z"/><path fill="#FCA326" d="M20.4 11.2l1 3.5a.7.7 0 01-.3.8L12 22l8.4-10.8z"/><path fill="#E24329" d="M20.4 11.2h-4.9l2.1-6.5c.1-.4.6-.4.7 0l2.1 6.5z"/></svg>';

    function injectStyles() {
        if (document.getElementById('qaap-login-gate-styles')) {
            return;
        }
        var style = document.createElement('style');
        style.id = 'qaap-login-gate-styles';
        style.textContent = [
            'body.qaap-login-active{overflow:hidden;margin:0}',
            'body.qaap-login-active .theia-preload{display:none!important}',
            '#qaap-login-host{--qaap-ink:#1a1a1a;--qaap-surface:#fff;--qaap-muted:#6b6b6b;--qaap-border:#e2e2e2;--qaap-link:#0969da;',
            'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif}',
            '@media (prefers-color-scheme:dark){#qaap-login-host{--qaap-ink:#f5f5f5;--qaap-surface:#1e1e1e;--qaap-muted:#a0a0a0;--qaap-border:#3c3c3c;--qaap-link:#58a6ff}}',
            '.qaap-login-overlay{flex:1;display:flex;flex-direction:column;padding:32px 24px 24px;background:var(--qaap-surface);color:var(--qaap-ink);box-sizing:border-box}',
            '.qaap-login-brand{display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:24px}',
            '.qaap-login-logo{width:64px;height:64px;object-fit:contain}',
            '.qaap-login-title{margin:0;font-size:30px;font-weight:700;letter-spacing:-.8px}',
            '.qaap-login-tagline{margin:0;max-width:280px;font-size:14px;line-height:1.45;text-align:center;color:var(--qaap-muted)}',
            '.qaap-login-spacer{flex:1;min-height:24px}',
            '.qaap-login-actions{display:flex;flex-direction:column;gap:10px}',
            '.qaap-login-btn{width:100%;height:48px;border-radius:10px;cursor:pointer;font:inherit;font-size:15px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:10px}',
            '.qaap-login-btn--primary{border:none;background:var(--qaap-ink);color:var(--qaap-surface)}',
            '.qaap-login-btn--secondary{height:44px;border:1px solid var(--qaap-border);background:transparent;color:var(--qaap-ink);font-size:14px;font-weight:500}',
            '.qaap-login-btn:disabled{opacity:.85;cursor:wait}',
            '.qaap-login-btn-icon{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center}',
            '.qaap-login-spinner{width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in srgb,currentColor 35%,transparent);border-top-color:currentColor;animation:qaap-spin .8s linear infinite}',
            '@keyframes qaap-spin{to{transform:rotate(360deg)}}',
            '.qaap-login-footer{margin-top:20px;font-size:11.5px;line-height:1.5;text-align:center;color:var(--qaap-muted)}',
            '.qaap-login-footer a{color:var(--qaap-link);text-decoration:none}'
        ].join('');
        document.head.appendChild(style);
    }

    function showGate() {
        injectStyles();
        document.body.classList.add('qaap-login-active');

        var host = document.createElement('div');
        host.id = 'qaap-login-host';
        host.setAttribute('role', 'dialog');
        host.setAttribute('aria-modal', 'true');
        host.innerHTML =
            '<div class="qaap-login-overlay">' +
            '<header class="qaap-login-brand">' +
            '<img class="qaap-login-logo" src="' + logoUrl() + '" width="64" height="64" alt=""/>' +
            '<h1 class="qaap-login-title">' + appName() + '</h1>' +
            '<p class="qaap-login-tagline">A pocket workspace for coding agents.<br/>Sign in to connect your repos.</p>' +
            '</header>' +
            '<div class="qaap-login-spacer"></div>' +
            '<div class="qaap-login-actions">' +
            '<button type="button" id="qaap-login-github" class="qaap-login-btn qaap-login-btn--primary">' +
            '<span class="qaap-login-btn-icon">' + GITHUB_SVG + '</span>Iniciar con GitHub</button>' +
            '<button type="button" id="qaap-login-gitlab" class="qaap-login-btn qaap-login-btn--secondary">' +
            '<span class="qaap-login-btn-icon">' + GITLAB_SVG + '</span>Iniciar con GitLab</button>' +
            '</div>' +
            '<footer class="qaap-login-footer">By continuing you agree to the terms &amp; privacy.</footer>' +
            '</div>';

        document.body.appendChild(host);

        var preloadEls = document.getElementsByClassName('theia-preload');
        for (var p = 0; p < preloadEls.length; p++) {
            preloadEls[p].style.display = 'none';
        }

        function authorize(provider, button) {
            if (button.disabled) {
                return;
            }
            if (provider === 'github') {
            try {
                window.history.replaceState({}, '', window.location.pathname + window.location.search);
            } catch (e) { /* ignore */ }
                window.location.href = '/qaap/oauth/github/start';
                return;
            }
            var buttons = host.querySelectorAll('button');
            for (var b = 0; b < buttons.length; b++) {
                buttons[b].disabled = true;
            }
            button.innerHTML = '<span class="qaap-login-spinner"></span> Authorizing…';
            window.setTimeout(function () {
                writeSignedIn(provider);
                host.remove();
                document.body.classList.remove('qaap-login-active');
                loadBundle();
            }, AUTH_MS);
        }

        var github = document.getElementById('qaap-login-github');
        var gitlab = document.getElementById('qaap-login-gitlab');
        if (github) {
            github.addEventListener('click', function (e) {
                e.preventDefault();
                authorize('github', github);
            });
        }
        if (gitlab) {
            gitlab.addEventListener('click', function (e) {
                e.preventDefault();
                authorize('gitlab', gitlab);
            });
        }
        if (github) {
            github.focus();
        }
    }

    if (window.location.search.indexOf('qaapLogout=1') !== -1) {
        try {
            var keysToRemove = [];
            for (var k = 0; k < localStorage.length; k++) {
                var storageKey = localStorage.key(k);
                if (storageKey && storageKey.indexOf('qaap.auth') !== -1) {
                    keysToRemove.push(storageKey);
                }
            }
            for (var r = 0; r < keysToRemove.length; r++) {
                localStorage.removeItem(keysToRemove[r]);
            }
        } catch (e) { /* ignore */ }
    }

    function resumeAfterOAuthOrSession() {
        if (window.location.search.indexOf('qaap_oauth_error=1') !== -1) {
            try {
                var errParams = new URLSearchParams(window.location.search);
                var reason = errParams.get('qaap_oauth_reason');
                console.error('[Qaap] GitHub OAuth callback failed.', reason ? 'Reason: ' + reason : '(no reason provided by backend)');
            } catch (e) { /* ignore */ }
        }
        if (window.location.search.indexOf('qaap_oauth=github') !== -1) {
            fetch('/qaap/api/auth/session', { credentials: 'include' })
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('session');
                    }
                    return response.json();
                })
                .then(function (data) {
                    if (data && data.signedIn && data.user && data.user.provider) {
                        writeSignedIn(data.user.provider, data.user, data.sessionId);
                    }
                    document.body.classList.remove('qaap-login-active');
                    var host = document.getElementById('qaap-login-host');
                    if (host) {
                        host.remove();
                    }
                    var next = new URL(window.location.href);
                    next.searchParams.delete('qaap_oauth');
                    next.searchParams.delete('qaap_oauth_error');
                    var clean = next.pathname + next.search + (next.hash || '');
                    window.history.replaceState({}, '', clean);
                    loadBundle();
                })
                .catch(function () {
                    document.body.classList.remove('qaap-login-active');
                    loadBundle();
                });
            return;
        }
        fetch('/qaap/api/auth/session', { credentials: 'include' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('session');
                }
                return response.json();
            })
            .then(function (data) {
                if (data && data.signedIn && data.user && data.user.provider) {
                    writeSignedIn(data.user.provider, data.user, data.sessionId);
                    loadBundle();
                    return;
                }
                throw new Error('unsigned');
            })
            .catch(function () {
                if (document.body) {
                    showGate();
                } else {
                    document.addEventListener('DOMContentLoaded', showGate);
                }
            });
    }

    if (isSignedIn()) {
        loadBundle();
    } else {
        resumeAfterOAuthOrSession();
    }
})();
