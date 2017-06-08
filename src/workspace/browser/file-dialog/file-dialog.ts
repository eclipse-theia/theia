/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Message } from '@phosphor/messaging';
import { h } from '@phosphor/virtualdom';
import { AbstractDialog, DialogProps, VirtualWidget } from "../../../application/browser";
import { UriSelection } from '../../../filesystem/common';
import { FileStatNode } from "../../../navigator/browser/file-tree";
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';
import URI from "../../../application/common/uri";

export const FileDialogFactory = Symbol('FileDialogFactory');
export interface FileDialogFactory {
    (props: FileDialogProps): FileDialog;
}

export const NAVIGATION_PANEL_CLASS = 'theia-NavigationPanel';
export const CONTROL_PANEL_CLASS = 'theia-ControlPanel';
export const LOCATION_LIST_CLASS = 'theia-LocationList';

@injectable()
export class FileDialogProps extends DialogProps {
}

@injectable()
export class FileDialog extends AbstractDialog<UriSelection | undefined> {

    protected readonly back: HTMLButtonElement;
    protected readonly forward: HTMLButtonElement;
    protected readonly locationListHost: HTMLDivElement;

    constructor(
        @inject(FileDialogProps) props: FileDialogProps,
        @inject(FileDialogWidget) readonly widget: FileDialogWidget
    ) {
        super(props);
        this.toDispose.push(widget);
        this.toDispose.push(this.model.onChanged(() =>
            this.update()
        ));

        const navigationPanel = document.createElement('div');
        navigationPanel.classList.add(NAVIGATION_PANEL_CLASS);
        this.contentNode.appendChild(navigationPanel);

        navigationPanel.appendChild(this.back = this.createButton('Back'));
        navigationPanel.appendChild(this.forward = this.createButton('Forward'));

        this.locationListHost = document.createElement('div');
        navigationPanel.appendChild(this.locationListHost);

        this.contentNode.appendChild(this.widget.node);

        const controlPanel = document.createElement('div');
        controlPanel.classList.add(CONTROL_PANEL_CLASS);
        this.contentNode.appendChild(controlPanel);

        controlPanel.appendChild(this.createCloseButton('Cancel'));
        controlPanel.appendChild(this.createAcceptButton('Open'));
    }

    get model(): FileDialogModel {
        return this.widget.model;
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.back.disabled = !this.model.canNavigateBackward();
        this.forward.disabled = !this.model.canNavigateForward();

        this.updateLocationList();
    }

    protected updateLocationList(): void {
        const root = this.model.root;
        if (!FileStatNode.is(root)) {
            return;
        }
        const values = [];
        let value = root.uri;
        while (!value.path.root) {
            values.push(value);
            value = value.parent;
        }
        values.push(value);
        VirtualWidget.render(this.renderLocationList(values.reverse()), this.locationListHost, () => {
            const locationList = this.locationList;
            if (locationList) {
                locationList.value = root.uri.toString();
            }
        });
    }

    protected renderLocationList(values: URI[]): h.Child {
        const options = values.map(value => this.renderLocation(value));
        return h.select({
            className: LOCATION_LIST_CLASS,
            onchange: e => this.onLocationChanged(e)
        }, ...options.reverse());
    }

    protected renderLocation(uri: URI): h.Child {
        const value = uri.toString();
        return h.option({
            value
        }, uri.lastSegment);
    }

    protected onLocationChanged(e: Event): void {
        const locationList = this.locationList;
        if (locationList) {
            const value = locationList.value;
            const uri = new URI(value);
            this.model.navigateTo(uri);
        }
        e.preventDefault();
        e.stopPropagation();
    }

    protected get locationList(): HTMLSelectElement | undefined {
        const locationList = this.node.getElementsByClassName(LOCATION_LIST_CLASS)[0];
        if (locationList instanceof HTMLSelectElement) {
            return locationList;
        }
        return undefined;
    }

    protected onAfterAttach(msg: Message): void {
        this.addEventListener(this.back, 'click', () =>
            this.model.navigateBackward()
        );
        this.addEventListener(this.forward, 'click', () =>
            this.model.navigateForward()
        );
        super.onAfterAttach(msg);
    }

    protected onActivateRequest(msg: Message): void {
        this.widget.activate();
    }

    get value(): UriSelection | undefined {
        return this.widget.model.selectedFileStatNode;
    }

}