// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { MiniBrowser } from '@theia/mini-browser/lib/browser/mini-browser';
import { QaapMiniBrowserContent } from './qaap-mini-browser-content';
import { findQaapMiniBrowserContentFromWidgets } from './qaap-preview-surface-registry';

export function isWorkHubAgentsShellActive(): boolean {
    if (typeof document === 'undefined') {
        return false;
    }
    return !!document.querySelector('.theia-mobile-projects.theia-mod-agents-hub-shell-active');
}

export function forEachQaapMiniBrowserContent(
    shell: ApplicationShell,
    callback: (content: QaapMiniBrowserContent, widget: MiniBrowser) => void,
): void {
    for (const area of ['main', 'right'] as const) {
        for (const widget of shell.getWidgets(area)) {
            if (!(widget instanceof MiniBrowser)) {
                continue;
            }
            const content = findQaapMiniBrowserContentFromWidgets([widget]);
            if (content) {
                callback(content, widget);
            }
        }
    }
}

/** Unloads preview iframes so embedded dev servers stop HMR noise while Work Hub is foreground. */
export function suspendQaapMiniBrowserPreviews(shell: ApplicationShell, exceptWidgetId?: string): void {
    forEachQaapMiniBrowserContent(shell, (content, widget) => {
        if (exceptWidgetId && widget.id === exceptWidgetId) {
            return;
        }
        content.suspendPreviewFrame();
    });
}

export function resumeQaapMiniBrowserPreview(shell: ApplicationShell, widgetId?: string): void {
    forEachQaapMiniBrowserContent(shell, (content, widget) => {
        if (widgetId && widget.id !== widgetId) {
            return;
        }
        content.resumePreviewFrame();
    });
}

export function syncQaapMiniBrowserPreviewSuspension(
    shell: ApplicationShell,
    userViewingIdePreview: boolean,
): void {
    if (userViewingIdePreview) {
        forEachQaapMiniBrowserContent(shell, (content, widget) => {
            if (shell.activeWidget?.id === widget.id || shell.currentWidget?.id === widget.id) {
                content.resumePreviewFrame();
            } else {
                content.suspendPreviewFrame();
            }
        });
        return;
    }
    if (isWorkHubAgentsShellActive()) {
        suspendQaapMiniBrowserPreviews(shell);
    }
}
