/*
    wcLeftPanelLayout.js
    Amy Hicox <amy@hicox.com> 8/16/24

    ------------------------------
    |          |                 |
    |  ctrl    |      main       |
    |          |                 |
    ------------------------------
    (open)

    ------------------------------
    | |                           |
    |>|          main             |
    | |                           |
    ------------------------------
    (closed)

    like that
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';
class wcLeftPanelLayout extends noiceAutonomousCustomElement {

static classID = wcLeftPanelLayout;
static classAttributeDefaults = {
    open: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true },
    minimize_buttons: { observed: true, accessor: true, type: 'bool', value: true, forceInit: true },
    title: { observed: true, accessor: true, type: 'elementAttribute', value: '' },
    content: { observed: true, accessor: true, type: 'elementAttribute', value: '' },
    vertical_offset: { observed: true, accessor: true, type: 'str', value: '0px', forceAttribute: true, forceInit: true },
    control_panel_height: { observed: true, accessor: true, type: 'str', value: 'auto', forceAttribute: true, forceInit: true },
}
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });
static classStyleDefaults = {

    'panel-background': { value: 'radial-gradient(ellipse at bottom right, rgba(53, 57, 59, .4), rgba(53, 57, 59, .3), rgba(53, 57, 59, .2),rgba(53, 57, 59, .1), rgba(53, 57, 59, 0))', global: true },
    'panel-background-color': { value: 'rgb(2, 6, 9)', global: true },
    'panel-border': { value: '.128em solid rgba(240, 240, 240, .2)', global: true },
    'panel-border-width': { value: '.128em', global: true },
    'panel-border-style': { value: 'solid', global: true },
    'panel-border-color': { value: 'rgba(240, 240, 240, .2)', global: true },
    'panel-split': { value: '33% 67%', global: true },
    'content-background': { value: 'linear-gradient(rgba(240, 240, 240,.18), rgba(240, 240, 240,0), rgba(240, 240, 240,0))', global: true },
    'content-background-color': { value: 'rgb(2, 6, 9)', global: true },
    'handle-background': { value: 'none', global: true },
    'handle-background-color': { value: 'rgb(5, 15, 20)', global: true },
    'handle-width': { value: '1.5em', global: true },
    'control-panel-background': { value: 'linear-gradient(rgba(240, 240, 240,.18), rgba(240, 240, 240,0), rgba(240, 240, 240,0))', global: true },
    'control-panel-background-color': { value: 'rgb(2, 6, 9)', global: true },
    'control-panel-border': { value: '.064em solid rgba(240, 240, 240, .2)', global: true },
    'control-panel-box-shadow': { value: '0 .128em .128em rgba(20, 22, 23, .3)', global: true },
    'control-panel-height': { value: 'auto', global: true },
    'close-button-color': { value: 'rgb(240, 240, 240)', global: true},
    'close-button-font-size': { value: '.85em', global: true },
    'close-button-font-family': { value: 'Comfortaa', global: true },
    'title-font-size': { value: '1em', global: true },
    'title-font-family': { value: 'Comfortaa', global: true },
    'title-color': { value: 'rgb(240, 240, 240)', global: true },
    'handle-color': { value: 'rgb(240, 240, 240)', global: true },
    'vertical-offset': { value: '0px', global: true }
};




/*
    constructor
*/
constructor(args){
    super(args);
    this._className = 'wcLeftPanelLayout';
    this._version = 1;
    this._listeners = {};
    this.cssVarPrefix = '--wc-leftpanellayout';
    this._buttonQueue = [];

    this.attributeDefaults = JSON.parse(JSON.stringify(wcLeftPanelLayout.classAttributeDefaults));
    this.initConstructorArgs(args);
    this.spawnAttributeAccessors();

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        open: (name, oldVal, newVal, selfRef) => {
            setTimeout(() => {
                if (selfRef.minimize_buttons == true){ selfRef.moveButtonContainer(newVal == false); }
                selfRef.dispatchEvent(new CustomEvent("panel_toggle", { detail: { open: selfRef.open, self: selfRef } }));
            }, 420);
        },
        minimize_buttons: (n,o,v,s) => { s.toggleMinimizeButtons(v); },
        vertical_offset: (name, oldValue, newValue, slf) => {
            if (slf.initialized){
                slf.setStyleVar('vertical-offset', slf.isNotNull(newValue)?newValue:'0px', {global: true});
            }
        },
        control_panel_height: (name, oldValue, newValue, slf) => {
            if (slf.initialized){
                slf.setStyleVar('control-panel-height', slf.isNotNull(newValue)?newValue:'auto', {global: true});
            }
        }
    }
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcLeftPanelLayout.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcLeftPanelLayout.classStyleDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.insertAdjacentHTML('afterbegin', `
        <div data-_name="leftMenu">
            <div data-_name="menuContent">
                    <div data-_name="ctlPnl">
                        <div class="controlPanel" data-_name="controlPanel">
                            <button data-_name="btnClose">close</button>
                            <slot name="button-container" data-_name="button-container"><div data-_name="buttonContainer"></div></slot>
                        </div>
                        <slot name="left-title"><h3 data-_name="title"></h3></slot>
                    </div>
                    <div class="leftContent"><slot name="left-content" data-_name="left-content"></slot></div>
            </div>
            <div data-_name="handle"></div>
        </div>

        <div data-_name="main">
            <slot name="main-content" data-_name="main-content"></slot>
        </div>
    `);
    return(div);
}




