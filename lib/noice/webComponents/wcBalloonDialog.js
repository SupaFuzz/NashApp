/*
    wcBalloonDialog.js
    4/25/24 Amy Hicox <amy@hicox.com>

    this is a reimplementation of noiceBalloonDialog as a webComponent

    css vars:
        --wc-balloon-dialog-body-border:            1px solid rgb(191, 191, 24);
        --wc-balloon-dialog-body-background-color:  rgb(191, 191, 24)
        --wc-balloon-dialog-body-radius:            .25em;
        --wc-balloon-dialog-header-text-color:      rgba(30, 32, 33, 66);
        --wc-balloon-dialog-body-background-color:  rgb(30, 32, 33);
        --wc-balloon-dialog-control-font:           Comfortaa
    events:
        set_position:   {self: this}    either the root element has been inserted into a document object
                                        and connectedCallback() has fired or an orientationChange event
                                        has fired, or a resize event has fired
    attributes:
        exitCallback:   async function(selfRef) - its an old school async callback function pointer, be careful

    to-do list 5/9/24 @ 2256:
        * [done] centered attriute (bool: false) -- this is a css switch so will totally override relativeElement
        * [done] show_decoaration (bool, default:true; if false, draw nothing but the dialogContent)
        * [done] test the exitCallback await
        * [done] buttons in the header
        * [done] style switches, like "alert" or "context" or what have you
        * draggable

    5/15/24 FORGET EVERYTHING POPOVER API JUST DROPPED
    https://developer.mozilla.org/en-US/docs/Web/API/Popover_API

    bloody hell. dropped like 3 weeks ago with support across all major browsers
    I've somehow gotta get on top of the WC3 pipeline beyond watching random Theo t3.gg youtubes
    which yes. I found about this, via him, last night after my last commit on this.

    OK so ... there is a CSS target alignment API which I think I'll still need to completely
    emulate this in OOB HTML5. Maybe? I'll admit I've not read through the whole thing but
    my god that API is 99% of what I've written here, like -- direct alignment. Amazing.

    anyhow. this kinda works ok for now. I guess leaving it be
    but honesltly -- that needs to happen. don't sleep on this like ya did web components hun.

    this thing does scroll-into-view support FFS.
    yeah. We need to get on it.


*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';

class wcBalloonDialog extends noiceAutonomousCustomElement {




static classID = wcBalloonDialog;
static classAttributeDefaults = {

    // wip
    arrow_offset: { observed: true, accessor: true, type: 'str', value: '21px', forceAttribute: true },
    veritical_arrow_offset: { observed: true, accessor: true, type: 'str', value: '42px', forceAttribute: true },
    arrow_size: { observed: true, accessor: true, type: 'str', value: '10px', forceAttribute: true },
    max_height: { observed: true, accessor: true, type: 'str', value: '66vh' },

    // done
    arrow_position: {  observed: true, accessor: true, type: 'enum', values:[
        'none',
        'topRight', 'topMiddle', 'topLeft',
        'bottomRight', 'bottomMiddle', 'bottomLeft',
        'rightTop', 'rightMiddle', 'rightBottom',
        'leftTop', 'leftMiddle', 'leftBottom'
    ], value: 'none', forceAttribute: true },
    alignment_mode: {  observed: true, accessor: true, type: 'enum', values:[
        'none',
        'topRight', 'topMiddle', 'topLeft',
        'bottomRight', 'bottomMiddle', 'bottomLeft',
        'rightTop', 'rightMiddle', 'rightBottom',
        'leftTop', 'leftMiddle', 'leftBottom', 'centered'
    ], value: 'none'},
    x: { observed: true, accessor: true, type: 'str', value: 0, forceAttribute: true },
    y: { observed: true, accessor: true, type: 'str', value: 0, forceAttribute: true },
    z: { observed: true, accessor: true, type: 'int', value: 9, forceAttribute: true },
    title: { observed: true, accessor: true, type: 'elementAttribute', value: '' },
    modal: { observed: true, accessor: true, type: 'bool', value: false },
    lightbox: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    centered: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    show_decoration: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true },
    alert: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    warning: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true }
};
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });

static classStyleDefaults = {
    'body-warning-background-color': { value: 'rgb(6, 133, 135)', global: true },
    'body-alert-background-color': { value: 'rgb(230, 0, 161)', global: true },
    'body-border': { value: '1px solid rgb(191, 191, 24)', global: true },
    'body-radius': { value: '.25em', global: true },
    'body-background-color': { value: 'rgb(191, 191, 24)', global: true },
    'box-shadow': { value: '.25em .25em .25em rgba(17, 47, 65, .5)', global: true },
    'header-text-color': { value: 'rgba(30, 32, 33, 66)', global: true },
    'control-font': { value: 'Comfortaa', global: true },
    'content-background-color': { value: 'rgb(30, 32, 33)', global: true },
    'lightbox-background': { value: 'rgba(53, 53, 53, .5)', global: true },
    'scrollbar-gutter': { value: 'auto', global: true },
};


/*
    constructor
*/
constructor(args){
    super(args);
    this._className = 'wcBalloonDialog';
    this._version = 1;
    this._hasSetPositionCallback = false;
    this._listeners = {};
    this._elements = {};
    this.cssVarPrefix = "--wc-balloon-dialog";

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        x: (name, o, n, s) => { s.setCoordinate(name, n); },
        y: (name, o, n, s) => { s.setCoordinate(name, n); },
        z: (name, o, n, s) => { s.setCoordinate(name, n); },
        arrow_position: (name, o, n, s) => { s.setPosition(); },
        title: (name, o, n, s) => { s.elementAttributeValueSetter(name, n); },
        arrow_size: (name, o, n, s) => { s.updateStyle(); },
        arrow_offset: (name, o, n, s) => { s.updateStyle(); },

        /*
            ex
            label_position: (attributeName, oldValue, newValue, selfReference) => { selfReference.setLabelPosition(newValue, oldValue); },
        */
    };
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcBalloonDialog.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcBalloonDialog.classStyleDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.classList.add('dialog');
    div.insertAdjacentHTML('afterbegin',
        `<div class="body">
            <div class="dialogHeader">
                <span class="title">${this.title}</span>
                <div class='headerContent'><slot name="headerContent"></slot></div>
            </div>
            <div class='dialogContent'><slot name="dialogContent"></slot></div>
        </div>`
    );
    this._elements.dialogContent = div.querySelector('div.body div.dialogContent');
    this._elements.headerContent = div.querySelector('div.dialogHeader div.headerContent');
    this._elements.title = div.querySelector('span.title');
    this._elements.body = div.querySelector('div.body');

    // setup exit listener & override
    let that = this;
    that.bodyClickListener = this.getEventListenerWrapper((evt) => { that.bodyClickHandler(evt); });
    div.addEventListener('click', that.bodyClickListener);

    that.exitClickListener = this.getEventListenerWrapper((evt) => { that.exitClickHandler(evt); });
    this.addEventListener('click', that.exitClickListener);

    // observe changes to dimensions and update position appropriately
    that.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentBoxSize) { that.setPosition(); }
      }
    });
    that.resizeObserver.observe(div);

    return(div);
}




