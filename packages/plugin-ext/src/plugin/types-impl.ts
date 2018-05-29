/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export class Disposable {
    private disposable: undefined | (() => void);

    constructor(func: () => void) {
        this.disposable = func;
    }
    /**
     * Dispose this object.
     */
    dispose(): void {
        if (this.disposable) {
            this.disposable();
            this.disposable = undefined;
        }
    }

    static create(func: () => void): Disposable {
        return new Disposable(func);
    }
}

export class ThemeColor {
    id: string;

    constructor(id: string) {
        this.id = id;
    }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2
}
