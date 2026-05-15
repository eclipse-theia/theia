// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { DockLayout, DockPanel, TabBar, Widget } from '@lumino/widgets';
import { Emitter, Event as CommonEvent } from '@theia/core/lib/common';
import { TabBarRendererFactory, SHELL_TABBAR_CONTEXT_MENU } from '@theia/core/lib/browser/shell/tab-bars';
import { TabBarToolbarRegistry, TabBarToolbarFactory } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { BreadcrumbsRendererFactory } from '@theia/core/lib/browser/breadcrumbs/breadcrumbs-renderer';
import { CorePreferences } from '@theia/core/lib/common/core-preferences';
import { QaapScrollableTabBar, QaapToolbarAwareTabBar } from './qaap-tab-bars';

/**
 * Dock panel tab bar renderer using {@link QaapToolbarAwareTabBar} (native horizontal pan on narrow viewports).
 */
@injectable()
export class QaapDockPanelRenderer implements DockLayout.IRenderer {
    readonly tabBarClasses: string[] = [];

    document?: Document | ShadowRoot;

    private readonly onDidCreateTabBarEmitter = new Emitter<TabBar<Widget>>();

    constructor(
        @inject(TabBarRendererFactory) protected readonly tabBarRendererFactory: TabBarRendererFactory,
        @inject(TabBarToolbarRegistry) protected readonly tabBarToolbarRegistry: TabBarToolbarRegistry,
        @inject(TabBarToolbarFactory) protected readonly tabBarToolbarFactory: TabBarToolbarFactory,
        @inject(BreadcrumbsRendererFactory) protected readonly breadcrumbsRendererFactory: BreadcrumbsRendererFactory,
        @inject(CorePreferences) protected readonly corePreferences: CorePreferences,
    ) { }

    get onDidCreateTabBar(): CommonEvent<TabBar<Widget>> {
        return this.onDidCreateTabBarEmitter.event;
    }

    createTabBar(): TabBar<Widget> {
        const getDynamicTabOptions: () => QaapScrollableTabBar.Options | undefined = () => {
            if (this.corePreferences.get('workbench.tab.shrinkToFit.enabled')) {
                return {
                    minimumTabSize: this.corePreferences.get('workbench.tab.shrinkToFit.minimumSize'),
                    defaultTabSize: this.corePreferences.get('workbench.tab.shrinkToFit.defaultSize')
                };
            }
            return undefined;
        };

        const renderer = this.tabBarRendererFactory();
        const tabBar = new QaapToolbarAwareTabBar(
            this.tabBarToolbarRegistry,
            this.tabBarToolbarFactory,
            this.breadcrumbsRendererFactory,
            {
                document: this.document,
                renderer
            },
            {
                handlers: ['drag-thumb', 'keyboard', 'wheel'],
                useBothWheelAxes: true,
                scrollXMarginOffset: 4,
                suppressScrollY: true
            },
            getDynamicTabOptions());
        this.tabBarClasses.forEach(c => tabBar.addClass(c));
        renderer.tabBar = tabBar;
        renderer.contextMenuPath = SHELL_TABBAR_CONTEXT_MENU;
        tabBar.currentChanged.connect(this.onCurrentTabChanged, this);
        const prefChangeDisposable = this.corePreferences.onPreferenceChanged(change => {
            if (change.preferenceName === 'workbench.tab.shrinkToFit.enabled' ||
                change.preferenceName === 'workbench.tab.shrinkToFit.minimumSize' ||
                change.preferenceName === 'workbench.tab.shrinkToFit.defaultSize') {
                tabBar.dynamicTabOptions = getDynamicTabOptions();
            }
        });
        tabBar.disposed.connect(() => {
            prefChangeDisposable.dispose();
            renderer.dispose();
        });
        this.onDidCreateTabBarEmitter.fire(tabBar);
        return tabBar;
    }

    createHandle(): HTMLDivElement {
        return DockPanel.defaultRenderer.createHandle();
    }

    protected onCurrentTabChanged(sender: QaapToolbarAwareTabBar, { currentIndex }: TabBar.ICurrentChangedArgs<Widget>): void {
        if (currentIndex >= 0) {
            void sender.revealTab(currentIndex);
        }
    }
}