/*
    headerContent
*/
get headerContent(){ return((this.initialized)?this.querySelector('div.dialogHeader div.headerContent'):this._headerContent); }
set headerContent(v){
    if (this.initialized){
        if (v instanceof Element){
            this._elements.headerContent.innerHTML = '';
            this._elements.headerContent.appendChild(v)
        }else{
            this._elements.headerContent.textContent = `${(!(typeof v === 'undefined'))?v:''}`;
        }
    }else{
        this._headerContent = v;
    }
}




/*
    dialogContent
*/
get dialogContent(){ return((this.initialized)?this.querySelector('div.body div.dialogContent'):this._dialogContent); }
set dialogContent(v){
    if (this.initialized){
        if (v instanceof Element){
            this._elements.dialogContent.innerHTML = '';
            this._elements.dialogContent.appendChild(v)
        }else{
            this._elements.dialogContent.textContent = `${(!(typeof v === 'undefined'))?v:''}`;
        }
    }else{
        this._dialogContent = v;
    }
}




/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        position: absolute;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        left: 0px;
        top: 0px;
        z-index: ${this.z};
    }
    :host > * {
        cursor: default;
    }
    :host([centered="false"]) div.dialog {
        position: absolute;
    }
    div.dialog {
        display: grid;
        grid-template-columns: 1fr;
        place-items: center;
        font-size: 1em;
    }
    :host([lightbox="true"]){
        background: ${this.styleVar('lightbox-background')};
    }
    :host([show_decoration="true"][warning="true"]) div.dialog .body {
        border-color: ${this.styleVar('body-warning-background-color')};
    }
    :host([show_decoration="true"][alert="true"]) div.dialog .body {
        border-color: ${this.styleVar('body-alert-background-color')};
    }
    :host([show_decoration="true"]) div.dialog .body {
        border-left: ${this.styleVar('body-border')};
        border-right: ${this.styleVar('body-border')};
        border-bottom: ${this.styleVar('body-border')};
        border-radius:  ${this.styleVar('body-radius')};
        border-color: ${this.styleVar('body-background-color')};
    }
    div.dialog .body {
        overflow: auto;
        max-width: 100%;
        box-shadow: ${this.styleVar('box-shadow')};
    }
    :host([show_decoration="false"]) div.dialogHeader {
        display: none;
    }
    :host([alert="true"]) div.dialogHeader {
        background-color: ${this.styleVar('body-alert-background-color')};
    }
    :host([warning="true"]) div.dialogHeader {
        background-color: ${this.styleVar('body-warning-background-color')};
    }
    div.dialogHeader {
        display: grid;
        /*grid-template-columns: auto 5em;*/
        grid-template-columns: auto auto;
        width: 100%;
        border-color: transparent;
        border-width: 0;
        background-color: ${this.styleVar('body-background-color')};
        border: 0px;
    }
    :host([alert="true"]) div.dialogHeader span.title:before {
        content: '\\26A0';
        margin-right: .25em;
        font-size: 1.25em;
    }
    :host([warning="true"]) div.dialogHeader span.title:before {
        content: '\\2731';
        margin-right: .25em;
        font-size: 1.25em;
    }
    div.dialogHeader span.title {
        align-self: center;
        font-size: .85em;
        padding: .25em .75em .25em .75em;
        text-align: left;
        color: ${this.styleVar('header-text-color')};
        font-family: ${this.styleVar('control-font')};
    }
    div.dialogHeader div.headerContent {
        display: flex;
        flex-direction: row-reverse;
        padding: .25em
    }
    div.dialogHeader div.headerContent >* {
        height: min-content;
        align-self: center;
    }
    div.dialogContent {
        width: auto;
        height: auto;
        background-color: ${this.styleVar('content-background-color')};
        overflow-x: hidden;
        overflow-y: auto;
        max-height: ${this.max_height};
        scrollbar-width: thin;
        scrollbar-gutter: ${this.styleVar('scrollbar-gutter')};
    }

    :host([arrow_position="topRight"]) .dialog:after {
        content: '';
        position: absolute;
        top: -${this.arrow_size};
        right: ${this.arrow_offset};
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-bottom-color: ${this.styleVar('body-background-color')};
        border-top: 0;
        margin-left: -${this.arrow_size};
        margin-bottom: -${this.arrow_size};
    }
    :host([arrow_position="topLeft"]) .dialog:after {
        content: '';
        position: absolute;
        top: -${this.arrow_size};
        left: ${this.arrow_offset};
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-bottom-color: ${this.styleVar('body-background-color')};
        border-top: 0;
        margin-left: -${this.arrow_size};
        margin-bottom: -${this.arrow_size};
    }
    :host([arrow_position="topMiddle"]) .dialog:after {
        content: '';
        position: absolute;
        top: -${this.arrow_size};
        left: 50%;
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-bottom-color: ${this.styleVar('body-background-color')};
        border-top: 0;
        margin-left: -${this.arrow_size};
        margin-bottom: -${this.arrow_size};
    }
    :host([arrow_position="bottomRight"]) .dialog:after {
        content: '';
        position: absolute;
        bottom: 0px;
        right: ${this.arrow_offset};
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-top-color: ${this.styleVar('body-background-color')};
        border-bottom: 0;
        margin-left: -${this.arrow_size};
        margin-bottom: -${this.arrow_size};
    }
    :host([arrow_position="bottomLeft"]) .dialog:after {
        content: '';
        position: absolute;
        bottom: 0px;
        left: ${this.arrow_offset};
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-top-color: ${this.styleVar('body-background-color')};
        border-bottom: 0;
        margin-left: -${this.arrow_size};
        margin-bottom: -${this.arrow_size};
    }
    :host([arrow_position="bottomMiddle"]) .dialog:after {
        content: '';
        position: absolute;
        bottom: 0px;
        left: 50%;
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-top-color: ${this.styleVar('body-background-color')};
        border-bottom: 0;
        margin-left: -${this.arrow_size};
        margin-bottom: -${this.arrow_size};
    }
    :host([arrow_position="rightBottom"]) .dialog:after {
        content: '';
        position: absolute;
        bottom: ${this.arrow_offset};
        right: 0px;
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-left-color: ${this.styleVar('body-background-color')};
        border-right: 0;
        margin-right: -${this.arrow_size};
        margin-bottom: 0px;
    }
    :host([arrow_position="rightMiddle"]) .dialog:after {
        content: '';
        position: absolute;
        top: 50%;
        right: 0px;
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-left-color: ${this.styleVar('body-background-color')};
        border-right: 0;
        margin-right: -${this.arrow_size};
        margin-bottom: 0px;
    }
    :host([arrow_position="rightTop"]) .dialog:after {
        content: '';
        position: absolute;
        top: 42px;
        right: 0px;
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-left-color: ${this.styleVar('body-background-color')};
        border-right: 0;
        margin-right: -${this.arrow_size};
        margin-bottom: 0px;
    }
    :host([arrow_position="leftTop"]) .dialog:after {
       content: '';
       position: absolute;
       top: 42px;
       left: -${this.arrow_size};
       width: 0;
       height: 0;
       border: ${this.arrow_size} solid transparent;
       border-right-color: ${this.styleVar('body-background-color')};
       border-left: 0;
       margin-right: -${this.arrow_size};
       margin-bottom: 0px;
   }
   :host([arrow_position="leftMiddle"]) .dialog:after {
        content: '';
        position: absolute;
        top: 50%;
        left: -${this.arrow_size};
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-right-color: ${this.styleVar('body-background-color')};
        border-left: 0;
        margin-right: -${this.arrow_size};
        margin-bottom: 0px;
    }
    :host([arrow_position="leftBottom"]) .dialog:after {
        content: '';
        position: absolute;
        bottom: ${this.arrow_offset};
        left: -${this.arrow_size};
        width: 0;
        height: 0;
        border: ${this.arrow_size} solid transparent;
        border-right-color: ${this.styleVar('body-background-color')};
        border-left: 0;
        margin-right: -${this.arrow_size};
        margin-bottom: 0px;
    }
