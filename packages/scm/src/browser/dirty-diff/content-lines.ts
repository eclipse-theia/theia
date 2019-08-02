/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

export interface ContentLines extends ArrayLike<string> {
    readonly length: number,
    getLineContent: (line: number) => string,
}

export interface ContentLinesArrayLike extends ContentLines, ArrayLike<string> {
    [Symbol.iterator]: () => IterableIterator<string>,
    readonly [n: number]: string;
}

export namespace ContentLines {
    const NL = '\n'.charCodeAt(0);
    const CR = '\r'.charCodeAt(0);

    export function fromString(content: string): ContentLines {
        const computeLineStarts: (s: string) => number[] = s => {
            const result: number[] = [0];
            for (let i = 0; i < s.length; i++) {
                const chr = s.charCodeAt(i);
                if (chr === CR) {
                    if (i + 1 < s.length && s.charCodeAt(i + 1) === NL) {
                        result[result.length] = i + 2;
                        i++;
                    } else {
                        result[result.length] = i + 1;
                    }
                } else if (chr === NL) {
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
                    throw new Error('line index out of bounds');
                }
                const start = lineStarts[line];
                let end = (line === lineStarts.length - 1) ? undefined : lineStarts[line + 1] - 1;
                if (!!end && content.charCodeAt(end - 1) === CR) {
                    end--; // ignore CR at the end
                }
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
            // tslint:disable-next-line:no-any
            get(target: ContentLines, p: PropertyKey): any {
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
                        return function* (): IterableIterator<string> {
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
                throw new Error(`get ${String(p)} not implemented`);
            }
        };
    }
}
