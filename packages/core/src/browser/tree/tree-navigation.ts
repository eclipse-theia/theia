/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { TreeNode } from "./tree";

@injectable()
export class TreeNavigationService {

    protected index: number = -1;
    protected nodes: TreeNode[] = [];

    get next(): TreeNode | undefined {
        return this.nodes[this.index + 1];
    }

    get prev(): TreeNode | undefined {
        return this.nodes[this.index - 1];
    }

    advance(): TreeNode | undefined {
        const node = this.next;
        if (node) {
            this.index = this.index + 1;
            return node;
        }
        return undefined;
    }

    retreat(): TreeNode | undefined {
        const node = this.prev;
        if (node) {
            this.index = this.index - 1;
            return node;
        }
        return undefined;
    }

    push(node: TreeNode): void {
        this.nodes = this.nodes.slice(0, this.index + 1);
        this.nodes.push(node);
        this.index = this.index + 1;
    }

}
