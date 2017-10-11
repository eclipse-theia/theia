/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable } from "inversify";
import { Event, Emitter } from "@theia/core";
import { ICompositeTreeNode, ISelectableTreeNode, IExpandableTreeNode, ITreeNode } from "@theia/core/lib/browser";

@injectable()
export class OutlineViewService {

    protected _open: boolean = false;

    protected readonly onDidChangeOutlineEmitter = new Emitter<OutlineSymbolInformationNode[]>();
    protected readonly onDidChangeOpenStateEmitter = new Emitter<boolean>();
    protected readonly onDidSelectEmitter = new Emitter<OutlineSymbolInformationNode>();
    protected readonly onDidOpenEmitter = new Emitter<OutlineSymbolInformationNode>();

    get onDidSelect(): Event<OutlineSymbolInformationNode> {
        return this.onDidSelectEmitter.event;
    }

    fireSelect(node: OutlineSymbolInformationNode) {
        this.onDidSelectEmitter.fire(node);
    }

    get onDidOpen(): Event<OutlineSymbolInformationNode> {
        return this.onDidOpenEmitter.event;
    }

    fireOpen(node: OutlineSymbolInformationNode) {
        return this.onDidOpenEmitter.fire(node);
    }

    get onDidChangeOutline(): Event<OutlineSymbolInformationNode[]> {
        return this.onDidChangeOutlineEmitter.event;
    }

    get onDidChangeOpenState(): Event<boolean> {
        return this.onDidChangeOpenStateEmitter.event;
    }

    publish(symbolInformations: OutlineSymbolInformationNode[]): void {
        this.onDidChangeOutlineEmitter.fire(symbolInformations);
    }

    get open(): boolean {
        return this._open;
    }

    set open(open: boolean) {
        this._open = open;
        this.onDidChangeOpenStateEmitter.fire(open);
    }
}

export interface OutlineSymbolInformationNode extends ICompositeTreeNode, ISelectableTreeNode, IExpandableTreeNode {
    iconClass: string;
}

export namespace OutlineSymbolInformationNode {
    export function is(node: ITreeNode): node is OutlineSymbolInformationNode {
        return !!node && IExpandableTreeNode.is(node) && ISelectableTreeNode.is(node) && 'iconClass' in node;
    }
}
