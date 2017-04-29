/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export interface Disposable {
    /**
     * Dispose this object.
     */
    dispose(): void;
}

export namespace Disposable {
    export function create(func: () => void): Disposable {
        return {
            dispose: func
        };
    }
}

export class DisposableCollection implements Disposable {
    protected readonly disposables: Disposable[] = [];

    dispose(): void {
        while (this.disposables.length !== 0) {
            this.disposables.pop()!.dispose();
        }
    }

    push(disposable: Disposable): Disposable {
        const disposables = this.disposables;
        disposables.push(disposable);
        return {
            dispose(): void {
                const index = disposables.indexOf(disposable);
                if (index !== -1) {
                    disposables.splice(index, 1);
                }
            }
        }
    }

    pushAll(disposables: Disposable[]): Disposable[] {
        return disposables.map(disposable =>
            this.push(disposable)
        );
    }

}
