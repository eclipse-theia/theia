/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { expect } from 'chai';
import { TreeDecoratorService, AbstractTreeDecoratorService, TreeDecoration } from './tree-decorator';

class MockTreeDecoratorService extends AbstractTreeDecoratorService {

    constructor() {
        super([]);
    }

}

describe('tree-decorator', () => {

    describe('tree-decorator-service', () => {

        const decoratorService: TreeDecoratorService = new MockTreeDecoratorService();

        it('should inflate an empty object into an empty map', () => {
            expect(decoratorService.inflateDecorators({})).to.be.empty;
        });

        it('should inflate an object into the corresponding map', () => {
            const expected = new Map<string, TreeDecoration.Data[]>();
            expected.set('id_1', [
                {
                    tooltip: 'tooltip'
                },
                {
                    fontData: {
                        color: 'blue'
                    }
                }
            ]);
            expected.set('id_2', [
                {
                    backgroundColor: 'yellow'
                },
                {
                    priority: 100
                }
            ]);
            expect(decoratorService.inflateDecorators(
                {
                    "id_1": [
                        {
                            "tooltip": "tooltip"
                        },
                        {
                            "fontData": {
                                "color": "blue"
                            }
                        }
                    ],
                    "id_2": [
                        {
                            "backgroundColor": "yellow"
                        },
                        {
                            "priority": 100
                        }
                    ]
                }
            )).to.be.deep.equal(expected);
        });

        it('should deflate an empty map into an empty object', () => {
            expect(decoratorService.inflateDecorators({})).to.be.empty;
        });

        it('should inflate an object into the corresponding map', () => {
            const decorations = new Map<string, TreeDecoration.Data[]>();
            decorations.set('id_1', [
                {
                    tooltip: 'tooltip'
                },
                {
                    fontData: {
                        color: 'blue'
                    }
                }
            ]);
            decorations.set('id_2', [
                {
                    backgroundColor: 'yellow'
                },
                {
                    priority: 100
                }
            ]);
            expect(decoratorService.deflateDecorators(decorations)).to.be.deep.equal({
                "id_1": [
                    {
                        "tooltip": "tooltip"
                    },
                    {
                        "fontData": {
                            "color": "blue"
                        }
                    }
                ],
                "id_2": [
                    {
                        "backgroundColor": "yellow"
                    },
                    {
                        "priority": 100
                    }
                ]
            });
        });

    });

});
