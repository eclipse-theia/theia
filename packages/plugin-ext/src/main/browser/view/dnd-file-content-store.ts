// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class DnDFileContentStore {
    private static id: number = 0;
    private files: Map<string, File> = new Map();

    addFile(f: File): string {
        const id = (DnDFileContentStore.id++).toString();
        this.files.set(id, f);
        return id;
    }

    removeFile(id: string): boolean {
        return this.files.delete(id);
    }

    getFile(id: string): File {
        const file = this.files.get(id);
        if (file) {
            return file;
        }

        throw new Error(`File with id ${id} not found in dnd operation`);
    }
}
