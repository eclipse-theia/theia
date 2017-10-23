import { Client } from "webdriverio";

export class MainPage {

    constructor(private driver: Client<any>) {
    }

    clickMenuTab(tabNumber: number) {
        this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    hoverMenuTab(tabNumber: number) {
        this.driver.moveToObject(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    /**
     * Selects one of the side tabs.
     * @param index the (0 based) index of the tab. If not present, the first tab (with 0 index) will be selected.
     */
    clickSideTab(index: number = 0) {
        this.driver.click(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(${index})`);
    }

    clickFilesSideTab() {
        this.clickSideTab(1);
    }

    isFileNavigatorOpen(): Boolean {
        return this.isSideTabActive(1);
    }

    isSideTabActive(index: number = 0): Boolean {
        return this.driver.element(`.p-TabBar-content > .p-TabBar-tab:nth-child(${index})`).getAttribute('class').split(' ').indexOf('p-mod-current') === 1;
    }

    isTabActive(tabNumber: number) {
        return this.driver.element(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`).getAttribute('class').split(' ').indexOf('p-mod-active') !== -1;
    }

    waitForLoadingPanels() {
        this.driver.waitForExist('#theia-top-panel');
        this.driver.waitForVisible('#theia-main-content-panel');
    }

    isMainContentPanelLoaded(): boolean {
        return this.driver.element('#theia-main-content-panel').state === 'success';
    }

    isSubMenuShowing(): boolean {
        return this.driver.element('p-Widget.p-Menu.p-MenuBar-menu').state !== 'failure';
    }

    waitForLoadingMenu() {
        browser.waitForExist('.p-Widget.p-Menu.p-MenuBar-menu');
    }

    getxBarTabPosition(tabNumber: number): number {
        return browser.getLocation(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber}`, 'x');
    }

    getxMenuPosition(): number {
        return this.driver.getLocation('.p-Widget.p-Menu.p-MenuBar-menu', 'x');
    }
}