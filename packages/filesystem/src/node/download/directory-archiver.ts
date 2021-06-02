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

import { injectable } from '@theia/core/shared/inversify';
import * as fs from '@theia/core/shared/fs-extra';
import { pack } from 'tar-fs';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';

@injectable()
export class DirectoryArchiver {

    async archive(inputPath: string, outputPath: string, entries?: string[]): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            pack(inputPath, { entries }).pipe(fs.createWriteStream(outputPath)).on('finish', () => resolve()).on('error', e => reject(e));
        });
    }

    async findCommonParents(uris: URI[]): Promise<Map<string, string[]>> {
        const map = new Map<string, string[]>();
        for (const uri of uris) {
            // 1. Get the container if not the URI is not a directory.
            const containerUri = (await this.isDir(uri)) ? uri : uri.parent;
            let containerUriStr = this.toUriString(containerUri);
            // 2. If the container already registered, just append the current URI to it.
            if (map.has(containerUriStr)) {
                map.set(containerUriStr, [...map.get(containerUriStr)!, this.toUriString(uri)]);
            } else {
                // 3. Try to find the longest container URI that we can use.
                // When we have `/A/B/` and `/A/C` and a file `A/B/C/D.txt` then we need to find `/A/B`. The longest URIs come first.
                for (const knownContainerUri of Array.from(map.keys()).sort((left, right) => right.length - left.length)) {
                    if (uri.toString().startsWith(knownContainerUri)) {
                        containerUriStr = knownContainerUri;
                        break;
                    }
                }
                const entries = map.get(containerUriStr) || [];
                entries.push(this.toUriString(uri));
                map.set(containerUriStr, entries);
            }
            // 4. Collapse the hierarchy by finding the closest common parents for the entries, if any.
            let collapsed = false;
            collapseLoop: while (!collapsed) {
                const knownContainerUris = Array.from(map.keys()).sort((left, right) => right.length - left.length);
                if (knownContainerUris.length > 1) {
                    for (let i = 0; i < knownContainerUris.length; i++) {
                        for (let j = i + 1; j < knownContainerUris.length; j++) {
                            const left = knownContainerUris[i];
                            const right = knownContainerUris[j];
                            const commonParent = this.closestCommonParentUri(new URI(left), new URI(right));
                            if (commonParent && !commonParent.path.isRoot) {
                                const leftEntries = map.get(left) || [];
                                const rightEntries = map.get(right) || [];
                                map.delete(left);
                                map.delete(right);
                                map.set(this.toUriString(commonParent), [...leftEntries, ...rightEntries]);
                                break collapseLoop;
                            }
                        }
                    }
                }
                collapsed = true;
            }
        }
        return map;
    }

    protected closestCommonParentUri(left: URI, right: URI): URI | undefined {
        if (left.scheme !== right.scheme) {
            return undefined;
        }
        const allLeft = left.allLocations;
        const allRight = right.allLocations;
        for (const leftUri of allLeft) {
            for (const rightUri of allRight) {
                if (this.equal(leftUri, rightUri)) {
                    return leftUri;
                }
            }
        }
        return undefined;
    }

    protected async isDir(uri: URI): Promise<boolean> {
        try {
            const stat = await fs.stat(FileUri.fsPath(uri));
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    protected equal(left: URI | URI[], right: URI | URI[]): boolean {
        if (Array.isArray(left) && Array.isArray(right)) {
            if (left === right) {
                return true;
            }
            if (left.length !== right.length) {
                return false;
            }
            return left.map(this.toUriString).sort().toString() === right.map(this.toUriString).sort().toString();
        } else if (left instanceof URI && right instanceof URI) {
            return this.toUriString(left) === this.toUriString(right);
        }
        return false;
    }

    protected toUriString(uri: URI): string {
        const raw = uri.toString();
        return raw.endsWith('/') ? raw.slice(0, -1) : raw;
    }

}
