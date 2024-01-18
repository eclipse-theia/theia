// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { interfaces, ContainerModule } from '@theia/core/shared/inversify';
import { Plugin, PluginManager, emptyPlugin } from '../../common';

export type ApiFactory<T extends object> = (plugin: Plugin) => T;

/**
 * Bind a service identifier for the factory function creating API objects of
 * type `T` for a client plugin to a class providing a `call()` method that
 * implements that factory function.
 *
 * @template T the API object type that the factory creates
 * @param serviceIdentifier the injection key identifying the API factory function
 * @param factoryClass the class implementing the API factory function via its `call()` method
 */
export type BindApiFactory = <T extends object>(
    apiModuleName: string,
    serviceIdentifier: interfaces.ServiceIdentifier<ApiFactory<T>>,
    factoryClass: new () => { createApi: ApiFactory<T>}) => void;

/**
 * An analogue of the callback function in the constructor of the Inversify
 * `ContainerModule` providing a registry that, in addition to the standard
 * binding-related functions, includes a custom function for binding an
 * API factory.
 */
export type PluginContainerModuleCallBack = (registry: {
    bind: interfaces.Bind;
    unbind: interfaces.Unbind;
    isBound: interfaces.IsBound;
    rebind: interfaces.Rebind;
    bindApiFactory: BindApiFactory;
}) => void;

/**
 * Factory for an Inversify `ContainerModule` that supports registration of the plugin's
 * API factory. Use the `PluginContainerModule`'s `create()` method to create the container
 * module; its `callback` function provides a `registry` of Inversify binding functions that
 * includes a `bindApiFactory` function for binding the API factory.
 */
export const PluginContainerModule: symbol & { create(callback: PluginContainerModuleCallBack): ContainerModule } = Object.assign(Symbol('PluginContainerModule'), {
    create(callback: PluginContainerModuleCallBack): ContainerModule {
        const result: InternalPluginContainerModule = new ContainerModule((bind, unbind, isBound, rebind) => {
            const bindApiFactory: BindApiFactory = (apiModuleName, serviceIdentifier, factoryClass) => {
                result.initializeApi = container => {
                    const apiCache = new PluginApiCache(apiModuleName, serviceIdentifier);
                    apiCache.initializeApi(container);
                    return apiCache;
                };
                bind(factoryClass).toSelf().inSingletonScope();
                bind(serviceIdentifier).toDynamicValue(({ container }) => {
                    const factory = container.get(factoryClass);
                    return factory.createApi.bind(factory);
                }).inSingletonScope();
            };
            callback({ bind, unbind, isBound, rebind, bindApiFactory });
        });
        return result;
    }
});

/**
 * Definition of additional API provided by the `ContainerModule` created by the
 * {@link PluginContainerModule} factory function that is for internal use by Theia.
 */
export type InternalPluginContainerModule = ContainerModule & {
    /** Use my API factory binding to initialize the plugin API in some `container`. */
    initializeApi?: (container: interfaces.Container) => PluginApiCache<object>;
};

/**
 * An object that creates and caches the instance of the plugin API created by the
 * factory binding in a {@link PluginContainerModule} in some plugin host.
 *
 * @template T the custom API object's type
 */
export class PluginApiCache<T extends object> {

    private apiFactory: ApiFactory<T>;
    private pluginManager: PluginManager;
    private defaultApi: T;
    private pluginsApiImpl = new Map<string, T>();
    private hookedModuleLoader = false;

    /**
     * Initializes me with the module name by which plugins import the API
     * and the service identifier to look up in the Inversify `Container` to
     * obtain the {@link ApiFactory} that will instantiate it.
     */
    constructor(private readonly apiModuleName: string,
        private readonly serviceIdentifier: interfaces.ServiceIdentifier<ApiFactory<T>>) {}

    // Called by Theia to do any prep work needed for dishing out the API object
    // when it's requested. The key part of that is hooking into the node module
    // loader. This is called every time a plugin-host process is forked.
    initializeApi(container: interfaces.Container): void {
        this.apiFactory = container.get(this.serviceIdentifier);
        this.pluginManager = container.get(PluginManager);

        if (!this.hookedModuleLoader) {
            this.hookedModuleLoader = true;
            this.overrideInternalLoad();
        }
    }

    /**
     * Hook into the override chain of JavaScript's `module` loading function
     * to implement ourselves, using the API provider's registered factory,
     * the construction of its default exports object.
     */
    private overrideInternalLoad(): void {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const module = require('module');

        const internalLoad = module._load;
        const self = this;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        module._load = function (request: string, parent: any, isMain: any): any {
            if (request !== self.apiModuleName) {
                // Pass the request to the next implementation down the chain
                return internalLoad.call(this, request, parent, isMain);
            }

            const plugin = self.findPlugin(parent.filename);
            if (plugin) {
                let apiImpl = self.pluginsApiImpl.get(plugin.model.id);
                if (!apiImpl) {
                    apiImpl = self.apiFactory(plugin);
                    self.pluginsApiImpl.set(plugin.model.id, apiImpl);
                }
                return apiImpl;
            }

            console.warn(
                `Extension module ${parent.filename} did an import of '${self.apiModuleName}' but our cache ` +
                    ' has no knowledge of that extension. Returning a generic API object; some functionality might not work correctly.'
            );
            if (!self.defaultApi) {
                self.defaultApi = self.apiFactory(emptyPlugin);
            }
            return self.defaultApi;
        };
    }

    // Search all loaded plugins to see which one has the given file (absolute path)
    protected findPlugin(filePath: string): Plugin | undefined {
        return this.pluginManager.getAllPlugins().find(plugin => filePath.startsWith(plugin.pluginFolder));
    }
}
