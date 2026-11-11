// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import * as sinon from 'sinon';
// The terminal imports load xterm, which probes the canvas API during module loading.
// These tests do not render a terminal, and JSDOM has no canvas backend.
const canvasContext = sinon.stub(HTMLCanvasElement.prototype, 'getContext');

import { expect } from 'chai';
import { TerminalCollection, TerminalWidget, TerminalWidgetOptions } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { PanelKind, TaskConfiguration, TaskOutputPresentation, TaskScope } from '../common/index.js';
import { TaskDefinitionRegistry } from './task-definition-registry.js';
import { TaskTerminalWidgetManager } from './task-terminal-widget-manager.js';

canvasContext.restore();
disableJSDOM();

interface FakeTaskTerminal {
    id: string;
    kind: 'task';
    isDisposed: boolean;
    dedicated?: boolean;
    busy?: boolean;
    taskConfig?: TaskConfiguration;
    options: TerminalWidgetOptions;
}

class FakeTerminalService {
    readonly all: FakeTaskTerminal[] = [];
    readonly lastUsedTerminal = undefined;
    readonly created: TerminalWidgetOptions[] = [];

    async newTerminal(options: TerminalWidgetOptions): Promise<TerminalWidget> {
        this.created.push(options);
        const widget = createTerminal(`created-${this.created.length}`);
        widget.options = options;
        return widget as unknown as TerminalWidget;
    }

    async open(): Promise<void> { }
}

let terminalCounter = 0;
function createTerminal(id = `terminal-${++terminalCounter}`, props: Partial<FakeTaskTerminal> = {}): FakeTaskTerminal & Record<string, unknown> {
    return {
        id,
        kind: 'task',
        isDisposed: false,
        options: {},
        resetTerminal: () => { },
        setTitle: () => { },
        clearOutput: () => { },
        writeLine: () => { },
        ...props,
    };
}

function task(label: string, presentation?: TaskOutputPresentation): TaskConfiguration {
    return { type: 'shell', label, _scope: TaskScope.Workspace, presentation };
}

class TestTaskTerminalWidgetManager extends TaskTerminalWidgetManager {
    override readonly taskDefinitionRegistry = new TaskDefinitionRegistry();
    override readonly terminalService: TerminalService;

    constructor(readonly fakeTerminalService: FakeTerminalService) {
        super();
        this.terminalService = fakeTerminalService as unknown as TerminalService;
    }
}

describe('TaskTerminalWidgetManager', () => {
    let terminalService: FakeTerminalService;
    let manager: TestTaskTerminalWidgetManager;
    const factoryOptions: TerminalWidgetFactoryOptions = { created: 'test' };

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        terminalService = new FakeTerminalService();
        manager = new TestTaskTerminalWidgetManager(terminalService);
    });

    function addTerminal(props: Partial<FakeTaskTerminal>): FakeTaskTerminal {
        const terminal = createTerminal(undefined, props);
        terminalService.all.push(terminal);
        return terminal;
    }

    async function open(config: TaskConfiguration): Promise<TerminalWidget> {
        return manager.open(factoryOptions, { taskConfig: config });
    }

    describe('newTaskTerminal', () => {
        it('creates task terminals in the Tasks collection', async () => {
            await manager.newTaskTerminal(factoryOptions);

            const [options] = terminalService.created;
            expect(options.kind).to.equal('task');
            expect(options.collection?.id).to.equal('tasks');
            expect(options.collection?.iconClass).to.contain('tasklist');
        });

        it('lets subclasses opt out of the collection', async () => {
            class NoCollectionManager extends TestTaskTerminalWidgetManager {
                protected override getTerminalCollection(): TerminalCollection | undefined {
                    return undefined;
                }
            }
            await new NoCollectionManager(terminalService).newTaskTerminal(factoryOptions);

            expect(terminalService.created[0].collection).to.be.undefined;
        });

        it('keeps the given location for a task without a group', async () => {
            await manager.newTaskTerminal({ ...factoryOptions, location: { parentTerminal: 'other' } }, task('build'));

            expect(terminalService.created[0].location).to.deep.equal({ parentTerminal: 'other' });
        });

        it('splits next to a terminal of a task in the same group', async () => {
            addTerminal({ taskConfig: task('lint', { group: 'checks' }), busy: true });
            const groupTerminal = addTerminal({ taskConfig: task('test', { group: 'build' }), busy: true });

            await manager.newTaskTerminal(factoryOptions, task('build', { group: 'build' }));

            expect(terminalService.created[0].location).to.deep.equal({ parentTerminal: groupTerminal.id });
        });

        it('does not split for a group without terminals', async () => {
            addTerminal({ taskConfig: task('lint', { group: 'checks' }), busy: true });

            await manager.newTaskTerminal(factoryOptions, task('build', { group: 'build' }));

            expect(terminalService.created[0].location).to.be.undefined;
        });

        it('ignores disposed terminals of the same group', async () => {
            addTerminal({ taskConfig: task('test', { group: 'build' }), isDisposed: true });

            await manager.newTaskTerminal(factoryOptions, task('build', { group: 'build' }));

            expect(terminalService.created[0].location).to.be.undefined;
        });
    });

    describe('open with a shared terminal', () => {
        it('reuses an idle terminal of a task without a group', async () => {
            const idle = addTerminal({ taskConfig: task('test') });

            const widget = await open(task('build'));

            expect(widget).to.equal(idle);
            expect(terminalService.created).to.be.empty;
        });

        it('reuses an idle terminal of a task in the same group', async () => {
            addTerminal({ taskConfig: task('lint', { group: 'checks' }) });
            const idle = addTerminal({ taskConfig: task('test', { group: 'build' }) });

            const widget = await open(task('build', { group: 'build' }));

            expect(widget).to.equal(idle);
        });

        it('does not reuse an idle terminal of a task in another group', async () => {
            addTerminal({ taskConfig: task('lint', { group: 'checks' }) });

            await open(task('build', { group: 'build' }));

            expect(terminalService.created).to.have.lengthOf(1);
        });

        it('does not reuse an idle terminal of a grouped task for a task without a group', async () => {
            addTerminal({ taskConfig: task('lint', { group: 'checks' }) });

            await open(task('build'));

            expect(terminalService.created).to.have.lengthOf(1);
        });

        it('splits a new terminal next to a busy terminal of the same group', async () => {
            const busy = addTerminal({ taskConfig: task('test', { group: 'build' }), busy: true });

            await open(task('build', { group: 'build' }));

            expect(terminalService.created[0].location).to.deep.equal({ parentTerminal: busy.id });
        });

        it('does not reuse a dedicated terminal', async () => {
            addTerminal({ taskConfig: task('test', { panel: PanelKind.Dedicated }), dedicated: true });

            await open(task('build'));

            expect(terminalService.created).to.have.lengthOf(1);
        });
    });
});

describe('TaskOutputPresentation', () => {
    it('reads a string group', () => {
        expect(TaskOutputPresentation.getGroup(task('build', { group: 'build' }))).to.equal('build');
    });

    it('ignores a group that is not a string', () => {
        expect(TaskOutputPresentation.getGroup(task('build', { group: 42 as unknown as string }))).to.be.undefined;
        expect(TaskOutputPresentation.getGroup(task('build'))).to.be.undefined;
    });

    it('keeps the group when parsed from JSON', () => {
        expect(TaskOutputPresentation.fromJson({ presentation: { group: 'build' } }).group).to.equal('build');
    });
});
