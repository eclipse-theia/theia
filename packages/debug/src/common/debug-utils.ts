/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

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
