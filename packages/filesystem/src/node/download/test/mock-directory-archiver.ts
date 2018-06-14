/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { DirectoryArchiver } from '../directory-archiver';
import URI from '@theia/core/lib/common/uri';

export class MockDirectoryArchiver extends DirectoryArchiver {

    constructor(private folders?: URI[]) {
        super();
    }

    protected async isDir(uri: URI): Promise<boolean> {
        return !!this.folders && this.folders.map(u => u.toString()).indexOf(uri.toString()) !== -1;
    }

}
