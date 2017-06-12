/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, Container } from 'inversify';
import { createTreeContainer, ITree, Tree, ITreeModel, TreeModel, TreeServices, TreeWidget } from "../../../application/browser";
import { FileTree } from "./file-tree";
import { FileTreeModel, FileTreeServices } from './file-tree-model';
import { FileTreeWidget } from "./file-tree-widget";

export function createFileTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(Tree);
    child.bind(FileTree).toSelf();
    child.rebind(ITree).toDynamicValue(ctx => ctx.container.get(FileTree));

    child.unbind(TreeServices);
    child.bind(FileTreeServices).toSelf();

    child.unbind(TreeModel);
    child.bind(FileTreeModel).toSelf();
    child.rebind(ITreeModel).toDynamicValue(ctx => ctx.container.get(FileTreeModel));

    child.unbind(TreeWidget);
    child.bind(FileTreeWidget).toSelf();

    return child;
}