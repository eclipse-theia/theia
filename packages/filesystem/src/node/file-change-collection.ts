/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { FileChange, FileChangeType } from '../common/filesystem-watcher-protocol';

/**
 * A file change collection guarantees that only one change is reported for each URI.
 *
 * Changes are normalized according following rules:
 * - ADDED + ADDED => ADDED
 * - ADDED + UPDATED => ADDED
 * - ADDED + DELETED => [ADDED, DELETED]
 * - UPDATED + ADDED => UPDATED
 * - UPDATED + UPDATED => UPDATED
 * - UPDATED + DELETED => DELETED
 * - DELETED + ADDED => UPDATED
 * - DELETED + UPDATED => UPDATED
 * - DELETED + DELETED => DELETED
 */
export class FileChangeCollection {
    protected readonly changes = new Map<string, FileChange[]>();

    push(change: FileChange): void {
        const changes = this.changes.get(change.uri) || [];
        this.normalize(changes, change);
        this.changes.set(change.uri, changes);
    }

    protected normalize(changes: FileChange[], change: FileChange): void {
        let currentType;
        let nextType: FileChangeType | [FileChangeType, FileChangeType] = change.type;
        do {
            const current = changes.pop();
            currentType = current && current.type;
            nextType = this.reduce(currentType, nextType);
        } while (!Array.isArray(nextType) && currentType !== undefined && currentType !== nextType);

        const uri = change.uri;
        if (Array.isArray(nextType)) {
            changes.push(...nextType.map(type => ({ uri, type })));
        } else {
            changes.push({ uri, type: nextType });
        }
    }

    protected reduce(current: FileChangeType | undefined, change: FileChangeType): FileChangeType | [FileChangeType, FileChangeType] {
        if (current === undefined) {
            return change;
        }
        if (current === FileChangeType.ADDED) {
            if (change === FileChangeType.DELETED) {
                return [FileChangeType.ADDED, FileChangeType.DELETED];
            }
            return FileChangeType.ADDED;
        }
        if (change === FileChangeType.DELETED) {
            return FileChangeType.DELETED;
        }
        return FileChangeType.UPDATED;
    }

    values(): FileChange[] {
        return Array.from(this.changes.values()).reduce((acc, val) => acc.concat(val), []);
    }
}
