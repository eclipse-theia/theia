// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, ContextMenuRenderer } from '@theia/core/lib/browser';
import { SecondaryWindowService } from '@theia/core/lib/browser/window/secondary-window-service';
import { NotificationManager } from './notifications-manager';
import { NotificationCenterComponent } from './notification-center-component';
import { NotificationToastsComponent } from './notification-toasts-component';
import { CorePreferences, DisposableCollection } from '@theia/core';

@injectable()
export class NotificationsRenderer {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(SecondaryWindowService)
    protected readonly secondaryWindowService: SecondaryWindowService;

    protected containerRoot: Root;
    protected readonly secondaryWindowRoots = new Map<Window, { root: Root; container: HTMLDivElement }>();
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.createOverlayContainer();
        this.render();
        this.setupSecondaryWindowSupport();
    }

    protected container: HTMLDivElement;
    protected createOverlayContainer(): void {
        this.container = window.document.createElement('div');
        this.container.className = 'theia-notifications-overlay';
        if (window.document.body) {
            window.document.body.appendChild(this.container);
        }
        this.containerRoot = createRoot(this.container);
    }

    protected setupSecondaryWindowSupport(): void {
        this.toDispose.push(this.secondaryWindowService.onWindowLoaded(win => {
            this.createSecondaryWindowOverlay(win);
        }));
        this.toDispose.push(this.secondaryWindowService.onWindowClosed(win => {
            this.removeSecondaryWindowOverlay(win);
        }));
    }

    /**
     * Creates a notification overlay in the given secondary window.
     *
     * Both toasts and the notification center are rendered into every window
     * (main and secondary), all driven by the same {@link NotificationManager}
     * state. This means:
     * - A toast triggered from any window appears in all windows simultaneously.
     * - Toggling the notification center opens/closes it in all windows at once.
     *
     * Showing toasts everywhere ensures users don't miss notifications regardless
     * of which window they are looking at. Per-window notification center gating
     * is a potential future improvement.
     */
    protected createSecondaryWindowOverlay(win: Window): void {
        const container = win.document.createElement('div');
        container.className = 'theia-notifications-overlay';
        win.document.body.appendChild(container);
        const root = createRoot(container);
        root.render(this.renderNotificationComponents());
        this.secondaryWindowRoots.set(win, { root, container });
    }

    protected removeSecondaryWindowOverlay(win: Window): void {
        const entry = this.secondaryWindowRoots.get(win);
        if (entry) {
            entry.root.unmount();
            entry.container.remove();
            this.secondaryWindowRoots.delete(win);
        }
    }

    protected render(): void {
        this.containerRoot.render(this.renderNotificationComponents());
    }

    protected renderNotificationComponents(): React.ReactNode {
        return <div>
            <NotificationToastsComponent
                manager={this.manager}
                corePreferences={this.corePreferences}
                contextMenuRenderer={this.contextMenuRenderer}
            />
            <NotificationCenterComponent
                manager={this.manager}
                contextMenuRenderer={this.contextMenuRenderer}
            />
        </div>;
    }

}
