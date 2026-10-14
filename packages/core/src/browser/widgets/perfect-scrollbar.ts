// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import PerfectScrollbarModule from 'perfect-scrollbar';

// The types of `perfect-scrollbar` declare an ES module default export, but its CommonJS entry point assigns the class to
// `module.exports`, which is what a default import from an ES module provides at runtime.
export const PerfectScrollbar = PerfectScrollbarModule as unknown as typeof PerfectScrollbarModule.default;
export type PerfectScrollbar = PerfectScrollbarModule.default;
export declare namespace PerfectScrollbar {
    type Options = PerfectScrollbarModule.default.Options;
}
