// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { interfaces, Container } from 'inversify';
import { TreeWidget, TreeProps, defaultTreeProps } from './tree-widget';
import { TreeModelImpl, TreeModel } from './tree-model';
import { TreeImpl, Tree } from './tree';
import { TreeSelectionService } from './tree-selection';
import { TreeSelectionServiceImpl } from './tree-selection-impl';
import { TreeExpansionService, TreeExpansionServiceImpl } from './tree-expansion';
import { TreeNavigationService } from './tree-navigation';
import { TreeDecoratorService, NoopTreeDecoratorService } from './tree-decorator';
import { TreeSearch } from './tree-search';
import { FuzzySearch } from './fuzzy-search';
import { SearchBox, SearchBoxFactory } from './search-box';
import { SearchBoxDebounce } from './search-box-debounce';
import { TreeFocusService, TreeFocusServiceImpl } from './tree-focus-service';

export function isTreeServices(candidate?: Partial<TreeProps> | Partial<TreeContainerProps>): candidate is TreeContainerProps {
    if (candidate) {
        const maybeServices = candidate as TreeContainerProps;
        for (const key of Object.keys(maybeServices)) {
            // This key is in both TreeProps and TreeContainerProps, so we have to handle it separately
            if (key === 'search' && typeof maybeServices[key] === 'boolean') {
                return false;
            }
            if (key in defaultImplementations) {
                return true;
            }
        }
    }
    return false;
}

export function createTreeContainer(parent: interfaces.Container, props?: Partial<TreeContainerProps>): Container;
/**
 * @deprecated Please use TreeContainerProps instead of TreeProps
 * @since 1.23.0
 */
export function createTreeContainer(parent: interfaces.Container, props?: Partial<TreeProps>): Container;
export function createTreeContainer(parent: interfaces.Container, props?: Partial<TreeProps> | Partial<TreeContainerProps>): Container {
    const child = new Container({ defaultScope: 'Singleton' });
    child.parent = parent;
    const overrideServices: Partial<TreeContainerProps> = isTreeServices(props) ? props : { props: props as Partial<TreeProps> | undefined };
    for (const key of Object.keys(serviceIdentifiers) as (keyof TreeIdentifiers)[]) {
        if (key === 'props') {
            const { service, identifier } = getServiceAndIdentifier(key, overrideServices);
            child.bind(identifier).toConstantValue({
                ...defaultImplementations.props,
                ...service
            });
        } else if (key === 'searchBoxFactory') {
            const { service, identifier } = getServiceAndIdentifier(key, overrideServices);
            child.bind(identifier).toFactory(context => service(context));
        } else {
            const { service, identifier } = getServiceAndIdentifier(key, overrideServices);
            child.bind(service).toSelf().inSingletonScope();
            if (identifier !== service) {
                child.bind(identifier as interfaces.ServiceIdentifier<typeof service>).toService(service);
            }
        }
    }
    return child;
}

function getServiceAndIdentifier<Key extends keyof TreeIdentifiers>(
    key: Key, overrides: Partial<TreeContainerProps>
): { service: TreeContainerProps[Key], identifier: TreeIdentifiers[Key] } {
    const override = overrides[key] as TreeContainerProps[Key] | undefined;
    const service = override ?? defaultImplementations[key];
    return {
        service,
        identifier: serviceIdentifiers[key]
    };
}

export interface SearchBoxFactoryFactory {
    (context: interfaces.Context): SearchBoxFactory;
}

const defaultSearchBoxFactoryFactory: SearchBoxFactoryFactory = () => options => {
    const debounce = new SearchBoxDebounce(options);
    return new SearchBox(options, debounce);
};

interface TreeConstants {
    searchBoxFactory: SearchBoxFactory,
    props: TreeProps,
}

interface TreeServices {
    tree: Tree,
    selectionService: TreeSelectionService,
    expansionService: TreeExpansionService,
    navigationService: TreeNavigationService,
    model: TreeModel,
    widget: TreeWidget,
    search: TreeSearch,
    fuzzy: FuzzySearch,
    decoratorService: TreeDecoratorService,
    focusService: TreeFocusService,
}

interface TreeTypes extends TreeServices, TreeConstants { }

export type TreeIdentifiers = { [K in keyof TreeTypes]: interfaces.ServiceIdentifier<TreeTypes[K]>; };
type TreeServiceProviders = { [K in keyof TreeServices]: interfaces.Newable<TreeServices[K]> };

export interface TreeContainerProps extends TreeServiceProviders {
    props: Partial<TreeProps>,
    searchBoxFactory: SearchBoxFactoryFactory;
}

const defaultImplementations: TreeContainerProps & { props: TreeProps } = {
    tree: TreeImpl,
    selectionService: TreeSelectionServiceImpl,
    expansionService: TreeExpansionServiceImpl,
    navigationService: TreeNavigationService,
    model: TreeModelImpl,
    widget: TreeWidget,
    search: TreeSearch,
    fuzzy: FuzzySearch,
    decoratorService: NoopTreeDecoratorService,
    focusService: TreeFocusServiceImpl,
    props: defaultTreeProps,
    searchBoxFactory: defaultSearchBoxFactoryFactory,
};

const serviceIdentifiers: TreeIdentifiers = {
    tree: Tree,
    selectionService: TreeSelectionService,
    expansionService: TreeExpansionService,
    navigationService: TreeNavigationService,
    model: TreeModel,
    widget: TreeWidget,
    props: TreeProps,
    search: TreeSearch,
    fuzzy: FuzzySearch,
    searchBoxFactory: SearchBoxFactory,
    decoratorService: TreeDecoratorService,
    focusService: TreeFocusService
};
