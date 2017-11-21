/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from "inversify";

export interface LabelIcon {
    name: string;
    animation?: string;
}

export namespace LabelIcon {
    export function is(val: object): val is LabelIcon {
        return 'name' in val;
    }
}

export type LabelPart = string | LabelIcon;

@injectable()
export class LabelParser {

    /**
     * Returns an array with parts of the given text.
     * These parts are of type LabelPart which can be either a string or a LabelIcon.
     * For splitting up the giving text the parser follows this rule:
     * The text gets parsed for the following pattern: $(iconName~iconAnimation).
     * If the parser finds such pattern a new LabelIcon object
     * { name: 'iconName', animation: 'iconAnimation'} is added to the returned array.
     * iconName can be for instance the name of an icon of e.g. FontAwesome and the (optional) iconAnimation
     * the name of an animation class which must be supported by the particular icon toolkit.
     *
     * Every string before, between or after such icon patterns gets also added to the array
     * before, between or after the related LabelIcon.
     *
     * @param text - the label text to parse
     */
    parse(text: string): LabelPart[] {
        const parserArray: LabelPart[] = [];
        let arrPointer = 0;
        let potentialIcon = '';

        for (let idx = 0; idx < text.length; idx++) {
            const char = text.charAt(idx);
            parserArray[arrPointer] = parserArray[arrPointer] || '';
            if (potentialIcon === '') {
                if (char === '$') {
                    potentialIcon += char;
                } else {
                    parserArray[arrPointer] += char;
                }
            } else if (potentialIcon === '$') {
                if (char === '(') {
                    potentialIcon += char;
                } else {
                    parserArray[arrPointer] += potentialIcon + char;
                    potentialIcon = '';
                }
            } else {
                if (char === ')') {
                    const iconClassArr = potentialIcon.substring(2, potentialIcon.length).split('~');
                    if (parserArray[arrPointer] !== '') {
                        arrPointer++;
                    }
                    parserArray[arrPointer] = { name: iconClassArr[0], animation: iconClassArr[1] };
                    arrPointer++;
                    potentialIcon = '';
                } else {
                    potentialIcon += char;
                }
            }
        }

        if (potentialIcon !== '') {
            parserArray[arrPointer] += potentialIcon;
        }

        return parserArray;
    }

}
