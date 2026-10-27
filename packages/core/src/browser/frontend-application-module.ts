// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

// Import Lumino rules first because some conflict with Theia's styles.
// This ensures Theia rules with equal specificity take precedence (see GH-17872).
import '@lumino/widgets/style/index.css';
import 'perfect-scrollbar/css/perfect-scrollbar.css';
import '../../src/browser/style/index.css';
import '../../src/browser/style/materialcolors.css';
import 'font-awesome/css/font-awesome.min.css';
import 'file-icons-js/css/style.css';
import '@vscode/codicons/dist/codicon.css';

import { ContainerModule } from 'inversify';
import {
    bindRootContributionProvider,
    SelectionService,
    ResourceResolver,
    CommandContribution, CommandRegistry, CommandService, commandServicePath,
    MenuModelRegistry, MenuContribution,
    MessageClient,
    InMemoryResources,
    messageServicePath,
    InMemoryTextResourceResolver,
    UntitledResourceResolver,
    MenuPath,
    PreferenceService,
    RemoteCliArgsContribution
} from '../common/index.js';
import { KeybindingRegistry, KeybindingContext, KeybindingContribution } from './keybinding.js';
import { FrontendApplication } from './frontend-application.js';
import { FrontendApplicationContribution, DefaultFrontendApplicationContribution } from './frontend-application-contribution.js';
import { DefaultOpenerService, OpenerService, OpenHandler } from './opener-service.js';
import { HttpOpenHandler } from './http-open-handler.js';
import { CommonFrontendContribution } from './common-frontend-contribution.js';
import { LocalStorageService, StorageService } from './storage-service.js';
import { WidgetFactory, WidgetManager } from './widget-manager.js';
import {
    ApplicationShell, ApplicationShellOptions, DockPanelRenderer, TabBarRenderer,
    TabBarRendererFactory, ShellLayoutRestorer,
    SidePanelHandler, SidePanelHandlerFactory,
    SidebarMenuWidget, SidebarTopMenuWidgetFactory,
    SplitPositionHandler, DockPanelRendererFactory, ApplicationShellLayoutMigration, ApplicationShellLayoutMigrationError, SidebarBottomMenuWidgetFactory,
    ShellLayoutTransformer, WidgetAreaResolver
} from './shell/index.js';
import { LabelParser } from './label-parser.js';
import { LabelProvider, LabelProviderContribution, DefaultUriLabelProviderContribution } from './label-provider.js';
import { ContextMenuRenderer, Coordinate } from './context-menu-renderer.js';
import { ThemeService } from './theming.js';
import { ConnectionStatusService, FrontendConnectionStatusService, ApplicationConnectionStatusContribution, PingService } from './connection-status-service.js';
import { DiffUriLabelProviderContribution } from './diff-uris.js';
import { ApplicationServer, applicationPath } from '../common/application-protocol.js';
import { WebSocketConnectionProvider } from './messaging/index.js';
import { AboutDialog, AboutDialogProps } from './about-dialog.js';
import { EnvVariablesServer, envVariablesPath, EnvVariable } from './../common/env-variables/index.js';
import { FrontendApplicationStateService } from './frontend-application-state.js';
import { JsonSchemaStore, JsonSchemaContribution, DefaultJsonSchemaContribution, JsonSchemaDataStore } from './json-schema-store.js';
import { TabBarToolbarRegistry, TabBarToolbarContribution, TabBarToolbarFactory, TabBarToolbar } from './shell/tab-bar-toolbar/index.js';
import { ContextKeyService, ContextKeyServiceDummyImpl } from './context-key-service.js';
import { ResourceContextKey } from './resource-context-key.js';
import { WidgetContextKeyContribution } from './widget-context-key-contribution.js';
import { KeyboardLayoutService } from './keyboard/keyboard-layout-service.js';
import { MimeService } from './mime-service.js';
import { ApplicationShellMouseTracker } from './shell/application-shell-mouse-tracker.js';
import { ViewContainer, ViewContainerIdentifier } from './view-container.js';
import { QuickViewService } from './quick-input/quick-view-service.js';
import { DialogOverlayService } from './dialogs.js';
import { ProgressLocationService } from './progress-location-service.js';
import { ProgressClient } from '../common/progress-service-protocol.js';
import { ProgressService } from '../common/progress-service.js';
import { DispatchingProgressClient } from './progress-client.js';
import { ProgressStatusBarItem } from './progress-status-bar-item.js';
import { TabBarDecoratorService, TabBarDecorator } from './shell/tab-bar-decorator.js';
import { ContextMenuContext } from './menu/context-menu-context.js';
import { bindResourceProvider, bindMessageService, bindPreferenceService } from './frontend-application-bindings.js';
import { ColorRegistry } from './color-registry.js';
import { ColorContribution, ColorApplicationContribution } from './color-application-contribution.js';
import { ExternalUriService } from './external-uri-service.js';
import { IconThemeService, NoneIconTheme } from './icon-theme-service.js';
import { IconThemeApplicationContribution, IconThemeContribution, DefaultFileIconThemeContribution } from './icon-theme-contribution.js';
import { TreeLabelProvider } from './tree/tree-label-provider.js';
import { ProgressBar } from './progress-bar.js';
import { ProgressBarFactory, ProgressBarOptions } from './progress-bar-factory.js';
import { CommandOpenHandler } from './command-open-handler.js';
import { LanguageService } from './language-service.js';
import { EncodingRegistry } from './encoding-registry.js';
import { EncodingService } from '../common/encoding-service.js';
import { AuthenticationService, AuthenticationServiceImpl } from '../browser/authentication-service.js';
import { DecorationsService, DecorationsServiceImpl } from './decorations-service.js';
import { keyStoreServicePath, KeyStoreService } from '../common/key-store.js';
import { CredentialsService, CredentialsServiceImpl } from './credentials-service.js';
import { ContributionFilterRegistry, ContributionFilterRegistryImpl } from '../common/contribution-filter/index.js';
import { QuickCommandFrontendContribution } from './quick-input/quick-command-frontend-contribution.js';
import { QuickPickService, quickPickServicePath } from '../common/quick-pick-service.js';
import {
    QuickPickServiceImpl,
    QuickInputFrontendContribution,
    QuickAccessContribution,
    QuickCommandService,
    QuickHelpService
} from './quick-input/index.js';
import { SidebarBottomMenuWidget } from './shell/sidebar-bottom-menu-widget.js';
import { WindowContribution } from './window-contribution.js';
import {
    BreadcrumbID,
    BreadcrumbPopupContainer,
    BreadcrumbPopupContainerFactory,
    BreadcrumbRenderer,
    BreadcrumbsContribution,
    BreadcrumbsRenderer,
    BreadcrumbsRendererFactory,
    BreadcrumbsService,
    DefaultBreadcrumbRenderer,
} from './breadcrumbs/index.js';
import { DockPanel, RendererHost } from './widgets/index.js';
import { TooltipService, TooltipServiceImpl } from './tooltip-service.js';
import { BackendRequestService, RequestService, REQUEST_SERVICE_PATH } from '@theia/request';
import { bindFrontendStopwatch, bindBackendStopwatch } from './performance/index.js';
import { SaveableService, SaveErrorChecker } from './saveable-service.js';
import { SecondaryWindowHandler } from './secondary-window-handler.js';
import { UserWorkingDirectoryProvider } from './user-working-directory-provider.js';
import { WindowTitleService } from './window/window-title-service.js';
import { WindowTitleUpdater } from './window/window-title-updater.js';
import { TheiaDockPanel } from './shell/theia-dock-panel.js';
import { bindStatusBar } from './status-bar/index.js';
import { CoreMarkdownRenderer, MarkdownRenderer, MarkdownRendererFactory, MarkdownRendererImpl } from './markdown-rendering/markdown-renderer.js';
import { StylingParticipant, StylingService } from './styling-service.js';
import { bindCommonStylingParticipants } from './common-styling-participants.js';
import { HoverService } from './hover-service.js';
import { AdditionalViewsMenuPath, AdditionalViewsMenuWidget, AdditionalViewsMenuWidgetFactory } from './shell/additional-views-menu-widget.js';
import { SidePanelItemVisibility, SidePanelItemVisibilityImpl } from './shell/side-panel-item-visibility.js';
import { LanguageIconLabelProvider } from './language-icon-provider.js';
import { bindTreePreferences } from '../common/tree-preference.js';
import { OpenWithService } from './open-with-service.js';
import { ViewColumnService } from './shell/view-column-service.js';
import { DomInputUndoRedoHandler, UndoRedoHandler, UndoRedoHandlerService } from './undo-redo-handler.js';
import { WidgetStatusBarContribution, WidgetStatusBarService } from './widget-status-bar-service.js';
import { SymbolIconColorContribution } from './symbol-icon-color-contribution.js';
import { CorePreferences, bindCorePreferences } from '../common/core-preferences.js';
import { bindBadgeDecoration } from './badges/index.js';
import { PerspectiveContribution, PerspectiveService, PerspectiveServiceImpl, PerspectiveServiceInternal, WidgetAreaResolverImpl } from './perspective-service.js';

