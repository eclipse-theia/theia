/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { ITreeNode, ICompositeTreeNode, ISelectableTreeNode, IExpandableTreeNode, Tree } from "@theia/core/lib/browser";

import { Definition, Caller } from '../callhierarchy';
import { CallHierarchyService } from '../callhierarchy-service';

import { Md5 } from 'ts-md5/dist/md5';

@injectable()
export class CallHierarchyTree extends Tree {

    protected _callHierarchyService: CallHierarchyService | undefined;

    set callHierarchyService(callHierarchyService: CallHierarchyService | undefined) {
        this._callHierarchyService = callHierarchyService;
    }

    get callHierarchyService(): CallHierarchyService | undefined {
        return this._callHierarchyService;
    }

    async resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        if (!this.callHierarchyService) {
            return Promise.resolve([]);
        }
        if (parent.children.length > 0) {
            return Promise.resolve([...parent.children]);
        }
        let definition: Definition | undefined;
        if (DefinitionNode.is(parent)) {
            definition = parent.definition;
        } else if (CallerNode.is(parent)) {
            definition = parent.caller.callerDefinition;
        }
        if (definition) {
            const callers = await this.callHierarchyService.getCallers(definition);
            if (!callers) {
                return Promise.resolve([]);
            }
            return this.toNodes(callers, parent);
        }
        return Promise.resolve([]);
    }

    protected toNodes(callers: Caller[], parent: ICompositeTreeNode): ITreeNode[] {
        return callers.map(caller => this.toNode(caller, parent));
    }

    protected toNode(caller: Caller, parent: ICompositeTreeNode | undefined): ITreeNode {
        return CallerNode.create(caller, parent as ITreeNode);
    }
}

export interface DefinitionNode extends ISelectableTreeNode, IExpandableTreeNode {
    definition: Definition;
}

export namespace DefinitionNode {
    export function is(node: ITreeNode | undefined): node is DefinitionNode {
        return !!node && 'definition' in node;
    }

    export function create(definition: Definition, parent: ITreeNode | undefined): DefinitionNode {
        const name = definition.symbolName;
        const id = createId(definition, parent);
        return <DefinitionNode>{
            id, definition, name, parent,
            visible: true,
            children: [],
            expanded: false,
            selected: false,
        };
    }
}

export interface CallerNode extends ISelectableTreeNode, IExpandableTreeNode {
    caller: Caller;
}

export namespace CallerNode {
    export function is(node: ITreeNode | undefined): node is CallerNode {
        return !!node && 'caller' in node;
    }

    export function create(caller: Caller, parent: ITreeNode | undefined): CallerNode {
        const callerDefinition = caller.callerDefinition;
        const name = callerDefinition.symbolName;
        const id = createId(callerDefinition, parent);
        return <CallerNode>{
            id, caller, name, parent,
            visible: true,
            children: [],
            expanded: false,
            selected: false,
        };
    }
}

function createId(definition: Definition, parent: ITreeNode | undefined): string {
    const idPrefix = (parent) ? parent.id + '/' : '';
    const id = idPrefix + Md5.hashStr(JSON.stringify(definition));
    return id;
}
