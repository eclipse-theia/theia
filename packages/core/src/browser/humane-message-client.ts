/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as humane from 'humane-js';
import { injectable } from "inversify";
import 'humane-js/themes/jackedup.css';
import { MessageClient, MessageType } from '../common/message-service-protocol';
import { FrontendApplication, FrontendApplicationContribution } from './frontend-application';

export const MESSAGE_CLASS = 'theia-Message';
export const MESSAGE_ITEM_CLASS = 'theia-MessageItem';

@injectable()
export class HumaneMessageClient implements MessageClient, FrontendApplicationContribution {

    onStart(app: FrontendApplication): void {
        // no-op
    }

    async showMessage(type: MessageType, message: string, ...actions: string[]): Promise<string | undefined> {
        await this.hide();
        return this.show(type, message, ...actions);
    }

    protected show(type: MessageType, message: string, ...actions: string[]): Promise<string | undefined> {
        // TODO style actions
        let html = `<div class='${MESSAGE_CLASS}'>${message}</div>`;
        if (!!actions && actions.length > 0) {
            for (const action of actions) {
                html += `<div class='${MESSAGE_ITEM_CLASS}'>${action}</div>`;
            }
        }
        return new Promise(resolve => {
            humane.log(html, {
                clickToClose: true,
                timeout: 0,
                addnCls: this.notificationClass(type)
            }, () => {
                // TODO find the chosen action
                resolve(undefined);
            });
        });
    }

    protected hide(): Promise<void> {
        return new Promise(resolve => humane.remove(resolve));
    }

    protected notificationClass(type: MessageType): string {
        if (type === MessageType.Error) {
            return 'humane-jackedup-error';
        }
        // TODO style notificatio classes
        return 'humane-jackedup-info';
    }

}
