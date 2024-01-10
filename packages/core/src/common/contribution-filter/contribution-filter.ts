// *****************************************************************************
// Copyright (C) 2021 STMicroelectronics and others.
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

import { interfaces } from 'inversify';
import { Filter } from './filter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContributionType = interfaces.ServiceIdentifier<any>;

export const ContributionFilterRegistry = Symbol('ContributionFilterRegistry');
export interface ContributionFilterRegistry {

    /**
     * Add filters to be applied for every type of contribution.
     */
    addFilters(types: '*', filters: Filter<Object>[]): void;

    /**
     * Given a list of contribution types, register filters to apply.
     * @param types types for which to register the filters.
     */
    addFilters(types: ContributionType[], filters: Filter<Object>[]): void;

    /**
     * Applies the filters for the given contribution type. Generic filters will be applied on any given type.
     * @param toFilter the elements to filter
     * @param type the contribution type for which potentially filters were registered
     * @returns the filtered elements
     */
    applyFilters<T extends Object>(toFilter: T[], type: ContributionType): T[]
}

export const FilterContribution = Symbol('FilterContribution');
/**
 * Register filters to remove contributions.
 */
export interface FilterContribution {
    /**
     * Use the registry to register your contribution filters.
     * * Note that filtering contributions based on their class (constructor) name is discouraged.
     * Class names are minified in production builds and therefore not reliable.
     * Use instance of checks or direct constructor comparison instead:
     *
     * ```ts
     * registry.addFilters('*', [
     *     contrib => !(contrib instanceof SampleFilteredCommandContribution)
     * ]);
     * ```
     */
    registerContributionFilters(registry: ContributionFilterRegistry): void;
}