export { bindResourceProvider, bindMessageService, bindPreferenceService };

export const frontendApplicationModule = new ContainerModule((bind, _unbind, _isBound, _rebind) => {
    bind(NoneIconTheme).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(NoneIconTheme);
    bind(IconThemeService).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, IconThemeContribution);
    bind(DefaultFileIconThemeContribution).toSelf().inSingletonScope();
    bind(IconThemeContribution).toService(DefaultFileIconThemeContribution);
    bind(IconThemeApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(IconThemeApplicationContribution);
    bind(LanguageIconLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(LanguageIconLabelProvider);

    bind(ColorRegistry).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, ColorContribution);
    bind(ColorApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ColorApplicationContribution);

    bind(FrontendApplication).toSelf().inSingletonScope();
    bind(FrontendApplicationStateService).toSelf().inSingletonScope();
    bind(DefaultFrontendApplicationContribution).toSelf();
    bindRootContributionProvider(bind, FrontendApplicationContribution);
    bindRootContributionProvider(bind, RemoteCliArgsContribution);

    bind(ApplicationShellOptions).toConstantValue({});
    bind(ApplicationShell).toSelf().inSingletonScope();
    bind(SidePanelHandlerFactory).toAutoFactory(SidePanelHandler);
    bind(SidePanelHandler).toSelf();
    bind(SidePanelItemVisibilityImpl).toSelf().inSingletonScope();
    bind(SidePanelItemVisibility).toService(SidePanelItemVisibilityImpl);
    bind(SidebarTopMenuWidgetFactory).toAutoFactory(SidebarMenuWidget);
    bind(SidebarMenuWidget).toSelf();
    bind(SidebarBottomMenuWidget).toSelf();
    bind(SidebarBottomMenuWidgetFactory).toAutoFactory(SidebarBottomMenuWidget);
    bind(AdditionalViewsMenuWidget).toSelf();
    bind(AdditionalViewsMenuWidgetFactory).toFactory(ctx => (side: 'left' | 'right') => {
        const childContainer = ctx.container.createChild();
        childContainer.bind<MenuPath>(AdditionalViewsMenuPath).toConstantValue(['additional_views_menu', side]);
        return childContainer.resolve(AdditionalViewsMenuWidget);
    });
    bind(SplitPositionHandler).toSelf().inSingletonScope();

    bindRootContributionProvider(bind, TabBarToolbarContribution);
    bindRootContributionProvider(bind, WidgetContextKeyContribution);
    bind(TabBarToolbarRegistry).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TabBarToolbarRegistry);
    bind(TabBarToolbarFactory).toFactory(context => () => {
        const container = context.container.createChild();
        container.bind(TabBarToolbar).toSelf().inSingletonScope();
        return container.get(TabBarToolbar);
    });

    bind(DockPanelRendererFactory).toFactory<DockPanelRenderer, [(Document | ShadowRoot)?]>(context => (document?: Document | ShadowRoot) => {
        const renderer = context.container.get(DockPanelRenderer);
        renderer.document = document;
        return renderer;
    });
    bind(DockPanelRenderer).toSelf();
    bind(TabBarRendererFactory).toFactory(({ container }) => () => {
        const contextMenuRenderer = container.get(ContextMenuRenderer);
        const tabBarDecoratorService = container.get(TabBarDecoratorService);
        const iconThemeService = container.get(IconThemeService);
        const selectionService = container.get(SelectionService);
        const commandService = container.get<CommandService>(CommandService);
        const corePreferences = container.get<CorePreferences>(CorePreferences);
        const hoverService = container.get(HoverService);
        const contextKeyService: ContextKeyService = container.get(ContextKeyService);
        return new TabBarRenderer(contextMenuRenderer, tabBarDecoratorService, iconThemeService,
            selectionService, commandService, corePreferences, hoverService, contextKeyService);
    });
    bind(TheiaDockPanel.Factory).toFactory(({ container }) => (options?: DockPanel.IOptions, maximizeCallback?: (area: TheiaDockPanel) => void) => {
        const corePreferences = container.get<CorePreferences>(CorePreferences);
        return new TheiaDockPanel(options, corePreferences, maximizeCallback);
    });

    bindRootContributionProvider(bind, TabBarDecorator);
    bind(TabBarDecoratorService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TabBarDecoratorService);

    bindRootContributionProvider(bind, OpenHandler);
    bind(DefaultOpenerService).toSelf().inSingletonScope();
    bind(OpenerService).toService(DefaultOpenerService);

    bind(ExternalUriService).toSelf().inSingletonScope();
    bind(HttpOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(HttpOpenHandler);

    bind(CommandOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(CommandOpenHandler);

    bind(OpenWithService).toSelf().inSingletonScope();

    bind(TooltipServiceImpl).toSelf().inSingletonScope();
    bind(TooltipService).toService(TooltipServiceImpl);

    bindRootContributionProvider(bind, ApplicationShellLayoutMigration);
    bind<ApplicationShellLayoutMigration>(ApplicationShellLayoutMigration).toConstantValue({
        layoutVersion: 2.0,
        onWillInflateLayout({ layoutVersion }): void {
            throw ApplicationShellLayoutMigrationError.create(
                `It is not possible to migrate layout of version ${layoutVersion} to version ${this.layoutVersion}.`
            );
        }
    });

    bindRootContributionProvider(bind, ShellLayoutTransformer);

    bindRootContributionProvider(bind, WidgetFactory);
    bind(WidgetManager).toSelf().inSingletonScope();
    bind(ShellLayoutRestorer).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ShellLayoutRestorer);

    bindResourceProvider(bind);
    bind(InMemoryResources).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(InMemoryResources);

    bind(InMemoryTextResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(InMemoryTextResourceResolver);

    bind(UntitledResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(UntitledResourceResolver);

    bind(SelectionService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope().onActivation(({ container }, registry) => {
        WebSocketConnectionProvider.createHandler(container, commandServicePath, registry);
        return registry;
    });
    bind(CommandService).toService(CommandRegistry);
    bindRootContributionProvider(bind, CommandContribution);

    bind(ContextKeyService).to(ContextKeyServiceDummyImpl).inSingletonScope();

    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, MenuContribution);

    bind(KeyboardLayoutService).toSelf().inSingletonScope();
    bind(KeybindingRegistry).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, KeybindingContext);
    bindRootContributionProvider(bind, KeybindingContribution);

    bindMessageService(bind).onActivation(({ container }, messages) => {
        const client = container.get(MessageClient);
        WebSocketConnectionProvider.createHandler(container, messageServicePath, client);
        return messages;
    });

    bind(LanguageService).toSelf().inSingletonScope();

    bind(EncodingService).toSelf().inSingletonScope();
    bind(EncodingRegistry).toSelf().inSingletonScope();

    bind(ResourceContextKey).toSelf().inSingletonScope();
    bind(CommonFrontendContribution).toSelf().inSingletonScope();
    [FrontendApplicationContribution, CommandContribution, KeybindingContribution, MenuContribution, ColorContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(CommonFrontendContribution)
    );
    bind(SymbolIconColorContribution).toSelf().inSingletonScope();
    bind(ColorContribution).toService(SymbolIconColorContribution);

    bindCommonStylingParticipants(bind);

    bind(QuickCommandFrontendContribution).toSelf().inSingletonScope();
    [CommandContribution, KeybindingContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(QuickCommandFrontendContribution)
    );
    bind(QuickCommandService).toSelf().inSingletonScope();
    bind(QuickAccessContribution).toService(QuickCommandService);

    bind(QuickHelpService).toSelf().inSingletonScope();
    bind(QuickAccessContribution).toService(QuickHelpService);

    bind(QuickPickService).to(QuickPickServiceImpl).inSingletonScope().onActivation(({ container }, quickPickService: QuickPickService) => {
        WebSocketConnectionProvider.createHandler(container, quickPickServicePath, quickPickService);
        return quickPickService;
    });

    bind(CoreMarkdownRenderer).to(MarkdownRendererImpl).inSingletonScope();
    bind(MarkdownRenderer).toService(CoreMarkdownRenderer);
    bind(MarkdownRendererFactory).toFactory(({ container }) => () => container.get(MarkdownRenderer));

    bindRootContributionProvider(bind, QuickAccessContribution);
    bind(QuickInputFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QuickInputFrontendContribution);

    bind(LocalStorageService).toSelf().inSingletonScope();
    bind(StorageService).toService(LocalStorageService);

    bindStatusBar(bind);
    bind(LabelParser).toSelf().inSingletonScope();

    bindRootContributionProvider(bind, LabelProviderContribution);
    bind(LabelProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(LabelProvider);
    bind(DefaultUriLabelProviderContribution).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(DefaultUriLabelProviderContribution);
    bind(LabelProviderContribution).to(DiffUriLabelProviderContribution).inSingletonScope();

    bind(TreeLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(TreeLabelProvider);

    bindPreferenceService(bind);
    bind(FrontendApplicationContribution).toService(PreferenceService);

    bindRootContributionProvider(bind, JsonSchemaContribution);
    bind(JsonSchemaStore).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(JsonSchemaStore);
    bind(JsonSchemaDataStore).toSelf().inSingletonScope();
    bind(DefaultJsonSchemaContribution).toSelf().inSingletonScope();
    bind(JsonSchemaContribution).toService(DefaultJsonSchemaContribution);

    bind(PingService).toDynamicValue(ctx => {
        // let's reuse a simple and cheap service from this package
        const envServer: EnvVariablesServer = ctx.container.get(EnvVariablesServer);
        return {
            ping(): Promise<EnvVariable | undefined> {
                return envServer.getValue('does_not_matter');
            }
        };
    });
    bind(FrontendConnectionStatusService).toSelf().inSingletonScope();
    bind(ConnectionStatusService).toService(FrontendConnectionStatusService);
    bind(ApplicationConnectionStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ApplicationConnectionStatusContribution);

    bind(ApplicationServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<ApplicationServer>(applicationPath);
    }).inSingletonScope();

    bind(AboutDialog).toSelf().inSingletonScope();
    bind(AboutDialogProps).toConstantValue({ title: 'Theia' });

    bind(EnvVariablesServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<EnvVariablesServer>(envVariablesPath);
    }).inSingletonScope();

    bind(ThemeService).toSelf().inSingletonScope();

    bindCorePreferences(bind);
    bindTreePreferences(bind);

    bind(MimeService).toSelf().inSingletonScope();

    bind(ApplicationShellMouseTracker).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ApplicationShellMouseTracker);

    bind(ViewContainer.Factory).toFactory(context => (options: ViewContainerIdentifier) => {
        const container = context.container.createChild();
        container.bind(ViewContainerIdentifier).toConstantValue(options);
        container.bind(ViewContainer).toSelf().inSingletonScope();
        return container.get(ViewContainer);
    });

    bind(QuickViewService).toSelf().inSingletonScope();
    bind(QuickAccessContribution).toService(QuickViewService);

    bind(DialogOverlayService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(DialogOverlayService);

    bind(DispatchingProgressClient).toSelf().inSingletonScope();
    bind(ProgressLocationService).toSelf().inSingletonScope();
    bind(ProgressStatusBarItem).toSelf().inSingletonScope();
    bind(ProgressClient).toService(DispatchingProgressClient);
    bind(ProgressService).toSelf().inSingletonScope();
    bind(ProgressBarFactory).toFactory(context => (options: ProgressBarOptions) => {
        const childContainer = context.container.createChild();
        childContainer.bind(ProgressBarOptions).toConstantValue(options);
        childContainer.bind(ProgressBar).toSelf().inSingletonScope();
        return childContainer.get(ProgressBar);
    });

    bind(ContextMenuContext).toSelf().inSingletonScope();

    bind(AuthenticationService).to(AuthenticationServiceImpl).inSingletonScope();
    bind(DecorationsService).to(DecorationsServiceImpl).inSingletonScope();

    bind(KeyStoreService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<KeyStoreService>(keyStoreServicePath);
    }).inSingletonScope();

    bind(CredentialsService).to(CredentialsServiceImpl);

    bind(ContributionFilterRegistry).to(ContributionFilterRegistryImpl).inSingletonScope();
    bind(WindowContribution).toSelf().inSingletonScope();
    for (const contribution of [CommandContribution, KeybindingContribution, MenuContribution]) {
        bind(contribution).toService(WindowContribution);
    }
    bind(WindowTitleService).toSelf().inSingletonScope();
    bind(WindowTitleUpdater).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(WindowTitleUpdater);
    bindRootContributionProvider(bind, BreadcrumbsContribution);
    bind(BreadcrumbsService).toSelf().inSingletonScope();
    bind(BreadcrumbsRenderer).toSelf();
    bind(BreadcrumbsRendererFactory).toFactory(ctx =>
        () => {
            const childContainer = ctx.container.createChild();
            childContainer.bind(BreadcrumbRenderer).to(DefaultBreadcrumbRenderer).inSingletonScope();
            return childContainer.get(BreadcrumbsRenderer);
        }
    );
    bind(BreadcrumbPopupContainer).toSelf();
    bind(BreadcrumbPopupContainerFactory).toFactory(({ container }) => (parent: HTMLElement, breadcrumbId: string, position: Coordinate): BreadcrumbPopupContainer => {
        const child = container.createChild();
        child.bind(RendererHost).toConstantValue(parent);
        child.bind(BreadcrumbID).toConstantValue(breadcrumbId);
        child.bind(Coordinate).toConstantValue(position);
        return child.get(BreadcrumbPopupContainer);
    });

    bind(BackendRequestService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<RequestService>(ctx.container, REQUEST_SERVICE_PATH)
    ).inSingletonScope();

    bindFrontendStopwatch(bind);
    bindBackendStopwatch(bind);

    bind(SaveableService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SaveableService);
    bindRootContributionProvider(bind, SaveErrorChecker);

    bind(UserWorkingDirectoryProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(UserWorkingDirectoryProvider);

    bind(HoverService).toSelf().inSingletonScope();

    bind(StylingService).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, StylingParticipant);
    bind(FrontendApplicationContribution).toService(StylingService);

    bind(SecondaryWindowHandler).toSelf().inSingletonScope();
    bind(ViewColumnService).toSelf().inSingletonScope();

    bind(UndoRedoHandlerService).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, UndoRedoHandler);
    bind(DomInputUndoRedoHandler).toSelf().inSingletonScope();
    bind(UndoRedoHandler).toService(DomInputUndoRedoHandler);

    bind(WidgetAreaResolverImpl).toSelf().inSingletonScope();
    bind(WidgetAreaResolver).toService(WidgetAreaResolverImpl);
    bind(PerspectiveServiceImpl).toSelf().inSingletonScope();
    bind(PerspectiveService).toService(PerspectiveServiceImpl);
    bind(PerspectiveServiceInternal).toService(PerspectiveServiceImpl);
    bind(FrontendApplicationContribution).toService(PerspectiveServiceImpl);
    bind(CommandContribution).toService(PerspectiveServiceImpl);
    bindRootContributionProvider(bind, PerspectiveContribution);

    bind(WidgetStatusBarService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(WidgetStatusBarService);
    bindRootContributionProvider(bind, WidgetStatusBarContribution);
    bindBadgeDecoration(bind);
});
