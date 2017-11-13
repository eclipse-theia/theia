/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
