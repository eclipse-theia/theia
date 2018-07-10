/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import URI from "@theia/core/lib/common/uri";

export function hasSameId(left: { id: number } | number | undefined, right: { id: number } | number | undefined): boolean {
    return getId(left) === getId(right);
}

export function pathToUri(path: string): URI {
    return new URI(encodeURI('file://' + path));
}

function getId(entity: { id: number } | number | undefined): number | undefined {
    if (typeof entity === "number") {
        return entity;
    }

    return entity ? entity.id : undefined;
}
