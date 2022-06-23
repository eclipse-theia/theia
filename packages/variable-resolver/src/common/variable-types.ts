// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Holds variable-names to command id mappings (e.g. Provided by specific plugins / extensions)
 * see "variables": https://code.visualstudio.com/api/references/contribution-points#contributes.debuggers
 */
export interface CommandIdVariables {
    [id: string]: string
}

/**
 * Holds a common state among variables being resolved by interactions e.g. commands.
 * A `NOK` state indicates that at least one of the variables did not get resolved successfully.
 */
export class InteractionsAggregatedState {
    protected state: 'NOK' | 'OK' = 'OK';

    setNOK(state: 'NOK'): void {
        this.state = state;
    }

    isNOK(): boolean {
        return this.state !== 'OK';
    }
}
