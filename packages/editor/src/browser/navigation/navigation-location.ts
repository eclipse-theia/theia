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

import URI from '@theia/core/lib/common/uri';
import { Position, Range, TextDocumentContentChangeDelta } from '../editor';
export { Position, Range };

export namespace NavigationLocation {

    /**
     * The navigation location type.
     */
    export enum Type {

        /**
         * Cursor position change type.
         */
        CURSOR,

        /**
         * Text selection change type.
         */
        SELECTION,

        /**
         * Content change type.
         */
        CONTENT_CHANGE

    }

    /**
     * The type of the context for the navigation location.
     */
    export type Context = Position | Range | TextDocumentContentChangeDelta;

    export namespace Context {

        /**
         * Returns with the type for the context.
         */
        export function getType(context: Context): Type {
            if (Position.is(context)) {
                return Type.CURSOR;
            }
            if (Range.is(context)) {
                return Type.SELECTION;
            }
            if (TextDocumentContentChangeDelta.is(context)) {
                return Type.CONTENT_CHANGE;
            }
            throw new Error(`Unexpected context for type: ${context}.`);
        }

    }

}

/**
 * Representation of a navigation location in a text editor.
 */
export interface NavigationLocation {

    /**
     * The URI of the resource opened in the editor.
     */
    readonly uri: URI;

    /**
     * The type of the navigation location.
     */
    readonly type: NavigationLocation.Type;

    /**
     * Context of the navigation location.
     */
    readonly context: NavigationLocation.Context;

}

export namespace NavigationLocation {

    /**
     * Transforms the location into an object that can be safely serialized.
     */
    export function toObject(location: NavigationLocation): object {
        const { uri, type } = location;
        const context = (() => {
            if (CursorLocation.is(location)) {
                return CursorLocation.toObject(location.context);
            }
            if (SelectionLocation.is(location)) {
                return SelectionLocation.toObject(location.context);
            }
            if (ContentChangeLocation.is(location)) {
                return ContentChangeLocation.toObject(location.context);
            }
        })();
        return {
            uri: uri.toString(),
            type,
            context
        };
    }

    /**
     * Returns with the navigation location object from its serialized counterpart.
     */
    export function fromObject(object: Partial<NavigationLocation>): NavigationLocation | undefined {
        const { uri, type } = object;
        if (uri !== undefined && type !== undefined && object.context !== undefined) {
            const context = (() => {
                switch (type) {
                    case NavigationLocation.Type.CURSOR: return CursorLocation.fromObject(object.context as Position);
                    case NavigationLocation.Type.SELECTION: return SelectionLocation.fromObject(object.context as Range);
                    case NavigationLocation.Type.CONTENT_CHANGE: return ContentChangeLocation.fromObject(object.context as TextDocumentContentChangeDelta);
                }
            })();
            if (context) {
                return {
                    uri: toUri(uri),
                    context,
                    type
                };
            }
        }
        return undefined;
    }

    /**
     * Returns with the context of the location as a `Range`.
     */
    export function range(location: NavigationLocation): Range {
        if (CursorLocation.is(location)) {
            return Range.create(location.context, location.context);
        }
        if (SelectionLocation.is(location)) {
            return location.context;
        }
        if (ContentChangeLocation.is(location)) {
            return location.context.range;
        }
        throw new Error(`Unexpected navigation location: ${location}.`);
    }

    /**
     * Creates a new cursor location.
     */
    export function create(uri: URI | { uri: URI } | string, context: Position): CursorLocation;

    /**
     * Creates a new selection location.
     */
    export function create(uri: URI | { uri: URI } | string, context: Range): SelectionLocation;

    /**
     * Creates a new text content change location type.
     */
    export function create(uri: URI | { uri: URI } | string, context: TextDocumentContentChangeDelta): ContentChangeLocation;

    /**
     * Creates a new navigation location object.
     */
    export function create(uri: URI | { uri: URI } | string, context: NavigationLocation.Context): NavigationLocation {
        const type = NavigationLocation.Context.getType(context);
        return {
            uri: toUri(uri),
            type,
            context
        };
    }

