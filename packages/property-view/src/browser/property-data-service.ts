// *****************************************************************************
// Copyright (C) 2020 EclipseSource and others.
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

export const PropertyDataService = Symbol('PropertyDataService');
/**
 * `PropertyDataService` should be implemented to provide property data for the given selection.
 */
export interface PropertyDataService {

    /**
     * A unique id for this provider.
     */
    readonly id: string;
    /**
     * A human-readable name for this provider.
     */
    readonly label?: string;

    /**
     * Test whether this provider can provide property data for the given selection.
     * Return a nonzero number if this provider can provide; otherwise it cannot.
     * Never reject.
     *
     * A returned value indicating a priority of this provider.
     */
    canHandleSelection(selection: Object | undefined): number;

    /**
     * Provide property data for the given selection.
     * Resolve to a property view content widget.
     * Never reject if `canHandle` returns a positive number; otherwise should reject.
     */
    providePropertyData(selection: Object | undefined): Promise<Object | undefined>;

}
