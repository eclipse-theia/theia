/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify/dts/interfaces/interfaces";

export const ExtensionProvider = Symbol("ExtensionProvider")

export interface ExtensionProvider<T extends object> {
    getExtensions(): T[]
}

export function bindExtensionProvider(bind: interfaces.Bind, id: symbol): void {
    bind(ExtensionProvider).toDynamicValue(ctx => {
        return new ContainerBasedExtensionProvider(id, ctx.container)
    }).inSingletonScope().whenTargetNamed(id)
}

class ContainerBasedExtensionProvider<T extends object> implements ExtensionProvider<T> {

    constructor(private serviceIdentifier: interfaces.ServiceIdentifier<T>, private container: interfaces.Container) {}

    private services: T[]

    getExtensions(): T[] {
        if (this.services === undefined) {
            try {
                this.services = this.container.getAll(this.serviceIdentifier)
            } catch (error) {
                this.services = []
            }
        }
        return this.services
    }
}
