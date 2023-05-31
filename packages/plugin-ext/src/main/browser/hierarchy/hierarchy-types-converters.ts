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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CallHierarchyIncomingCall, CallHierarchyItem, CallHierarchyOutgoingCall } from '@theia/callhierarchy/lib/browser';
import * as languageProtocol from '@theia/core/shared/vscode-languageserver-protocol';
import { URI } from '@theia/core/shared/vscode-uri';
import { TypeHierarchyItem } from '@theia/typehierarchy/lib/browser';
import * as rpc from '../../../common/plugin-api-rpc';
import * as model from '../../../common/plugin-api-rpc-model';
import { UriComponents } from '../../../common/uri-components';

export function toUriComponents(uri: string): UriComponents {
    return URI.parse(uri);
}

export function fromUriComponents(uri: UriComponents): string {
    return URI.revive(uri).toString();
}

export function fromLocation(location: languageProtocol.Location): model.Location {
    return <model.Location>{
        uri: URI.parse(location.uri),
        range: fromRange(location.range)
    };
}

export function toLocation(uri: UriComponents, range: model.Range): languageProtocol.Location {
    return {
        uri: URI.revive(uri).toString(),
        range: toRange(range)
    };
}

export function fromPosition(position: languageProtocol.Position): rpc.Position {
    return <rpc.Position>{
        lineNumber: position.line,
        column: position.character
    };
}

export function fromRange(range: languageProtocol.Range): model.Range {
    const { start, end } = range;
    return {
        startLineNumber: start.line + 1,
        startColumn: start.character + 1,
        endLineNumber: end.line + 1,
        endColumn: end.character + 1,
    };
}

export function toRange(range: model.Range): languageProtocol.Range {
    return languageProtocol.Range.create(
        range.startLineNumber - 1,
        range.startColumn - 1,
        range.endLineNumber - 1,
        range.endColumn - 1,
    );
}

export namespace SymbolKindConverter {
    export function fromSymbolKind(kind: languageProtocol.SymbolKind): model.SymbolKind {
        switch (kind) {
            case languageProtocol.SymbolKind.File: return model.SymbolKind.File;
            case languageProtocol.SymbolKind.Module: return model.SymbolKind.Module;
            case languageProtocol.SymbolKind.Namespace: return model.SymbolKind.Namespace;
            case languageProtocol.SymbolKind.Package: return model.SymbolKind.Package;
            case languageProtocol.SymbolKind.Class: return model.SymbolKind.Class;
            case languageProtocol.SymbolKind.Method: return model.SymbolKind.Method;
            case languageProtocol.SymbolKind.Property: return model.SymbolKind.Property;
            case languageProtocol.SymbolKind.Field: return model.SymbolKind.Field;
            case languageProtocol.SymbolKind.Constructor: return model.SymbolKind.Constructor;
            case languageProtocol.SymbolKind.Enum: return model.SymbolKind.Enum;
            case languageProtocol.SymbolKind.Interface: return model.SymbolKind.Interface;
            case languageProtocol.SymbolKind.Function: return model.SymbolKind.Function;
            case languageProtocol.SymbolKind.Variable: return model.SymbolKind.Variable;
            case languageProtocol.SymbolKind.Constant: return model.SymbolKind.Constant;
            case languageProtocol.SymbolKind.String: return model.SymbolKind.String;
            case languageProtocol.SymbolKind.Number: return model.SymbolKind.Number;
            case languageProtocol.SymbolKind.Boolean: return model.SymbolKind.Boolean;
            case languageProtocol.SymbolKind.Array: return model.SymbolKind.Array;
            case languageProtocol.SymbolKind.Object: return model.SymbolKind.Object;
            case languageProtocol.SymbolKind.Key: return model.SymbolKind.Key;
            case languageProtocol.SymbolKind.Null: return model.SymbolKind.Null;
            case languageProtocol.SymbolKind.EnumMember: return model.SymbolKind.EnumMember;
            case languageProtocol.SymbolKind.Struct: return model.SymbolKind.Struct;
            case languageProtocol.SymbolKind.Event: return model.SymbolKind.Event;
            case languageProtocol.SymbolKind.Operator: return model.SymbolKind.Operator;
            case languageProtocol.SymbolKind.TypeParameter: return model.SymbolKind.TypeParameter;
            default: return model.SymbolKind.Property;
        }
    }
    export function toSymbolKind(kind: model.SymbolKind): languageProtocol.SymbolKind {
        switch (kind) {
            case model.SymbolKind.File: return languageProtocol.SymbolKind.File;
            case model.SymbolKind.Module: return languageProtocol.SymbolKind.Module;
            case model.SymbolKind.Namespace: return languageProtocol.SymbolKind.Namespace;
            case model.SymbolKind.Package: return languageProtocol.SymbolKind.Package;
            case model.SymbolKind.Class: return languageProtocol.SymbolKind.Class;
            case model.SymbolKind.Method: return languageProtocol.SymbolKind.Method;
            case model.SymbolKind.Property: return languageProtocol.SymbolKind.Property;
            case model.SymbolKind.Field: return languageProtocol.SymbolKind.Field;
            case model.SymbolKind.Constructor: return languageProtocol.SymbolKind.Constructor;
            case model.SymbolKind.Enum: return languageProtocol.SymbolKind.Enum;
            case model.SymbolKind.Interface: return languageProtocol.SymbolKind.Interface;
            case model.SymbolKind.Function: return languageProtocol.SymbolKind.Function;
            case model.SymbolKind.Variable: return languageProtocol.SymbolKind.Variable;
            case model.SymbolKind.Constant: return languageProtocol.SymbolKind.Constant;
            case model.SymbolKind.String: return languageProtocol.SymbolKind.String;
            case model.SymbolKind.Number: return languageProtocol.SymbolKind.Number;
            case model.SymbolKind.Boolean: return languageProtocol.SymbolKind.Boolean;
            case model.SymbolKind.Array: return languageProtocol.SymbolKind.Array;
            case model.SymbolKind.Object: return languageProtocol.SymbolKind.Object;
            case model.SymbolKind.Key: return languageProtocol.SymbolKind.Key;
            case model.SymbolKind.Null: return languageProtocol.SymbolKind.Null;
            case model.SymbolKind.EnumMember: return languageProtocol.SymbolKind.EnumMember;
            case model.SymbolKind.Struct: return languageProtocol.SymbolKind.Struct;
            case model.SymbolKind.Event: return languageProtocol.SymbolKind.Event;
            case model.SymbolKind.Operator: return languageProtocol.SymbolKind.Operator;
            case model.SymbolKind.TypeParameter: return languageProtocol.SymbolKind.TypeParameter;
            default: return languageProtocol.SymbolKind.Property;
        }
    }
}

