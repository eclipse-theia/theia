/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { Disposable } from '../../common';
import { inject, injectable } from 'inversify';
import * as React from 'react';
import { CorePreferences } from '../core-preferences';
import { wait } from '../../common/promise-util';

export const isReactEvent = (event: MouseEvent | React.MouseEvent): event is React.MouseEvent => 'nativeEvent' in event;

interface MouseEventHandlerPlus<T extends MouseEvent | React.MouseEvent> {
    (event: T, ...additionalArgs: unknown[]): unknown;
}

export interface ClickEventHandlerOptions<T extends MouseEvent | React.MouseEvent = MouseEvent> {
    /**
     * A function to invoke on every click, regardless of other conditions.
     */
    immediateAction?: MouseEventHandlerPlus<T>;
    /**
     * Functions to invoke on a given number of clicks, and no more.
     * E.g. the action at index 0 will be invoked on a single click if no additional click
     * comes within a set interval.
     */
    actions: MouseEventHandlerPlus<T>[];
}

export const ClickEventHandlerOptions = Symbol('ClickEventHandlerOptions');
export interface ClickEventHandlerFactory {
    <T extends MouseEvent | React.MouseEvent>(options: ClickEventHandlerOptions<T>): ClickEventHandler<T>;
}
export const ClickEventHandlerFactory = Symbol('ClickEventHandlerFactory');

@injectable()
export class ClickEventHandler<T extends MouseEvent | React.MouseEvent> implements Disposable {

    @inject(CorePreferences) readonly preferences: CorePreferences;
    @inject(ClickEventHandlerOptions) protected readonly options: ClickEventHandlerOptions<T>;

    protected disposed = false;

    /**
     * Setting `.canceled` to true will prevent the handler from running.
     * Calling `.run()` will invoke the handler immediately and prevent future invocations.
     */
    protected queuedInvocation: { event: T, canceled: boolean, run: () => unknown } | undefined;

    async invoke(event: T, ...additionalArguments: unknown[]): Promise<void> {
        if (this.disposed) {
            return;
        }
        if (isReactEvent(event)) {
            event.persist();
        }
        const { immediateAction, actions } = this.options;
        if (immediateAction) {
            immediateAction(event, ...additionalArguments);
        }
        const { detail } = event;
        const handler = actions[detail - 1];
        if (!!handler) {
            if (this.queuedInvocation && detail > this.queuedInvocation.event.detail) { // Click is on same thing as before. Cancel that invocation.
                this.queuedInvocation.canceled = true;
            } else if (this.queuedInvocation) { // Clicking somewhere else or OS timer has run out. Run handler for last invocation immediately.
                this.queuedInvocation.run();
            }
            const thisCall = {
                event,
                canceled: false,
                run(): void {
                    if (!this.canceled) {
                        this.canceled = true;
                        handler(event, ...additionalArguments);
                    }
                }
            };
            this.queuedInvocation = thisCall;
            // If detail == actions.length, it's the last defined handler.
            // In that case, we run it immediately. If >, we don't reach this code.
            if (detail < actions.length) {
                await wait(this.preferences.get('application.clickTime', 500));
            }
            thisCall.run();
            if (this.queuedInvocation === thisCall) {
                this.queuedInvocation = undefined;
            }
        }
    }

    dispose(): void {
        this.disposed = true;
        if (this.queuedInvocation) {
            this.queuedInvocation.canceled = true;
            this.queuedInvocation = undefined;
        }
    }
}
