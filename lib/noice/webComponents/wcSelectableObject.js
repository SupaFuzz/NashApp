/*
    wcSelectableObject.js
    8/22/24 Amy Hicox <amy@hicox.com>

    this is a wrapper for external content that is selectable

    the selectCallback is fired on the 'select' event and is not async
    if you need to manage select state aborts etc you gotta do it externally

    you can either use the 'content' elementAttribute or embed HTML content
    with the "content" slot
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';

class wcSelectableObject extends noiceAutonomousCustomElement {

static classID = wcSelectableObject;
static classAttributeDefaults = {
    display: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true },
    selected: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    disable_callbacks: { observed: true, accessor: true, type: 'bool', value: false },
    loading: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    saved: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    cloned: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    disabled: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    content: { observed: true, accessor: true, type: 'elementAttribute', value: '' },
    loading_message: { observed: true, accessor: true, type: 'elementAttribute', value: 'loading ...' },
    selected_background: { observed: true, accessor: true, type: 'str', value: '', forceAttribute: true, forceInit: true },
    selected_background_color: { observed: true, accessor: true, type: 'str', value: '', forceAttribute: true, forceInit: true },
}
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });
static classStyleDefaults = {
    'selected-background': { value: 'none', global: true },
    'selected-background-color': { value: 'rgba(240, 240, 240, .5)', global: true },
    'background-color': { value: 'transparent', global: true },
    'disabled-opacity': { value: '.5', global: true },
    'disabled-filter': { value: 'grayscale(.9)', global: true },
    'loading-background-color': { value: 'rgba(53, 53, 53, .5)', global: true },
    'loading-foreground-color': { value: 'rgba(240, 240, 240, .8)', global: true },
    'loading-background-color-animation-target': { value: 'rgba(6, 133, 135, .5)', global: true },
    'saved-background-color':  { value: 'rgb(0, 153, 0)', global: true },
    'saved-animation-duration': { value: '.75s', global: true },
    'cloned-background-color':  { value: 'rgb(242, 177, 52)', global: true },
    'cloned-animation-duration': { value: '.75s', global: true }
}




/*
    constructor
*/
constructor(args){
    super();
    this._className = 'wcSelectableObject';
    this._version = 1;
    this.cssVarPrefix = '--wc-selectable';

    this.attributeDefaults = JSON.parse(JSON.stringify(wcSelectableObject.classAttributeDefaults));
    this.initConstructorArgs(args);
    this.spawnAttributeAccessors();

    this.attributeChangeHandlers = {
        selected: (name, oldValue, newValue, slf) => {
            if (! slf.disable_callbacks){
                slf.dispatchEvent(new CustomEvent("select", { detail: { self: slf, selected: newValue }}));
            }
        },
        selected_background: (n, o, v, s) => {
            s.setStyleVar('selected-background', s.isNotNull(v)?v:'none', {global: s.isNull(v)})
        },
        selected_background_color: (n, o, v, s) => {
            s.setStyleVar('selected-background-color', s.isNotNull(v)?v:'rgba(240, 240, 240, .5)', {global: s.isNull(v)})
        },
        saved: (n, o, v, s) => {
            if (v == true){
                let t = parseFloat(s.styleVars['saved-animation-duration'].value) * 1000;
                setTimeout(() => {s.saved = false;}, t);
            }
        },
        cloned: (n, o, v, s) => {
            if (v == true){
                let t = parseFloat(s.styleVars['cloned-animation-duration'].value) * 1000;
                setTimeout(() => {s.cloned = false;}, t);
            }
        }
    };

}



/*
    selectCallback
*/
set selectCallback(f){ if (f instanceof Function){
    this.addEventListener('select', (evt) => { f(evt.detail.selected, evt.detail.self); });
}}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcSelectableObject.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcSelectableObject.classStyleDefaults);
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
        <slot name="content" data-_name="content"></slot>
        <div data-_name="loadingMessageFrame">
            <slot name="loading_message" data-_name="loading_message">loading ...</slot>
        </div>
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

    this.addEventListener('click', (evt) => {
        if (! that.disabled){ that.selected = (! that.selected); }
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
        background-color: ${this.styleVar('background-color')};
    }
    :host([display="false"]){
        display: none;
    }
    :host([disabled="true"]){
        opacity: ${this.styleVar('disabled-opacity')};
        filter: ${this.styleVar('disabled-filter')};
    }
    :host([selected="true"]) {
        background: ${this.styleVar('selected-background')};
        background-color: ${this.styleVar('selected-background-color')};
    }
    :host([selected="true"][saved="true"]){
        animation: savedAnimationSelected ${this.styleVar('saved-animation-duration')} ease-out;
    }
    :host([selected="false"][saved="true"]){
        animation: savedAnimation ${this.styleVar('saved-animation-duration')} ease-out;
    }
    :host([selected="true"][cloned="true"]){
        animation: clonedAnimationSelected ${this.styleVar('cloned-animation-duration')} ease-out;
    }
    :host([selected="false"][cloned="true"]){
        animation: clonedAnimation ${this.styleVar('cloned-animation-duration')} ease-out;
    }
    div[data-_name="loadingMessageFrame"]{
        display: none;
    }
    :host([loading="true"]) div[data-_name="loadingMessageFrame"] {
        display: grid;
        place-items: center;
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 100%;
        background-color: ${this.styleVar('loading-background-color')};
        color: ${this.styleVar('loading-foreground-color')};
        animation: loadingAnimation 1.5s ease-in-out infinite;
    }
    @keyframes loadingAnimation {
        0%  { background-color: ${this.styleVar('loading-background-color')}; }
        50% { background-color: ${this.styleVar('loading-background-color-animation-target')}; }
        0%  { background-color: ${this.styleVar('loading-background-color')}; }
    }
    @keyframes savedAnimation {
        0%  { background-color: ${this.styleVar('saved-background-color')}; }
        100%{ background-color: ${this.styleVar('background-color')}; }
    }
    @keyframes savedAnimationSelected {
        0%  { background-color: ${this.styleVar('saved-background-color')}; }
        100%{ background-color: ${this.styleVar('selected-background-color')}; }
    }
    @keyframes clonedAnimation {
        0%  { background-color: ${this.styleVar('cloned-background-color')}; }
        100%{ background-color: ${this.styleVar('background-color')}; }
    }
    @keyframes clonedAnimationSelected {
        0%  { background-color: ${this.styleVar('cloned-background-color')}; }
        100%{ background-color: ${this.styleVar('selected-background-color')}; }
    }
`)};



}
const _classRegistration = wcSelectableObject.registerElement('wc-selectable-object');
export { _classRegistration as wcSelectableObject };
