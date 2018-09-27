/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import { Container } from 'inversify';
import { TreeSearch } from './tree-search';
import { FuzzySearch } from './fuzzy-search';
import { Tree, TreeImpl } from './tree';
import { ILogger } from '../../common/logger';
import { MockLogger } from '../../common/test/mock-logger';
import { MockTreeModel } from './test/mock-tree-model';
import { TreeSelectionState } from './tree-selection-state';
import { TreeNavigationService } from './tree-navigation';
import { TreeModel, TreeModelImpl } from './tree-model';
import { TreeSelectionServiceImpl } from './tree-selection-impl';
import { TreeExpansionService, TreeExpansionServiceImpl } from './tree-expansion';
import { TreeSelection, TreeSelectionService, SelectableTreeNode } from './tree-selection';

// tslint:disable:no-unused-expression

namespace TreeSelectionState {

    export interface Expectation {
        readonly focus?: string | undefined;
        readonly selection?: string[];
    }

    export interface Assert {
        readonly nextState: (type: 'default' | 'toggle' | 'range', nodeId: string, expectation?: Expectation) => Assert;
    }

}

describe('tree-selection-state', () => {

    const model = createTreeModel();
    const findNode = (nodeId: string) => model.getNode(nodeId) as (SelectableTreeNode);

    beforeEach(() => {
        model.root = MockTreeModel.FLAT_MOCK_ROOT();
        expect(model.selectedNodes).to.be.empty;
    });

    it('should remove the selection but not the focus when toggling the one and only selected node', () => {
        newState()
            .nextState('toggle', '1', {
                focus: '1',
                selection: ['1']
            })
            .nextState('toggle', '1', {
                focus: '1',
                selection: []
            });
    });

    it('should keep the focus on the `fromNode` when selecting a range', () => {
        newState()
            .nextState('toggle', '1')
            .nextState('range', '3', {
                focus: '1',
                selection: ['1', '2', '3']
            });
    });

    it('should always have one single focus node when toggling node in a range', () => {
        newState()
            .nextState('toggle', '1')
            .nextState('range', '3')
            .nextState('toggle', '2', {
                focus: '1',
                selection: ['1', '3']
            })
            .nextState('toggle', '2', {
                focus: '1',
                selection: ['1', '2', '3']
            });
    });

    it('should calculate the range from the focus even unselecting a node in the previously created range', () => {
        newState()
            .nextState('toggle', '5')
            .nextState('range', '2', {
                focus: '5',
                selection: ['2', '3', '4', '5']
            })
            .nextState('toggle', '3', {
                focus: '5',
                selection: ['2', '4', '5']
            })
            .nextState('range', '7', {
                focus: '5',
                selection: ['2', '4', '5', '6', '7']
            });
    });

    it('should discard the previous range selection state if the current one has the same focus with other direction', () => {
        newState()
            .nextState('toggle', '4')
            .nextState('range', '1')
            .nextState('range', '6', {
                focus: '4',
                selection: ['4', '5', '6']
            });
    });

    it('should discard the previous range selection state if the current one overlaps the previous one', () => {
        newState()
            .nextState('toggle', '4')
            .nextState('range', '6')
            .nextState('range', '8', {
                focus: '4',
                selection: ['4', '5', '6', '7', '8']
            });
    });

    it('should move the focus to the most recently selected node if the previous selection was a toggle', () => {
        newState()
            .nextState('toggle', '4')
            .nextState('toggle', '5', {
                focus: '5',
                selection: ['4', '5']
            });
    });

    it('should keep the focus on the previous node if the current toggling happens in the most recent range', () => {
        newState()
            .nextState('toggle', '4')
            .nextState('range', '2', {
                focus: '4',
                selection: ['4', '3', '2']
            });
    });

    it('should move the focus to the next toggle node if that is out of the latest range selection', () => {
        newState()
            .nextState('toggle', '3')
            .nextState('range', '5', {
                focus: '3',
                selection: ['3', '4', '5']
            })
            .nextState('toggle', '1', {
                focus: '1',
                selection: ['3', '4', '5', '1']
            });
    });

    it('should not change the focus when removing a selection from an individual node', () => {
        newState()
            .nextState('toggle', '3')
            .nextState('range', '5', {
                focus: '3',
                selection: ['5', '4', '3']
            })
            .nextState('toggle', '1', {
                focus: '1',
                selection: ['1', '5', '4', '3']
            })
            .nextState('toggle', '4', {
                focus: '1',
                selection: ['1', '5', '3']
            });
    });

    it('should discard the previously selected range if each node from the previous range is contained in the current one', () => {
        newState()
            .nextState('toggle', '5')
            .nextState('range', '2')
            .nextState('toggle', '3', {
                focus: '5',
                selection: ['5', '4', '2']
            })
            .nextState('range', '1', {
                focus: '5',
                selection: ['5', '4', '3', '2', '1']
            })
            .nextState('range', '7', {
                focus: '5',
                selection: ['5', '6', '7']
            });
    });

    it('should be possible to remove the selection of a node which is contained in two overlapping ranges', () => {
        newState()
            .nextState('toggle', '5')
            .nextState('range', '4')
            .nextState('toggle', '3')
            .nextState('range', '2', {
                focus: '3',
                selection: ['2', '3', '4', '5']
            })
            .nextState('range', '5', {
                focus: '3',
                selection: ['5', '4', '3']
            })
            .nextState('toggle', '4', {
                focus: '3',
                selection: ['5', '3']
            });
    });

    it('should be possible to traverse with range selections', () => {
        newState()
            .nextState('toggle', '2')
            .nextState('range', '3', {
                focus: '2', // In VSCode this is 3.
                selection: ['2', '3']
            })
            .nextState('range', '4', {
                focus: '2', // In VSCode this is 4. They distinguish between `Shift + Up Arrow` and `Shift + Click`.
                selection: ['2', '3', '4']
            });
    });

    it('should remove the selection from a node inside a range instead of setting the focus', () => {
        newState()
            .nextState('toggle', '2')
            .nextState('range', '3', {
                focus: '2',
                selection: ['2', '3']
            })
            .nextState('toggle', '5', {
                focus: '5',
                selection: ['2', '3', '5']
            })
            .nextState('range', '6', {
                focus: '5',
                selection: ['2', '3', '5', '6']
            })
            .nextState('toggle', '3', {
                focus: '5',
                selection: ['2', '5', '6']
            });
    });

    it('should merge all individual selections into a range', () => {
        newState()
            .nextState('toggle', '1')
            .nextState('toggle', '3')
            .nextState('toggle', '6')
            .nextState('toggle', '2')
            .nextState('range', '7', {
                focus: '2',
                selection: ['1', '2', '3', '4', '5', '6', '7']
            });
    });

    it('should keep focus on the most recent even when removing selection from individual nodes', () => {
        newState()
            .nextState('toggle', '9')
            .nextState('range', '6', {
                focus: '9',
                selection: ['9', '8', '7', '6']
            })
            .nextState('range', '10', {
                focus: '9',
                selection: ['9', '10']
            })
            .nextState('range', '2', {
                focus: '9',
                selection: ['9', '8', '7', '6', '5', '4', '3', '2']
            })
            .nextState('toggle', '4', {
                focus: '9',
                selection: ['9', '8', '7', '6', '5', '3', '2']
            })
            .nextState('toggle', '5', {
                focus: '9',
                selection: ['9', '8', '7', '6', '3', '2']
            })
            .nextState('toggle', '6', {
                focus: '9',
                selection: ['9', '8', '7', '3', '2']
            })
            .nextState('toggle', '7', {
                focus: '9',
                selection: ['9', '8', '3', '2']
            })
            .nextState('range', '5', {
                focus: '9',
                selection: ['9', '8', '7', '6', '5', '3', '2']
            });
    });

    it('should expand the range instead of discarding it if individual elements have created a hole in the range', () => {
        newState()
            .nextState('toggle', '9')
            .nextState('range', '3', {
                focus: '9',
                selection: ['9', '8', '7', '6', '5', '4', '3']
            })
            .nextState('toggle', '4', {
                focus: '9',
                selection: ['9', '8', '7', '6', '5', '3']
            })
            .nextState('range', '10', {
                focus: '9',
                selection: ['10', '9', '8', '7', '6', '5', '3']
            });
    });

    it('should reset the selection state and the focus when using the default selection', () => {
        newState()
            .nextState('toggle', '1')
            .nextState('toggle', '2', {
                focus: '2',
                selection: ['1', '2']
            })
            .nextState('default', '2', {
                focus: '2',
                selection: ['2']
            })
            .nextState('toggle', '1', {
                focus: '1',
                selection: ['1', '2']
            })
            .nextState('default', '2', {
                focus: '2',
                selection: ['2']
            });
    });

    it('should remove the selection but keep the focus when toggling the single selected node', () => {
        newState()
            .nextState('toggle', '1', {
                focus: '1',
                selection: ['1']
            })
            .nextState('toggle', '1', {
                focus: '1',
                selection: []
            });
    });

    it('should treat ranges with the same from and to node as a single element range', () => {
        newState()
            .nextState('toggle', '2')
            .nextState('range', '1', {
                focus: '2',
                selection: ['1', '2']
            })
            .nextState('range', '2', {
                focus: '2',
                selection: ['2']
            })
            .nextState('range', '3', {
                focus: '2',
                selection: ['2', '3']
            })
            .nextState('range', '2', {
                focus: '2',
                selection: ['2']
            })
            .nextState('range', '1', {
                focus: '2',
                selection: ['1', '2']
            });
    });

    it('should remember the most recent range selection start after toggling individual nodes', () => {
        newState()
            .nextState('toggle', '10', {
                focus: '10',
                selection: ['10']
            })
            .nextState('range', '3', {
                focus: '10',
                selection: ['3', '4', '5', '6', '7', '8', '9', '10']
            })
            .nextState('toggle', '7', {
                focus: '10',
                selection: ['3', '4', '5', '6', '8', '9', '10']
            })
            .nextState('toggle', '8', {
                focus: '10',
                selection: ['3', '4', '5', '6', '9', '10']
            })
            .nextState('toggle', '6', {
                focus: '10',
                selection: ['3', '4', '5', '9', '10']
            })
            .nextState('toggle', '5', {
                focus: '10',
                selection: ['3', '4', '9', '10']
            })
            .nextState('range', '2', {
                focus: '10',
                selection: ['2', '3', '4', '5', '6', '7', '8', '9', '10']
            });
    });

    function newState(): TreeSelectionState.Assert {
        return nextState(new TreeSelectionState(model));
    }

    function nextState(state: TreeSelectionState): TreeSelectionState.Assert {
        return {
            nextState: (nextType, nextId, expectation) => {
                const node = findNode(nextId);
                const type = ((t: 'default' | 'toggle' | 'range') => {
                    switch (t) {
                        case 'default': return TreeSelection.SelectionType.DEFAULT;
                        case 'toggle': return TreeSelection.SelectionType.TOGGLE;
                        case 'range': return TreeSelection.SelectionType.RANGE;
                        default: throw new Error(`Unexpected selection type: ${t}.`);
                    }
                })(nextType);
                const next = state.nextState({ node, type });
                if (!!expectation) {
                    const { focus, selection } = expectation;
                    if ('focus' in expectation) {
                        if (focus === undefined) {
                            expect(next.focus).to.be.undefined;
                        } else {
                            expect(next.focus).to.be.not.undefined;
                            expect(next.focus!.id).to.be.equal(focus);
                            // TODO: we need tree-selection tests too, otherwise, we cannot verify whether there is one focus or not.
                        }
                    }
                    if (selection) {
                        expect(next.selection().map(n => n.id).sort()).to.be.deep.equal(selection.sort());
                    }
                }
                return nextState(next);
            }
        };
    }

    function createTreeModel(): TreeModel {
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(TreeImpl).toSelf();
        container.bind(Tree).toService(TreeImpl);
        container.bind(TreeSelectionServiceImpl).toSelf();
        container.bind(TreeSelectionService).toService(TreeSelectionServiceImpl);
        container.bind(TreeExpansionServiceImpl).toSelf();
        container.bind(TreeExpansionService).toService(TreeExpansionServiceImpl);
        container.bind(TreeNavigationService).toSelf();
        container.bind(TreeModelImpl).toSelf();
        container.bind(TreeModel).toService(TreeModelImpl);
        container.bind(TreeSearch).toSelf();
        container.bind(FuzzySearch).toSelf();
        container.bind(MockLogger).toSelf();
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        return container.get(TreeModel);
    }

});