/*
    initializedCallback(slf)
*/
initializedCallback(){
    let that = this;
    that._elements.btnClose.addEventListener('click', (evt) => {
        that._elements.handle.click();
    });

    that._elements.handle.addEventListener('click', (evt) => {
        that.open = (!(that.open == true));
    });

    // dequeue the _buttonQueue if we have one
    this._buttonQueue = this._buttonQueue.sort((a,b) => {return(a.order - b.order)});
    while (this._buttonQueue.length > 0){ that.addButton(that._buttonQueue.shift()); }

    if (that.initCallback instanceof Function){ that.initCallback(that); }

}




/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
    }
    :host([open="true"]) div.${this._className} {
        grid-template-columns: ${this.styleVar('panel-split')};
    }
    div.${this._className} {
        display: grid;
        /*grid-template-columns: 1.6em auto;*/
        grid-template-columns: calc(${this.styleVar('handle-width')} + ${this.styleVar('panel-border-width')}) auto;
        width: 100%;
        height: 100%;
        transition: grid-template-columns .4s ease-in-out;
    }
    :host([open="true"]) div[data-_name="leftMenu"]{
        grid-template-columns: auto 0em;
    }
    div[data-_name="leftMenu"]{
        background: ${this.styleVar('panel-background')};
        background-color: ${this.styleVar('panel-background-color')};
        display: grid;
        grid-template-columns: auto ${this.styleVar('handle-width')};
        overflow-y: hidden;
        transition: grid-template-columns .4s ease-in-out;
        border-right: ${this.styleVar('panel-border-width')} ${this.styleVar('panel-border-style')} ${this.styleVar('panel-border-color')};
        position: relative;
    }
    div[data-_name="menuContent"]{
        display: grid;
        grid-template-rows: auto auto;
        height: calc(100vh - ${this.styleVar('vertical-offset')});
        align-content: baseline;
    }
    div.leftContent {
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: thin;
        display: block;
    }
    div[data-_name="handle"]{
        color: ${this.styleVar('handle-color')};
        background: ${this.styleVar('handle-background')};
        background-color: ${this.styleVar('handle-background-color')};
        display: grid;
        place-items: center;
        position: relative;
    }
    :host([open="false"]) div[data-_name="handle"]:hover:after{
        content: '\\25B6';
    }
    :host([open="false"]) div[data-_name="handle"]:after{
        content: '\\25B7';
    }
    div[data-_name="main"]{
        background: ${this.styleVar('content-background')};
        background-color: ${this.styleVar('content-background-color')};
        overflow-y: auto;
    }
    :host([open="false"]) div[data-_name="ctlPnl"]{
        display: none;
    }
    div[data-_name="ctlPnl"]{
        display: grid;
        background: ${this.styleVar('control-panel-background')};
        background-color: ${this.styleVar('control-panel-background-color')};
        border-bottom: ${this.styleVar('control-panel-border')};
        box-shadow: ${this.styleVar('control-panel-box-shadow')};
        min-height: ${this.styleVar('control-panel-height')};
        z-index: 1;
    }
    div[data-_name="handle"] div[data-_name="buttonContainer"]{
        position: absolute;
        top: 0;
        display: grid;
    }
    div[data-_name="buttonContainer"]{
        width: 100%;
        display: flex;
        flex-direction: row-reverse;
    }
    div.controlPanel {
        display: flex;
    }
    button[data-_name="btnClose"]:hover {
        opacity: 1;
    }
    button[data-_name="btnClose"]{
        background-color: transparent;
        border: none;
        color: ${this.styleVar('close-button-color')};
        font-size: ${this.styleVar('close-button-font-size')};
        font-family: ${this.styleVar('close-button-font-family')};
        opacity: .6;
    }
    /* this horks up on macos?!
    button[data-_name="btnClose"]:hover:before {
        content: '\\25C0';
        padding-right: .25em;
    }
    */
    button[data-_name="btnClose"]:before {
        content: '\\2B9C';
        padding-right: .25em;
    }
    div[data-_name="buttonContainer"] button.icon:hover:not(:disabled) {
        opacity: 1;
    }
    div[data-_name="buttonContainer"] button.icon:disabled {
        opacity: .2;
        filter: grayscale(.9);
    }
    div[data-_name="buttonContainer"] button.icon {
        background-color: transparent;
        border: none;
        font-size: 1em;
        opacity: .5;
        color: ${this.styleVar('close-button-color')};
        width: ${this.styleVar('handle-width')};
        height: ${this.styleVar('handle-width')};
        margin-right: .25em;
    }
    h3[data-_name="title"]{
       margin: .75em 0 .25em 1.25em;
       font-size: ${this.styleVar('title-font-size')};
       font-family: ${this.styleVar('title-font-family')};
       color: ${this.styleVar('title-color')};
    }
