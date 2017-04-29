/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as electron from 'electron';
import { injectable } from "inversify";

import { ClipboardService } from "../../common/clipboard-service";

@injectable()
export class ElectronClipboardService implements ClipboardService {
    private _set: boolean
    private _clipboard: {[index: string]: any} = electron.clipboard
    private _formats: {[id: string]: string} = {
        text: 'readText',
        html: 'readHTML',
        image: 'readImage',
        rtf: 'readRTF',
        bookmark: 'readBookmark'
    }

    getData(format: string, type?: "" | "selection" | undefined): any {
        let funcName = <string>this._formats[format]
        if (funcName) {
            return this._clipboard[funcName]()
        }
    }

    get isEmpty(): boolean {
        return !this._set

    }
    setData(data: any, type?: "" | "selection" | undefined) {
        this._set = true
        electron.clipboard.write(data, type)
    }
}