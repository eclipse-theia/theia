// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Lightweight global snackbar for the narrow-viewport workbench. Sits above the
 * bottom activity bar / keyboard accessory and acknowledges gestures that have
 * no other visible feedback (e.g. two-finger swipe between editor tabs, undo of
 * a PR decision, "Refresh" pull triggered).
 *
 * Design choices:
 *  - Renders directly under `document.body` so it is unaffected by Lumino layout.
 *  - Z-index sits just below the onboarding overlay but above side sheets so
 *    feedback for a sheet-internal gesture stays readable.
 *  - Single live region; rapidly chained calls replace the previous toast and
 *    reset the timer (matches Android Material `Snackbar` behavior).
 *  - Bottom inset honors `--theia-mobile-bottom-bar-height`,
 *    `--theia-mobile-status-chrome-height` and `--theia-mobile-keyboard-inset`,
 *    so the toast stays out of the way when the soft keyboard or code accessory
 *    is up.
 */
export namespace MobileSnackbar {

    export type Kind = 'default' | 'success' | 'warning' | 'loading';

    export interface ShowOptions {
        /** Visual variant. Defaults to `default`. */
        kind?: Kind;
        /**
         * Display duration in ms. Defaults to `1800` (short / Material `LENGTH_SHORT`).
         * Use `0` with `kind: 'loading'` to keep the toast until the next `show()` / `dismiss()`.
         */
        duration?: number;
        /** Optional action text. When provided, an inline button is shown. */
        actionLabel?: string;
        /** Invoked when the user taps the action button. */
        onAction?: () => void;
    }

    let host: HTMLElement | undefined;
    let timer: number | undefined;

    function ensureHost(): HTMLElement {
        if (host && document.body.contains(host)) {
            return host;
        }
        const node = document.createElement('div');
        node.className = 'theia-mobile-snackbar';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        node.setAttribute('aria-atomic', 'true');
        node.hidden = true;
        document.body.appendChild(node);
        host = node;
        return node;
    }

    export function show(message: string, options: ShowOptions = {}): void {
        if (typeof document === 'undefined') {
            return;
        }
        const node = ensureHost();
        const isLoading = options.kind === 'loading';
        const duration = isLoading
            ? 0
            : Math.max(800, Math.min(8000, options.duration ?? 1800));
        node.classList.remove('theia-mod-kind-success', 'theia-mod-kind-warning', 'theia-mod-kind-loading');
        if (options.kind === 'success') {
            node.classList.add('theia-mod-kind-success');
        } else if (options.kind === 'warning') {
            node.classList.add('theia-mod-kind-warning');
        } else if (isLoading) {
            node.classList.add('theia-mod-kind-loading');
        }

        node.replaceChildren();
        if (isLoading) {
            const spinner = document.createElement('span');
            spinner.className = 'theia-mobile-snackbar-spinner codicon codicon-loading';
            spinner.setAttribute('aria-hidden', 'true');
            node.appendChild(spinner);
        }
        const label = document.createElement('span');
        label.className = 'theia-mobile-snackbar-message';
        label.textContent = message;
        node.appendChild(label);

        if (options.actionLabel && options.onAction) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'theia-mobile-snackbar-action';
            action.textContent = options.actionLabel;
            action.addEventListener('click', () => {
                try {
                    options.onAction?.();
                } finally {
                    dismiss();
                }
            });
            node.appendChild(action);
        }

        node.hidden = false;
        // Force reflow so the transition runs even when chaining show() rapidly.
        void node.offsetWidth;
        node.classList.add('theia-mod-visible');

        if (timer !== undefined) {
            window.clearTimeout(timer);
            timer = undefined;
        }
        if (duration > 0) {
            timer = window.setTimeout(dismiss, duration);
        }
    }

    export function dismiss(): void {
        if (timer !== undefined) {
            window.clearTimeout(timer);
            timer = undefined;
        }
        if (!host) {
            return;
        }
        host.classList.remove('theia-mod-visible');
        window.setTimeout(() => {
            if (host && !host.classList.contains('theia-mod-visible')) {
                host.hidden = true;
            }
        }, 220);
    }
}
