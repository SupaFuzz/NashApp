/*
    wcToggle.js
    8/15/24 Amy Hicox <amy@hicox.com>
    your standard iOS style toggler

    [()   ] <label>
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';

class wcToggle extends noiceAutonomousCustomElement {

static classID = wcToggle;
static classAttributeDefaults = {
    on: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    disabled: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    label: { observed: true, accessor: true, type: 'elementAttribute', value: '' },
    label_position: { observed: true, accessor: true, type: 'enum', value: 'right', values: ['left', 'right', 'none'], forceAttribute: true },
}
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });
static classStyleDefaults = {
    'on-gutter-color': { value: 'rgb(13, 104, 15)', global: true },
    'off-gutter-color': { value: 'rgb(31, 33, 36)', global: true },
    'gutter-background': { value: 'radial-gradient(ellipse at top left, rgba(240, 240, 240, .25), rgba(240, 240, 240, .1), rgba(0, 0, 0, .13))', global: true },
    'gutter-box-shadow': { value: '2px 2px 2px rgba(20, 22, 23, .3) inset', global: true },
    'gutter-border': { value: '.128em solid rgba(240, 240, 240, .5)', global: true },
    'gutter-height': { value: '2em', global: true},
    'gutter-width': { value: '3.25em', global: true },
    'gutter-radius': { value: '1.5em', global: true },
    'knob-color': { value: 'rgba(240, 240, 240, .75)', global: true },
    'knob-background': { value: 'radial-gradient(ellipse at top left, rgba(240, 240, 240, .25), rgba(240, 240, 240, .1), rgba(0, 0, 0, .13))', global: true },
    'knob-box-shadow': { value: '2px 2px 2px rgba(20, 22, 23, .1)', global: true },
    'knob-size': { value: '1.5em', global: true },
    'knob-margin': { value: '.25em', global: true },
    'label-font-size': { value: '1.25em', global: true },
    'label-font-family': { value: 'Comfortaa', global: true },
    'label-color': { value: 'rgba(240, 240, 240, .75)', global: true },
}




/*
    constructor
*/
constructor(args){
    super();
    this._className = 'wcToggle';
    this._version = 1;
    this.cssVarPrefix = '--wc-toggle';

    this.attributeDefaults = JSON.parse(JSON.stringify(wcToggle.classAttributeDefaults));
    this.initConstructorArgs(args);
    this.spawnAttributeAccessors();

}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcToggle.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcToggle.classStyleDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.insertAdjacentHTML('afterbegin', `<div data-_name="gutter"><span data-_name="knob"></span></div><span data-_name="label"></span>`);
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
    this.addEventListener('click', (evt) => {
        evt.stopPropagation();
        if (! that.disabled){
            that.on = (! (that.on == true));
            that.captureValue();
        }
    });
}




/*
    captureValue()
*/
captureValue(){
    this.dispatchEvent(new CustomEvent("capture_value", { detail: {
        value: this.on,
        self: this
    }}));
}




/*
    captureValueCallback setter
*/
set captureValueCallback(f){
    if (f instanceof Function){
        this.addEventListener('capture_value', (evt) => { f(evt.detail.value, evt.detail.self); });
    }
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
        opacity: .5;
        filter: grayscale(.9);
    }
    :host([on="true"]) span[data-_name="knob"]{
        justify-self: right;
    }
    :host([on="false"]) span[data-_name="knob"]{
        justify-self: left;
    }
    :host([on="true"]) div[data-_name="gutter"]{
        background-color: ${this.styleVar('on-gutter-color')};
    }
    :host([on="false"]) div[data-_name="gutter"]{
        background-color: ${this.styleVar('off-gutter-color')};
    }
    :host([label_position="left"]) div.${this._className} {
        flex-direction: row-reverse;
    }
    :host([label_position="none"]) span[data-_name="label"] {
        display: none;
    }
    div.${this._className} {
        display: flex;
        align-items: center;
    }
    div[data-_name="gutter"]{
        background: ${this.styleVar('gutter-background')};
        transition: background-color .128s ease-in-out;
        border: ${this.styleVar('gutter-border')};
        box-shadow: ${this.styleVar('gutter-box-shadow')};
        display: grid;
        align-items: center;

        /* remove eventually? */
        height: ${this.styleVar('gutter-height')};
        width:  ${this.styleVar('gutter-width')};
        border-radius: ${this.styleVar('gutter-radius')};
    }
    span[data-_name="knob"]{
        border-radius: 50%;
        background: ${this.styleVar('knob-background')};
        background-color: ${this.styleVar('knob-color')};
        box-shadow: ${this.styleVar('knob-box-shadow')};
        height: ${this.styleVar('knob-size')};
        width: ${this.styleVar('knob-size')};
        margin-right: ${this.styleVar('knob-margin')};
        margin-left: ${this.styleVar('knob-margin')};
    }
    :host([label_position="left"]) span[data-_name="label"]{
        margin-right: .25em;
    }
    span[data-_name="label"]{
        font-size: ${this.styleVar('label-font-size')};
        font-family: ${this.styleVar('label-font-family')};
        color: ${this.styleVar('label-color')};
        margin-left: .25em;
    }
`)};



}
const _classRegistration = wcToggle.registerElement('wc-toggle');
export { _classRegistration as wcToggle };
