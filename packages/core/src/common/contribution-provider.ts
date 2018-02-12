/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";

export const ContributionProvider = Symbol("ContributionProvider");

export interface ContributionProvider<T extends object> {
    getContributions(): T[]
}

class ContainerBasedContributionProvider<T extends object> implements ContributionProvider<T> {

    constructor(
        protected readonly serviceIdentifier: interfaces.ServiceIdentifier<T>,
        protected readonly container: interfaces.Container
    ) { }

    protected services: T[] | undefined;

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
        return this.services;
    }
}

export type Bindable = interfaces.Bind | interfaces.Container;
export namespace Bindable {
    export function isContainer(arg: Bindable): arg is interfaces.Container {
        return 'guid' in arg;
    }
}

export function bindContributionProvider(bindable: Bindable, id: symbol): void {
    const bindingToSyntax = (Bindable.isContainer(bindable) ? bindable.bind(ContributionProvider) : bindable(ContributionProvider));
    bindingToSyntax
        .toDynamicValue(ctx => new ContainerBasedContributionProvider(id, ctx.container))
        .inSingletonScope().whenTargetNamed(id);
}
