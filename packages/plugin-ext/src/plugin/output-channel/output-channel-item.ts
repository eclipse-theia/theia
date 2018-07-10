/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as theia from '@theia/plugin';
import {OutputChannelRegistryMain} from '../../api/plugin-api';

export class OutputChannelImpl implements theia.OutputChannel {

    private disposed: boolean;

    constructor(readonly name: string, private proxy: OutputChannelRegistryMain) {
    }

    dispose(): void {
        if (!this.disposed) {
            this.proxy.$dispose(this.name).then(() => {
                this.disposed = true;
            });
        }
    }

    append(value: string): void {
        this.validate();
        this.proxy.$append(this.name, value);
    }

    appendLine(value: string): void {
        this.validate();
        this.append(value + '\n');
    }

    clear(): void {
        this.validate();
        this.proxy.$clear(this.name);
    }

    show(preserveFocus: boolean | undefined): void {
        this.validate();
        this.proxy.$reveal(this.name, !!preserveFocus);
    }

    hide(): void {
        this.validate();
        this.proxy.$close(this.name);
    }

    private validate(): void {
        if (this.disposed) {
            throw new Error('Channel has been closed');
        }
    }
}
