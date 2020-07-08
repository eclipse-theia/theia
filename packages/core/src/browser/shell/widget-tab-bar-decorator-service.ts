/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import debounce = require('lodash.debounce');
import { inject, injectable, named, postConstruct } from 'inversify';
import { Title, Widget } from '@phosphor/widgets';
import { Event, Emitter, Disposable, DisposableCollection, ContributionProvider } from '../../common';
import { WidgetDecoration } from '../widget-decoration';

export const WidgetTabBarDecorator = Symbol('WidgetTabBarDecorator');
export interface WidgetTabBarDecorator {
    readonly id: string;
    readonly onDidChangeDecorations: Event<void>;
    decorate(title: Title<Widget>): WidgetDecoration.Data[];
}

@injectable()
export class WidgetTabBarDecoratorService implements Disposable {

    protected readonly onDidChangeDecorationsEmitter = new Emitter<void>();

    readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;
    protected fireDidChangeDecorations = debounce(() => this.onDidChangeDecorationsEmitter.fire(undefined), 150);

    protected readonly toDispose = new DisposableCollection();

    @inject(ContributionProvider) @named(WidgetTabBarDecorator)
    protected readonly contributions: ContributionProvider<WidgetTabBarDecorator>;

    @postConstruct()
    protected init(): void {
        const decorators = this.contributions.getContributions();
        this.toDispose.pushAll(decorators.map(decorator =>
            decorator.onDidChangeDecorations(this.fireDidChangeDecorations)
        ));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Assign tabs the decorators provided by all the contributions.
     * @param {Title<Widget>} title the title
     * @returns an array of its decoration data.
     */
    getDecorations(title: Title<Widget>): WidgetDecoration.Data[] {
        const decorators = this.contributions.getContributions();
        let all: WidgetDecoration.Data[] = [];
        for (const decorator of decorators) {
            const decorations = decorator.decorate(title);
            all = all.concat(decorations);
        }
        return all;
    }
}
