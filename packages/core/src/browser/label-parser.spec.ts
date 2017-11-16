/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { LabelParser, LabelPart, LabelIcon } from './label-parser';
import { CommandService } from './../common';
import { Container } from "inversify";
import { expect } from 'chai';

let statusBarEntryUtility: LabelParser;

before(() => {
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

    it("should create an empty array.", () => {
        text = '';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(0);
    });

    it("should create a string array with one entry.", () => {
        text = 'foo bar';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(1);
        expect(iconArr[0]).equals('foo bar');
    });

    it("should create a string array with one entry - text contains an $.", () => {
        text = 'foo $ bar';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(1);
        expect(iconArr[0]).equals('foo $ bar');
    });

    it("should create a string array with one entry - text contains an $( which does not close.", () => {
        text = 'foo $(bar';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(1);
        expect(iconArr[0]).equals('foo $(bar');
    });

    it("should create a string array with two entries. Second is a simple StatusBarIcon.", () => {
        text = 'foo $(bar)';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(2);
        expect(iconArr[0]).equals('foo ');
        expect(iconArr[1]).has.property('name');
        expect(iconArr[1]).has.property('animation');
        expect((iconArr[1] as LabelIcon).name).equals('bar');
        expect((iconArr[1] as LabelIcon).animation).to.be.undefined;
    });

    it("should create a string array with two entries. Second is a StatusBarIcon with an animation.", () => {
        text = 'foo $(bar~baz)';
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(2);
        expect(iconArr[0]).equals('foo ');
        expect(iconArr[1]).has.property('name');
        expect(iconArr[1]).has.property('animation');
        expect((iconArr[1] as LabelIcon).name).equals('bar');
        expect((iconArr[1] as LabelIcon).animation).equals('baz');
    });

    it("should create string array of 'foo $(icon1) bar $(icon2) baz $(icon3)'", () => {
        text = "foo $(icon1) bar $(icon2) baz $(icon3)";
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(6);
        expect(iconArr[0]).equals('foo ');
        expect(iconArr[2]).equals(' bar ');
    });

    it("should create string array of '$(icon1) foo bar $(icon2) baz $(icon3)'", () => {
        text = "$(icon1) foo bar $(icon2~ani1) baz $(icon3)";
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(5);
        expect(iconArr[0]).has.property('name');
        expect((iconArr[0] as LabelIcon).name).equals('icon1');
        expect(iconArr[2]).has.property('animation');
        expect((iconArr[2] as LabelIcon).animation).equals('ani1');
    });

    it("should create an array with one element of '$(icon1)'", () => {
        text = "$(icon1)";
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(1);
        expect(iconArr[0]).has.property('name');
        expect((iconArr[0] as LabelIcon).name).equals('icon1');
    });

    it("should create an array of '$(icon1)$(icon2) (icon3)'", () => {
        text = "$(icon1)$(icon2) $(icon3)";
        const iconArr: LabelPart[] = statusBarEntryUtility.parse(text);
        expect(iconArr).to.have.lengthOf(4);
        expect(iconArr[0]).has.property('name');
        expect((iconArr[0] as LabelIcon).name).equals('icon1');
        expect(iconArr[1]).has.property('name');
        expect((iconArr[1] as LabelIcon).name).equals('icon2');
        expect(iconArr[2]).equals(' ');
        expect(iconArr[3]).has.property('name');
        expect((iconArr[3] as LabelIcon).name).equals('icon3');
    });

});
