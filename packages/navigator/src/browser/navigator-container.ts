/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container, interfaces } from 'inversify';
import { Tree, TreeModel, TreeProps, defaultTreeProps, TreeDecoratorService } from "@theia/core/lib/browser";
import { createFileTreeContainer, FileTree, FileTreeModel, FileTreeWidget } from '@theia/filesystem/lib/browser';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { FileNavigatorTree } from "./navigator-tree";
import { FileNavigatorModel } from "./navigator-model";
import { FileNavigatorWidget } from "./navigator-widget";
import { NAVIGATOR_CONTEXT_MENU } from "./navigator-contribution";
import { NavigatorDecoratorService, NavigatorTreeDecorator } from './navigator-decorator-service';

export const FILE_NAVIGATOR_PROPS = <TreeProps>{
    ...defaultTreeProps,
    contextMenuPath: NAVIGATOR_CONTEXT_MENU,
    multiSelect: true
};

export function createFileNavigatorContainer(parent: interfaces.Container): Container {
    const child = createFileTreeContainer(parent);

    child.unbind(FileTree);
    child.bind(FileNavigatorTree).toSelf();
    child.rebind(Tree).toDynamicValue(ctx => ctx.container.get(FileNavigatorTree));

    child.unbind(FileTreeModel);
    child.bind(FileNavigatorModel).toSelf();
    child.rebind(TreeModel).toDynamicValue(ctx => ctx.container.get(FileNavigatorModel));

    child.unbind(FileTreeWidget);
    child.bind(FileNavigatorWidget).toSelf();

    child.rebind(TreeProps).toConstantValue(FILE_NAVIGATOR_PROPS);

    child.bind(NavigatorDecoratorService).toSelf().inSingletonScope();
    child.rebind(TreeDecoratorService).toDynamicValue(ctx => ctx.container.get(NavigatorDecoratorService)).inSingletonScope();
    bindContributionProvider(child, NavigatorTreeDecorator);

    return child;
}

export function createFileNavigatorWidget(parent: interfaces.Container): FileNavigatorWidget {
    return createFileNavigatorContainer(parent).get(FileNavigatorWidget);
}
