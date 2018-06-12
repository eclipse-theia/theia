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

export function hasSameId(left: { id: number } | number | undefined, right: { id: number } | number | undefined): boolean {
    return getId(left) === getId(right);
}

function getId(entity: { id: number } | number | undefined): number | undefined {
    if (typeof entity === "number") {
        return entity;
    }

    return entity ? entity.id : undefined;
}
