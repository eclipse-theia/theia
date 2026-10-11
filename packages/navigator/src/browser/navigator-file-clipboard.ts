// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';

/**
 * In-app store for file URIs copied in the navigator.
 *
 * Reading the system clipboard from a browser requires a user permission prompt.
 * By remembering what the navigator itself copied, pasting within the application
 * works without accessing the system clipboard. The store cannot observe copies
 * made in external applications; consumers should fall back to the system
 * clipboard when the store is empty.
 */
@injectable()
export class NavigatorFileClipboard {

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    protected content: string | undefined;

    @postConstruct()
    protected init(): void {
        // any copy or cut invalidates the store; the navigator repopulates it in its
        // own (bubbling) copy listener, which runs after this capturing listener
        document.addEventListener('copy', this.clear, true);
        document.addEventListener('cut', this.clear, true);
        // writes through the ClipboardService (e.g. Copy Path) dispatch no DOM event either,
        // so invalidate the store here to let consumers fall back to the system clipboard
        this.clipboardService.onDidWriteText?.(this.clear);
    }

    set(content: string): void {
        this.content = content || undefined;
    }

    get(): string | undefined {
        return this.content;
    }

    protected clear = (): void => {
        this.content = undefined;
    };
}
