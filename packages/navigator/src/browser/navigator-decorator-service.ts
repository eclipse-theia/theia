/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { TreeDecorator, DecorationData, TreeDecoratorService } from '@theia/core/lib/browser/tree/tree-decorator';

/**
 * Decorator service which emits events from all known tree decorators and caches the current state.
 */
@injectable()
export class NavigatorDecoratorService implements TreeDecoratorService {

    protected emitter: Emitter<Map<string, DecorationData[]>>;
    protected decorations: Map<string, Map<string, DecorationData>>;

    constructor(@inject(ContributionProvider) @named(TreeDecorator) protected readonly decorators: ContributionProvider<TreeDecorator>) {
        this.decorations = new Map();
        this.emitter = new Emitter();
        this.decorators.getContributions().forEach(decorator => {
            const { id } = decorator;
            decorator.onDidChangeDecorations(data => {
                this.decorations.set(id, data);
                const changes = new Map();
                Array.from(this.decorations.values()).forEach(decorations => {
                    Array.from(decorations.entries()).forEach(keyIdPair => {
                        const [nodeId, nodeData] = keyIdPair;
                        if (changes.has(nodeId)) {
                            changes.get(nodeId)!.push(nodeData);
                        } else {
                            changes.set(nodeId, [nodeData]);
                        }
                    });
                });
                this.emitter.fire(changes);
            });
        });
    }

    get onDidChangeDecorations(): Event<Map<string, DecorationData[]>> {
        return this.emitter.event;
    }

}
