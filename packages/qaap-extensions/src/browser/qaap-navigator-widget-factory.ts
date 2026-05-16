// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { createFileTreeContainer } from '@theia/filesystem/lib/browser';
import { FileNavigatorModel } from '@theia/navigator/lib/browser/navigator-model';
import { FileNavigatorTree } from '@theia/navigator/lib/browser/navigator-tree';
import { FileNavigatorWidget } from '@theia/navigator/lib/browser/navigator-widget';
import { NavigatorDecoratorService } from '@theia/navigator/lib/browser/navigator-decorator-service';
import { FILE_NAVIGATOR_PROPS } from '@theia/navigator/lib/browser/navigator-container';
import { QaapFileNavigatorModel } from './qaap-file-navigator-model';

export function createQaapFileNavigatorWidget(parent: interfaces.Container): FileNavigatorWidget {
    const child = createFileTreeContainer(parent, {
        tree: FileNavigatorTree,
        model: QaapFileNavigatorModel,
        widget: FileNavigatorWidget,
        decoratorService: NavigatorDecoratorService,
        props: FILE_NAVIGATOR_PROPS,
    });
    child.bind(FileNavigatorModel).toService(QaapFileNavigatorModel);
    return child.get(FileNavigatorWidget);
}
