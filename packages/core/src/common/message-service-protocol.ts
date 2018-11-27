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

import { injectable } from 'inversify';
import { CancellationToken } from './cancellation';

export const messageServicePath = '/services/messageService';

export enum MessageType {
    Error = 1,
    Warning = 2,
    Info = 3,
    Log = 4,
    Progress = 5
}

export interface Message {
    readonly type?: MessageType;
    readonly text: string;
    readonly actions?: string[];
    readonly options?: MessageOptions;
}

export interface ProgressMessage extends Message {
    readonly type?: MessageType.Progress;
    readonly options?: ProgressMessageOptions;
}
export namespace ProgressMessage {
    export const Cancel = 'Cancel';
    export function isCancelable(message: ProgressMessage): boolean {
        return !message.options
            || message.options.cancelable === undefined
            || message.options.cancelable === true;
    }
}

export interface MessageOptions {
    readonly timeout?: number;
}

export interface ProgressMessageOptions extends MessageOptions {
    /**
     * Default: `true`
     */
    readonly cancelable?: boolean;
}

export interface Progress {
    readonly id: string;
    readonly report: (update: ProgressUpdate) => void;
    readonly cancel: () => void;
    readonly result: Promise<string | undefined>;
}

export interface ProgressUpdate {
    readonly message?: string;
    readonly work?: { done: number, total: number };
}

@injectable()
export class MessageClient {

    /**
     * Show a message of the given type and possible actions to the user.
     * Resolve to a chosen action.
     * Never reject.
     *
     * To be implemented by an extension, e.g. by the messages extension.
     */
    showMessage(message: Message): Promise<string | undefined> {
        console.info(message.text);
        return Promise.resolve(undefined);
    }

    /**
     * Show progress message with possible actions to user.
     *
     * To be implemented by an extension, e.g. by the messages extension.
     */
    showProgress(progressId: string, message: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        console.info(message.text);
        return Promise.resolve(undefined);
    }

    /**
     * Update started progress message.
     *
     * To be implemented by an extension, e.g. by the messages extension.
     */
    reportProgress(progressId: string, update: ProgressUpdate, message: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        return Promise.resolve(undefined);
    }
}
