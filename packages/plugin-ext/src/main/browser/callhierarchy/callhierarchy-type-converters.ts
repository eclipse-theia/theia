/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import { Definition as CallHierarchyDefinition, Caller as CallHierarchyCaller, Callee as CallHierarchyCallee } from '@theia/callhierarchy/lib/browser';
import * as model from '../../../common/plugin-api-rpc-model';
import * as rpc from '../../../common/plugin-api-rpc';
import * as lsp from '@theia/core/shared/vscode-languageserver-protocol';
import { URI } from '@theia/core/shared/vscode-uri';
import { UriComponents } from '../../../common/uri-components';

export function toUriComponents(uri: string): UriComponents {
    return URI.parse(uri);
}

export function fromUriComponents(uri: UriComponents): string {
    return URI.revive(uri).toString();
}

export function fromLocation(location: lsp.Location): model.Location {
    return <model.Location>{
        uri: URI.parse(location.uri),
        range: fromRange(location.range)
    };
}

export function toLocation(uri: UriComponents, range: model.Range): lsp.Location {
    return {
        uri: URI.revive(uri).toString(),
        range: toRange(range)
    };
}

export function fromPosition(position: lsp.Position): rpc.Position {
    return <rpc.Position>{
        lineNumber: position.line,
        column: position.character
    };
}

export function fromRange(range: lsp.Range): model.Range {
    const { start, end } = range;
    return {
        startLineNumber: start.line + 1,
        startColumn: start.character + 1,
        endLineNumber: end.line + 1,
        endColumn: end.character + 1,
    };
}

export function toRange(range: model.Range): lsp.Range {
    return lsp.Range.create(
        range.startLineNumber - 1,
        range.startColumn - 1,
        range.endLineNumber - 1,
        range.endColumn - 1,
    );
}

export namespace SymbolKindConverter {
    // tslint:disable-next-line:no-null-keyword
    const fromMapping: { [kind: number]: model.SymbolKind } = Object.create(null);
    fromMapping[lsp.SymbolKind.File] = model.SymbolKind.File;
    fromMapping[lsp.SymbolKind.Module] = model.SymbolKind.Module;
    fromMapping[lsp.SymbolKind.Namespace] = model.SymbolKind.Namespace;
    fromMapping[lsp.SymbolKind.Package] = model.SymbolKind.Package;
    fromMapping[lsp.SymbolKind.Class] = model.SymbolKind.Class;
    fromMapping[lsp.SymbolKind.Method] = model.SymbolKind.Method;
    fromMapping[lsp.SymbolKind.Property] = model.SymbolKind.Property;
    fromMapping[lsp.SymbolKind.Field] = model.SymbolKind.Field;
    fromMapping[lsp.SymbolKind.Constructor] = model.SymbolKind.Constructor;
    fromMapping[lsp.SymbolKind.Enum] = model.SymbolKind.Enum;
    fromMapping[lsp.SymbolKind.Interface] = model.SymbolKind.Interface;
    fromMapping[lsp.SymbolKind.Function] = model.SymbolKind.Function;
    fromMapping[lsp.SymbolKind.Variable] = model.SymbolKind.Variable;
    fromMapping[lsp.SymbolKind.Constant] = model.SymbolKind.Constant;
    fromMapping[lsp.SymbolKind.String] = model.SymbolKind.String;
    fromMapping[lsp.SymbolKind.Number] = model.SymbolKind.Number;
    fromMapping[lsp.SymbolKind.Boolean] = model.SymbolKind.Boolean;
    fromMapping[lsp.SymbolKind.Array] = model.SymbolKind.Array;
    fromMapping[lsp.SymbolKind.Object] = model.SymbolKind.Object;
    fromMapping[lsp.SymbolKind.Key] = model.SymbolKind.Key;
    fromMapping[lsp.SymbolKind.Null] = model.SymbolKind.Null;
    fromMapping[lsp.SymbolKind.EnumMember] = model.SymbolKind.EnumMember;
    fromMapping[lsp.SymbolKind.Struct] = model.SymbolKind.Struct;
    fromMapping[lsp.SymbolKind.Event] = model.SymbolKind.Event;
    fromMapping[lsp.SymbolKind.Operator] = model.SymbolKind.Operator;
    fromMapping[lsp.SymbolKind.TypeParameter] = model.SymbolKind.TypeParameter;

    export function fromSymbolKind(kind: lsp.SymbolKind): model.SymbolKind {
        return fromMapping[kind] || model.SymbolKind.Property;
    }

