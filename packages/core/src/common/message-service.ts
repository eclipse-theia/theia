/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import {
    MessageClient,
    MessageType,
    MessageOptions,
    Progress,
    ProgressUpdate,
    ProgressMessage
} from './message-service-protocol';
import { CancellationTokenSource } from './cancellation';

@injectable()
export class MessageService {

    constructor(
        @inject(MessageClient) protected readonly client: MessageClient
    ) { }

    log<T extends string>(message: string, ...actions: T[]): Promise<T | undefined>;
    log<T extends string>(message: string, options?: MessageOptions, ...actions: T[]): Promise<T | undefined>;
    // tslint:disable-next-line:no-any
    log(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Log, message, args);
    }

    info<T extends string>(message: string, ...actions: T[]): Promise<T | undefined>;
    info<T extends string>(message: string, options?: MessageOptions, ...actions: T[]): Promise<T | undefined>;
    // tslint:disable-next-line:no-any
    info(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Info, message, args);
    }

    warn<T extends string>(message: string, ...actions: T[]): Promise<T | undefined>;
    warn<T extends string>(message: string, options?: MessageOptions, ...actions: T[]): Promise<T | undefined>;
    // tslint:disable-next-line:no-any
    warn(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Warning, message, args);
    }

    error<T extends string>(message: string, ...actions: T[]): Promise<T | undefined>;
    error<T extends string>(message: string, options?: MessageOptions, ...actions: T[]): Promise<T | undefined>;
    // tslint:disable-next-line:no-any
    error(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Error, message, args);
    }

    // tslint:disable-next-line:no-any
    protected processMessage(type: MessageType, text: string, args?: any[]): Promise<string | undefined> {
        if (!!args && args.length > 0) {
            const first = args[0];
            const actions: string[] = args.filter(a => typeof a === 'string');
            const options = (typeof first === 'object' && !Array.isArray(first))
                ? <MessageOptions>first
                : undefined;
            return this.client.showMessage({ type, options, text, actions });
        }
        return this.client.showMessage({ type, text });
    }

    async showProgress(message: ProgressMessage, onDidCancel?: () => void): Promise<Progress> {
        const id = this.newProgressId();
        const cancellationSource = new CancellationTokenSource();
        const report = (update: ProgressUpdate) => {
            this.client.reportProgress(id, update, message, cancellationSource.token);
        };
        let clientMessage = message;
        if (ProgressMessage.isCancelable(message)) {
            const actions = new Set<string>(message.actions);
            actions.add(ProgressMessage.Cancel);
            clientMessage = { ...message, actions: Array.from(actions) };
        }
        const result = this.client.showProgress(id, clientMessage, cancellationSource.token);
        if (ProgressMessage.isCancelable(message) && typeof onDidCancel === 'function') {
            result.then(value => {
                if (value === ProgressMessage.Cancel) {
                    onDidCancel();
                }
            });
        }
        return {
            id,
            cancel: () => cancellationSource.cancel(),
            result,
            report
        };
    }

    private progressIdPrefix = Math.random().toString(36).substring(5);
    private counter = 0;
    protected newProgressId(): string {
        return `${this.progressIdPrefix}-${++this.counter}`;
    }
}
