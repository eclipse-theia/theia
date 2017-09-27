/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
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

describe("widget-manager", () => {

    it("creates and caches widgets", async () => {
        const wA = await widgetManager.getOrCreateWidget('test', 'widgetA');
        const wB = await widgetManager.getOrCreateWidget('test', 'widgetB');
        expect(wA).not.equals(wB);
        expect(wA).equals(await widgetManager.getOrCreateWidget('test', 'widgetA'));
    });

});