export function toItemHierarchyDefinition(modelItem: model.HierarchyItem): TypeHierarchyItem | CallHierarchyItem {
    return {
        ...modelItem,
        kind: SymbolKindConverter.toSymbolKind(modelItem.kind),
        range: toRange(modelItem.range),
        selectionRange: toRange(modelItem.selectionRange),
    };
}

export function fromItemHierarchyDefinition(definition: TypeHierarchyItem | CallHierarchyItem): model.HierarchyItem {
    return {
        ...definition,
        kind: SymbolKindConverter.fromSymbolKind(definition.kind),
        range: fromRange(definition.range),
        selectionRange: fromRange(definition.range),
    };
}

export function toCaller(caller: model.CallHierarchyIncomingCall): CallHierarchyIncomingCall {
    return {
        from: toItemHierarchyDefinition(caller.from),
        fromRanges: caller.fromRanges.map(toRange)
    };
}

export function fromCaller(caller: CallHierarchyIncomingCall): model.CallHierarchyIncomingCall {
    return {
        from: fromItemHierarchyDefinition(caller.from),
        fromRanges: caller.fromRanges.map(fromRange)
    };
}

export function toCallee(callee: model.CallHierarchyOutgoingCall): CallHierarchyOutgoingCall {
    return {
        to: toItemHierarchyDefinition(callee.to),
        fromRanges: callee.fromRanges.map(toRange),
    };
}

export function fromCallHierarchyCallerToModelCallHierarchyIncomingCall(caller: CallHierarchyIncomingCall): model.CallHierarchyIncomingCall {
    return {
        from: fromItemHierarchyDefinition(caller.from),
        fromRanges: caller.fromRanges.map(fromRange),
    };
}

export function fromCallHierarchyCalleeToModelCallHierarchyOutgoingCall(callee: CallHierarchyOutgoingCall): model.CallHierarchyOutgoingCall {
    return {
        to: fromItemHierarchyDefinition(callee.to),
        fromRanges: callee.fromRanges.map(fromRange),
    };
}
