/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable, DisposableCollection } from "./disposable";
import { MaybePromise } from "./types";

export interface Reference<T> extends Disposable {
    readonly object: T
}

export class ReferenceCollection<K, V extends Disposable> {

    protected readonly values = new Map<string, MaybePromise<V>>();
    protected readonly keyMap = new Map<string, K>();
    protected readonly references = new Map<string, DisposableCollection>();

    constructor(protected readonly factory: (key: K) => MaybePromise<V>) { }

    has(args: K): boolean {
        const key = this.toKey(args);
        return this.references.has(key);
    }

    keys(): K[] {
        return [...this.keyMap.values()];
    }

    async acquire(args: K): Promise<Reference<V>> {
        const key = this.toKey(args);
        const object = await this.getOrCreateValue(key, args);
        const references = this.references.get(key) || this.createReferences(key, object);
        const reference: Reference<V> = {
            object,
            dispose: () => { }
        };
        references.push(reference);
        return reference;
    }

    protected async getOrCreateValue(key: string, args: K): Promise<V> {
        const existing = this.values.get(key);
        if (existing) {
            return existing;
        }
        const value = this.factory(args);
        this.keyMap.set(key, args);
        this.values.set(key, value);
        return value;
    }

    protected toKey(args: K): string {
        return JSON.stringify(args);
    }

    protected createReferences(key: string, object: V): DisposableCollection {
        const references = new DisposableCollection();
        references.onDispose(() => object.dispose());
        const disposeObject = object.dispose.bind(object);
        object.dispose = () => {
            disposeObject();
            this.values.delete(key);
            this.keyMap.delete(key);
            this.references.delete(key);
            references!.dispose();
        };
        this.references.set(key, references);
        return references;
    }

}
