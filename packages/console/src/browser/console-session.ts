/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { ReactNode } from 'react';
import { Event } from '@theia/core/lib/common/event';
import { MaybePromise } from '@theia/core/lib/common/types';
import { MessageType } from '@theia/core/lib/common/message-service-protocol';

export interface ConsoleItem {
    readonly severity?: MessageType
    readonly empty: boolean
    render(): ReactNode
}
export namespace ConsoleItem {
    export const errorClassName = 'theia-console-error';
    export const warningClassName = 'theia-console-warning';
    export const infoClassName = 'theia-console-info';
    export const logClassName = 'theia-console-log';
    export function toClassName(item: ConsoleItem): string | undefined {
        if (item.severity === MessageType.Error) {
            return errorClassName;
        }
        if (item.severity === MessageType.Warning) {
            return warningClassName;
        }
        if (item.severity === MessageType.Info) {
            return infoClassName;
        }
        if (item.severity === MessageType.Log) {
            return logClassName;
        }
        return undefined;
    }
}

export interface CompositeConsoleItem extends ConsoleItem {
    readonly hasChildren: boolean;
    resolve(): MaybePromise<ConsoleItem[]>;
}
export namespace CompositeConsoleItem {
    // tslint:disable:no-any
    export function is(item: CompositeConsoleItem | any): item is CompositeConsoleItem {
        return !!item && 'resolve' in item;
    }
    export function hasChildren(item: CompositeConsoleItem | any): item is CompositeConsoleItem {
        return is(item) && item.hasChildren;
    }
}

export interface ConsoleSession {
    readonly id: string
    readonly name: string
    readonly items: ConsoleItem[]
    readonly onDidChange: Event<void>
    execute(value: string): MaybePromise<void>
    clear(): MaybePromise<void>
}
