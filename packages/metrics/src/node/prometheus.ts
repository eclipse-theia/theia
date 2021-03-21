/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

export function toPrometheusValidName(name: string): string {
    /* Make sure that start of name is valid and respect [a-zA-Z_:] */
    const validFirstCharString = name.replace(/(^[^a-zA-Z_:]+)/gi, '');
    /* Make sure that rest of the name respect [a-zA-Z0-9_:]* */
    const validPrometheusName = validFirstCharString.replace(/([^a-zA-Z0-9_:])/gi, '_');
    return validPrometheusName;
}

export const PROMETHEUS_REGEXP = /^[a-zA-Z_:][a-zA-Z0-9_:]*/;
