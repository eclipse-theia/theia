/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FileSystem } from "../../filesystem/common";
import { FileTree } from "../../filesystem/browser";

@injectable()
export class FileNavigatorTree extends FileTree {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        super(fileSystem);
    }

}
