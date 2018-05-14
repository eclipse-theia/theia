/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as ReactDOM from "react-dom";
import * as React from "react";
import { injectable } from "inversify";
import { DisposableCollection, Disposable } from "../../common";
import { BaseWidget, Message } from "./widget";

@injectable()
export abstract class ReactWidget extends BaseWidget {

    protected readonly onRender = new DisposableCollection();
    protected scrollOptions = {
        suppressScrollX: true
    };

    constructor() {
        super();
        this.toDispose.push(Disposable.create(() => {
            ReactDOM.unmountComponentAtNode(this.node);
        }));
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        ReactDOM.render(<React.Fragment>{this.render()}</React.Fragment>, this.node, () => this.onRender.dispose());
    }

    protected abstract render(): React.ReactNode;
}
