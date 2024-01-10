// *****************************************************************************
// Copyright (C) 2022 EclipseSource and others.
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

import { ContributionProvider, Disposable, Emitter, Event, Prioritizeable } from '@theia/core';
import { inject, injectable, interfaces, named } from '@theia/core/shared/inversify';
import { Preference } from '../../util/preference-types';
import { PreferenceHeaderRenderer, PreferenceNodeRenderer } from './preference-node-renderer';

export const PreferenceNodeRendererCreatorRegistry = Symbol('PreferenceNodeRendererCreatorRegistry');
export interface PreferenceNodeRendererCreatorRegistry {
    registerPreferenceNodeRendererCreator(creator: PreferenceNodeRendererCreator): Disposable;
    unregisterPreferenceNodeRendererCreator(creator: PreferenceNodeRendererCreator): void;
    getPreferenceNodeRendererCreator(node: Preference.TreeNode): PreferenceNodeRendererCreator;
    onDidChange: Event<void>;
}

export const PreferenceNodeRendererContribution = Symbol('PreferenceNodeRendererContribution');
export interface PreferenceNodeRendererContribution {
    registerPreferenceNodeRendererCreator(registry: PreferenceNodeRendererCreatorRegistry): void;
}

export const PreferenceNodeRendererCreator = Symbol('PreferenceNodeRendererCreator');
export interface PreferenceNodeRendererCreator {
    id: string;
    canHandle(node: Preference.TreeNode): number;
    createRenderer(node: Preference.TreeNode, container: interfaces.Container): PreferenceNodeRenderer;
}

@injectable()
export class DefaultPreferenceNodeRendererCreatorRegistry implements PreferenceNodeRendererCreatorRegistry {
    protected readonly _creators: Map<string, PreferenceNodeRendererCreator> = new Map<string, PreferenceNodeRendererCreator>();
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(
        @inject(ContributionProvider) @named(PreferenceNodeRendererContribution)
        protected readonly contributionProvider: ContributionProvider<PreferenceNodeRendererContribution>
    ) {
        const contributions = this.contributionProvider.getContributions();
        for (const contrib of contributions) {
            contrib.registerPreferenceNodeRendererCreator(this);
        }
    }

    registerPreferenceNodeRendererCreator(creator: PreferenceNodeRendererCreator): Disposable {
        if (this._creators.has(creator.id)) {
            console.warn(`A preference node renderer creator ${creator.id} is already registered.`);
            return Disposable.NULL;
        }
        this._creators.set(creator.id, creator);
        this.fireDidChange();
        return Disposable.create(() => this._creators.delete(creator.id));
    }

    unregisterPreferenceNodeRendererCreator(creator: PreferenceNodeRendererCreator | string): void {
        const id = typeof creator === 'string' ? creator : creator.id;
        if (this._creators.delete(id)) {
            this.fireDidChange();
        }
    }

    getPreferenceNodeRendererCreator(node: Preference.TreeNode): PreferenceNodeRendererCreator {
        const contributions = this.prioritize(node);
        if (contributions.length >= 1) {
            return contributions[0];
        }
        // we already bind a default creator contribution so if that happens it was deliberate
        throw new Error(`There is no contribution for ${node.id}.`);
    }

    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    protected prioritize(node: Preference.TreeNode): PreferenceNodeRendererCreator[] {
        const prioritized = Prioritizeable.prioritizeAllSync(Array.from(this._creators.values()), creator => {
            try {
                return creator.canHandle(node);
            } catch {
                return 0;
            }
        });
        return prioritized.map(p => p.value);
    }
}

@injectable()
export abstract class PreferenceLeafNodeRendererContribution implements PreferenceNodeRendererCreator, PreferenceNodeRendererContribution {
    abstract id: string;

    canHandle(node: Preference.TreeNode): number {
        return Preference.LeafNode.is(node) ? this.canHandleLeafNode(node) : 0;
    }

    registerPreferenceNodeRendererCreator(registry: PreferenceNodeRendererCreatorRegistry): void {
        registry.registerPreferenceNodeRendererCreator(this);
    }

    abstract canHandleLeafNode(node: Preference.LeafNode): number;

    createRenderer(node: Preference.TreeNode, container: interfaces.Container): PreferenceNodeRenderer {
        const child = container.createChild();
        child.bind(Preference.Node).toConstantValue(node);
        return this.createLeafNodeRenderer(child);
    }

    abstract createLeafNodeRenderer(container: interfaces.Container): PreferenceNodeRenderer;
}

@injectable()
export class PreferenceHeaderRendererContribution implements PreferenceNodeRendererCreator, PreferenceNodeRendererContribution {
    static ID = 'preference-header-renderer';
    id = PreferenceHeaderRendererContribution.ID;

    registerPreferenceNodeRendererCreator(registry: PreferenceNodeRendererCreatorRegistry): void {
        registry.registerPreferenceNodeRendererCreator(this);
    }

    canHandle(node: Preference.TreeNode): number {
        return !Preference.LeafNode.is(node) ? 1 : 0;
    }

    createRenderer(node: Preference.TreeNode, container: interfaces.Container): PreferenceNodeRenderer {
        const grandchild = container.createChild();
        grandchild.bind(Preference.Node).toConstantValue(node);
        return grandchild.get(PreferenceHeaderRenderer);
    }
}
