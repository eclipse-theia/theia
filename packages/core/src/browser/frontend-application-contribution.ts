// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import type { FrontendApplication } from './frontend-application';
import { MaybePromise, isObject } from '../common/types';
import { StopReason } from '../common/frontend-application-state';
import { injectable } from 'inversify';

/**
 * Clients can implement to get a callback for contributing widgets to a shell on start.
 */
export const FrontendApplicationContribution = Symbol('FrontendApplicationContribution');
export interface FrontendApplicationContribution {

    /**
     * Called on application startup before configure is called.
     */
    initialize?(): void;

    /**
     * Called before commands, key bindings and menus are initialized.
     * Should return a promise if it runs asynchronously.
     */
    configure?(app: FrontendApplication): MaybePromise<void>;

    /**
     * Called when the application is started. The application shell is not attached yet when this method runs.
     * Should return a promise if it runs asynchronously.
     */
    onStart?(app: FrontendApplication): MaybePromise<void>;

    /**
     * Called on `beforeunload` event, right before the window closes.
     * Return `true` or an OnWillStopAction in order to prevent exit.
     * Note: No async code allowed, this function has to run on one tick.
     */
    onWillStop?(app: FrontendApplication): boolean | undefined | OnWillStopAction<unknown>;

    /**
     * Called when an application is stopped or unloaded.
     *
     * Note that this is implemented using `window.beforeunload` which doesn't allow any asynchronous code anymore.
     * I.e. this is the last tick.
     */
    onStop?(app: FrontendApplication): void;

    /**
     * Called after the application shell has been attached in case there is no previous workbench layout state.
     * Should return a promise if it runs asynchronously.
     */
    initializeLayout?(app: FrontendApplication): MaybePromise<void>;

    /**
     * An event is emitted when a layout is initialized, but before the shell is attached.
     */
    onDidInitializeLayout?(app: FrontendApplication): MaybePromise<void>;
}

export interface OnWillStopAction<T = unknown> {
    /**
     * @resolves to a prepared value to be passed into the `action` function.
     */
    prepare?: (stopReason?: StopReason) => MaybePromise<T>;
    /**
     * @resolves to `true` if it is safe to close the application; `false` otherwise.
     */
    action: (prepared: T, stopReason?: StopReason) => MaybePromise<boolean>;
    /**
     * A descriptive string for the reason preventing close.
     */
    reason: string;
    /**
     * A number representing priority. Higher priority items are run later.
     * High priority implies that some options of this check will have negative impacts if
     * the user subsequently cancels the shutdown.
     */
    priority?: number;
}

export namespace OnWillStopAction {
    export function is(candidate: unknown): candidate is OnWillStopAction {
        return isObject(candidate) && 'action' in candidate && 'reason' in candidate;
    }
}

/**
 * Default frontend contribution that can be extended by clients if they do not want to implement any of the
 * methods from the interface but still want to contribute to the frontend application.
 */
@injectable()
export abstract class DefaultFrontendApplicationContribution implements FrontendApplicationContribution {

    initialize(): void {
        // NOOP
    }

}
