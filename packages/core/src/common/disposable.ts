/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Event, Emitter } from "./event";

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
    export const NULL = create(() => { });
}

export class DisposableCollection implements Disposable {
    protected readonly disposables: Disposable[] = [];
    protected readonly onDisposeEmitter = new Emitter<void>();

    get onDispose(): Event<void> {
        return this.onDisposeEmitter.event;
    }

    protected checkDisposed(): void {
        if (this.disposed) {
            this.onDisposeEmitter.fire(undefined);
        }
    }

    get disposed(): boolean {
        return this.disposables.length === 0;
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        while (!this.disposed) {
            this.disposables.pop()!.dispose();
        }
        this.checkDisposed();
    }

    push(disposable: Disposable): Disposable {
        const disposables = this.disposables;
        disposables.push(disposable);
        return Disposable.create(() => {
            const index = disposables.indexOf(disposable);
            if (index !== -1) {
                disposables.splice(index, 1);
            }
            this.checkDisposed();
        });
    }

    pushAll(disposables: Disposable[]): Disposable[] {
        return disposables.map(disposable =>
            this.push(disposable)
        );
    }

}
