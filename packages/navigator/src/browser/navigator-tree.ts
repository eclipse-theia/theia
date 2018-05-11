/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from 'inversify';
import { FileTree } from '@theia/filesystem/lib/browser';
import { TreeNode, CompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { FileNavigatorFilter } from './navigator-filter';

@injectable()
export class FileNavigatorTree extends FileTree {

    @inject(FileNavigatorFilter) protected readonly filter: FileNavigatorFilter;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.filter.onFilterChanged(() => this.refresh()));
    }

    async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        return this.filter.filter(super.resolveChildren(parent));
    }

}
