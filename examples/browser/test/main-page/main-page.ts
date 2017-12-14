import "webdriverio";
import { TopPanel } from '../top-panel/top-panel';
import { LeftPanel } from '../left-panel/left-panel';

export class MainPage {

    protected readonly topPanel: TopPanel;
    protected readonly leftPanel: LeftPanel;

    constructor(protected readonly driver: WebdriverIO.Client<void>) {
        this.topPanel = new TopPanel(driver);
        this.leftPanel = new LeftPanel(driver);
    }

    mainContentPanelExists(): boolean {
        return this.driver.waitForExist('#theia-main-content-panel');
    }

    applicationShellExists(): boolean {
        return this.driver.waitForExist('#theia-main-content-panel');
    }

    theiaTopPanelExists(): boolean {
        return this.driver.waitForExist('#theia-top-panel');
    }

    rightSideBarExists(): boolean {
        return this.driver.waitForExist('div.theia-SideBar.theia-mod-right');
    }

    leftSideBarExists(): boolean {
        return this.driver.waitForExist('div.theia-SideBar.theia-mod-left');
    }

    statusBarExists(): boolean {
        return this.driver.waitForExist('div#theia-statusBar');
    }

    isTerminalVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.terminal.xterm');
    }

    isProblemsViewVisible(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-marker-container');
    }

    closeTerminal() {
        this.driver.rightClick('.p-Widget.p-TabBar .p-TabBar-tab[title*=Terminal]');
        this.driver.element(`.p-Widget.p-Menu .p-Menu-content`).click(`div\=Close`);
    }

    closeProblemsView() {
        this.driver.element(`.p-Widget.p-TabBar .p-TabBar-tab.p-mod-closable`).rightClick(`div\=Problems`);
        this.driver.element(`.p-Widget.p-Menu .p-Menu-content`).click(`div\=Close`);
    }

    closeAll() {
        /* Make sure that all the "docked" layouts are closed */
        while (this.driver.isExisting(`.p-Widget.p-TabBar .p-TabBar-tab.p-mod-closable`)) {
            this.driver.rightClick(`.p-Widget.p-TabBar .p-TabBar-tab.p-mod-closable`);
            this.driver.element(`.p-Widget.p-Menu .p-Menu-content`).click(`div\=Close All`);
        }
    }
}
