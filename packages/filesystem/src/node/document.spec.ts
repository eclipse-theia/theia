/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as assert from 'assert';
import { FileUri } from "@theia/core/lib/node";
import { BaseDocument } from "./document";

describe("BaseDocument", () => {

    it('update 01', async () => {
        const text = `Hello World
Hello Anton`;
        const document = new BaseDocument(FileUri.create('/foo.txt'));
        await document.ready;
        document.update([{ text }]);
        assert.equal(text, document.content.getText());
    });

    it('update 02', async () => {
        const document = new BaseDocument(FileUri.create('/foo.txt'));
        await document.ready;
        document.update([{ text: 'Hello World' }]);
        assert.equal('Hello World', document.content.getText());
        document.update([{
            "text": "\n",
            "range": {
                "start": {
                    "line": 0,
                    "character": 11
                },
                "end": {
                    "line": 0,
                    "character": 11
                }
            },
            "rangeLength": 0
        },
        {
            "text": "H",
            "range": {
                "start": {
                    "line": 1,
                    "character": 0
                },
                "end": {
                    "line": 1,
                    "character": 0
                }
            },
            "rangeLength": 0
        },
        {
            "text": "e",
            "range": {
                "start": {
                    "line": 1,
                    "character": 1
                },
                "end": {
                    "line": 1,
                    "character": 1
                }
            },
            "rangeLength": 0
        },
        {
            "text": "l",
            "range": {
                "start": {
                    "line": 1,
                    "character": 2
                },
                "end": {
                    "line": 1,
                    "character": 2
                }
            },
            "rangeLength": 0
        },
        {
            "text": "l",
            "range": {
                "start": {
                    "line": 1,
                    "character": 3
                },
                "end": {
                    "line": 1,
                    "character": 3
                }
            },
            "rangeLength": 0
        },
        {
            "text": "o",
            "range": {
                "start": {
                    "line": 1,
                    "character": 4
                },
                "end": {
                    "line": 1,
                    "character": 4
                }
            },
            "rangeLength": 0
        },
        {
            "text": " ",
            "range": {
                "start": {
                    "line": 1,
                    "character": 5
                },
                "end": {
                    "line": 1,
                    "character": 5
                }
            },
            "rangeLength": 0
        },
        {
            "text": "A",
            "range": {
                "start": {
                    "line": 1,
                    "character": 6
                },
                "end": {
                    "line": 1,
                    "character": 6
                }
            },
            "rangeLength": 0
        },
        {
            "text": "n",
            "range": {
                "start": {
                    "line": 1,
                    "character": 7
                },
                "end": {
                    "line": 1,
                    "character": 7
                }
            },
            "rangeLength": 0
        },
        {
            "text": "t",
            "range": {
                "start": {
                    "line": 1,
                    "character": 8
                },
                "end": {
                    "line": 1,
                    "character": 8
                }
            },
            "rangeLength": 0
        },
        {
            "text": "o",
            "range": {
                "start": {
                    "line": 1,
                    "character": 9
                },
                "end": {
                    "line": 1,
                    "character": 9
                }
            },
            "rangeLength": 0
        },
        {
            "text": "n",
            "range": {
                "start": {
                    "line": 1,
                    "character": 10
                },
                "end": {
                    "line": 1,
                    "character": 10
                }
            },
            "rangeLength": 0
        }]);
        assert.equal(`Hello World
Hello Anton`, document.content.getText());
    });

});
