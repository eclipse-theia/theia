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
import { FrontendApplication } from '../browser';
import { ElectronMenuContribution } from './menu/electron-menu-contribution';

@injectable()
export class ElectronFrontendApplication extends FrontendApplication {

    @inject(ElectronMenuContribution)
    protected readonly electroMenuContribution: ElectronMenuContribution;

    protected registerEventListeners(): void {
        const { addEventListener: delegate } = EventTarget.prototype;
        // Intercepting `addEventListener` to be able to capture all events. Based on: https://css-tricks.com/capturing-all-events/
        EventTarget.prototype.addEventListener = (eventName: string, handler: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
            delegate.call(this, eventName, options, (event: Event) => {
                if (handler) {
                    if (this.isEventListenerObject(handler)) {
                        console.info(`handling with event listener object: ${event} for event type: ${eventName}`);
                        handler.handleEvent(event);
                    } else {
                        console.info(`handling with event listener: ${event} for event type: ${eventName}`);
                        handler(event);
                    }
                } else {
                    console.warn(`handler was null for event type: ${eventName}.`);
                }
            });
        };
        console.log('this.electroMenuContribution', this.electroMenuContribution);
        super.registerEventListeners();
    }

    protected isEventListenerObject(handler: EventListenerOrEventListenerObject & { handleEvent?(evt: Event): void }): handler is EventListenerObject {
        return typeof handler.handleEvent === 'function';
    }

}
