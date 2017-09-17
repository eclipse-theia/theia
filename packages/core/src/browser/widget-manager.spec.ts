/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */


import * as assert from 'assert';
import { TestLogger } from '../common/test/test-logger';
import { WidgetManager, WidgetFactory } from './widget-manager';
import { Widget } from '@phosphor/widgets';
import { LocalStorageService, StorageService } from './storage-service';
import { Signal } from '@phosphor/signaling';

let widgetManager: WidgetManager;

let storage: StorageService;
let widgetFactory: TestFactory;

class TestFactory implements WidgetFactory {

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

before(() => {
    widgetFactory = new TestFactory();
    storage = new LocalStorageService(new TestLogger());
    widgetManager = new WidgetManager({
        getContributions() {
            return [
                widgetFactory
            ];
        }
    }, new TestLogger());
});

describe("widget-manager", () => {

    it("creates and caches widgets", async () => {
        const wA = await widgetManager.getOrCreateWidget('test', 'widgetA');
        const wB = await widgetManager.getOrCreateWidget('test', 'widgetB');
        assert.notStrictEqual(wA, wB);
        assert.strictEqual(wA, await widgetManager.getOrCreateWidget('test', 'widgetA'));
    });

});

