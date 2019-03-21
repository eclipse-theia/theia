/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

export interface MetadataSelection {
    // tslint:disable-next-line:no-any
    readonly metadata: any
}

export namespace MetadataSelection {

    export function is(arg: Object | undefined): arg is MetadataSelection {
        // tslint:disable-next-line:no-any
        return typeof arg === 'object' && ('metadata' in arg);
    }

    // tslint:disable-next-line:no-any
    export function getMetadata(selection: Object | undefined): any | undefined {
        if (is(selection)) {
            return selection.metadata;
        }
        if (Array.isArray(selection) && is(selection[0])) {
            return selection[0].metadata;
        }
        return undefined;
    }

}
