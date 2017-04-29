/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";

import { ClipboardService } from "../../common/clipboard-service";

@injectable()
export class BrowserClipboardService implements ClipboardService {
    private _data: any

    getData(format: string): any {
        if (this._data && this._data[format]) {
            return this._data[format];
        }
        return "";
    }

    get isEmpty(): boolean {
        return (typeof this._data === "undefined")
    }

    setData(data: any) {
        let format = Object.getOwnPropertyNames(data)[0]
        if (typeof this._data === 'undefined') {
            this._data = {}
        }
        this._data[format] = data[format]
    }
}