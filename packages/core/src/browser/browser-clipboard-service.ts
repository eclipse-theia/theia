/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { ClipboardService } from './clipboard-service';

export interface NavigatorClipboard {
    readText(): Promise<string>;
    writeText(value: string): Promise<void>;
}
export interface NavigatorPermissions {
    query(options: { name: string }): Promise<{ state: 'granted' | 'prompt' | 'denied' }>
}

@injectable()
export class BrowserClipboardService implements ClipboardService {

    async readText(): Promise<string> {
        if ('permissions' in navigator && 'clipboard' in navigator) {
            const result = await (<NavigatorPermissions>navigator['permissions']).query({ name: 'clipboard-read' });
            if (result.state === 'granted' || result.state === 'prompt') {
                return (<NavigatorClipboard>navigator['clipboard']).readText();
            }
        }
        return '';
    }

    async writeText(value: string): Promise<void> {
        if ('permissions' in navigator && 'clipboard' in navigator) {
            const result = await (<NavigatorPermissions>navigator['permissions']).query({ name: 'clipboard-write' });
            if (result.state === 'granted' || result.state === 'prompt') {
                return (<NavigatorClipboard>navigator['clipboard']).writeText(value);
            }
        }
    }

}
