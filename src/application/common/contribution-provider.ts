/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";

export const ContributionProvider = Symbol("ContributionProvider")

export interface ContributionProvider<T extends object> {
    getContributions(): T[]
}

export function bindContributionProvider(bind: interfaces.Bind, id: symbol): void {
    bind(ContributionProvider).toDynamicValue(ctx => {
        return new ContainerBasedContributionProvider(id, ctx.container)
    }).inSingletonScope().whenTargetNamed(id)
}

class ContainerBasedContributionProvider<T extends object> implements ContributionProvider<T> {

    constructor(private serviceIdentifier: interfaces.ServiceIdentifier<T>, private container: interfaces.Container) { }

    private services: T[]

    getContributions(): T[] {
        if (this.services === undefined) {
            if (this.container.isBound(this.serviceIdentifier)) {
                try {
                    this.services = this.container.getAll(this.serviceIdentifier);
                } catch (error) {
                    console.error(error);
                    this.services = [];
                }
            } else {
                this.services = [];
            }
        }
        return this.services
    }
}
