/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import {interfaces} from 'inversify';
import * as types from '../../plugin/types-impl';
import {StatusBarMessageRegistryMain} from '../../api/plugin-api';
import {StatusBar, StatusBarAlignment} from '@theia/core/lib/browser/status-bar/status-bar';

const STATUS_BAR_MESSAGE_PRE = 'status-bar-entry';

export class StatusBarMessageRegistryMainImpl implements StatusBarMessageRegistryMain {
    private delegate: StatusBar;

    private ids: string[] = [];

    constructor(container: interfaces.Container) {
        this.delegate = container.get(StatusBar);
    }

    $setMessage(text: string,
                priority: number,
                alignment: number,
                color: string | undefined,
                tooltip: string | undefined,
                command: string | undefined): PromiseLike<string> {
        const id = this.uniqueId;
        this.ids.push(id);

        const entry = {
            text,
            priority,
            alignment: alignment === types.StatusBarAlignment.Left ? StatusBarAlignment.LEFT : StatusBarAlignment.RIGHT,
            color,
            tooltip,
            command
        };

        return this.delegate.setElement(id, entry).then(() => Promise.resolve(id));
    }

    $dispose(id: string): void {
        this.delegate.removeElement(id).then(() => {
            const index = this.ids.indexOf(id);
            if (index > -1) {
                this.ids.splice(index, 1);
            }
        });
    }

    private get uniqueId(): string {
        let extensionId = STATUS_BAR_MESSAGE_PRE;
        for (let counter = 0; counter < 100; counter++) {
            extensionId = `${STATUS_BAR_MESSAGE_PRE}_id_${('0000' + (Math.random() * Math.pow(36, 4) << 0).toString(36)).slice(-4)}`;
            if (this.ids.indexOf(extensionId) === -1) {
                break;
            }
        }
        return extensionId;
    }
}
