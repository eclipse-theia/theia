// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FileUri } from '@theia/core/lib/common/file-uri';
import { nls } from '@theia/core/lib/common/nls';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Widget as LuminoWidget } from '@lumino/widgets';
import { MessageLoop } from '@lumino/messaging';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { resolveTranscriptWorkspaceRootUri } from './qaap-transcript-file-open';
import type { TranscriptTerminalSurface } from './qaap-transcript-surface-types';

export interface TranscriptTerminalViewServices {
    resolveCwd(cwd: string): string;
    createTerminal(cwd: string): Promise<TerminalWidget>;
    localize(key: string, defaultValue: string, ...args: string[]): string;
}

export type { TranscriptTerminalSurface } from './qaap-transcript-surface-types';

export function scheduleTranscriptTerminalResize(terminal: TerminalWidget): void {
    terminal.update();
    requestAnimationFrame(() => {
        if (terminal.isAttached) {
            MessageLoop.sendMessage(terminal, LuminoWidget.ResizeMessage.UnknownSize);
            terminal.update();
        }
    });
}

/**
 * Creates a connected DOM staging parent so {@link LuminoWidget.attach} does not throw
 * ("Host is not attached") while the surface waits in the workspace cache.
 */
export function createTranscriptTerminalStagingHost(): HTMLElement {
    const staging = document.createElement('div');
    staging.className = 'theia-mobile-transcript-terminal-staging';
    staging.hidden = true;
    staging.setAttribute('aria-hidden', 'true');
    document.body.append(staging);
    return staging;
}

/**
 * Creates one integrated terminal for a workspace ({@link TerminalService#newTerminal}).
 * `mountTarget` must already be in the document (Lumino requirement).
 */
export async function createTranscriptTerminalSurface(
    mountTarget: HTMLElement,
    cwd: string,
    services: TranscriptTerminalViewServices,
): Promise<TranscriptTerminalSurface> {
    if (!mountTarget.isConnected) {
        throw new Error('Host is not attached.');
    }
    const resolvedCwd = services.resolveCwd(cwd);
    const terminal = await services.createTerminal(resolvedCwd);
    const mountHost = document.createElement('div');
    mountHost.className = 'theia-mobile-transcript-terminal-mount';
    mountTarget.replaceChildren();
    mountTarget.append(mountHost);

    terminal.node.classList.add('theia-mobile-transcript-terminal-embed');
    LuminoWidget.attach(terminal, mountHost);
    await terminal.start();
    scheduleTranscriptTerminalResize(terminal);

    const toDispose = new DisposableCollection(
        Disposable.create(() => {
            if (terminal.isAttached && terminal.node.parentElement) {
                LuminoWidget.detach(terminal);
            }
            if (!terminal.isDisposed) {
                terminal.dispose();
            }
            mountHost.remove();
        }),
    );

    return { terminal, mountHost, dispose: toDispose };
}

/** Mounts a cached terminal surface into the transcript tab host. */
export function attachTranscriptTerminalSurface(
    host: HTMLElement,
    surface: TranscriptTerminalSurface,
): Disposable {
    if (!host.isConnected) {
        throw new Error('Host is not attached.');
    }
    host.replaceChildren();
    host.classList.add('theia-mobile-transcript-terminal');
    host.append(surface.mountHost);
    scheduleTranscriptTerminalResize(surface.terminal);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (surface.terminal.isAttached && !host.hidden) {
                MessageLoop.sendMessage(surface.terminal, LuminoWidget.ResizeMessage.UnknownSize);
                surface.terminal.update();
            }
        })
        : undefined;
    resizeObserver?.observe(surface.mountHost);

    return Disposable.create(() => {
        resizeObserver?.disconnect();
        detachTranscriptTerminalSurface(host, surface);
    });
}

/** Detaches the surface from the sheet without killing the PTY (for reuse / cache). */
export function detachTranscriptTerminalSurface(host: HTMLElement, surface: TranscriptTerminalSurface): void {
    if (surface.mountHost.parentElement === host) {
        surface.mountHost.remove();
    }
}

export function createTranscriptTerminalViewServices(
    terminalService: TerminalService,
    workspaceService: WorkspaceService,
): TranscriptTerminalViewServices {
    return {
        resolveCwd: cwd => {
            const root = resolveTranscriptWorkspaceRootUri(cwd, workspaceService);
            if (root) {
                return FileUri.fsPath(root.toString());
            }
            return cwd;
        },
        createTerminal: async cwd => terminalService.newTerminal({
            title: nls.localizeByDefault('Terminal'),
            cwd,
            destroyTermOnClose: true,
            useServerTitle: true,
        }),
        localize: (key, defaultValue, ...args) => nls.localize(key, defaultValue, ...args),
    };
}
