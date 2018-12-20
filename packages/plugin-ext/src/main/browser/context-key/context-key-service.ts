/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

// adjusted to Theia APIs

import { injectable, unmanaged, inject } from 'inversify';
import { PreferenceService } from '@theia/core/lib/browser';
import { Event, Emitter, DisposableCollection, Disposable } from '@theia/core/lib/common';
import { ContextKeyExpr, Context, ContextKey, ContextKeyChangeEvent, ContextKeyService, ContextKeyServiceTarget, ReadableSet } from './context-key';

const KEYBINDING_CONTEXT_ATTR = 'data-keybinding-context';

// tslint:disable:no-any
export class DefaultContext implements Context {

    protected value: { [key: string]: any; };

    constructor(protected readonly id: number, protected readonly parent: DefaultContext | undefined) {
        // tslint:disable-next-line:no-null-keyword
        this.value = Object.create(null);
        this.value['_contextId'] = id;
    }

    public setValue(key: string, value: any): boolean {
        if (this.value[key] !== value) {
            this.value[key] = value;
            return true;
        }
        return false;
    }

    public removeValue(key: string): boolean {
        if (key in this.value) {
            delete this.value[key];
            return true;
        }
        return false;
    }

    public getValue<T>(key: string): T | undefined {
        const ret = this.value[key];
        if (typeof ret === 'undefined' && this.parent) {
            return this.parent.getValue<T>(key);
        }
        return ret;
    }

    collectAllValues(): { [key: string]: any; } {
        // tslint:disable-next-line:no-null-keyword
        let result = this.parent ? this.parent.collectAllValues() : Object.create(null);
        result = { ...result, ...this.value };
        delete result['_contextId'];
        return result;
    }
}

class NullContext extends DefaultContext {

    static readonly INSTANCE = new NullContext();

    constructor() {
        super(-1, undefined);
    }

    public setValue(key: string, value: any): boolean {
        return false;
    }

    public removeValue(key: string): boolean {
        return false;
    }

    public getValue<T>(key: string): T | undefined {
        return undefined;
    }

    collectAllValues(): { [key: string]: any; } {
        // tslint:disable-next-line:no-null-keyword
        return Object.create(null);
    }
}

class ConfigAwareContextValuesContainer extends DefaultContext {

    private static keyPrefix = 'config.';

    private readonly values = new Map<string, any>();
    private readonly listener: Disposable;

    constructor(readonly id: number, private readonly configurationService: PreferenceService, readonly emitter: Emitter<string | string[]>) {
        super(id, undefined);

        this.listener = this.configurationService.onPreferenceChanged(event => {
            const changedKeys: string[] = [];
            const contextKey = `config.${event.preferenceName}`;
            if (this.values.has(contextKey)) {
                this.values.delete(contextKey);
                changedKeys.push(contextKey);
            }
            emitter.fire(changedKeys);
        });
    }

    dispose(): void {
        this.listener.dispose();
    }

    getValue(key: string): any {
        if (key.indexOf(ConfigAwareContextValuesContainer.keyPrefix) !== 0) {
            return super.getValue(key);
        }

        if (this.values.has(key)) {
            return this.values.get(key);
        }

        const configKey = key.substr(ConfigAwareContextValuesContainer.keyPrefix.length);
        const configValue = this.configurationService.get(configKey);
        let value: any = undefined;
        switch (typeof configValue) {
            case 'number':
            case 'boolean':
            case 'string':
                value = configValue;
                break;
        }

        this.values.set(key, value);
        return value;
    }

    setValue(key: string, value: any): boolean {
        return super.setValue(key, value);
    }

    removeValue(key: string): boolean {
        return super.removeValue(key);
    }

    collectAllValues(): { [key: string]: any; } {
        const result: {
            [key: string]: any
            // tslint:disable-next-line:no-null-keyword
        } = Object.create(null);
        this.values.forEach((value, index) => result[index] = value);
        return { ...result, ...super.collectAllValues() };
    }
}

class ContextKeyImpl<T> implements ContextKey<T> {

    constructor(private readonly parent: AbstractContextKeyService, private readonly key: string, private readonly defaultValue: T | undefined) {
        this.reset();
    }

    public set(value: T): void {
        this.parent.setContext(this.key, value);
    }

    public reset(): void {
        if (typeof this.defaultValue === 'undefined') {
            this.parent.removeContext(this.key);
        } else {
            this.parent.setContext(this.key, this.defaultValue);
        }
    }

    public get(): T | undefined {
        return this.parent.getContextKeyValue<T>(this.key);
    }
}

class SimpleContextKeyChangeEvent implements ContextKeyChangeEvent {
    constructor(private readonly key: string) { }
    affectsSome(keys: ReadableSet<string>): boolean {
        return keys.has(this.key);
    }
}

class ArrayContextKeyChangeEvent implements ContextKeyChangeEvent {
    constructor(private readonly keys: string[]) { }
    affectsSome(keys: ReadableSet<string>): boolean {
        for (const key of this.keys) {
            if (keys.has(key)) {
                return true;
            }
        }
        return false;
    }
}

@injectable()
export abstract class AbstractContextKeyService implements ContextKeyService {

    protected isDisposed: boolean;
    protected onDidChangeContextEvent: Event<ContextKeyChangeEvent>;
    protected onDidChangeContextKey: Emitter<string | string[]>;

    constructor(@unmanaged() protected readonly myContextId: number) {
        this.isDisposed = false;
        this.onDidChangeContextKey = new Emitter<string>();
    }

    abstract dispose(): void;

    public createKey<T>(key: string, defaultValue: T | undefined): ContextKey<T> {
        if (this.isDisposed) {
            throw new Error('AbstractContextKeyService has been disposed');
        }
        return new ContextKeyImpl(this, key, defaultValue);
    }

