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

// Monaco's localization override is handled by a webpack alias that replaces
// @theia/monaco-editor-core/esm/vs/nls with packages/monaco/src/browser/monaco-nls.ts.
// See webpack-generator.ts for the alias configuration.

import { Container } from '@theia/core/shared/inversify';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { SyncDescriptor } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/descriptors';
import { IInstantiationService, createDecorator } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/serviceCollection';
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
import { createContentHoverWidgetPatcher } from './content-hover-widget-patcher';
import { IHoverService } from '@theia/monaco-editor-core/esm/vs/platform/hover/browser/hover';
import { setBaseLayerHoverDelegate } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/hover/hoverDelegate2';
import { IWorkspaceContextService } from '@theia/monaco-editor-core/esm/vs/platform/workspace/common/workspace';
import { MonacoWorkspaceContextService } from './monaco-workspace-context-service';
import { ILayoutService } from '@theia/monaco-editor-core/esm/vs/platform/layout/browser/layoutService';
import { Event } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import * as dom from '@theia/monaco-editor-core/esm/vs/base/browser/dom';
import { mainWindow } from '@theia/monaco-editor-core/esm/vs/base/browser/window';

export const contentHoverWidgetPatcher = createContentHoverWidgetPatcher();

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

class MonacoWorkspaceContextServiceConstructor {
    constructor(container: Container) {
        return container.get(MonacoWorkspaceContextService);
    }
}

/**
 * Layout service that returns the Theia application shell as the main container
 * instead of the first Monaco editor's container DOM node. This ensures that
 * Monaco UI elements like the quick input are positioned relative to the full
 * application layout rather than a single editor.
 */
class MonacoLayoutService {
    readonly onDidLayoutMainContainer = Event.None;
    readonly onDidLayoutActiveContainer = Event.None;
    readonly onDidLayoutContainer = Event.None;
    readonly onDidChangeActiveContainer = Event.None;
    readonly onDidAddContainer = Event.None;
    readonly mainContainerOffset = { top: 0, quickPickTop: 0 };
    readonly activeContainerOffset = { top: 0, quickPickTop: 0 };

    get mainContainer(): HTMLElement {
        return mainWindow.document.getElementById('theia-app-shell') ?? mainWindow.document.body;
    }

    get activeContainer(): HTMLElement {
        return this.mainContainer;
    }

    get mainContainerDimension(): dom.IDimension {
        return dom.getClientArea(this.mainContainer);
    }

    get activeContainerDimension(): dom.IDimension {
        return dom.getClientArea(this.activeContainer);
    }

    get containers(): Iterable<HTMLElement> {
        return [this.mainContainer];
    }

    getContainer(): HTMLElement {
        return this.activeContainer;
    }

    whenContainerStylesLoaded(): undefined {
        return undefined;
    }

    focus(): void {
        this.mainContainer.focus();
    }
}

class MonacoLayoutServiceConstructor {
    constructor() {
        return new MonacoLayoutService();
    }
}

export namespace MonacoInit {
    export function init(container: Container): void {
        const overrides: Record<string, SyncDescriptor<unknown>> = {
            [ICodeEditorService.toString()]: new SyncDescriptor(MonacoEditorServiceConstructor, [container]),
            [IConfigurationService.toString()]: new SyncDescriptor(MonacoConfigurationServiceConstructor, [container]),
            [ITextModelService.toString()]: new SyncDescriptor(MonacoTextModelServiceConstructor, [container]),
            [IContextMenuService.toString()]: new SyncDescriptor(MonacoContextMenuServiceConstructor, [container]),
            [IBulkEditService.toString()]: new SyncDescriptor(MonacoBulkEditServiceConstructor, [container]),
            [ICommandService.toString()]: new SyncDescriptor(MonacoCommandServiceConstructor, [container]),
            [IQuickInputService.toString()]: new SyncDescriptor(MonacoQuickInputImplementationConstructor, [container]),
            [IStandaloneThemeService.toString()]: new SyncDescriptor(MonacoStandaloneThemeServiceConstructor, []),
            [IWorkspaceContextService.toString()]: new SyncDescriptor(MonacoWorkspaceContextServiceConstructor, [container]),
            [ILayoutService.toString()]: new SyncDescriptor(MonacoLayoutServiceConstructor, [])
        };

        // Try the standard initialization path first.
        StandaloneServices.initialize(overrides);

        // If StandaloneServices was already initialized (e.g., by a premature StandaloneServices.get() call
        // triggered as a side-effect during module loading), the call above is a no-op and our overrides are
        // silently dropped.  Detect this situation, warn about it, and inject our service descriptors directly
        // into the internal service collection so that they are used when the services are next resolved.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instantiationService = StandaloneServices.get(IInstantiationService) as any;
        const serviceCollection: ServiceCollection | undefined = instantiationService?._services;
        if (serviceCollection) {
            const patchedServices: string[] = [];
            const alreadyInstantiatedServices: string[] = [];
            for (const serviceId of Object.keys(overrides)) {
                const serviceIdentifier = createDecorator(serviceId);
                const existing = serviceCollection.get(serviceIdentifier);
                if (existing instanceof SyncDescriptor && existing !== overrides[serviceId]) {
                    // The override was not applied by initialize() – patch it in manually.
                    serviceCollection.set(serviceIdentifier, overrides[serviceId]);
                    patchedServices.push(serviceId);
                } else if (existing !== undefined && !(existing instanceof SyncDescriptor) && existing !== overrides[serviceId]) {
                    // The service was already instantiated – we cannot override it anymore.
                    alreadyInstantiatedServices.push(serviceId);
                }
            }
            if (patchedServices.length > 0) {
                console.warn(
                    'StandaloneServices was already initialized before MonacoInit.init() was called. '
                    + 'This typically happens when a StandaloneServices.get() call is triggered as a side-effect during module loading. '
                    + 'The following Theia service overrides had to be patched in after the fact: '
                    + patchedServices.join(', ')
                    + '. Investigate the module loading order to prevent premature initialization.'
                );
            }
            if (alreadyInstantiatedServices.length > 0) {
                console.error(
                    'StandaloneServices was already initialized and the following services were already instantiated '
                    + 'before MonacoInit.init() could apply Theia overrides: '
                    + alreadyInstantiatedServices.join(', ')
                    + '. These services are using the default Monaco implementations instead of Theia\'s. '
                    + 'This may cause unexpected behavior. Investigate which code triggers premature service resolution.'
                );
            }
        }

        // Make sure the global base hover delegate is initialized as otherwise the quick input will throw an error and not update correctly
        // in case no Monaco editor was constructed before and items with keybindings are shown. See #15042.
        setBaseLayerHoverDelegate(StandaloneServices.get(IHoverService));
    }
}