`)};




/*
    toggleMinimizeButtons(bool)
    toggle the minimize_buttons bool.
    if moving from true to false, move buttons back to controlPanel
*/
toggleMinimizeButtons(bool){
    if (bool == false){
        let el = this._elements.handle.querySelector('div[data-_name="buttonContainer"]');
        if (el instanceof Element){ this.moveButtonContainer(false); }
    }else if ((bool == true) && (this.open == false)){
        let el = this._elements.controlPanel.querySelector('div[data-_name="buttonContainer"]');
        if (el instanceof Element){ this.moveButtonContainer(true); }
    }
}




/*
    moveButtonContainer(toHandleBool)
    move the buttonContainer from the ControlPanel to the Handle if
    toHandleBool is true, else from the handle to the controlpanel
*/
moveButtonContainer(toHandleBool){
    if (toHandleBool === true){
        this._elements.handle.appendChild(this._elements.buttonContainer);
    }else{
        this._elements.controlPanel.appendChild(this._elements.buttonContainer);
    }
}




/*
    panelToggleCallback
    setup a callback that fires on toggle_panel
*/
set panelToggleCallback(f){ if (f instanceof Function){
    this.addEventListener('panel_toggle', (evt) => { f(evt.detail.open, evt.detail.self); });
}}




/*
    addButton({
        name: <str>
        callback: <function(btnRef, slfRef, evt)>,
        element: Element.button
        icon: <bool>
        order: <int>
    })

    add an externally defined button to the buttonContainer

        * name: a unique string. you'll need this for removeButton for instance

        * callback: the function to call when it's clicked, this dispatches the event `${name}_button_click`
          and we automatically bind the function you sent to an event handler for it

        * element: the actual button element. I mean you could send something else but
          the layout's gonna expect to treat it as a 1em x 1em icon button

        * icon: <bool> - set false if you don't want the 1em x 1em icon button styles applied

        * order: we're gonna sort by this when appending the buttons
*/
addButton(args){
    let that = this;
    if (
        (args instanceof Object) &&
        (args.element instanceof Element) &&
        args.hasOwnProperty('name') &&
        that.isNotNull(args.name) &&
        args.hasOwnProperty('order') &&
        (! isNaN(parseFloat(args.order)))
    ){
        if (that.initialized){
            args.element.dataset.name = args.name;
            args.element.dataset.order = args.order;
            if (args.hasOwnProperty('icon') && (args.icon == true)){ args.element.classList.add('icon'); }else{ args.element.classList.remove('icon'); }
            args.element.addEventListener('click', (evt) => {
                evt.stopPropagation();
                that.dispatchEvent(new CustomEvent(`${args.name}_button_click`, { detail: {
                    button: args.element,
                    self: that
                }}));
            });
            if (args.callback instanceof Function){
                that.addEventListener(`${args.name}_button_click`, (evt) => { args.callback(evt.detail.button, evt.detail.self, evt) });
            }
            that._elements.buttonContainer.appendChild(args.element);

            // sort 'em
            requestAnimationFrame(() => {
                Array.from(that._elements.buttonContainer.querySelectorAll('button')).sort((a,b) => {return(
                    parseFloat(a.dataset.order) - parseFloat(b.dataset.order)
                )}).forEach((el) => { that._elements.buttonContainer.appendChild(el); });
            });

        }else{
            this._buttonQueue.push(args);
        }

    }else{
        throw(`${that._className} v${that._version} | addButton() | invalid input`);
    }
}




}
const _classRegistration = wcLeftPanelLayout.registerElement('wc-left-panel-layout');
export { _classRegistration as wcLeftPanelLayout };
