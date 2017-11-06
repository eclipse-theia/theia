/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Event, MaybePromise } from '../common';

export interface Saveable {
    readonly dirty: boolean;
    readonly onDirtyChanged: Event<void>;
    save(): MaybePromise<void>;
}

export interface SaveableSource {
    readonly saveable: Saveable;
}

export namespace Saveable {
    export function isSource(arg: any): arg is SaveableSource {
        return !!arg && ('saveable' in arg);
    }
    export function is(arg: any): arg is Saveable {
        return !!arg && ('dirty' in arg) && ('onDirtyChanged' in arg);
    }
    export function get(arg: any): Saveable | undefined {
        if (is(arg)) {
            return arg;
        }
        if (isSource(arg)) {
            return arg.saveable;
        }
    }
    export function getDirty(arg: any): Saveable | undefined {
        const saveable = get(arg);
        if (saveable && saveable.dirty) {
            return saveable;
        }
    }
    export function isDirty(arg: any): boolean {
        return !!getDirty(arg);
    }
    export async function save(arg: any): Promise<void> {
        const saveable = getDirty(arg);
        if (saveable) {
            await saveable.save();
        }
    }
}
