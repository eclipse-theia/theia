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

import { interfaces, Container } from '@theia/core/shared/inversify';
import { MarkerOptions } from '../marker-tree';
import { ProblemWidget } from './problem-widget';
import { ProblemTreeModel, ProblemTree } from './problem-tree-model';
import { TreeWidget, TreeProps, defaultTreeProps, TreeModel, createTreeContainer, TreeModelImpl, TreeImpl, Tree } from '@theia/core/lib/browser';
import { PROBLEM_KIND } from '../../common/problem-marker';

export const PROBLEM_TREE_PROPS = <TreeProps>{
    ...defaultTreeProps,
    contextMenuPath: [PROBLEM_KIND],
    globalSelection: true
};

export const PROBLEM_OPTIONS = <MarkerOptions>{
    kind: 'problem'
};

export function createProblemTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);

    child.unbind(TreeImpl);
    child.bind(ProblemTree).toSelf();
    child.rebind(Tree).toService(ProblemTree);

    child.unbind(TreeWidget);
    child.bind(ProblemWidget).toSelf();

    child.unbind(TreeModelImpl);
    child.bind(ProblemTreeModel).toSelf();
    child.rebind(TreeModel).toService(ProblemTreeModel);

    child.rebind(TreeProps).toConstantValue(PROBLEM_TREE_PROPS);
    child.bind(MarkerOptions).toConstantValue(PROBLEM_OPTIONS);
    return child;
}

export function createProblemWidget(parent: interfaces.Container): ProblemWidget {
    return createProblemTreeContainer(parent).get(ProblemWidget);
}
