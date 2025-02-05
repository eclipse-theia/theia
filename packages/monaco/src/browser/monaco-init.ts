// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

/*
 * The code in this file is responsible for overriding service implementations in the Monaco editor with our own Theia-based implementations.
 * Since we only get a single chance to call `StandaloneServices.initialize()` with our overrides, we need to make sure that initialize is called before the first call to
 * `StandaloneServices.get()` or `StandaloneServices.initialize()`. As we do not control the mechanics of Inversify instance constructions, the approach here is to call
 * `MonacoInit.init()` from the `index.js` file after all container modules are loaded, but before the first object is fetched from it.
 * `StandaloneServices.initialize()` is called with service descriptors, not service instances. This lets us finish all overrides before any inversify object is constructed and
 * might call `initialize()` while being constructed.
 * The service descriptors require a constructor function, so we declare dummy class for each Monaco service we override. But instead of returning an instance of the dummy class,
 * we fetch the implementation of the monaco service from the inversify container.
 * The inversify-constructed services must not call StandaloneServices.get() or StandaloneServices.initialize() from their constructors. Calling `get`()` in postConstruct methods
 * is allowed.
 */

// Before importing anything from monaco we need to override its localization function

import { Container } from '@theia/core/shared/inversify';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { SyncDescriptor } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/descriptors';
import { MonacoEditorServiceFactory, MonacoEditorServiceFactoryType } from './monaco-editor-service';
import { IConfigurationService } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configuration';
import { ITextModelService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import { MonacoConfigurationService } from './monaco-frontend-module';
import { MonacoTextModelService } from './monaco-text-model-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { IContextMenuService } from '@theia/monaco-editor-core/esm/vs/platform/contextview/browser/contextView';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { IThemeService } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';
import { MonacoBulkEditService } from './monaco-bulk-edit-service';
import { MonacoCommandService } from './monaco-command-service';
import { IBulkEditService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';
import { ICommandService } from '@theia/monaco-editor-core/esm/vs/platform/commands/common/commands';
import { MonacoQuickInputImplementation } from './monaco-quick-input-service';
import { IQuickInputService } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickInput';
import { IStandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/common/standaloneTheme';
import { MonacoStandaloneThemeService } from './monaco-standalone-theme-service';
import { ContentHoverWidget } from '@theia/monaco-editor-core/esm/vs/editor/contrib/hover/browser/contentHoverWidget';
import { IPosition } from '@theia/monaco-editor-core/esm/vs/editor/common/core/position';

// https://github.com/microsoft/vscode/blob/1430e1845cbf5ec29a2fc265f12c7fb5c3d685c3/src/vs/editor/contrib/hover/browser/resizableContentWidget.ts#L13-L14
const VSCODE_TOP_HEIGHT = 30;
const VSCODE_BOTTOM_HEIGHT = 24;

// VS Code uses 30 pixel for top height, and 24 pixels for bottom height, but Theia uses 32 pixel for the top and 22 for the bottom.
// https://github.com/eclipse-theia/theia/blob/b752ea690bdc4e7c5d9ab98a138504ead05be0d1/packages/core/src/browser/style/menus.css#L22
// https://github.com/eclipse-theia/theia/blob/b752ea690bdc4e7c5d9ab98a138504ead05be0d1/packages/core/src/browser/style/status-bar.css#L18
// https://github.com/eclipse-theia/theia/issues/14826
function patchContentHoverWidget(topPanelHeight = 32): { setActualTopHeightForContentHoverWidget: (value: number) => void } {
    let _actualTopHeight = topPanelHeight;
    function getTopHeightDiff(): number {
        return _actualTopHeight - VSCODE_TOP_HEIGHT;
    }

    const actualBottomHeight = 22; // Theia's status bar height
    const bottomHeightDiff = actualBottomHeight - VSCODE_BOTTOM_HEIGHT;

    const originalAvailableVerticalSpaceAbove = ContentHoverWidget.prototype['_availableVerticalSpaceAbove'];
    ContentHoverWidget.prototype['_availableVerticalSpaceAbove'] = function (position: IPosition): number | undefined {
        const value = originalAvailableVerticalSpaceAbove.call(this, position);
        // The original implementation deducts the height of the top panel from the total available space.
        // https://github.com/microsoft/vscode/blob/1430e1845cbf5ec29a2fc265f12c7fb5c3d685c3/src/vs/editor/contrib/hover/browser/resizableContentWidget.ts#L71
        // However, in Theia, the top panel has generally different size (especially when the toolbar is visible).
        // This additional height must be further subtracted from the computed height for accurate positioning.
        const topHeightDiff = getTopHeightDiff();
        return typeof value === 'number' ? value - topHeightDiff : undefined;
    };

    const originalAvailableVerticalSpaceBelow = ContentHoverWidget.prototype['_availableVerticalSpaceBelow'];
    ContentHoverWidget.prototype['_availableVerticalSpaceBelow'] = function (position: IPosition): number | undefined {
        const value = originalAvailableVerticalSpaceBelow.call(this, position);
        // The original method subtracts the height of the bottom panel from the overall available height.
        // https://github.com/microsoft/vscode/blob/1430e1845cbf5ec29a2fc265f12c7fb5c3d685c3/src/vs/editor/contrib/hover/browser/resizableContentWidget.ts#L83
        // In Theia, the status bar has different height than in VS Code, which means this difference
        // should be also removed to ensure the calculated available space is accurate.
        // Note that removing negative value will increase the available space.
        return typeof value === 'number' ? value - bottomHeightDiff : undefined;
    };

    return {
        setActualTopHeightForContentHoverWidget: (value: number) => {
            _actualTopHeight = value;
        }
    };
}

export const { setActualTopHeightForContentHoverWidget } = patchContentHoverWidget();

class MonacoEditorServiceConstructor {
    /**
     * MonacoEditorService needs other Monaco services as constructor parameters, so we need to do use a factory for constructing the service. If we want the singleton instance,
     * we need to fetch it from the `StandaloneServices` class instead of injecting it.
     * @param container
     * @param contextKeyService
     * @param themeService
     */
    constructor(container: Container,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IThemeService themeService: IThemeService) {

        return container.get<MonacoEditorServiceFactoryType>(MonacoEditorServiceFactory)(contextKeyService, themeService);
    };
}

class MonacoConfigurationServiceConstructor {
    constructor(container: Container) {
        return container.get(MonacoConfigurationService);
    }
}

class MonacoTextModelServiceConstructor {
    constructor(container: Container) {
        return container.get(MonacoTextModelService);
    }
}

class MonacoContextMenuServiceConstructor {
    constructor(container: Container) {
        return container.get(MonacoContextMenuService);
    }
}

class MonacoBulkEditServiceConstructor {
    constructor(container: Container) {
        return container.get(MonacoBulkEditService);
    }
}

class MonacoCommandServiceConstructor {
    constructor(container: Container) {
        return container.get(MonacoCommandService);
    }
}

class MonacoQuickInputImplementationConstructor {
    constructor(container: Container) {
        return container.get(MonacoQuickInputImplementation);
    }
}

class MonacoStandaloneThemeServiceConstructor {
    constructor(container: Container) {
        return new MonacoStandaloneThemeService();
    }
}

export namespace MonacoInit {
    export function init(container: Container): void {
        StandaloneServices.initialize({
            [ICodeEditorService.toString()]: new SyncDescriptor(MonacoEditorServiceConstructor, [container]),
            [IConfigurationService.toString()]: new SyncDescriptor(MonacoConfigurationServiceConstructor, [container]),
            [ITextModelService.toString()]: new SyncDescriptor(MonacoTextModelServiceConstructor, [container]),
            [IContextMenuService.toString()]: new SyncDescriptor(MonacoContextMenuServiceConstructor, [container]),
            [IBulkEditService.toString()]: new SyncDescriptor(MonacoBulkEditServiceConstructor, [container]),
            [ICommandService.toString()]: new SyncDescriptor(MonacoCommandServiceConstructor, [container]),
            [IQuickInputService.toString()]: new SyncDescriptor(MonacoQuickInputImplementationConstructor, [container]),
            [IStandaloneThemeService.toString()]: new SyncDescriptor(MonacoStandaloneThemeServiceConstructor, [])
        });
    }
}
