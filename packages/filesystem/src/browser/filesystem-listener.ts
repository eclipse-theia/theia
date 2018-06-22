/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable } from "inversify";
import { ConfirmDialog } from "@theia/core/lib/browser";
import { FileStat, FileSystemClient, FileSystem } from "../common";

@injectable()
export class FileSystemListener implements FileSystemClient {

    protected filesystem: FileSystem;
    listen(filesystem: FileSystem): void {
        filesystem.setClient(this);
        this.filesystem = filesystem;
    }

    async shouldOverwrite(file: FileStat, stat: FileStat): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title: `The file '${file.uri}' has been changed on the file system.`,
            msg: 'Do you want to overwrite the changes made on the file system?',
            ok: 'Yes',
            cancel: 'No'
        });
        return dialog.open();
    }

}
