/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export interface ContentLines extends ArrayLike<string> {
    readonly length: number,
    getLineContent: (line: number) => string,
}

export interface ContentLinesArrayLike extends ContentLines, ArrayLike<string> {
    [Symbol.iterator]: () => IterableIterator<string>,
    readonly [n: number]: string;
}

export namespace ContentLines {

    export function fromString(content: string): ContentLines {
        const computeLineStarts: (s: string) => number[] = s => {
            const NL = '\n'.charCodeAt(0);
            const result: number[] = [0];
            for (let i = 0; i < s.length; i++) {
                const chr = s.charCodeAt(i);
                if (chr === NL) {
                    result[result.length] = i + 1;
                }
            }
            return result;
        };
        const lineStarts = computeLineStarts(content);

        return {
            length: lineStarts.length,
            getLineContent: line => {
                if (line >= lineStarts.length) {
                    throw 'line index out of bounds';
                }
                const start = lineStarts[line];
                const end = (line === lineStarts.length - 1) ? undefined : lineStarts[line + 1] - 1;
                const lineContent = content.substring(start, end);
                return lineContent;
            }
        };
    }

    export function arrayLike(lines: ContentLines): ContentLinesArrayLike {
        return new Proxy(lines as ContentLines, getProxyHandler()) as ContentLinesArrayLike;
    }

    function getProxyHandler(): ProxyHandler<ContentLinesArrayLike> {
        return {
            get(target: ContentLines, p: PropertyKey) {
                switch (p) {
                    case 'prototype':
                        return undefined;
                    case 'length':
                        return target.length;
                    case 'slice':
                        return (start?: number, end?: number) => {
                            if (start !== undefined) {
                                return [start, (end !== undefined ? end - 1 : target.length - 1)];
                            }
                            return [0, target.length - 1];
                        };
                    case Symbol.iterator:
                        return function* () {
                            for (let i = 0; i < target.length; i++) {
                                yield target.getLineContent(i);
                            }
                        };
                }
                // tslint:disable-next-line:no-any
                const index = Number.parseInt(p as any);
                if (Number.isInteger(index)) {
                    if (index >= 0 && index < target.length) {
                        const value = target.getLineContent(index);
                        if (value === undefined) {
                            console.log(target);
                        }
                        return value;
                    } else {
                        return undefined;
                    }
                }
                throw `get ${p} not implemented`;
            }
        };
    }
}
