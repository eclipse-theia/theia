/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { isFirefox } from '@theia/core/lib/browser';

@injectable()
export class TerminalCopyOnSelectionHandler {

    private textToCopy: string;
    private interceptCopy: boolean;

    private copyListener = (ev: ClipboardEvent) => {
        if (this.interceptCopy && ev.clipboardData) {
            ev.clipboardData.setData('text/plain', this.textToCopy);
            ev.preventDefault();
        }
    };

    @postConstruct()
    protected init(): void {
        document.addEventListener('copy', this.copyListener);
    }

    private async clipBoardCopyIsGranted(): Promise<boolean> {
        // Unfortunately Firefox doesn't support permission check `clipboard-write`, so let try to copy anyway,
        if (isFirefox) {
            return true;
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const permissions = (navigator as any).permissions;
            const { state } = await permissions.query({ name: 'clipboard-write' });
            if (state === 'granted') {
                return true;
            }
        } catch (e) { }

        return false;
    }

    private executeCommandCopy(): void {
        try {
            this.interceptCopy = true;
            document.execCommand('copy');
            this.interceptCopy = false;
        } catch (e) {
            // do nothing
        }
    }

    private async writeToClipBoard(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clipboard = (navigator as any).clipboard;

        if (!clipboard) {
            this.executeCommandCopy();
            return;
        }

        try {
            await clipboard.writeText(this.textToCopy);
        } catch (e) {
            this.executeCommandCopy();
        }
    }

    async copy(text: string): Promise<void> {
        this.textToCopy = text;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permissions = (navigator as any).permissions;
        if (permissions && permissions.query && await this.clipBoardCopyIsGranted()) {
            await this.writeToClipBoard();
        } else {
            this.executeCommandCopy();
        }
    }
}
