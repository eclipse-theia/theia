// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

/**
 * Converts the given standard name to a variable name starting with '$' if not already present.
 *
 * Variable names are used, for instance, to reference problem matchers, within task configurations.
 *
 * @param name standard name
 * @returns variable name with leading '$' if not already present.
 *
 * @see {@link fromVariableName} for the reverse conversion.
 */
export function asVariableName(name: string): string {
    return name.startsWith('$') ? name : `$${name}`;
}

/**
 * Converts a given variable name to a standard name, effectively removing a leading '$' if present.
 *
 * Standard names are used, for instance, in registries to store variable objects
 *
 * @param name variable name
 * @returns variable name without leading '$' if present.
 *
 * @see {@link asVariableName} for the reverse conversion.
 */
export function fromVariableName(name: string): string {
    return name.startsWith('$') ? name.slice(1) : name;
}