    // tslint:disable-next-line:no-null-keyword
    const toMapping: { [kind: number]: lsp.SymbolKind } = Object.create(null);
    toMapping[model.SymbolKind.File] = lsp.SymbolKind.File;
    toMapping[model.SymbolKind.Module] = lsp.SymbolKind.Module;
    toMapping[model.SymbolKind.Namespace] = lsp.SymbolKind.Namespace;
    toMapping[model.SymbolKind.Package] = lsp.SymbolKind.Package;
    toMapping[model.SymbolKind.Class] = lsp.SymbolKind.Class;
    toMapping[model.SymbolKind.Method] = lsp.SymbolKind.Method;
    toMapping[model.SymbolKind.Property] = lsp.SymbolKind.Property;
    toMapping[model.SymbolKind.Field] = lsp.SymbolKind.Field;
    toMapping[model.SymbolKind.Constructor] = lsp.SymbolKind.Constructor;
    toMapping[model.SymbolKind.Enum] = lsp.SymbolKind.Enum;
    toMapping[model.SymbolKind.Interface] = lsp.SymbolKind.Interface;
    toMapping[model.SymbolKind.Function] = lsp.SymbolKind.Function;
    toMapping[model.SymbolKind.Variable] = lsp.SymbolKind.Variable;
    toMapping[model.SymbolKind.Constant] = lsp.SymbolKind.Constant;
    toMapping[model.SymbolKind.String] = lsp.SymbolKind.String;
    toMapping[model.SymbolKind.Number] = lsp.SymbolKind.Number;
    toMapping[model.SymbolKind.Boolean] = lsp.SymbolKind.Boolean;
    toMapping[model.SymbolKind.Array] = lsp.SymbolKind.Array;
    toMapping[model.SymbolKind.Object] = lsp.SymbolKind.Object;
    toMapping[model.SymbolKind.Key] = lsp.SymbolKind.Key;
    toMapping[model.SymbolKind.Null] = lsp.SymbolKind.Null;
    toMapping[model.SymbolKind.EnumMember] = lsp.SymbolKind.EnumMember;
    toMapping[model.SymbolKind.Struct] = lsp.SymbolKind.Struct;
    toMapping[model.SymbolKind.Event] = lsp.SymbolKind.Event;
    toMapping[model.SymbolKind.Operator] = lsp.SymbolKind.Operator;
    toMapping[model.SymbolKind.TypeParameter] = lsp.SymbolKind.TypeParameter;

    export function toSymbolKind(kind: model.SymbolKind): lsp.SymbolKind {
        return toMapping[kind] || model.SymbolKind.Property;
    }
}

export function toDefinition(definition: model.CallHierarchyDefinition): CallHierarchyDefinition;
export function toDefinition(definition: model.CallHierarchyDefinition | undefined): CallHierarchyDefinition | undefined;
export function toDefinition(definition: model.CallHierarchyDefinition | undefined): CallHierarchyDefinition | undefined {
    if (!definition) {
        return undefined;
    }
    return {
        location: {
            uri: fromUriComponents(definition.uri),
            range: toRange(definition.range)
        },
        selectionRange: toRange(definition.selectionRange),
        symbolName: definition.name,
        symbolKind: SymbolKindConverter.toSymbolKind(definition.kind),
        containerName: undefined,
        tags: definition.tags,
        data: definition.data,
    };
}

export function fromDefinition(definition: CallHierarchyDefinition): model.CallHierarchyDefinition {
    return {
        uri: toUriComponents(definition.location.uri),
        range: fromRange(definition.location.range),
        selectionRange: fromRange(definition.selectionRange),
        name: definition.symbolName,
        kind: SymbolKindConverter.fromSymbolKind(definition.symbolKind),
        tags: definition.tags,
        data: definition.data,
    };
}

export function toCaller(caller: model.CallHierarchyReference): CallHierarchyCaller {
    return {
        callerDefinition: toDefinition(caller.callerDefinition),
        references: caller.references.map(toRange)
    };
}

export function fromCaller(caller: CallHierarchyCaller): model.CallHierarchyReference {
    return {
        callerDefinition: fromDefinition(caller.callerDefinition),
        references: caller.references.map(fromRange)
    };
}

export function toCallee(callee: model.CallHierarchyReference): CallHierarchyCallee {
    return {
        calleeDefinition: toDefinition(callee.callerDefinition),
        references: callee.references.map(toRange),
    };
}

export function fromCallHierarchyCallerToModelCallHierarchyIncomingCall(caller: CallHierarchyCaller): model.CallHierarchyIncomingCall {
    return {
        from: fromDefinition(caller.callerDefinition),
        fromRanges: caller.references.map(fromRange),
    };
}

export function fromCallHierarchyCalleeToModelCallHierarchyOutgoingCall(callee: CallHierarchyCallee): model.CallHierarchyOutgoingCall {
    return {
        to: fromDefinition(callee.calleeDefinition),
        fromRanges: callee.references.map(fromRange),
    };
}
