/********************************************************************************
 * Copyright (C) 2019 RedHat and others.
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

import { injectable, inject } from 'inversify';
import { isFirefox } from './browser';
import { ClipboardService } from './clipboard-service';
import { ILogger } from '../common/logger';
import { MessageService } from '../common/message-service';

export interface NavigatorClipboard {
    readText(): Promise<string>;
    writeText(value: string): Promise<void>;
}
export interface PermissionStatus {
    state: 'granted' | 'prompt' | 'denied'
}
export interface NavigatorPermissions {
    query(options: { name: string }): Promise<PermissionStatus>
}

@injectable()
export class BrowserClipboardService implements ClipboardService {

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    async readText(): Promise<string> {
        let permission;
        try {
            permission = await this.queryPermission('clipboard-read');
        } catch (e) {
            this.logger.error('Failed checking a clipboard-read permission.', e);
            // in FireFox, Clipboard API isn't gated with the permissions
            try {
                return await this.getClipboardAPI().readText();
            } catch (e) {
                this.logger.error('Failed reading clipboard content.', e);
                if (isFirefox) {
                    this.messageService.warn(`Clipboard API is not available.
                    It can be enabled by 'dom.events.testing.asyncClipboard' preference on 'about:config' page. Then reload Theia.
                    Note, it will allow FireFox getting full access to the system clipboard.`);
                }
                throw new Error('Failed reading clipboard content.');
            }
        }
        if (permission.state === 'denied') {
            // most likely, the user intentionally denied the access
            this.messageService.error("Access to the clipboard is denied. Check your browser's permission.");
            throw new Error('Access to the clipboard is denied.');
        }
        return this.getClipboardAPI().readText();
    }

    async writeText(value: string): Promise<void> {
        let permission;
        try {
            permission = await this.queryPermission('clipboard-write');
        } catch (e) {
            this.logger.error('Failed checking a clipboard-write permission.', e);
            // in FireFox, Clipboard API isn't gated with the permissions
            try {
                await this.getClipboardAPI().writeText(value);
                return;
            } catch (e) {
                this.logger.error('Failed writing to the clipboard.', e);
                if (isFirefox) {
                    this.messageService.warn(`Clipboard API is not available.
                    It can be enabled by 'dom.events.testing.asyncClipboard' preference on 'about:config' page. Then reload Theia.
                    Note, it will allow FireFox getting full access to the system clipboard.`);
                }
                throw new Error('Failed writing the the clipboard.');
            }
        }
        if (permission.state === 'denied') {
            // most likely, the user intentionally denied the access
            this.messageService.error("Access to the clipboard is denied. Check your browser's permission.");
            throw new Error('Access to the clipboard is denied.');
        }
        return this.getClipboardAPI().writeText(value);
    }

    protected async queryPermission(name: string): Promise<PermissionStatus> {
        if ('permissions' in navigator) {
            return (<NavigatorPermissions>navigator['permissions']).query({ name: name });
        }
        throw new Error('Permissions API unavailable');
    }

    protected getClipboardAPI(): NavigatorClipboard {
        if ('clipboard' in navigator) {
            return (<NavigatorClipboard>navigator['clipboard']);
        }
        throw new Error('Async Clipboard API unavailable');
    }
}
