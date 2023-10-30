// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { DefaultFileDialogService, FileDialogService } from '../../browser/file-dialog/file-dialog-service';
import { ElectronFileDialogService } from './electron-file-dialog-service';
import { LocationListRenderer, LocationListRendererFactory, LocationListRendererOptions } from '../../browser/location';
import { FileDialogHiddenFilesToggleRenderer, HiddenFilesToggleRendererFactory } from '../../browser/file-dialog/file-dialog-hidden-files-renderer';
import { FileDialogTree } from '../../browser/file-dialog/file-dialog-tree';
import { FileDialogTreeFiltersRenderer, FileDialogTreeFiltersRendererFactory, FileDialogTreeFiltersRendererOptions } from '../../browser/file-dialog';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(DefaultFileDialogService).toSelf().inSingletonScope();
    bind(LocationListRendererFactory).toFactory(context => (options: LocationListRendererOptions) => {
        const childContainer = context.container.createChild();
        childContainer.bind(LocationListRendererOptions).toConstantValue(options);
        childContainer.bind(LocationListRenderer).toSelf().inSingletonScope();
        return childContainer.get(LocationListRenderer);
    });
    bind(FileDialogTreeFiltersRendererFactory).toFactory(context => (options: FileDialogTreeFiltersRendererOptions) => {
        const childContainer = context.container.createChild();
        childContainer.bind(FileDialogTreeFiltersRendererOptions).toConstantValue(options);
        childContainer.bind(FileDialogTreeFiltersRenderer).toSelf().inSingletonScope();
        return childContainer.get(FileDialogTreeFiltersRenderer);
    });
    bind(HiddenFilesToggleRendererFactory).toFactory(({ container }) => (fileDialogTree: FileDialogTree) => {
        const child = container.createChild();
        child.bind(FileDialogTree).toConstantValue(fileDialogTree);
        child.bind(FileDialogHiddenFilesToggleRenderer).toSelf().inSingletonScope();
        return child.get(FileDialogHiddenFilesToggleRenderer);
    });
    bind(ElectronFileDialogService).toSelf().inSingletonScope();
    rebind(FileDialogService).toService(ElectronFileDialogService);
});
