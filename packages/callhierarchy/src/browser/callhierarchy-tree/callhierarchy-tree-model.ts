/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { TreeModel, TreeServices, ITreeNode } from "@theia/core/lib/browser";
import { CallHierarchyTree, DefinitionNode } from "./callhierarchy-tree";
import { CallHierarchyServiceProvider } from "../callhierarchy-service";
import { Location } from 'vscode-languageserver-types';

@injectable()
export class CallHierarchyTreeModel extends TreeModel {

    constructor(
        @inject(CallHierarchyTree) protected readonly tree: CallHierarchyTree,
        @inject(TreeServices) services: TreeServices,
        @inject(CallHierarchyServiceProvider) protected readonly callHierarchyServiceProvider: CallHierarchyServiceProvider,
    ) {
        super(tree, services);
    }

    getTree(): CallHierarchyTree {
        return this.tree;
    }

    async initializeCallHierarchy(languageId: string | undefined, location: Location | undefined): Promise<void> {
        this.tree.root = undefined;
        this.tree.callHierarchyService = undefined;
        if (languageId && location) {
            const callHierarchyService = this.callHierarchyServiceProvider.get(languageId);
            if (callHierarchyService) {
                this.tree.callHierarchyService = callHierarchyService;
                const rootDefinition = await callHierarchyService.getRootDefinition(location);
                if (rootDefinition) {
                    const rootNode = DefinitionNode.create(rootDefinition, undefined);
                    this.tree.root = rootNode;
                }
            }
        }
    }

    protected doOpenNode(node: ITreeNode): void {
        // do nothing (in particular do not expand the node)
    }
}
