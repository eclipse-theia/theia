// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { CallHierarchyItem, CallHierarchyIncomingCall, CallHierarchyOutgoingCall } from '@theia/callhierarchy/lib/browser';
import * as model from '../../../common/plugin-api-rpc-model';
import * as rpc from '../../../common/plugin-api-rpc';
import * as callhierarchy from '@theia/core/shared/vscode-languageserver-protocol';
import { URI } from '@theia/core/shared/vscode-uri';
import { UriComponents } from '../../../common/uri-components';

export function toUriComponents(uri: string): UriComponents {
    return URI.parse(uri);
}

export function fromUriComponents(uri: UriComponents): string {
    return URI.revive(uri).toString();
}

export function fromLocation(location: callhierarchy.Location): model.Location {
    return <model.Location>{
        uri: URI.parse(location.uri),
        range: fromRange(location.range)
    };
}

export function toLocation(uri: UriComponents, range: model.Range): callhierarchy.Location {
    return {
        uri: URI.revive(uri).toString(),
        range: toRange(range)
    };
}

export function fromPosition(position: callhierarchy.Position): rpc.Position {
    return <rpc.Position>{
        lineNumber: position.line,
        column: position.character
    };
}

export function fromRange(range: callhierarchy.Range): model.Range {
    const { start, end } = range;
    return {
        startLineNumber: start.line + 1,
        startColumn: start.character + 1,
        endLineNumber: end.line + 1,
        endColumn: end.character + 1,
    };
}

export function toRange(range: model.Range): callhierarchy.Range {
    return callhierarchy.Range.create(
        range.startLineNumber - 1,
        range.startColumn - 1,
        range.endLineNumber - 1,
        range.endColumn - 1,
    );
}

export namespace SymbolKindConverter {
    export function fromSymbolKind(kind: callhierarchy.SymbolKind): model.SymbolKind {
        switch (kind) {
            case callhierarchy.SymbolKind.File: return model.SymbolKind.File;
            case callhierarchy.SymbolKind.Module: return model.SymbolKind.Module;
            case callhierarchy.SymbolKind.Namespace: return model.SymbolKind.Namespace;
            case callhierarchy.SymbolKind.Package: return model.SymbolKind.Package;
            case callhierarchy.SymbolKind.Class: return model.SymbolKind.Class;
            case callhierarchy.SymbolKind.Method: return model.SymbolKind.Method;
            case callhierarchy.SymbolKind.Property: return model.SymbolKind.Property;
            case callhierarchy.SymbolKind.Field: return model.SymbolKind.Field;
            case callhierarchy.SymbolKind.Constructor: return model.SymbolKind.Constructor;
            case callhierarchy.SymbolKind.Enum: return model.SymbolKind.Enum;
            case callhierarchy.SymbolKind.Interface: return model.SymbolKind.Interface;
            case callhierarchy.SymbolKind.Function: return model.SymbolKind.Function;
            case callhierarchy.SymbolKind.Variable: return model.SymbolKind.Variable;
            case callhierarchy.SymbolKind.Constant: return model.SymbolKind.Constant;
            case callhierarchy.SymbolKind.String: return model.SymbolKind.String;
            case callhierarchy.SymbolKind.Number: return model.SymbolKind.Number;
            case callhierarchy.SymbolKind.Boolean: return model.SymbolKind.Boolean;
            case callhierarchy.SymbolKind.Array: return model.SymbolKind.Array;
            case callhierarchy.SymbolKind.Object: return model.SymbolKind.Object;
            case callhierarchy.SymbolKind.Key: return model.SymbolKind.Key;
            case callhierarchy.SymbolKind.Null: return model.SymbolKind.Null;
            case callhierarchy.SymbolKind.EnumMember: return model.SymbolKind.EnumMember;
            case callhierarchy.SymbolKind.Struct: return model.SymbolKind.Struct;
            case callhierarchy.SymbolKind.Event: return model.SymbolKind.Event;
            case callhierarchy.SymbolKind.Operator: return model.SymbolKind.Operator;
            case callhierarchy.SymbolKind.TypeParameter: return model.SymbolKind.TypeParameter;
            default: return model.SymbolKind.Property;
        }
    }
    export function toSymbolKind(kind: model.SymbolKind): callhierarchy.SymbolKind {
        switch (kind) {
            case model.SymbolKind.File: return callhierarchy.SymbolKind.File;
            case model.SymbolKind.Module: return callhierarchy.SymbolKind.Module;
            case model.SymbolKind.Namespace: return callhierarchy.SymbolKind.Namespace;
            case model.SymbolKind.Package: return callhierarchy.SymbolKind.Package;
            case model.SymbolKind.Class: return callhierarchy.SymbolKind.Class;
            case model.SymbolKind.Method: return callhierarchy.SymbolKind.Method;
            case model.SymbolKind.Property: return callhierarchy.SymbolKind.Property;
            case model.SymbolKind.Field: return callhierarchy.SymbolKind.Field;
            case model.SymbolKind.Constructor: return callhierarchy.SymbolKind.Constructor;
            case model.SymbolKind.Enum: return callhierarchy.SymbolKind.Enum;
            case model.SymbolKind.Interface: return callhierarchy.SymbolKind.Interface;
            case model.SymbolKind.Function: return callhierarchy.SymbolKind.Function;
            case model.SymbolKind.Variable: return callhierarchy.SymbolKind.Variable;
            case model.SymbolKind.Constant: return callhierarchy.SymbolKind.Constant;
            case model.SymbolKind.String: return callhierarchy.SymbolKind.String;
            case model.SymbolKind.Number: return callhierarchy.SymbolKind.Number;
            case model.SymbolKind.Boolean: return callhierarchy.SymbolKind.Boolean;
            case model.SymbolKind.Array: return callhierarchy.SymbolKind.Array;
            case model.SymbolKind.Object: return callhierarchy.SymbolKind.Object;
            case model.SymbolKind.Key: return callhierarchy.SymbolKind.Key;
            case model.SymbolKind.Null: return callhierarchy.SymbolKind.Null;
            case model.SymbolKind.EnumMember: return callhierarchy.SymbolKind.EnumMember;
            case model.SymbolKind.Struct: return callhierarchy.SymbolKind.Struct;
            case model.SymbolKind.Event: return callhierarchy.SymbolKind.Event;
            case model.SymbolKind.Operator: return callhierarchy.SymbolKind.Operator;
            case model.SymbolKind.TypeParameter: return callhierarchy.SymbolKind.TypeParameter;
            default: return callhierarchy.SymbolKind.Property;
        }
    }
}

