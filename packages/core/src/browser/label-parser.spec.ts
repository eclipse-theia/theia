/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { LabelParser, LabelPart, LabelIcon } from './label-parser';
import { CommandService } from './../common';
import { Container } from "inversify";

let statusBarEntryUtility: LabelParser;

beforeAll(() => {
    const testContainer = new Container();
    testContainer.bind(LabelParser).toSelf().inSingletonScope();
    testContainer.bind(CommandService).toDynamicValue(ctx => ({
        executeCommand<T>(): Promise<T | undefined> {
            return Promise.resolve(undefined);
        }
    })).inSingletonScope();

    statusBarEntryUtility = testContainer.get(LabelParser);
});

describe("StatusBarEntryUtility", () => {

    let text: string;

    test("should create an empty array.", () => {
        text = '';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).toHaveLength(0);
    });

    test("should create a string array with one entry.", () => {
        text = 'foo bar';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).toHaveLength(1);
        expect(iconArr[0]).toEqual('foo bar');
    });

    test(
        "should create a string array with one entry - text contains an $.",
        () => {
            text = 'foo $ bar';
            const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
            expect(iconArr).toHaveLength(1);
            expect(iconArr[0]).toEqual('foo $ bar');
        }
    );

    test(
        "should create a string array with one entry - text contains an $( which does not close.",
        () => {
            text = 'foo $(bar';
            const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
            expect(iconArr).toHaveLength(1);
            expect(iconArr[0]).toEqual('foo $(bar');
        }
    );

    test(
        "should create a string array with two entries. Second is a simple StatusBarIcon.",
        () => {
            text = 'foo $(bar)';
            const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
            expect(iconArr).toHaveLength(2);
            expect(iconArr[0]).toEqual('foo ');
            expect(iconArr[1]).toHaveProperty('name');
            expect(iconArr[1]).toHaveProperty('animation');
            expect((iconArr[1] as LabelIcon).name).toEqual('bar');
            expect((iconArr[1] as LabelIcon).animation).toBeUndefined();
        }
    );

    test(
        "should create a string array with two entries. Second is a StatusBarIcon with an animation.",
        () => {
            text = 'foo $(bar~baz)';
            const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
            expect(iconArr).toHaveLength(2);
            expect(iconArr[0]).toEqual('foo ');
            expect(iconArr[1]).toHaveProperty('name');
            expect(iconArr[1]).toHaveProperty('animation');
            expect((iconArr[1] as LabelIcon).name).toEqual('bar');
            expect((iconArr[1] as LabelIcon).animation).toEqual('baz');
        }
    );

    test(
        "should create string array of 'foo $(icon1) bar $(icon2) baz $(icon3)'",
        () => {
            text = "foo $(icon1) bar $(icon2) baz $(icon3)";
            const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
            expect(iconArr).toHaveLength(6);
            expect(iconArr[0]).toEqual('foo ');
            expect(iconArr[2]).toEqual(' bar ');
        }
    );

    test(
        "should create string array of '$(icon1) foo bar $(icon2) baz $(icon3)'",
        () => {
            text = "$(icon1) foo bar $(icon2~ani1) baz $(icon3)";
            const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
            expect(iconArr).toHaveLength(5);
            expect(iconArr[0]).toHaveProperty('name');
            expect((iconArr[0] as LabelIcon).name).toEqual('icon1');
            expect(iconArr[2]).toHaveProperty('animation');
            expect((iconArr[2] as LabelIcon).animation).toEqual('ani1');
        }
    );

    test("should create an array with one element of '$(icon1)'", () => {
        text = "$(icon1)";
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).toHaveLength(1);
        expect(iconArr[0]).toHaveProperty('name');
        expect((iconArr[0] as LabelIcon).name).toEqual('icon1');
    });

    test("should create an array of '$(icon1)$(icon2) (icon3)'", () => {
        text = "$(icon1)$(icon2) $(icon3)";
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).toHaveLength(4);
        expect(iconArr[0]).toHaveProperty('name');
        expect((iconArr[0] as LabelIcon).name).toEqual('icon1');
        expect(iconArr[1]).toHaveProperty('name');
        expect((iconArr[1] as LabelIcon).name).toEqual('icon2');
        expect(iconArr[2]).toEqual(' ');
        expect(iconArr[3]).toHaveProperty('name');
        expect((iconArr[3] as LabelIcon).name).toEqual('icon3');
    });

});
