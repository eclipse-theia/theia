/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from 'inversify';
import { EditorManager, EditorOpenerOptions, Position } from '@theia/editor/lib/browser';
import { DebugProtocol } from 'vscode-debugprotocol';
import { EditorWidget } from '@theia/editor/lib/browser/editor-widget';
import URI from '@theia/core/lib/common/uri';
import { ExtDebugProtocol } from '../common/debug-common';
import { DebugSession } from './debug-model';

@injectable()
export class SourceOpener {
    constructor(@inject(EditorManager) protected readonly editorManager: EditorManager) { }

    async open(frame: DebugProtocol.StackFrame): Promise<EditorWidget> {
        if (!frame.source) {
            return Promise.reject(`The source '${frame.name}' to open is not specified.`);
        }

        const uri = DebugUtils.toUri(frame.source);
        return this.editorManager.getByUri(uri).then(widget => widget ? widget : this.editorManager.open(uri, this.toEditorOpenerOption(frame)));
    }

    private toEditorOpenerOption(frame: DebugProtocol.StackFrame): EditorOpenerOptions {
        return {
            selection: { start: Position.create(frame.line - 1, frame.column - 1) }
        };
    }
}

export namespace DebugUtils {
    /**
     * Creates a unique breakpoint identifier based on its origin.
     * @param breakpoint the breakpoint
     * @returns the breakpoint unique identifier
     */
    export function makeBreakpointId(breakpoint: ExtDebugProtocol.AggregatedBreakpoint | DebugProtocol.Breakpoint): string {
        if ('origin' in breakpoint) {
            if (isSourceBreakpoint(breakpoint)) {
                return makeSourceBrkId(breakpoint.source!, breakpoint.origin as DebugProtocol.SourceBreakpoint);
            } else if (isFunctionBreakpoint(breakpoint)) {
                return makeFunctionBrkId(breakpoint.origin as DebugProtocol.FunctionBreakpoint);
            } else if (isExceptionBreakpoint(breakpoint)) {
                return makeExceptionBrkId(breakpoint.origin as ExtDebugProtocol.ExceptionBreakpoint);
            }
        } else if (!!breakpoint.source && !!breakpoint.line) {
            const sourceBreakpoint = {
                line: breakpoint.line,
                column: breakpoint.column
            };

            return makeSourceBrkId(breakpoint.source, sourceBreakpoint);
        }

        throw new Error('Unrecognized breakpoint type: ' + JSON.stringify(breakpoint));
    }

    export function isSourceBreakpoint(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): boolean {
        return !!breakpoint.source;
    }

    export function isFunctionBreakpoint(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): boolean {
        return 'name' in breakpoint.origin;
    }

    export function isExceptionBreakpoint(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): boolean {
        return 'filter' in breakpoint.origin;
    }

    function makeExceptionBrkId(breakpoint: ExtDebugProtocol.ExceptionBreakpoint): string {
        return 'brk-exception-' + breakpoint.filter;
    }

    function makeFunctionBrkId(breakpoint: DebugProtocol.FunctionBreakpoint): string {
        return 'brk-function-' + breakpoint.name;
    }

    function makeSourceBrkId(source: DebugProtocol.Source, breakpoint: DebugProtocol.SourceBreakpoint): string {
        return 'brk-source-'
            // Accordingly to the spec either path or reference ought to be specified.
            + (source.path || source.sourceReference!)
            + `-${breakpoint.line}`
            + (breakpoint.column ? `:${breakpoint.column}` : '');
    }

    /**
     * Indicates if two entities has the same id.
     * @param left the left entity
     * @param right the right entity
     * @returns true if two entities have the same id otherwise it returns false
     */
    export function isEqual(left: { id: number } | number | undefined, right: { id: number } | number | undefined): boolean {
        return getId(left) === getId(right);
    }

    function getId(entity: { id: number } | number | undefined): number | undefined {
        if (typeof entity === "number") {
            return entity;
        }
        return entity && entity.id;
    }

    /**
     * Converts the [source](#DebugProtocol.Source) to a [uri](#URI).
     * @param source the debug source
     * @returns an [uri](#URI) referring to the source
     */
    export function toUri(source: DebugProtocol.Source): URI {
        if (source.path) {
            return new URI().withScheme('file').withPath(source.path);
        }

        if (source.sourceReference && source.sourceReference > 0) {
            // Every source returned from the debug adapter has a name
            return new URI().withScheme('dap').withPath(source.name!).withQuery(source.sourceReference.toString());
        }

        throw new Error('Unrecognized source type: ' + JSON.stringify(source));
    }

    /**
     * Converts the [uri](#URI) to [debug source](#DebugProtocol.Source).
     * @param uri an [uri](#URI) referring to the source
     * @param debugSession [debug session](#DebugSession)
     * @returns an [debug source](#DebugProtocol.Source) referred by the uri
     */
    export function toSource(uri: URI, debugSession: DebugSession | undefined): DebugProtocol.Source {
        const sourceReference = uri.query;

        if (debugSession) {
            const source = sourceReference
                ? debugSession.state.sources.get(sourceReference)
                : debugSession.state.sources.get(uri.path.toString());
            if (source) {
                return source;
            }
        }

        if (sourceReference) {
            return {
                sourceReference: Number.parseInt(sourceReference),
                name: uri.path.toString()
            };
        }

        return {
            name: uri.displayName,
            path: uri.path.toString()
        };
    }

    /**
     * Groups breakpoints by their source.
     * @param breakpoints the breakpoints to group
     * @return grouped breakpoints by their source
     */
    export function groupBySource(breakpoints: ExtDebugProtocol.AggregatedBreakpoint[]): Map<string, ExtDebugProtocol.AggregatedBreakpoint[]> {
        return breakpoints
            .filter(breakpoint => isSourceBreakpoint(breakpoint))
            .reduce((sourced, breakpoint) => {
                const uri = toUri(breakpoint.source!).toString();

                const arr = sourced.get(uri) || [];
                arr.push(breakpoint);
                sourced.set(uri, arr);

                return sourced;
            }, new Map<string, ExtDebugProtocol.AggregatedBreakpoint[]>());
    }

    /**
     * Indicates if the breakpoint has a source that refers to the same uri as provided.
     * @param breakpoint (breakpoint)[#ExtDebugProtocol.AggregatedBreakpoint]
     * @param uri (URI)[#URI]
     * @returns true breakpoint has a source that refers to the same uri otherwise function returns false
     */
    export function checkUri(breakpoint: ExtDebugProtocol.AggregatedBreakpoint, uri: URI): boolean {
        return toUri(breakpoint.source!).toString() === uri.toString();
    }

    /**
     * Indicates if given source fits any of patterns.
     */
    export function checkPattern(source: DebugProtocol.Source, filePatterns: string[]): boolean {
        for (const pattern of filePatterns) {
            // Every source returned from the debug adapter has a name
            const name = source.name!;

            if (new RegExp(pattern).test(name)) {
                return true;
            }
        }

        return false;
    }
}