    /**
     * Returns with the human-consumable (JSON) string representation of the location argument.
     */
    export function toString(location: NavigationLocation): string {
        return JSON.stringify(toObject(location));
    }

    function toUri(arg: URI | { uri: URI } | string): URI {
        if (arg instanceof URI) {
            return arg;
        }
        if (typeof arg === 'string') {
            return new URI(arg);
        }
        return arg.uri;
    }

}

/**
 * Navigation location representing the cursor location change.
 */
export interface CursorLocation extends NavigationLocation {

    /**
     * The type is always `cursor`.
     */
    readonly type: NavigationLocation.Type.CURSOR;

    /**
     * The context for the location, that is always a position.
     */
    readonly context: Position;

}

export namespace CursorLocation {

    /**
     * `true` if the argument is a cursor location. Otherwise, `false`.
     */
    export function is(location: NavigationLocation): location is CursorLocation {
        return location.type === NavigationLocation.Type.CURSOR;
    }

    /**
     * Returns with the serialized format of the position argument.
     */
    export function toObject(context: Position): object {
        const { line, character } = context;
        return {
            line,
            character
        };
    }

    /**
     * Returns with the position from its serializable counterpart, or `undefined`.
     */
    export function fromObject(object: Partial<Position>): Position | undefined {
        if (object.line !== undefined && object.character !== undefined) {
            const { line, character } = object;
            return {
                line,
                character
            };
        }
        return undefined;
    }

}

/**
 * Representation of a selection location.
 */
export interface SelectionLocation extends NavigationLocation {

    /**
     * The `selection` type.
     */
    readonly type: NavigationLocation.Type.SELECTION;

    /**
     * The context of the selection; a range.
     */
    readonly context: Range;

}

export namespace SelectionLocation {

    /**
     * `true` if the argument is a selection location.
     */
    export function is(location: NavigationLocation): location is SelectionLocation {
        return location.type === NavigationLocation.Type.SELECTION;
    }

    /**
     * Converts the range argument into a serializable object.
     */
    export function toObject(context: Range): object {
        const { start, end } = context;
        return {
            start: CursorLocation.toObject(start),
            end: CursorLocation.toObject(end)
        };
    }

    /**
     * Creates a range object from its serializable counterpart. Returns with `undefined` if the argument cannot be converted into a range.
     */
    export function fromObject(object: Partial<Range>): Range | undefined {
        if (!!object.start && !!object.end) {
            const start = CursorLocation.fromObject(object.start);
            const end = CursorLocation.fromObject(object.end);
            if (start && end) {
                return {
                    start,
                    end
                };
            }
        }
        return undefined;
    }
}

/**
 * Content change location type.
 */
export interface ContentChangeLocation extends NavigationLocation {

    /**
     * The type, that is always `content change`.
     */
    readonly type: NavigationLocation.Type.CONTENT_CHANGE;

    /**
     * A text document content change deltas as the context.
     */
    readonly context: TextDocumentContentChangeDelta;

}

export namespace ContentChangeLocation {

    /**
     * `true` if the argument is a content change location. Otherwise, `false`.
     */
    export function is(location: NavigationLocation): location is ContentChangeLocation {
        return location.type === NavigationLocation.Type.CONTENT_CHANGE;
    }

    /**
     * Returns with a serializable object representing the arguments.
     */
    export function toObject(context: TextDocumentContentChangeDelta): object {
        return {
            range: SelectionLocation.toObject(context.range),
            rangeLength: context.rangeLength,
            text: context.text
        };
    }

    /**
     * Returns with a text document change delta for the argument. `undefined` if the argument cannot be mapped to a content change delta.
     */
    export function fromObject(object: Partial<TextDocumentContentChangeDelta>): TextDocumentContentChangeDelta | undefined {
        if (!!object.range && object.rangeLength !== undefined && object.text !== undefined) {
            const range = SelectionLocation.fromObject(object.range!);
            const rangeLength = object.rangeLength;
            const text = object.text;
            if (!!range) {
                return {
                    range,
                    rangeLength: rangeLength!,
                    text: text!
                };
            }
        } else {
            return undefined;
        }
    }

}
