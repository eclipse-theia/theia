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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { servicePath } from './service-provider';
import { CancellationToken } from './cancellation';
import { serviceIdentifier } from './types';

export const messageServicePath = servicePath<MessageServer>('/services/messageService');

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
    export const Cancel = 'Cancel';
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

export const MessageServer = serviceIdentifier<MessageServer>('MessageServer');
export interface MessageServer {
    showMessage(message: Message): Promise<string | undefined>
    showProgress(progressId: string, message: ProgressMessage, token: CancellationToken): Promise<string | undefined>
    updateProgress(progressId: string, update: ProgressUpdate, message: ProgressMessage): Promise<void>
}

export const NullMessageServer: MessageServer = {
    // eslint-disable-next-line no-void
    showMessage: async ({ type = MessageType.Info, text }) => void console.debug(`[${MessageType[type]}] ${text}`),
    showProgress: async () => undefined,
    updateProgress: async () => undefined
};
