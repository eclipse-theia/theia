/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { interfaces, Container } from "inversify";
import { createMarkerTreeContainer } from "../marker-container";
import { MarkerOptions } from '../marker-tree';
import { ProblemWidget } from './problem-widget';
import { ProblemTreeModel } from './problem-tree-model';
import { MARKER_CONTEXT_MENU } from './problem-contribution';
import { TreeWidget, TreeProps, defaultTreeProps, ITreeModel } from "@theia/core/lib/browser";

export const MARKER_TREE_PROPS = <TreeProps>{
    ...defaultTreeProps,
    contextMenuPath: MARKER_CONTEXT_MENU
};

export const MARKER_OPTIONS = <MarkerOptions>{
    kind: 'problem'
};

export function createProblemTreeContainer(parent: interfaces.Container): Container {
    const child = createMarkerTreeContainer(parent);

    child.unbind(TreeWidget);
    child.bind(ProblemWidget).toSelf();

    child.bind(ProblemTreeModel).toSelf();
    child.rebind(ITreeModel).toDynamicValue(ctx => ctx.container.get(ProblemTreeModel));

    child.rebind(TreeProps).toConstantValue(MARKER_TREE_PROPS);
    child.bind(MarkerOptions).toConstantValue(MARKER_OPTIONS);
    return child;
}

export function createProblemWidget(parent: interfaces.Container): ProblemWidget {
    return createProblemTreeContainer(parent).get(ProblemWidget);
}
