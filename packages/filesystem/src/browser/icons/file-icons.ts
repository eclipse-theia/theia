/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fileIcons from "file-icons-js";
import { injectable } from 'inversify';
import { FileStat } from '../../common/filesystem';
import URI from '@theia/core/lib/common/uri';

import "file-icons-js/css/style.css";

@injectable()
export class FileIconProvider {

    getFileIconForURI(uri: URI): string {
        const iconClass = fileIcons.getClass(uri.path.toString()) || 'fa fa-file';
        return iconClass + " file-icon";
    }

    getFileIconForStat(stat: FileStat): string {
        if (stat.isDirectory) {
            return "fa fa-folder file-icon";
        }
        const uri = new URI(stat.uri);
        return this.getFileIconForURI(uri);
    }
}