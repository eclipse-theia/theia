/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Event, Emitter, DisposableCollection } from '@theia/core';
import { WidgetFactory } from '@theia/core/lib/browser';
import { OutlineViewWidget, OutlineViewWidgetFactory, OutlineSymbolInformationNode } from './outline-view-widget';
import { Widget } from '@phosphor/widgets';

@injectable()
export class OutlineViewService implements WidgetFactory {

    id = 'outline-view';

    protected widget?: OutlineViewWidget;
    protected readonly onDidChangeOutlineEmitter = new Emitter<OutlineSymbolInformationNode[]>();
    protected readonly onDidChangeOpenStateEmitter = new Emitter<boolean>();
    protected readonly onDidSelectEmitter = new Emitter<OutlineSymbolInformationNode>();
    protected readonly onDidOpenEmitter = new Emitter<OutlineSymbolInformationNode>();

    constructor( @inject(OutlineViewWidgetFactory) protected factory: OutlineViewWidgetFactory) { }

    get onDidSelect(): Event<OutlineSymbolInformationNode> {
        return this.onDidSelectEmitter.event;
    }

    get onDidOpen(): Event<OutlineSymbolInformationNode> {
        return this.onDidOpenEmitter.event;
    }

    get onDidChangeOutline(): Event<OutlineSymbolInformationNode[]> {
        return this.onDidChangeOutlineEmitter.event;
    }

    get onDidChangeOpenState(): Event<boolean> {
        return this.onDidChangeOpenStateEmitter.event;
    }

    get open(): boolean {
        return this.widget !== undefined && this.widget.isVisible;
    }

    publish(roots: OutlineSymbolInformationNode[]): void {
        if (this.widget) {
            this.widget.setOutlineTree(roots);
            this.onDidChangeOutlineEmitter.fire(roots);
        }
    }

    createWidget(): Promise<Widget> {
        this.widget = this.factory();
        const disposables = new DisposableCollection();
        disposables.push(this.widget.onDidChangeOpenStateEmitter.event(open => this.onDidChangeOpenStateEmitter.fire(open)));
        disposables.push(this.widget.model.onOpenNode(node => this.onDidOpenEmitter.fire(node as OutlineSymbolInformationNode)));
        disposables.push(this.widget.model.onSelectionChanged(node => this.onDidSelectEmitter.fire(node as OutlineSymbolInformationNode)));
        this.widget.disposed.connect(() => {
            this.widget = undefined;
            disposables.dispose();
        });
        return Promise.resolve(this.widget);
    }
}
