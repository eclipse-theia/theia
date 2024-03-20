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

@injectable()
export class WebviewSecondaryWindowSupport implements FrontendApplicationContribution {
    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    onStart(app: FrontendApplication): MaybePromise<void> {
        this.secondaryWindowHandler.onDidAddWidget(([widget, win]) => {
            if (widget instanceof WebviewWidget) {
                const script = win.document.createElement('script');
                script.text = `
                        window.addEventListener('message', e => {
                        // Only process messages from Theia main window
                        if (e.source === window.opener) {
                            // Delegate message to iframe
                            const frame = window.document.getElementsByTagName('iframe').item(0);
                            if (frame) {
                                frame.contentWindow?.postMessage({ ...e.data }, '*');
                            }
                        }
                        }); `;
                win.document.head.append(script);
            }
        });
    }
}
