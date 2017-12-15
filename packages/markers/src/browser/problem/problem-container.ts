/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, Container } from "inversify";
import { MarkerOptions } from '../marker-tree';
import { ProblemWidget } from './problem-widget';
import { ProblemTreeModel, ProblemTree } from './problem-tree-model';
import { TreeWidget, TreeProps, defaultTreeProps, ITreeModel, createTreeContainer, TreeModel, Tree, ITree } from "@theia/core/lib/browser";
import { MarkerTreeServices } from '../marker-tree-model';
import { PROBLEM_KIND } from '../../common/problem-marker';

export const PROBLEM_TREE_PROPS = <TreeProps>{
    ...defaultTreeProps,
    contextMenuPath: [PROBLEM_KIND]
};

export const PROBLEM_OPTIONS = <MarkerOptions>{
    kind: 'problem'
};

export function createProblemTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(Tree);
    child.bind(ProblemTree).toSelf();
    child.rebind(ITree).toDynamicValue(ctx => ctx.container.get(ProblemTree));

    child.unbind(TreeWidget);
    child.bind(ProblemWidget).toSelf();

    child.unbind(TreeModel);
    child.bind(ProblemTreeModel).toSelf();
    child.rebind(ITreeModel).toDynamicValue(ctx => ctx.container.get(ProblemTreeModel));

    child.bind(MarkerTreeServices).toSelf();

    child.rebind(TreeProps).toConstantValue(PROBLEM_TREE_PROPS);
    child.bind(MarkerOptions).toConstantValue(PROBLEM_OPTIONS);
    return child;
}

export function createProblemWidget(parent: interfaces.Container): ProblemWidget {
    return createProblemTreeContainer(parent).get(ProblemWidget);
}
