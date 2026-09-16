// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import 'reflect-metadata';

import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { Container, ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { bindContributionProvider } from '@theia/core/lib/common';
import { AiConfigurationCategory, AiConfigurationSearchItem } from './ai-configuration-category';
import { AiConfigurationCategoryRegistry } from './ai-configuration-category-registry';

class DummyCategory implements AiConfigurationCategory {
    readonly renderer = {};
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    constructor(
        readonly id: string,
        readonly order?: number,
        readonly contributed?: boolean,
        protected readonly searchItems: AiConfigurationSearchItem[] = []
    ) { }
    readonly label = this.id;
    readonly iconClass = 'codicon codicon-gear';
    readonly kind = 'single-page' as const;
    get search(): { getSearchItems(): AiConfigurationSearchItem[] } | undefined {
        return this.searchItems.length ? { getSearchItems: () => this.searchItems } : undefined;
    }
    fireChange(): void {
        this.onDidChangeEmitter.fire();
    }
}

describe('AiConfigurationCategoryRegistry', () => {

    function createRegistry(...categories: AiConfigurationCategory[]): AiConfigurationCategoryRegistry {
        const container = new Container();
        container.load(new ContainerModule(bind => {
            bindContributionProvider(bind, AiConfigurationCategory);
            categories.forEach(category => bind(AiConfigurationCategory).toConstantValue(category));
            bind(AiConfigurationCategoryRegistry).toSelf().inSingletonScope();
        }));
        return container.get(AiConfigurationCategoryRegistry);
    }

    it('resolves to an empty list when nothing is contributed', () => {
        const registry = createRegistry();
        expect(registry.getCategories()).to.deep.equal([]);
    });

    it('aggregates an empty search index when nothing is contributed', () => {
        const registry = createRegistry();
        expect(registry.getSearchItems()).to.deep.equal([]);
    });

    it('orders categories ascending by order', () => {
        const registry = createRegistry(
            new DummyCategory('c', 300),
            new DummyCategory('a', 100),
            new DummyCategory('b', 200)
        );
        expect(registry.getCategories().map(c => c.id)).to.deep.equal(['a', 'b', 'c']);
    });

    it('sorts contributed categories after all built-ins regardless of order', () => {
        const registry = createRegistry(
            new DummyCategory('ext', 1, true),
            new DummyCategory('builtin', 900)
        );
        expect(registry.getCategories().map(c => c.id)).to.deep.equal(['builtin', 'ext']);
    });

    it('resolves a category by id', () => {
        const registry = createRegistry(new DummyCategory('a', 100), new DummyCategory('b', 200));
        expect(registry.getCategory('b')?.id).to.equal('b');
        expect(registry.getCategory('missing')).to.equal(undefined);
    });

    it('aggregates the search index across categories that provide one', () => {
        const item = (label: string, categoryId: string): AiConfigurationSearchItem =>
            ({ label, typeLabel: 'Setting', categoryId, target: { categoryId } });
        const registry = createRegistry(
            new DummyCategory('a', 100, false, [item('a1', 'a')]),
            new DummyCategory('b', 200),
            new DummyCategory('c', 300, false, [item('c1', 'c'), item('c2', 'c')])
        );
        expect(registry.getSearchItems().map(i => i.label)).to.deep.equal(['a1', 'c1', 'c2']);
    });

    it('refires onDidChange when a contributed category changes', () => {
        const category = new DummyCategory('a', 100);
        const registry = createRegistry(category);
        let fired = 0;
        registry.onDidChange(() => fired++);
        category.fireChange();
        expect(fired).to.equal(1);
    });

    it('resolves without recursion when a contributed category injects the registry', () => {
        // A category may inject the registry (e.g. to navigate across categories). The registry must not
        // resolve its contributions during its own construction, or that closes a dependency cycle.
        @injectable()
        class RegistryInjectingCategory implements AiConfigurationCategory {
            readonly id = 'self';
            readonly label = 'self';
            readonly iconClass = 'codicon codicon-gear';
            readonly kind = 'single-page' as const;
            readonly renderer = {};
            @inject(AiConfigurationCategoryRegistry)
            readonly registry: AiConfigurationCategoryRegistry;
        }
        const container = new Container();
        container.load(new ContainerModule(bind => {
            bindContributionProvider(bind, AiConfigurationCategory);
            bind(RegistryInjectingCategory).toSelf().inSingletonScope();
            bind(AiConfigurationCategory).toService(RegistryInjectingCategory);
            bind(AiConfigurationCategoryRegistry).toSelf().inSingletonScope();
        }));
        const registry = container.get(AiConfigurationCategoryRegistry);
        // Listening wires the aggregation, which resolves the contribution that injects this very registry.
        expect(() => registry.onDidChange(() => { })).to.not.throw();
        expect(registry.getCategories().map(category => category.id)).to.deep.equal(['self']);
    });
});
