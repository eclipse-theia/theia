/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

/*
* A marker represents meta information for a given uri
*/
export interface Marker<T> {
    /**
     * the uri this marker is associated with.
     */
    uri: string;
    /*
     * the owner of this marker. Any string provided by the registrar.
     */
    owner: string;

    /**
     * the kind, e.g. 'problem'
     */
    kind?: string;

    /*
     * marker kind specific data
     */
    data: T;
}
