/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

const disableJSDOM = enableJSDOM();

import { Container, ContainerModule } from 'inversify';
import { ILogger, MessageClient, MessageService, MenuPath, MenuAction, CommandRegistry, bindContributionProvider, CommandContribution, SelectionService } from '@theia/core';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { MockMenuModelRegistry } from '@theia/core/lib/common/test/mock-menu';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { MenusContributionPointHandler } from './menus-contribution-handler';
import 'mocha';
import * as sinon from 'sinon';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { QuickCommandService, SharedStyle } from '@theia/core/lib/browser';
import { TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

disableJSDOM();

let testContainer: Container;
let handler: MenusContributionPointHandler;

let notificationWarnSpy: sinon.SinonSpy;
let registerMenuSpy: sinon.SinonSpy;
let registerCmdHandlerSpy: sinon.SinonSpy;
let loggerWarnSpy: sinon.SinonSpy;

const testCommandId = 'core.about';

before(() => {
    testContainer = new Container();

    const module = new ContainerModule((bind, unbind, isBound, rebind) => {
        bind(ILogger).to(MockLogger).inSingletonScope();
        bind(MessageClient).toSelf().inSingletonScope();
        bind(MessageService).toSelf().inSingletonScope();
        bind(MenuModelRegistry).toConstantValue(new MockMenuModelRegistry());
        bindContributionProvider(bind, CommandContribution);
        bind(CommandRegistry).toSelf().inSingletonScope();
        bind(ContextKeyService).toSelf().inSingletonScope();
        bind(MenusContributionPointHandler).toSelf();
        // tslint:disable-next-line:no-any mock QuickCommandService
        bind(QuickCommandService).toConstantValue({} as any);
        // tslint:disable-next-line:no-any mock TabBarToolbarRegistry
        bind(TabBarToolbarRegistry).toConstantValue({} as any);
        // tslint:disable-next-line:no-any mock SharedStyle
        bind(SharedStyle).toConstantValue({} as any);
        bind(SelectionService).toSelf().inSingletonScope();
    });

    testContainer.load(module);
});

beforeEach(() => {
    handler = testContainer.get(MenusContributionPointHandler);

    const logger = testContainer.get<ILogger>(ILogger);
    loggerWarnSpy = sinon.spy(logger, 'warn');

    const messageService = testContainer.get(MessageService);
    notificationWarnSpy = sinon.spy(messageService, 'warn');

    const menuRegistry = testContainer.get(MenuModelRegistry);
    registerMenuSpy = sinon.spy(menuRegistry, 'registerMenuAction');

    const commandRegistry = testContainer.get(CommandRegistry);
    registerCmdHandlerSpy = sinon.spy(commandRegistry, 'registerHandler');
});

afterEach(function () {
    notificationWarnSpy.restore();
    registerMenuSpy.restore();
    registerCmdHandlerSpy.restore();
    loggerWarnSpy.restore();
});

// TODO: enable tests once the https://github.com/theia-ide/theia/issues/3344 is fixed
describe.skip('MenusContributionHandler', () => {
    describe('should register an item in the supported menus', () => {
        it('editor context menu', () => {
            handler.handle({
                menus: {
                    'editor/context': [{
                        command: testCommandId
                    }]
                }
            });

            assertItemIsRegistered(EDITOR_CONTEXT_MENU);
        });

        it('navigator context menu', () => {
            handler.handle({
                menus: {
                    'explorer/context': [{
                        command: testCommandId
                    }]
                }
            });

            assertItemIsRegistered(NAVIGATOR_CONTEXT_MENU);
        });
    });

    it('should register an item in a menu\'s group', () => {
        handler.handle({
            menus: {
                'explorer/context': [{
                    command: testCommandId,
                    group: 'navigation'
                }]
            }
        });

        assertItemIsRegistered(NAVIGATOR_CONTEXT_MENU, 'navigation');
    });

    it('should register an item in a menu\'s group with a position', () => {
        handler.handle({
            menus: {
                'explorer/context': [{
                    command: testCommandId,
                    group: 'navigation@7'
                }]
            }
        });

        assertItemIsRegistered(NAVIGATOR_CONTEXT_MENU, 'navigation', '7');
    });

    it('should do nothing when no \'menus\' contribution provided', () => {
        handler.handle({});

        sinon.assert.notCalled(notificationWarnSpy);
        sinon.assert.notCalled(registerMenuSpy);
        sinon.assert.notCalled(registerCmdHandlerSpy);
    });

    it('should warn when invalid menu identifier', () => {
        handler.handle({
            menus: {
                'non-existent location': [{
                    command: testCommandId
                }]
            }
        });

        sinon.assert.called(loggerWarnSpy);
    });

    function assertItemIsRegistered(menuPath: MenuPath, menuGroup: string = '', order?: string) {
        sinon.assert.calledWithExactly(registerMenuSpy,
            [...menuPath, menuGroup],
            <MenuAction>{
                commandId: testCommandId,
                order: order || undefined
            });
    }
});
