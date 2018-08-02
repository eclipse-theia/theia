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

import { injectable } from 'inversify';
import { MergeConflict } from './merge-conflict';
import { Range } from '@theia/editor/lib/browser';

@injectable()
export class MergeConflictsParser {
    private parser: MergeConflictsParser.StateMachine<MergeConflictsParser.Context>;

    constructor() {
        this.init();
    }

    parse(input: MergeConflictsParser.Input): MergeConflict[] {
        const context = new MergeConflictsParser.Context();
        this.parser.reset(context);
        for (let number = 0; number < input.lineCount; number++) {
            this.parser.read({ number, content: input.getLine(number) });
        }
        return context.all;
    }

    private init(): void {
        const parser = this.parser = new MergeConflictsParser.StateMachine(new MergeConflictsParser.Context());
        // states
        const start = parser.addState('start');
        const currentMarker = parser.addState('current-marker');
        const currentContent = parser.addState('current-content');
        const baseMarker = parser.addState('base-marker');
        const baseContent = parser.addState('base-content');
        const separator = parser.addState('separator');
        const incomingContent = parser.addState('incoming-content');
        const incomingMarker = parser.addState('incoming-marker');
        const push = parser.addState('push');

        // conditions / triggers
        const createStartsWithCondition: (char: string) => ((input: string) => boolean) = (char: string) => {
            const re = new RegExp(`^${char}{7}`);
            return (input: string) => {
                if (input.length < 7) {
                    return false;
                }
                return re.test(input);
            };
        };
        const startsWithLt = createStartsWithCondition('<');
        const startsWithEq = createStartsWithCondition('=');
        const startsWithGt = createStartsWithCondition('>');
        const startsWithPp = createStartsWithCondition('\\|');
        const any = () => true;

        // transitions
        start.to(currentMarker, startsWithLt);
        start.to(start, any);
        currentMarker.to(currentMarker, startsWithLt);
        currentMarker.to(separator, startsWithEq);
        currentMarker.to(baseMarker, startsWithPp);
        currentMarker.to(currentContent, any);
        currentContent.to(currentMarker, startsWithLt);
        currentContent.to(separator, startsWithEq);
        currentContent.to(baseMarker, startsWithPp);
        currentContent.to(start, startsWithGt);
        currentContent.to(currentContent, any);
        baseMarker.to(currentMarker, startsWithLt);
        baseMarker.to(baseMarker, startsWithPp);
        baseMarker.to(separator, startsWithEq);
        baseMarker.to(baseContent, any);
        baseContent.to(currentMarker, startsWithLt);
        baseContent.to(separator, startsWithEq);
        baseContent.to(baseMarker, startsWithPp);
        baseContent.to(baseContent, any);
        separator.to(currentMarker, startsWithLt);
        separator.to(start, startsWithEq);
        separator.to(incomingMarker, startsWithGt);
        separator.to(incomingContent, any);
        incomingContent.to(start, startsWithEq);
        incomingContent.to(currentMarker, startsWithLt);
        incomingContent.to(incomingMarker, startsWithGt);
        incomingContent.to(incomingContent, any);
        incomingMarker.to(push);
        push.to(start);

        // actions
        currentMarker.onEnter = (input, ctx) => {
            ctx.new = new MergeConflictsParser.Context().new;
            ctx.new.current.marker = this.lineToRange(input);
        };
        currentContent.onEnter = (input, ctx) => {
            const current = ctx.new.current;
            current.content = this.addLineToRange(input, current.content);
        };
        baseMarker.onEnter = (input, ctx) => {
            ctx.new.bases.push({ marker: this.lineToRange(input) });
        };
        baseContent.onEnter = (input, ctx) => {
            const base = ctx.new.bases.slice(-1)[0];
            base.content = this.addLineToRange(input, base.content);
        };
        incomingContent.onEnter = (input, ctx) => {
            const incoming = ctx.new.incoming;
            incoming.content = this.addLineToRange(input, incoming.content);
        };
        incomingMarker.onEnter = (input, ctx) => {
            const markerRange = this.lineToRange(input);
            ctx.new.incoming.marker = markerRange;
            ctx.new.total = {
                start: ctx.new.current.marker!.start,
                end: markerRange.end
            };
        };
        push.onEnter = (input, ctx) => {
            ctx.all.push(ctx.new);
        };
    }

    private lineToRange(line: MergeConflictsParser.Line): Range {
        return {
            start: { line: line.number, character: 0 },
            end: { line: line.number, character: line.content.length },
        };
    }

    private addLineToRange(line: MergeConflictsParser.Line, range: Range | undefined): Range {
        if (!range) {
            return this.lineToRange(line);
        }
        range.end = { line: line.number, character: line.content.length };
        return range;
    }
}

export namespace MergeConflictsParser {

    export interface Input {
        readonly lineCount: number;
        getLine(lineNumber: number): string;
    }

    export class Context {
        new: MergeConflict = {
            current: {},
            incoming: {},
            bases: []
        };
        all: MergeConflict[] = [];
    }

    export interface Line {
        number: number;
        content: string;
    }

    export class StateMachine<C extends object> {
        current: State<C>;
        readonly states: State<C>[] = [];

        constructor(protected context: C) { }

        reset(context: C): void {
            this.current = this.states[0];
            this.context = context;
        }

        read(line: Line): void {
            let next = this.current.findNext(line, this.context);
            while (next) {
                if (next.onEnter) {
                    next.onEnter(line, this.context);
                }
                if (next.immediateNext) {
                    this.current = next;
                    next = next.immediateNext;
                } else {
                    break;
                }
            }
            if (!next) {
                throw new Error(`Missing transition from (${this.current.id}) for input: L.${line.number} > ${line.content}`);
            }
            this.current = next;
        }

        addState(id: string): State<C> {
            const state = new State<C>(id);
            this.states.push(state);
            if (!this.current) {
                this.current = state;
            }
            return state;
        }
    }

    export class State<C> {
        onEnter?: (line: Line, context: C) => void;
        readonly conditionalNext: { to: State<C>, condition: (line: string) => boolean }[] = [];
        immediateNext: State<C> | undefined;

        constructor(readonly id: string) { }

        findNext(line: Line, context: C): State<C> | undefined {
            for (const candidate of this.conditionalNext) {
                if (candidate.condition(line.content)) {
                    return candidate.to;
                }
            }
            return undefined;
        }

        to(next: State<C>, condition?: (line: string) => boolean): void {
            if (condition) {
                this.immediateNext = undefined;
                this.conditionalNext.push({ to: next, condition });
            } else {
                this.immediateNext = next;
            }
        }
    }
}
