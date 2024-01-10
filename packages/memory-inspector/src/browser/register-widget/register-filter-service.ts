/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';

export enum AllOrCustom {
    All = 'All',
    Custom = 'Custom'
}

export const RegisterFilterService = Symbol('RegisterFilterService');
export interface RegisterFilterService {
    currentFilterLabel: string;
    filterLabels: string[];
    setFilter(filterLabel: string): void;
    shouldDisplayRegister(registerName: string): boolean;
    currentFilterRegisters(): string[];
}
export const RegisterFilterServiceOptions = Symbol('RegisterFilterServiceOptions');
export interface RegisterFilterServiceOptions {
    [key: string]: string[];
}

@injectable()
export class RegisterFilterServiceImpl implements RegisterFilterService {
    @inject(RegisterFilterServiceOptions) protected readonly options: RegisterFilterServiceOptions;

    protected filters: Map<string, Set<string> | undefined> = new Map();
    protected currentFilter: string = AllOrCustom.All;

    get filterLabels(): string[] {
        return [...this.filters.keys()];
    }

    get currentFilterLabel(): string {
        return this.currentFilter;
    }

    @postConstruct()
    protected init(): void {
        this.filters.set(AllOrCustom.All, undefined);
        this.filters.set(AllOrCustom.Custom, new Set());
        for (const [key, values] of Object.entries(this.options)) {
            this.filters.set(key, new Set(values));
        }
    }

    setFilter(filterLabel: string): void {
        if (this.filters.has(filterLabel)) {
            this.currentFilter = filterLabel;
        }
    }

    shouldDisplayRegister(registerName: string): boolean {
        const currentFilter = this.filters.get(this.currentFilter);
        return !currentFilter || currentFilter.has(registerName);
    }

    currentFilterRegisters(): string[] {
        const currentFilterRegisters = this.filters.get(this.currentFilter);
        return currentFilterRegisters ? Array.from(currentFilterRegisters) : [];
    }
}
