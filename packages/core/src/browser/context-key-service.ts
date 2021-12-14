/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
import { Disposable } from '../common';
import { Emitter, Event } from '../common/event';

export interface ContextKey<T> {
    set(value: T | undefined): void;
    reset(): void;
    get(): T | undefined;
}

export namespace ContextKey {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export const None: ContextKey<any> = Object.freeze({
        set: () => { },
        reset: () => { },
        get: () => undefined
    });
}

export interface ContextKeyChangeEvent {
    affects(keys: Set<string>): boolean;
}

export const ContextKeyService = Symbol('ContextKeyService');
export interface ContextKeyService extends Disposable {
    readonly onDidChange: Event<ContextKeyChangeEvent>;

    createKey<T>(key: string, defaultValue: T | undefined): ContextKey<T>;

    /**
     * Whether the expression is satisfied. If `context` provided, the service will attempt to retrieve a context object associated with that element.
     */
    match(expression: string, context?: HTMLElement): boolean;

    /**
     * @returns a Set of the keys used by the given `expression` or `undefined` if none are used or the expression cannot be parsed.
     */
    parseKeys(expression: string): Set<string> | undefined;

    /**
     * Creates a temporary context that will use the `values` passed in when evaluating `callback`
     * `callback` must be synchronous.
     */
    with<T>(values: Record<string, unknown>, callback: () => T): T;

    /**
     * Creates a child service with a separate context scoped to the HTML element passed in.
     * Useful for e.g. setting the {view} context value for particular widgets.
     */
    createScoped(target?: HTMLElement): ScopedValueStore;

    /**
     * Set or modify a value in the service's context.
     */
    setContext(key: string, value: unknown): void;
}

export type ScopedValueStore = Omit<ContextKeyService, 'onDidChange' | 'match' | 'parseKeys' | 'with'>;

@injectable()
export class ContextKeyServiceDummyImpl implements ContextKeyService {

    protected readonly onDidChangeEmitter = new Emitter<ContextKeyChangeEvent>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected fireDidChange(event: ContextKeyChangeEvent): void {
        this.onDidChangeEmitter.fire(event);
    }

    createKey<T>(key: string, defaultValue: T | undefined): ContextKey<T> {
        return ContextKey.None;
    }
    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    match(expression: string, context?: HTMLElement): boolean {
        return true;
    }

    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    parseKeys(expression: string): Set<string> | undefined {
        return new Set<string>();
    }

    /**
     * Details should be implemented by an extension, e.g. by the monaco extension.
     * Callback must be synchronous.
     */
    with<T>(values: Record<string, unknown>, callback: () => T): T {
        return callback();
    }

    /**
     * Details should implemented by an extension, e.g. by the monaco extension.
     */
    createScoped(target?: HTMLElement): ContextKeyService {
        return this;
    }

    /**
     * Details should be implemented by an extension, e.g. by the monaco extension.
     */
    setContext(key: string, value: unknown): void { }

    dispose(): void { }
}
