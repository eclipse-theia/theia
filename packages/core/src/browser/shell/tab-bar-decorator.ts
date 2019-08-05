/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, named, postConstruct } from 'inversify';
import { Event, Emitter, Disposable, DisposableCollection, ContributionProvider } from '../../common';
import { Title, Widget } from '@phosphor/widgets';
import { WidgetDecoration } from '../widget-decoration';

export const TabBarDecorator = Symbol('TabBarDecorator');

export interface TabBarDecorator {

    /**
     * The unique identifier of the tab bar decorator.
     */
    readonly id: string;

    /**
     * Event that is fired when any of the available tab bar decorators has changes.
     */
    readonly onDidChangeDecorations: Event<void>;

    /**
     * Decorate tabs by the underlying URI.
     * @param {Title<Widget>[]} titles An array of the titles of the tabs.
     * @returns A map from the URI of the tab to its decoration data.
     */
    decorate(titles: Title<Widget>[]): Map<string, WidgetDecoration.Data>;
}

@injectable()
export class TabBarDecoratorService implements Disposable {

    protected readonly onDidChangeDecorationsEmitter = new Emitter<void>();

    readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    @inject(ContributionProvider) @named(TabBarDecorator)
    protected readonly contributions: ContributionProvider<TabBarDecorator>;

    @postConstruct()
    protected init(): void {
        const decorators = this.contributions.getContributions();
        this.toDispose.pushAll(decorators.map(decorator =>
            decorator.onDidChangeDecorations(data =>
                this.onDidChangeDecorationsEmitter.fire(undefined)
            ))
        );
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Assign tabs the decorators provided by all the contributions.
     * @param {Title<Widget>[]} titles An array of the titles of the tabs.
     * @returns A map from the URI of the tab to an array of its decoration data.
     */
    getDecorations(titles: Title<Widget>[]): Map<string, WidgetDecoration.Data[]> {
        const decorators = this.contributions.getContributions();
        const changes: Map<string, WidgetDecoration.Data[]> = new Map();
        for (const decorator of decorators) {
            for (const [id, data] of (decorator.decorate(titles)).entries()) {
                if (changes.has(id)) {
                    changes.get(id)!.push(data);
                } else {
                    changes.set(id, [data]);
                }
            }
        }
        return changes;
    }
}
