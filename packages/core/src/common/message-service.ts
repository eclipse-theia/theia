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

import { injectable, inject } from "inversify";
import { MessageClient, MessageType, MessageOptions } from "./message-service-protocol";

@injectable()
export class MessageService {

    constructor(
        @inject(MessageClient) protected readonly client: MessageClient
    ) { }

    log(message: string, ...actions: string[]): Promise<string | undefined>;
    log(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
    // tslint:disable-next-line:no-any
    log(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Log, message, args);
    }

    info(message: string, ...actions: string[]): Promise<string | undefined>;
    info(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
    // tslint:disable-next-line:no-any
    info(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Info, message, args);
    }

    warn(message: string, ...actions: string[]): Promise<string | undefined>;
    warn(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
    // tslint:disable-next-line:no-any
    warn(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Warning, message, args);
    }

    error(message: string, ...actions: string[]): Promise<string | undefined>;
    error(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
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

}
