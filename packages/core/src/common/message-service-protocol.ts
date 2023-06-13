// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable } from 'inversify';
import { CancellationToken } from './cancellation';
import { nls } from './nls';

export const messageServicePath = '/services/messageService';

export enum MessageType {
    Error = 1,
    Warning = 2,
    Info = 3,
    Log = 4,
    Progress = 5
}

export interface Message {
    /**
     * Type of the message, i.e. error, warning, info, etc.
     */
    readonly type?: MessageType;
    /**
     * Message text.
     */
    readonly text: string;
    /**
     * Actions offered to the user in the context of the message.
     */
    readonly actions?: string[];
    /**
     * Additional options.
     */
    readonly options?: MessageOptions;
    readonly source?: string;
}

export interface ProgressMessage extends Message {
    readonly type?: MessageType.Progress;
    readonly options?: ProgressMessageOptions;
}
export namespace ProgressMessage {
    export const Cancel = nls.localizeByDefault('Cancel');
    export function isCancelable(message: ProgressMessage): boolean {
        return !!message.options?.cancelable;
    }
}

export interface MessageOptions {
    /**
     * Timeout in milliseconds.
     * `0` and negative values are treated as no timeout.
     */
    readonly timeout?: number;
}

export interface ProgressMessageOptions extends MessageOptions {
    /**
     * Default: `false`
     */
    readonly cancelable?: boolean;
    /**
     * Known values: `notification` | `window` | `scm`
     */
    readonly location?: string;
}

export interface Progress {
    /**
     * Unique progress id.
     */
    readonly id: string;
    /**
     * Update the current progress.
     *
     * @param update the data to update.
     */
    readonly report: (update: ProgressUpdate) => void;
    /**
     * Cancel or complete the current progress.
     */
    readonly cancel: () => void;
    /**
     * Result of the progress.
     *
     * @returns a promise which resolves to either 'Cancel', an alternative action or `undefined`.
     */
    readonly result: Promise<string | undefined>;
}

export interface ProgressUpdate {
    /**
     * Updated message for the progress.
     */
    readonly message?: string;
    /**
     * Updated ratio between steps done so far and total number of steps.
     */
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
     * Show a progress message with possible actions to user.
     *
     * To be implemented by an extension, e.g. by the messages extension.
     */
    showProgress(progressId: string, message: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        console.info(message.text);
        return Promise.resolve(undefined);
    }

    /**
     * Update a previously created progress message.
     *
     * To be implemented by an extension, e.g. by the messages extension.
     */
    reportProgress(progressId: string, update: ProgressUpdate, message: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        return Promise.resolve(undefined);
    }
}
