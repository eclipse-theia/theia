// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
 * The mini-browser can now serve content on its own host/origin.
 *
 * The virtual host can be configured with this `THEIA_MINI_BROWSER_HOST_PATTERN`
 * environment variable. `{{hostname}}` represents the current host, and `{{uuid}}`
 * will be replace by a random uuid value.
 */
export namespace MiniBrowserEndpoint {
    export const PATH = '/mini-browser';
    export const HOST_PATTERN_ENV = 'THEIA_MINI_BROWSER_HOST_PATTERN';
    export const HOST_PATTERN_DEFAULT = '{{uuid}}.mini-browser.{{hostname}}';
}