`)};




/*
    initializedCallback(slf)
    anything you need to do only once, but *after* everything is rendered
    and this.initialized is set.

    this is called from .initialize() and .setType() (sometimes)
*/
initializedCallback(){
    if (! this.initialized){ this.initialize(); }

    if (this.isNotNull(this._dialogContent)){ this.dialogContent = this._dialogContent; }
    if (this.isNotNull(this._headerContent)){ this.headerContent = this._headerContent; }

}




/*
    connectedCallback()
    the root element has been inserted into a document object
*/
connectedCallback(){
    if (! this.initialized){ this.initialize(); }
    this.setPosition();
}




/*
    setPosition()
    either the root element has been inserted into a document object and connectedCallback() has fired
    or an orientationChange event has fired, or a resize event has fired

    if a setPositionCallback has been registered, we will fire the set_position event
    which should securely invoke it.

    otherwise we'll just fire the coordinate attribute setters
*/
setPosition(){

    // if we have a relativeElement do auto positioning
    if (this.relativeElement instanceof Element){
        this.setPositionRelativeTo(this.relativeElement, (this.isNull(this.alignment_mode) || (this.alignment_mode == "none"))?"auto":this.alignment_mode);
    }else if (this._hasSetPositionCallback){
        this.dispatchEvent(new CustomEvent("set_position", {detail: {
            self: this
        }}));
    }else{
        // the cheek!
        ['x', 'y', 'z'].forEach((c) => { this[c] = this[c]; }, this);
    }
}




/*
    setPositionCallback attribute setter
*/
set setPositionCallback(f){
    if (f instanceof Function){
        this.addEventListener('set_position', (evt) => { f(evt.detail.self); });
        this._hasSetPositionCallback = true;
    }
}




/*
    setPositionRelativeTo(<Element>, alignmentMode)
    sets the position of the dialog relative to the given Element
    alignmentMode is an enum:
        * auto - uses the value of arrow_position
        * <the arrow_position enums> - manually selects a specific position
*/
setPositionRelativeTo(el, alignmentMode){
    if (el instanceof Element){
        this.relativeElement = el;

        let myD = this.DOMElement.getBoundingClientRect();
        let targetD = el.getBoundingClientRect();
        let parent = (this.parentElement instanceof Element)?this.parentElement.getBoundingClientRect():{x: 0, y: 0 };
        switch ((alignmentMode == 'auto')?this.arrow_position:alignmentMode){
            case 'topRight':
                // place the dialog's top-right edge at the bottom-right edge of the target

                if (targetD.width <= myD.width){
                    this.x = `${(((targetD.x - parent.x) + targetD.width) - myD.width + parseFloat(this.arrow_offset) + parseFloat(this.arrow_size)) - (targetD.width/2) }px`;
                }else{
                    this.x = `${((targetD.x - parent.x) + targetD.width) - myD.width}px`;
                }

                //HOOOLD UP -- why on earth does this work? with the Math.abs?
                this.y = `${Math.abs(targetD.bottom - parent.y) + parseFloat(this.arrow_size)}px`;

                break;
            case 'topMiddle':
                // place the dialog's top edge centered along the bottom edge of the target
                this.x = `${(((targetD.x - parent.x) + (targetD.width/2)) - (myD.width/2))}px`;
                this.y = `${Math.abs(targetD.bottom - parent.y) + parseFloat(this.arrow_size)}px`;
                break;
            case 'topLeft':
                // place the dialog's top-left ege at the bottom-left edge of the target
                if (targetD.width <= myD.width){
                    this.x = `${(targetD.x - parent.x) - parseFloat(this.arrow_offset) + (targetD.width/2)}px`;
                }else{
                    this.x = `${(targetD.x - parent.x)}px`;
                }
                this.y = `${Math.abs(targetD.bottom - parent.y) + parseFloat(this.arrow_size)}px`;
                break;
            case 'bottomRight':
                // place the dialog's bottom-right edge at the top-right edge of the target
                if (targetD.width <= myD.width){
                    this.x = `${(((targetD.x - parent.x) + targetD.width) - myD.width + parseFloat(this.arrow_offset) + parseFloat(this.arrow_size)) - (targetD.width/2) }px`;
                }else{
                    this.x = `${((targetD.x - parent.x) + targetD.width) - myD.width}px`;
                }
                this.y = `${(targetD.top - parent.y) - myD.height - parseFloat(this.arrow_size)}px`;
                break;
            case 'bottomMiddle':
                // place the dialog's bottom edge centered along the top edge of the target
                this.x = `${(((targetD.x - parent.x) + (targetD.width/2)) - (myD.width/2))}px`;
                this.y = `${(targetD.top - parent.y)- myD.height - parseFloat(this.arrow_size)}px`;
                break;
            case 'bottomLeft':
                // place the dialog's bottom-left edge at the top-left edge of the target
                if (targetD.width <= myD.width){
                    this.x = `${(targetD.x - parent.x) - parseFloat(this.arrow_offset) + (targetD.width/2)}px`;
                }else{
                    this.x = `${(targetD.x - parent.x)}px`;
                }
                this.y = `${(targetD.top - parent.y)- myD.height - parseFloat(this.arrow_size)}px`;
                break;
            case 'rightTop':
                // place the dialog's right edge along the target's left edge centered at this.arrow_offset from top
                this.x = `${(targetD.x - parent.x) - myD.width - parseFloat(this.arrow_size)}px`;
                this.y = `${((targetD.top - parent.y) + (targetD.height/2)) - parseFloat(this.veritical_arrow_offset) - parseFloat(this.arrow_size)}px`;
                break;
            case 'rightMiddle':
                // place the dialog's right edge along the target's left edge aligned center-to-center vertically
                this.x = `${(targetD.x - parent.x) - myD.width - parseFloat(this.arrow_size)}px`;
                this.y = `${((targetD.top - parent.y) + (targetD.height/2)) - (myD.height/2) - parseFloat(this.arrow_size)}px`;
                break;
            case 'rightBottom':
                // place the dialog's right edge along the target's left edge centered at this.arrow_offset from bottom
                this.x = `${(targetD.x - parent.x) - myD.width - parseFloat(this.arrow_size)}px`;
                this.y = `${((targetD.top - parent.y) + (targetD.height/2)) - myD.height + parseFloat(this.veritical_arrow_offset) - parseFloat(this.arrow_size)}px`;
                break;
            case 'leftTop':
                // place the dialog's left edge along the target's right edge centered at this.arrow_offset from top
                this.x = `${(targetD.x - parent.x) + targetD.width + parseFloat(this.arrow_size)}px`;
                this.y = `${((targetD.top - parent.y) + (targetD.height/2)) - parseFloat(this.veritical_arrow_offset) - parseFloat(this.arrow_size)}px`;
                break;
            case 'leftMiddle':
                // place the dialog's left edge along the target's right edge aligned center-to-center vertically
                this.x = `${(targetD.x - parent.x) + targetD.width + parseFloat(this.arrow_size)}px`;
                this.y = `${((targetD.top - parent.y) + (targetD.height/2)) - (myD.height/2) - parseFloat(this.arrow_size)}px`;
                break;
            case'leftBottom':
                // place the dialog's left edge along the target's right edge centered at this.arrow_offset from bottom
                this.x = `${(targetD.x - parent.x) + targetD.width + parseFloat(this.arrow_size)}px`;
                this.y = `${((targetD.top - parent.y) + (targetD.height/2)) - myD.height + parseFloat(this.veritical_arrow_offset) - parseFloat(this.arrow_size)}px`;
                break;
            default:
                // same as 'none' -- stack it on top, dead center
                this.x = `${((targetD.x - parent.x) + (targetD.width/2)) - (myD.width/2)}px`;
                this.y = `${((targetD.top - parent.y) + (targetD.height/2)) - (myD.height/2)}px`;
        }
    }
}



/*
    togglePositionListeners(enableBool, selfRef)
    toggle the positioning listeners

    LEAVING THIS IN FOR POSTERITY
    using the resizeObserver seems to have obviated the need for this.
    leaving it here in case device rotation ends up not being caught by
    the resizeObserver and I need to scavange for parts ...
*/
togglePositionListeners(enableBool, selfRef){
    if (this.initialized){
        if (enableBool === true){

            // make 'em
            let that = this;
            let orientationChangeEvent = (screen && screen.orientation)?'change':'orientationchange';

            if (! (that._listeners[orientationChangeEvent] instanceof Function)){
                that._listeners[orientationChangeEvent] = that.getEventListenerWrapper((evt, selfReference) => {

                    if (orientationChangeEvent == 'change'){
                        /*
                            7/6/22
                            NOTE: on windows tablet chrome/edge at least,
                            the setTimeout is a brute-force way to wait until
                            screen.orientation/change has completed. There ought
                            to be a better way than this but it's the best I can
                            figure at the moment
                        */
                        setTimeout(function(){ that.setPosition(); }, 100);
                    }else{
                        that.setPosition();
                    }
                });
                if (orientationChangeEvent == 'change'){
                    screen.orientation.addEventListener('change', that._listeners[orientationChangeEvent]);
                }else{
                    window.addEventListener('orientationchange', that._listeners[orientationChangeEvent]);
                }
            }

            if (! (that._listeners.resize instanceof Function)){
                that._listeners.resize = that.getEventListenerWrapper((evt, selfReference) => { that.setPosition(); });
                window.addEventListener('resize', that._listeners.resize);
            }

        }else{
            // delete 'em
            Object.keys(this._listeners).forEach((eventName) => {
                window.removeEventListener(eventName, this._listeners[eventName]);
                delete(this._listeners[eventName]);
            }, this);
        }
    }
}




/*
    bodyClickHandler()
    primarily this is here to preventDefault() when allowExit is on
*/
bodyClickHandler(evt){
    if (this.modal === false){ evt.stopPropagation(); }
}




/*
    exitClickHandler()
    closes the dialog when it loses focus if allowExit is on
*/
exitClickHandler(evt){
    if (this.modal === false){ this.exit(); }
}




/*
    exit()
    async await exitCallback then close
*/
exit(){
    let that = this;
    return(new Promise((toot, boot) => {
        new Promise((_t) => { _t((that.exitCallback instanceof Function)?that.exitCallback(that):true) }).catch((error) => {
            if (that.debug){ that.log(`${that._className} v${that._version} | exitClickHandler() | exitCallback() threw preventing dialog close: ${error}`); }
        }).then(() => {
            that.remove();
            toot(true);
        })
    }));
}




/*
    setCoordinate(coordinate, value)
    coordinate is enum: x, y, z
*/
setCoordinate(coordinate, value){ if (this.initialized && this.isNotNull(value)){
    switch(coordinate){
        case 'x':
            //this._elements.body.style.left = `${value}`;
            this.DOMElement.style.left = `${value}`;
            break;
        case 'y':
            this.DOMElement.style.top = `${value}`;
            break;
        case 'z':
            this.shadowRoot.host.style.zIndex = `${value}`;
            break;
    }
}}



}
const _classRegistration = wcBalloonDialog.registerElement('wc-balloon-dialog');
export { _classRegistration as wcBalloonDialog };