export function toDefinition(definition: model.CallHierarchyItem): CallHierarchyItem;
export function toDefinition(definition: model.CallHierarchyItem | undefined): CallHierarchyItem | undefined;
export function toDefinition(definition: model.CallHierarchyItem | undefined): CallHierarchyItem | undefined {
    if (!definition) {
        return undefined;
    }
    return {
        ...definition,
        kind: SymbolKindConverter.toSymbolKind(definition.kind),
        range: toRange(definition.range),
        selectionRange: toRange(definition.selectionRange),
    };
}

export function fromDefinition(definition: CallHierarchyItem): model.CallHierarchyItem {
    return {
        ...definition,
        kind: SymbolKindConverter.fromSymbolKind(definition.kind),
        range: fromRange(definition.range),
        selectionRange: fromRange(definition.range),
    };
}

export function toCaller(caller: model.CallHierarchyIncomingCall): CallHierarchyIncomingCall {
    return {
        from: toDefinition(caller.from),
        fromRanges: caller.fromRanges.map(toRange)
    };
}

export function fromCaller(caller: CallHierarchyIncomingCall): model.CallHierarchyIncomingCall {
    return {
        from: fromDefinition(caller.from),
        fromRanges: caller.fromRanges.map(fromRange)
    };
}

export function toCallee(callee: model.CallHierarchyOutgoingCall): CallHierarchyOutgoingCall {
    return {
        to: toDefinition(callee.to),
        fromRanges: callee.fromRanges.map(toRange),
    };
}

export function fromCallHierarchyCallerToModelCallHierarchyIncomingCall(caller: CallHierarchyIncomingCall): model.CallHierarchyIncomingCall {
    return {
        from: fromDefinition(caller.from),
        fromRanges: caller.fromRanges.map(fromRange),
    };
}

export function fromCallHierarchyCalleeToModelCallHierarchyOutgoingCall(callee: CallHierarchyOutgoingCall): model.CallHierarchyOutgoingCall {
    return {
        to: fromDefinition(callee.to),
        fromRanges: callee.fromRanges.map(fromRange),
    };
}
