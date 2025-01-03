/*
    wcCollapsibleObject.js
    8/22/24 Amy Hicox <amy@hicox.com>

    this is a wrapper for external content that is collapsible with a handle

    you can either use the 'content' elementAttribute or embed HTML content
    with the "content" slot
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';

class wcCollapsibleObject extends noiceAutonomousCustomElement {

static classID = wcCollapsibleObject;
static classAttributeDefaults = {
    open: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    open_height: { observed: true, accessor: true, type: 'str', value: 'auto', forceAttribute: true, forceInit: true },
    disabled: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    content: { observer: true, accessor: true, type: 'elementAttribute', value: '' },
    handle_indicator: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    click_to_collapse: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    open_handle_border_bottom: { observed: true, accessor: true, type: 'str', value: 'none', forceAttribute: true, forceInit: true },
}
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });
static classStyleDefaults = {
    'open-height': { value: 'auto', global: true },
    'open-transition': { value: '.5s ease-in', global: true },
    'disabled-opacity': { value: '.5', global: true },
    'disabled-filter': { value: 'grayscale(.9)', global: true },
    'scrollbar-width': { value: 'thin', global: true },
    'scrollbar-gutter': { value: 'stable', global: true },
    'open-handle-border-bottom': { value: 'none', global: true }
}




/*
    constructor
*/
constructor(args){
    super();
    this._className = 'wcCollapsibleObject';
    this._version = 1;
    this.cssVarPrefix = '--wc-collapsible';

    this.attributeDefaults = JSON.parse(JSON.stringify(wcCollapsibleObject.classAttributeDefaults));
    this.initConstructorArgs(args);
    this.spawnAttributeAccessors();

    this.attributeChangeHandlers = {
        open: (name, oldValue, newValue, slf) => {
            slf.dispatchEvent(new CustomEvent("collapse", { detail: { self: slf, open: newValue }}));
        },
        open_height: (name, oldValue, newValue, slf) => {
            if (slf.initialized){
                slf.setStyleVar('open-height', slf.isNotNull(newValue)?newValue:'auto', {global: true});
            }
        },
        open_handle_border_bottom: (name, oldValue, newValue, slf) => {
            if (slf.initialized){
                slf.setStyleVar('open-handle-border-bottom', slf.isNotNull(newValue)?newValue:'none', {global: true});
            }
        }
    };

}



/*
    collapseCallback
*/
set collapseCallback(f){ if (f instanceof Function){
    this.addEventListener('collapse', (evt) => { f(evt.detail.selected, evt.detail.self); });
}}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcCollapsibleObject.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcCollapsibleObject.classStyleDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    /*
        OKAAAAYYYY! and templating without a <template>
        based on the element content is just that easy?!
        w00t!

        LOH 8/22/24 @ 1613
        ok, now we know how to wrap element content
        we'll need to embed css for the POMenuItems or whatever
        but I actually think that's fine to put in the global scope

        next up we need to flesh this out with the select callbacks
        n stuff. Play around with it, see what the most sane way
        to do this might be

        I'm afraid of making too light weight of a wrapper and just
        building a brand new precious class dependent mess.

        very cool to figure out how to do slots though. I like that alot
    */

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.insertAdjacentHTML('afterbegin', `
        <div data-_name="handleContainer">
            <div class="handle">
                <slot name="handle" data-_name="handle"></slot>
            </div>
        </div>
        <div class="content"><slot name="content" data-_name="content"></slot></div>
    `);
    return(div);
}




/*
    initializedCallback(slf)
    anything you need to do only once, but *after* everything is rendered
    and this.initialized is set.

    this is called from .initialize() and .setType() (sometimes)
*/
initializedCallback(){
    let that = this;
    this.DOMElement.querySelector('div[data-_name="handleContainer"]').addEventListener('click', (evt) => {
        if ((! that.disabled) && (that.click_to_collapse)){ that.open = (! that.open); }
    });
    if (this.initCallback instanceof Function){ this.initCallback(this); }
}




/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        display: block;
        position: relative;
    }
    :host([disabled="true"]){
        opacity: ${this.styleVar('disabled-opacity')};
        filter: ${this.styleVar('disabled-filter')};
    }
    .content {
        height: ${this.styleVar('open-height')};
        display: block;
        overflow: auto;
        transition: height ${this.styleVar('open-transition')};
        scrollbar-width: ${this.styleVar('scrollbar-width')};
        scrollbar-gutter: ${this.styleVar('scrollbar-gutter')};
    }
    :host([open="false"]) .content {
        height: 0px;
    }
    .handle {
        cursor: default;
        user-select: none;
    }
    :host([open="true"]) .handle {
        border-bottom: ${this.styleVar('open-handle-border-bottom')};
    }
    :host([open="true"]) .handle:before {
        transform: rotate(90deg);
    }
    :host([handle_indicator="true"]) .handle:before {
        transition: all ${this.styleVar('open-transition')};
        content: '\\25B6';
        display: inline-block;
        padding: .25em;
    }
`)};



}
const _classRegistration = wcCollapsibleObject.registerElement('wc-collapsible-object');
export { _classRegistration as wcCollapsibleObject };
