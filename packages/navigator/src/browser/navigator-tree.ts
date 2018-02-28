/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FileSystem } from "@theia/filesystem/lib/common";
import { FileTree } from "@theia/filesystem/lib/browser";
import { ITreeNode, ICompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { FileNavigatorFilter } from './navigator-filter';

@injectable()
export class FileNavigatorTree extends FileTree {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileNavigatorFilter) protected readonly filter: FileNavigatorFilter
    ) {
        super(fileSystem);
        filter.onFilterChanged(() => this.refresh());
    }

    async resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        return this.filter.filter(super.resolveChildren(parent));
    }

}
