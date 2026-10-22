// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { Widget } from '@lumino/widgets';

export const WidgetContextKeyContribution = Symbol('WidgetContextKeyContribution');

/**
 * Contributes the context key values that describe a particular widget, so that `when` clauses about
 * that widget - such as the ones of its tab bar toolbar items - can be evaluated without consulting the
 * ambient context, which describes whichever widget currently has focus.
 */
export interface WidgetContextKeyContribution {
    /**
     * @param widget the widget to describe.
     * @returns the values to overlay over the ambient context, or `undefined` if this contribution does not
     * describe the given widget. A contribution owning a key should return an explicit "unset" value for the
     * widgets the key does not apply to, so that the ambient value of another widget cannot leak in.
     */
    getContextKeyValues(widget: Widget): Iterable<[string, unknown]> | undefined;
}
