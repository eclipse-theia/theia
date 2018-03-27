/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/';
import { VariableRegistry } from './variable';

@injectable()
export class VariableQuickOpenService implements QuickOpenModel {

    protected items: QuickOpenItem[];

    constructor(
        @inject(VariableRegistry) protected readonly variableRegistry: VariableRegistry,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService
    ) { }

    open(): void {
        this.items = this.variableRegistry.getVariables().map(
            v => new VariableQuickOpenItem(v.name, v.description)
        );

        this.quickOpenService.open(this, {
            placeholder: 'Registered variables',
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
            fuzzySort: true
        });
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }
}

export class VariableQuickOpenItem extends QuickOpenItem {

    constructor(
        protected readonly name: string,
        protected readonly description?: string
    ) {
        super();
    }

    getLabel(): string {
        return '${' + this.name + '}';
    }

    getDetail(): string {
        return this.description || '';
    }

    run(mode: QuickOpenMode): boolean {
        return false;
    }
}
