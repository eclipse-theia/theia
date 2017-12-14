import { Client } from "webdriverio";

export class MainPage {

    private driver: Client<any>;
    public constructor(driver: Client<any>) {
        this.driver = driver;
    }

    public clickMenuTab(tabNumber: number): void {
        this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    public hoverMenuTab(tabNumber: number): void {
        this.driver.moveToObject(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    public clickFilesSideTab(): void {
        this.driver.click('.p-TabBar-tab');
    }

    public isFileNavigatorOpen(): boolean {
        if (this.driver.element('#file-navigator').getAttribute('class').split(' ').indexOf('p-mod-hidden') !== -1) {
            return false;
        } else {
            return true;
        }
    }

    public isTabActive(tabNumber: number) {
        if (this.driver.element(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`).getAttribute('class')
            .split(' ').indexOf('p-mod-active') !== -1) {
            return true;
        } else {
            return false;
        }
    }

    public waitForLoadingPanels(): void {
        this.driver.waitForExist('#theia-top-panel');
        this.driver.waitForExist('#theia-main-content-panel');
    }

    public isMainContentPanelLoaded(): boolean {
        return (this.driver.element('#theia-main-content-panel').isExisting());
    }

    public isSubMenuShowing(): boolean {
        if (this.driver.element('p-Widget.p-Menu.p-MenuBar-menu').state === 'failure') {
            return false;
        } else {
            return true;
        }
    }

    public waitForLoadingMenu(): void {
        browser.waitForExist('.p-Widget.p-Menu.p-MenuBar-menu');
    }

    public getxBarTabPosition(tabNumber: Number): number {
        return browser.getLocation(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber}`, 'x');
    }

    public getxMenuPosition(): number {
        return this.driver.getLocation('.p-Widget.p-Menu.p-MenuBar-menu', 'x');
    }
}
