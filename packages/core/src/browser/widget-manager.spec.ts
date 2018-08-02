/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { Container, ContainerModule } from 'inversify';
import { expect } from 'chai';
import { WidgetManager, WidgetFactory } from './widget-manager';
import { Widget } from '@phosphor/widgets';
import { Signal } from '@phosphor/signaling';
import { ILogger } from '../common/logger';
import { MockLogger } from '../common/test/mock-logger';
import { bindContributionProvider } from '../common';

class TestWidgetFactory implements WidgetFactory {

    invocations = 0;
    id = 'test';

    async createWidget(name: string): Promise<Widget> {
        this.invocations++;
        // create a mock Widget, since a real widget has deps to dom api
        const result = {} as Widget;
        result.id = name;
        // tslint:disable-next-line:no-any
        (<any>result).disposed = new Signal<Widget, void>(result);
        return result;
    }
}

let widgetManager: WidgetManager;

before(() => {
    const testContainer = new Container();

    const module = new ContainerModule((bind, unbind, isBound, rebind) => {
        bind(ILogger).to(MockLogger);
        bindContributionProvider(bind, WidgetFactory);
        bind(WidgetFactory).toConstantValue(new TestWidgetFactory());
        bind(WidgetManager).toSelf().inSingletonScope();
    });
    testContainer.load(module);

    widgetManager = testContainer.get(WidgetManager);
});

describe('widget-manager', () => {

    it('creates and caches widgets', async () => {
        const wA = await widgetManager.getOrCreateWidget('test', 'widgetA');
        const wB = await widgetManager.getOrCreateWidget('test', 'widgetB');
        expect(wA).not.equals(wB);
        expect(wA).equals(await widgetManager.getOrCreateWidget('test', 'widgetA'));
    });

});
