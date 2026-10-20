// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { MaybePromise } from '@theia/core/lib/common';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { SecondaryWindowHandler } from '@theia/core/lib/browser/secondary-window-handler';
import { WebviewWidget } from './webview';

/**
 * Forwards messages from webviews to their iframes in secondary windows.
 *
 * The webview's iframe only accepts messages from its parent window, so the main window posts them to the secondary window,
 * from where a script forwards them to the iframe of the webview that the message is addressed to.
 */
@injectable()
export class WebviewSecondaryWindowSupport implements FrontendApplicationContribution {
    protected static readonly SCRIPT_ID = 'theia-webview-message-forwarding';

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    onStart(app: FrontendApplication): MaybePromise<void> {
        this.secondaryWindowHandler.onDidAddWidget(([widget, win]) => {
            if (widget instanceof WebviewWidget) {
                this.installMessageForwarding(win);
            }
        });
    }

    protected installMessageForwarding(win: Window): void {
        // a window may contain several webviews, but must forward each message once only
        if (win.document.getElementById(WebviewSecondaryWindowSupport.SCRIPT_ID)) {
            return;
        }
        const script = win.document.createElement('script');
        script.id = WebviewSecondaryWindowSupport.SCRIPT_ID;
        script.text = `
            window.addEventListener('message', e => {
                // Only process messages from Theia main window that are addressed to a webview
                if (e.source === window.opener && e.data && typeof e.data.webviewId === 'string') {
                    const { webviewId, ...message } = e.data;
                    for (const frame of window.document.getElementsByTagName('iframe')) {
                        if (frame.dataset.webviewId === webviewId) {
                            frame.contentWindow?.postMessage(message, '*');
                        }
                    }
                }
            });`;
        win.document.head.append(script);
    }
}
