/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Extension, ExtensionManager, ResolvedExtension } from '../common/extension-manager';
import { Message } from '@phosphor/messaging/lib';
import { VirtualWidget, VirtualRenderer } from '@theia/core/lib/browser';
import { h } from '@phosphor/virtualdom/lib';
import { ExtensionDetailWidgetService } from './extension-detail-widget-service';

export class ExtensionDetailWidget extends VirtualWidget {

    protected busy = false;

    constructor(id: string,
                protected resolvedExtension: ResolvedExtension,
                protected extensionManager: ExtensionManager,
                protected extensionDetailService: ExtensionDetailWidgetService) {
        super();
        this.id = id;
        this.addClass('theia-extension-detail');
        this.title.closable = true;
        this.title.label = resolvedExtension.name;

        extensionManager.onDidChange(() => {
            resolvedExtension.resolve().then(rex => {
                this.busy = rex.busy;
                this.update();
            });
        });
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.setBusyFlagAndUpdate(this.resolvedExtension.busy);
    }

    protected onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.dispose();
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);

        const el = document.getElementById(this.id + 'Doc');
        if (el !== null) {
            el.innerHTML = this.resolvedExtension.documentation;
        }
    }

    protected render(): h.Child {
        const r = this.resolvedExtension;

        const name = h.h2({className: 'extensionName'}, r.name);
        const extversion = h.div({className: 'extensionVersion'}, r.version);
        const author = h.div({className: 'extensionAuthor'}, r.author);
        const titleInfo = h.div({className: 'extensionSubtitle'}, author, extversion);
        const titleContainer = h.div({className: 'extensionTitleContainer'},
            name, titleInfo);

        const description = h.div({className: 'extensionDescription'}, r.description);

        const buttonRow = h.div({className: 'extensionButtonRow'},
            VirtualRenderer.flatten(this.createButtons(this.resolvedExtension)));

        const buttonContainer = h.div({className: 'extensionButtonContainer'}, buttonRow);

        const headerContainer = h.div({className: 'extensionHeaderContainer'},
            titleContainer, description, buttonContainer);

        const documentation = h.div({className: 'extensionDocumentation', id: this.id + 'Doc'}, '');
        const docContainer = h.div({className: 'extensionDocContainer flexcontainer'}, documentation);

        return [headerContainer, docContainer];
    }

    protected createButtons(extension: Extension): h.Child[] {
        const buttonArr = [];
        let btnLabel = 'Install';
        if (extension.installed) {
            btnLabel = 'Uninstall';
        }

        const faEl = h.i({className: 'fa fa-spinner fa-pulse fa-fw'});
        const content = this.busy ? faEl : btnLabel;

        buttonArr.push(h.div({
            className: 'extensionButton' +
            (this.busy ? ' working' : '') + ' ' +
            (extension.installed && !this.busy ? ' installed' : '') + ' ' +
            (extension.outdated && !this.busy ? ' outdated' : ''),
            onclick: event => {
                if (!this.busy) {
                    extension.busy = true;
                    this.extensionDetailService.fireExtensionBusyFlagSet(extension);
                    if (extension.installed) {
                        extension.uninstall();
                    } else {
                        extension.install();
                    }
                    this.setBusyFlagAndUpdate(true);
                    event.stopPropagation();
                }
            }
        }, content));

        if (extension.outdated) {
            buttonArr.push(h.div({
                className: (this.busy ? ' working' : '') + ' ' + 'extensionButton' + (extension.outdated && !this.busy ? ' outdated' : ''),
                onclick: event => {
                    if (!this.busy) {
                        extension.busy = true;
                        this.extensionDetailService.fireExtensionBusyFlagSet(extension);
                        extension.update();
                    }
                }
            }, this.busy ? faEl : 'Update'));
        }
        return buttonArr;
    }

    setBusyFlagAndUpdate(busy: boolean) {
        this.busy = busy;
        this.update();
    }
}