    public get onDidChangeContext(): Event<ContextKeyChangeEvent> {
        if (!this.onDidChangeContextEvent) {
            this.onDidChangeContextEvent = Event.map(this.onDidChangeContextKey.event, ((changedKeyOrKeys: string | string[]): ContextKeyChangeEvent =>
                typeof changedKeyOrKeys === 'string'
                    ? new SimpleContextKeyChangeEvent(changedKeyOrKeys)
                    : new ArrayContextKeyChangeEvent(changedKeyOrKeys)
            ));
        }
        return this.onDidChangeContextEvent;
    }

    public createScoped(domNode: ContextKeyServiceTarget): ContextKeyService {
        if (this.isDisposed) {
            throw new Error('AbstractContextKeyService has been disposed');
        }
        return new ScopedContextKeyService(this, this.onDidChangeContextKey, domNode);
    }

    public contextMatchesRules(rules: ContextKeyExpr | undefined): boolean {
        if (this.isDisposed) {
            throw new Error('AbstractContextKeyService has been disposed');
        }
        const context = this.getContextValuesContainer(this.myContextId);
        if (!rules) {
            return true;
        }
        return rules.evaluate(context);
    }

    public getContextKeyValue<T>(key: string): T | undefined {
        if (this.isDisposed) {
            return undefined;
        }
        return this.getContextValuesContainer(this.myContextId).getValue<T>(key);
    }

    public setContext(key: string, value: any): void {
        if (this.isDisposed) {
            return;
        }
        const myContext = this.getContextValuesContainer(this.myContextId);
        if (!myContext) {
            return;
        }
        if (myContext.setValue(key, value)) {
            this.onDidChangeContextKey.fire(key);
        }
    }

    public removeContext(key: string): void {
        if (this.isDisposed) {
            return;
        }
        if (this.getContextValuesContainer(this.myContextId).removeValue(key)) {
            this.onDidChangeContextKey.fire(key);
        }
    }

    public getContext(target: ContextKeyServiceTarget | null): Context {
        if (this.isDisposed) {
            return NullContext.INSTANCE;
        }
        return this.getContextValuesContainer(findContextAttr(target));
    }

    public abstract getContextValuesContainer(contextId: number): DefaultContext;
    public abstract createChildContext(parentContextId?: number): number;
    public abstract disposeContext(contextId: number): void;
}

@injectable()
export class ContextKeyServiceImpl extends AbstractContextKeyService implements ContextKeyService {

    private lastContextId: number;
    private contexts: {
        [contextId: string]: DefaultContext;
    };

    private toDispose: DisposableCollection;

    constructor(@inject(PreferenceService) configurationService: PreferenceService) {
        super(0);
        this.toDispose = new DisposableCollection();
        this.lastContextId = 0;
        // tslint:disable-next-line:no-null-keyword
        this.contexts = Object.create(null);

        const myContext = new ConfigAwareContextValuesContainer(this.myContextId, configurationService, this.onDidChangeContextKey);
        this.contexts[String(this.myContextId)] = myContext;
        this.toDispose.push(myContext);
    }

    public dispose(): void {
        this.isDisposed = true;
        this.toDispose.dispose();
    }

    public getContextValuesContainer(contextId: number): DefaultContext {
        if (this.isDisposed) {
            return NullContext.INSTANCE;
        }
        return this.contexts[String(contextId)];
    }

    public createChildContext(parentContextId: number = this.myContextId): number {
        if (this.isDisposed) {
            throw new Error('ContextKeyService has been disposed');
        }
        const id = (++this.lastContextId);
        this.contexts[String(id)] = new DefaultContext(id, this.getContextValuesContainer(parentContextId));
        return id;
    }

    public disposeContext(contextId: number): void {
        if (this.isDisposed) {
            return;
        }
        delete this.contexts[String(contextId)];
    }
}

class ScopedContextKeyService extends AbstractContextKeyService {

    constructor(private readonly parent: AbstractContextKeyService, emitter: Emitter<string | string[]>, private domNode?: ContextKeyServiceTarget) {
        super(parent.createChildContext());
        this.onDidChangeContextKey = emitter;

        if (domNode) {
            this.domNode = domNode;
            this.domNode.setAttribute(KEYBINDING_CONTEXT_ATTR, String(this.myContextId));
        }
    }

    public dispose(): void {
        this.isDisposed = true;
        this.parent.disposeContext(this.myContextId);
        if (this.domNode) {
            this.domNode.removeAttribute(KEYBINDING_CONTEXT_ATTR);
            this.domNode = undefined;
        }
    }

    public get onDidChangeContext(): Event<ContextKeyChangeEvent> {
        return this.parent.onDidChangeContext;
    }

    public getContextValuesContainer(contextId: number): DefaultContext {
        if (this.isDisposed) {
            return NullContext.INSTANCE;
        }
        return this.parent.getContextValuesContainer(contextId);
    }

    public createChildContext(parentContextId: number = this.myContextId): number {
        if (this.isDisposed) {
            throw new Error('ScopedContextKeyService has been disposed');
        }
        return this.parent.createChildContext(parentContextId);
    }

    public disposeContext(contextId: number): void {
        if (this.isDisposed) {
            return;
        }
        this.parent.disposeContext(contextId);
    }
}

function findContextAttr(domNode: ContextKeyServiceTarget | null): number {
    while (domNode) {
        if (domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
            const attr = domNode.getAttribute(KEYBINDING_CONTEXT_ATTR);
            if (attr) {
                return parseInt(attr, 10);
            }
            return NaN;
        }
        domNode = domNode.parentElement;
    }
    return 0;
}
