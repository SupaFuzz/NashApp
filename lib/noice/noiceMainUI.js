/*
    noiceMainUI.js
    this is the main screen
*/
import { noiceCoreUIOverlay, noiceCoreUIScreenHolder } from '../noice/noiceCoreUI.js';
import { noiceObjectCore } from '../noice/noiceCore.js';
import { noiceBalloonDialog } from '../noice/noiceBalloonDialog.js';

class noiceMainUI extends noiceCoreUIOverlay {


/*
    constructor
*/
constructor(args, defaults, callback){
    super(
        args,
        noiceObjectCore.mergeClassDefaults({
            _version: 1,
            _className: 'noiceMainUI',
            _headerHeight: '2em',
            _burgerMenuTitle: '',
            _showBurgerMenu: true,
            _burgerMenu: null,
            _defaultBurgerMenu: null,
            _locked: false,
            _UIs: {},
            _lastThreadMessage: {},
            useDefaultBurgerMenu: true,
            burgerMenuContainer: null,
            openBurgerMenuCallback: null,     // async function exexutes before putting burgerMenu on screen toot false to abort open
            burgerMenuOpenedCallback: null,  // function executes in the next animationFrame after placing the burgerMenu on the screen
            debug: false,
            closeBurgerMenuAfterSelect: false,
            menuItems: {}
        }, defaults),
        callback
    );
    this.setup()
}




/*
    html
*/
get html(){return(`
    <div class="rootLayoutContainer" style="
        display: grid;
        width: 100%;
        height: 100%;
        grid-template-rows: ${this.headerHeight} auto;
    ">
        <div class="header" style="
            display: grid;
            grid-template-columns: auto auto;
            align-items: center;
        ">
            <div class="titleContainer">
                <span class="title" data-templatename="title" data-templateattribute="true">${this.title}</span>
                <span class="subTitle" data-templatename="subTitle" data-templateattribute="true"></span>
            </div>
            <div class="btnContainer" style="
                display: flex;
                flex-direction: row-reverse;
            ">
                <button class="btnIndicator"></button>
                <button class="btnBurger"></button>
            </div>
        </div>
        <div class="main" style="overflow-y:auto;"></div>
    </div>
`);}




/*
    setup(self)
    perform these actions after render but before focus is gained
*/
setup(self){
    let that = this;

    // snag useful things
    that.btnContainer = that.DOMElement.querySelector('div.btnContainer');
    that.btnBurger = that.DOMElement.querySelector('button.btnBurger');
    that.main = that.DOMElement.querySelector('div.main');
    that.btnIndicator = that.DOMElement.querySelector('button.btnIndicator');

    // hook up the thread message viewer to btnIndicator
    that.btnIndicator.addEventListener('click', (evt) => { that.handleBtnIndicatorClick(evt); })

    // make a container for the burgerMenu to live in
    that.burgerMenuContainer = document.createElement('div');
    that.burgerMenuContainer.className = 'burgerMenu';

    // clickHandler for the burgerMenu
    that.btnBurger.addEventListener('click', (evt) => {
        that.btnBurger.disabled = true;
        requestAnimationFrame(() => {
            that.openBurgerMenu().catch((error) => {
                // loose end: do we wanna pop up or something here?
                that._app.log(`${that._className} v${that._version} | btnBurger.clickHandler() | openBurgerMenu() threw unexpectedly: ${error}`);
            }).then(() =>{
                that.btnBurger.disabled = false;
            });
        });
    });

    // disable burgerMenu by default (i'll get reactivated from the app thread when thread inits are completed)
    that.btnBurger.disabled = true;

    // make a uiHolder and put it in the main section
    that.uiHolder = new noiceCoreUIScreenHolder({fullscreen:false}).append(that.main);
}




/*
    UIs
*/
get UIs(){ return(this.uiHolder.UIList); }
set UIs(v){
    if (v instanceof Object){
        let that = this;
        requestAnimationFrame(() =>{
            // remove any UIs in the list that aren't in the new one
            Object.keys(that.uiHolder.UIList).filter((a)=>{return(! (v.hasOwnProperty(a)))}).forEach((uiName) => { that.uiHolder.removeUI(uiName); });
            // add or update
            Object.keys(v).forEach((uiName) => { that.uiHolder.addUI(v[uiName], uiName); });
        });
    }
}




/*
    defaultBurgerMenu
*/
get defaultBurgerMenu(){
    let that = this;

    // make one if we don't have one
    if (that.isNull(this._defaultBurgerMenu)){
        let dbm = document.createElement('div');
        dbm.className = 'defaultBurgerMenu';
        dbm.style.display = "grid";

        /*
            1/9/24 @ 1500 --
            ok this is all well and good and it works well  ... *however*
            and I know I already made it externally definable but I like this so much ...
            we need a way to inject items into the menu that aren't UIs.

            ok so maybe something like:
            menuItems: {
                <str>: { sortOrder: <int>, title: <str>, clickHandler: <function(evt)> },
                ...
            }

        */
        Object.keys(that.uiHolder.UIList).concat(Object.keys(that.menuItems)).sort((a,b) => {return(
            parseInt(that.uiHolder.UIList.hasOwnProperty(a)?that.uiHolder.UIList[a].sortOrder:that.menuItems[a].sortOrder) -
            parseInt(that.uiHolder.UIList.hasOwnProperty(b)?that.uiHolder.UIList[b].sortOrder:that.menuItems[b].sortOrder)
        )}).forEach((uiName) => {
            let btn = document.createElement('button');
            btn.className = "burgerMenuItem";
            if (that.uiHolder.UIList.hasOwnProperty[uiName] && that.uiHolder.UIList[uiName].hasOwnProperty('btnClass')){
                btn.classList.add(that.uiHolder.UIList[uiName].btnClass);
            }else if (that.menuItems.hasOwnProperty[uiName] && that.menuItems[uiName].hasOwnProperty('btnClass')){
                btn.classList.add(that.menuItems[uiName].btnClass);
            }
            btn.dataset.name = uiName;
            btn.dataset.selected = (that.uiHolder.currentUI == uiName);

            btn.textContent = (
                (that.uiHolder.UIList[uiName] instanceof Object) &&
                that.uiHolder.UIList[uiName].hasOwnProperty('title')
            )?that.uiHolder.UIList[uiName].title:(
                (that.menuItems[uiName] instanceof Object) &&
                that.menuItems[uiName].hasOwnProperty('title')
            )?that.menuItems[uiName].title:uiName;

            if (that.uiHolder.UIList[uiName] instanceof Object){
                btn.disabled = ((that.uiHolder.UIList[uiName].hasOwnProperty('disabled') && (that.uiHolder.UIList[uiName].disabled == true)));
                btn.addEventListener('click', (evt) => {
                    btn.disabled = true;
                    that.uiHolder.switchUI((btn.dataset.selected == 'true')?null:uiName).then(() => {

                        let b = (btn.dataset.selected == 'true');

                        // visually un-select everything, then reset this one if we didn't set null
                        dbm.querySelectorAll('button.burgerMenuItem').forEach((el) => {el.dataset.selected = false; });
                        if (! b){ btn.dataset.selected = 'true'; }

                        that.subTitle = b?'':`${btn.textContent}`;

                        // close the burgerMenu if we have the flag set
                        if (that.closeBurgerMenuAfterSelect == true){ that.burgerMenu.remove(); }

                    }).catch((error) => {
                        // this is not necessarily a bad error. could be something like a user abort to save a changeFlag or whatever
                        if (that.debug){ that._app.log(`${that._className} v${that._version} | defaultBurgerMenu() item click handler threw unexpectedly (probably user abort): ${error}`)}
                    });
                });
            }else if ((that.menuItems[uiName] instanceof Object) && (that.menuItems[uiName].clickHandler instanceof Function)){
                btn.addEventListener('click', (evt) => { that.menuItems[uiName].clickHandler(evt, that); })
            }

            dbm.appendChild(btn);
        });
        return(dbm);
    }
}



/*
    headerHeight(cssHeightValStr)
*/
get headerHeight(){ return(this._headerHeight); }
set headerHeight(v){
    let that = this;
    requestAnimationFrame(() => {
        that._headerHeight = v;
        if (that.DOMElement instanceof Element){
            let el = that.DOMElement.querySelector('div.rootLayoutContainer');
            if (el instanceof Element){
                el.style.gridTemplateRows = `${that.headerHeight} auto`;
            }
        }
    });
}




/*
    showBurgerMenu(bool)
*/
get showBurgerMenu(){ return(this._showBurgerMenu == true); }
set showBurgerMenu(v){
    let that = this;
    that._showBurgerMenu = (v == true);
    requestAnimationFrame(() => {
        if (that.btnBurger instanceof Element){
            that.btnBurger.style.display = that.showBurgerMenu?'block':'none';
        }
    })
}




/*
    burgerMenu
    override this externally if you need a more elaborate burger menu
*/
get burgerMenu(){
    let that = this;

    // make one if we haven't made one already.
    if (that.isNull(that._burgerMenu)){

        that._burgerMenu = new noiceBalloonDialog({
            title: that.burgerMenuTitle,
            hdrContent: '',
            dialogContent: that.burgerMenuContainer,
            setPosition: (selfReference) => {
                let b = that.btnBurger.getBoundingClientRect();

                selfReference.x = 0;
                let d = selfReference.DOMElement.querySelector('div.dialog').getBoundingClientRect();
                selfReference.y = (b.bottom + 5);
                selfReference.x = (b.right - d.width) - ((b.right - b.left) *.5) + 30;
            },
            burgerMenuContainer: that.burgerMenuContainer
        });
        that._burgerMenu.DOMElement.dataset.arrow='topRight';
    }

    // return it
    return(this._burgerMenu);
}
set burgerMenu(v){
    that._burgerMenu = v;
}




/*
    openBurgerMenu()
    place the burgerMenu on screen.
    if openBurgerMenuCallback is specified, await it, if it returns bool false DON'T open it
    if burgerMenuOpenedCallback is specified, execute in the next animationFrame after putting it onscreen
    if it boots or toots false, take it back off screen
    toots a bool. if we opened the window it's true, if one of the callbacks aborted,  false
*/
openBurgerMenu(){
    let that = this;
    return(new Promise((toot, boot) => {
        if (that.locked){
            toot(false);
        }else{
            new Promise((_t,_b)=>{
                if (that.openBurgerMenuCallback instanceof Function){
                    that.openBurgerMenuCallback(that.burgerMenu).then((openBool)=>{ _t(openBool); }).catch((e)=>{ _b(e); });
                }else{
                    _t(true);
                }
            }).then((openBool) => {
                if (openBool){
                    // if we have useDefaultBurgerMenu set true, just render a Ui switcher menu into it
                    if (that.useDefaultBurgerMenu == true){
                        that.burgerMenuContainer.innerHTML = '';
                        that.burgerMenuContainer.appendChild(that.defaultBurgerMenu);
                    }

                    that.burgerMenu.append(that.DOMElement);
                    if (that.burgerMenuOpenedCallback instanceof Function){
                        requestAnimationFrame(() => {
                            // note burgerMenuOpenedCallback cannot abort open, if you wanna close it from here you gon have to do it yourself
                            that.burgerMenuOpenedCallback(that.burgerMenu).catch((error) => {
                                that._app.log(`${that._className} v${that._version} | [ignored] openBurgerMenu() | burgerMenuOpenedCallback() threw unexpectedly: ${error}`);
                            }).then(() => {
                                toot(true);
                            });
                        });
                    }else{
                        toot(true);
                    }
                }else{
                    if (that.debug){ that._app.log(`${that._className} v${that._version} | openBurgerMenu() | openBurgerMenuCallback() aborted menu open: ${error}`); }
                    toot(false);
                }
            }).catch((error) => {
                that._app.log(`${that._className} v${that._version} | openBurgerMenu() | openBurgermenuCallback() threw unexpectedly: ${error}`);
                boot(error);
            });
        }
    }));
}




/*
    locked
*/
get locked(){ return(this._locked == true); }
set locked(v){
    this._locked = (v == true);
    requestAnimationFrame(() => {

        // insert ui element toggles here
        if (that.btnBurger instanceof Element){ that.btnBurger.disabled = that.locked; }

    });
}




/*
    threadMessage(data)
    receive a statusUpdate message from the syncWorker thread when startupDialog isn't up
*/
threadMessage(data){
    let that = this;
    // log it if we're in debug mode
    if (that.debug){ that._app.log(`${that._className} v${that._version} | syncWorkerMessage | ${
        ['message', 'detail', 'additionalDetail'].filter((a)=>{return(data.hasOwnProperty(a))}).map((a)=>{return(data[a])}).join(' | ')
    }`); }

    // stash the message and light up the btnIndicator
    that._lastThreadMessage = data;
    if (data.hasOwnProperty('runAnimation') && (data.runAnimation == true)){
        this.btnIndicator.dataset.status="pending";
    }else if (data.hasOwnProperty('_status')){
        this.btnIndicator.dataset.status=data._status;
    }else{
        this.btnIndicator.dataset.status='';
    }
}




/*
    handleBtnIndicatorClick(clickEvt)
    some curious soul clicked the btnIndicator, show them the startupDialog
    with the last received message
*/
handleBtnIndicatorClick(clickEvt){
    if (this.btnIndicatorCallback instanceof Function){
        this.btnIndicatorCallback(this);
    }
}




} // end noiceMainUI class
export { noiceMainUI };
