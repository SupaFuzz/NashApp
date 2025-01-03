/*
    wcSplitter.js
    6/2/24 Amy Hicox <amy@hicox.com>

    this is a flexible UI splitter something like this:

    ------------------------------------------------------------
    | | ---------------------------------------------------- | |
    | |                                                      | |
    | |                         A                            | |
    | |                                                      | |
    | | ---------------------------------------------------- | |
    | |                                                      | |
    | |                         B                            | |
    | |                                                      | |
    | | ---------------------------------------------------- | |
    ------------------------------------------------------------

    where the middle line is a handle that can be click/dragged
    to resize the split.

        TO-DO 6/11/24 @ 2240
        * live-update handle_width
        * live-update section_margin
        * quad-splitter option

 */

import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';
import { wcBasic } from './wcBasic.js';

class wcSplitter extends noiceAutonomousCustomElement {




static classID = wcSplitter;
static classAttributeDefaults = {

    orientation: { observed: true, accessor: true, type: 'enum', values: ['vertical', 'horizontal'], value: 'horizontal' },
    handle_width: { observed: true, accessor: true, type: 'str', value: '.128em' },
    section_margin: { observed: true, accessor: true, type: 'str', value: '0' },
    use_default_handle: { observed: true, accessor: true, type: 'bool', value: 'true' },

    // elementAttributes
    a: { observed: true, accessor: true, type: 'elementAttribute', value: 'A' },
    b: { observed: true, accessor: true, type: 'elementAttribute', value: 'B' },


    /*
        ex:
        disabled: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
        message: { observed: true, accessor: true, type: 'str', value: '' },
        size: { observed: true, accessor: true, type: 'int', value: 20 },
        options: { observed: true, accessor: true, type: 'json', key: 'values', value: []},
        wrap: { observed: true, accessor: true, type: 'enum', values:['hard','soft','off'], value: 'off' },
        value: { observed: true, accessor: true, type: 'float', value: 1.618 },
    */
}
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });




/*
    constructor
*/
constructor(args){
    super(args);
    this._className = 'wcSplitter';
    this._version = 1;

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        orientation: (attributeName, oldValue, newValue, selfReference) => {
            selfReference.resetSplit();
            requestAnimationFrame(() => { selfReference.homeHandle(); });
        }
    };

    // merge object defaults
    this.mergeClassDefaults({
        _dragStart: []
    });
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcSplitter.classAttributeDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.innerHTML = `
        <div class="section" data-_name="a"></div>
        <div class="handle" data-_name="handle"></div>
        <div class="section" data-_name="b"></div>
    `
    return(div);
}




/*
    initializedCallback(slf)
    anything you need to do only once, but *after* everything is rendered
    and this.initialized is set.

    this is called from .initialize()
*/
initializedCallback(){
    let that = this;


    /* old and busted
    // setup clickHandlers on the sections to block click on the background for the handle
    that.DOMElement.querySelectorAll('.section').forEach((el) => {
        el.addEventListener("mousedown", (evt) => { evt.stopPropagation(); });
    });
    */

    // background clickHandler / drag-start
    this._elements.handle.addEventListener("mousedown", (evt) => {
        that.getDragStart(evt)
        that._dragListener = that.getEventListenerWrapper((evt, slf) => { slf.handleDrag(evt, slf); });
        that.DOMElement.addEventListener('mousemove', that._dragListener);
    });

    that.DOMElement.addEventListener("mouseup", (evt) => {
        if (that._dragListener instanceof Function){
            that.DOMElement.removeEventListener('mousemove', that._dragListener);
        }
        this._elements.handle.firstChild.dir = "";
    });

    // same thing but for touches
    this._elements.handle.addEventListener("touchstart", (evt) => {
        that.getDragStart(evt)
        that._dragListener = that.getEventListenerWrapper((evt, slf) => { slf.handleDrag(evt, slf); });
        that.DOMElement.addEventListener('touchmove', that._dragListener);
    });

    that.DOMElement.addEventListener("touchend", (evt) => {
        if (that._dragListener instanceof Function){
            that.DOMElement.removeEventListener('touchmove', that._dragListener);
        }
    });


    // if we have use_default_handle: true
    if (that.use_default_handle == true){ this._elements.handle.appendChild(that.defaultHandle()); }

    // init handle position
    this.homeHandle();

    // keep the handle where it belongs
    that.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentBoxSize) { that.homeHandle(); }
      }
    });
    that.resizeObserver.observe(that.DOMElement);
}




/*
    homeHandle()
    put the handle where it belongs
*/
homeHandle(){
    if (this.orientation == "vertical"){
        this._elements.handle.style.left = `${(((this._elements.a.offsetWidth/(this._elements.a.offsetWidth + this._elements.b.offsetWidth)) + 0) - ((this._elements.handle.offsetWidth/(this._elements.a.offsetWidth + this._elements.b.offsetWidth))/2))*100}%`;
        this._elements.handle.style.top = `${(50 + (((this._elements.handle.offsetHeight/this._elements.a.offsetHeight)*100)*.5))}%`;
    }else{
        this._elements.handle.style.top = `${(((this._elements.a.offsetHeight/(this._elements.a.offsetHeight + this._elements.b.offsetHeight)) + 0) - ((this._elements.handle.offsetHeight/(this._elements.a.offsetHeight + this._elements.b.offsetHeight))/2))*100}%`;
        this._elements.handle.style.left = `${(50 - (((this._elements.handle.offsetWidth/this._elements.a.offsetWidth)*100)*.5))}%`;
    }
}




/*
    handleDrag(evt, slf)
*/
handleDrag(evt, slf){
    if (this.orientation == "vertical"){
        let clientY = evt.touches?evt.touches[0].clientX:evt.clientX;
        let deltaY = (clientY - this._dragStart[1]);
        let deltaYPct = deltaY / (this._dragStart[2] + this._dragStart[3]);
        this.DOMElement.style.gridTemplateColumns = `${(this._dragStart[4] + deltaYPct)*100}% ${((this._dragStart[4] + this._dragStart[5]) - (this._dragStart[4] + deltaYPct))*100}%`;
        this._elements.handle.style.left = `${((this._dragStart[4] + deltaYPct) - (this._dragStart[6]/2))*100}%`;
        this._elements.handle.firstChild.dir = (deltaYPct > 0)?"up":(deltaYPct < 0)?"down":"";
    }else{
        let clientY = evt.touches?evt.touches[0].clientY:evt.clientY;
        let deltaY = (clientY - this._dragStart[1]);
        let deltaYPct = deltaY / (this._dragStart[2] + this._dragStart[3]);
        this.DOMElement.style.gridTemplateRows = `${(this._dragStart[4] + deltaYPct)*100}% ${((this._dragStart[4] + this._dragStart[5]) - (this._dragStart[4] + deltaYPct))*100}%`;
        this._elements.handle.style.top = `${((this._dragStart[4] + deltaYPct) - (this._dragStart[6]/2))*100}%`;
        this._elements.handle.firstChild.dir = (deltaYPct > 0)?"down":(deltaYPct < 0)?"up":"";
    }

}



/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        display: block;
        height: 100%;
        width: 100%;
    }
    :host([orientation="horizontal"]) .wcSplitter {
        grid-template-rows: 1fr 1fr;
    }
    :host([orientation="vertical"]) .wcSplitter {
        grid-template-columns: 1fr 1fr;
    }
    .wcSplitter {
        display: grid;
        height: 100%;
        width: 100%;
        display: grid;
        background-color: var(--wc-splitter-background-color, transparent);
        user-select: none;
        position: relative;
    }
    :host([orientation="horizontal"]) .section {
        overflow-x: auto;
    }
    :host([orientation="vertical"]) .section {
        overflow-y: auto;
    }
    .section {
        user-select: text;
    }
    .section[data-_name="a"]{
        background-color: var(--wc-splitter-a-background-color, transparent);
    }
    :host([orientation="horizontal"]) .section[data-_name="a"] {
        margin: ${this.section_margin} ${this.section_margin} ${this.handle_width} ${this.section_margin};
        border-bottom: var(--wc-splitter-handle-border, .128em dotted rgba(240, 240, 240, .3));
    }
    :host([orientation="vertical"]) .section[data-_name="a"] {
        margin: ${this.section_margin} ${this.handle_width} ${this.section_margin} ${this.section_margin};
        border-right: var(--wc-splitter-handle-border, .128em dotted rgba(240, 240, 240, .3));
    }
    .section[data-_name="b"]{
        background-color: var(--wc-splitter-b-background-color, transparent);
    }
    :host([orientation="horizontal"]) .section[data-_name="b"]{
        margin: ${this.handle_width} ${this.section_margin} ${this.section_margin} ${this.section_margin};
        border-top: var(--wc-splitter-handle-border, .128em dotted rgba(240, 240, 240, .3));
    }
    :host([orientation="vertical"]) .section[data-_name="b"]{
        margin: ${this.section_margin} ${this.section_margin} ${this.section_margin} ${this.handle_width};
        border-left: var(--wc-splitter-handle-border, .128em dotted rgba(240, 240, 240, .3));
    }
    .handle {
        position: absolute;
        z-index: 3;
    }
    :host([orientation="horizontal"]) .handle {
        left: 50%;
    }
    :host([orientation="vertical"]) .handle {
        transform: rotate(90deg);
        top: 50%;
        left: 50%;
    }
    :host([orientation="vertical"]) .handle:first-child .defaultHandle{
        margin-left: unset;
    }
`)};




/*
    defaultHandle()
    returns the default handle
*/
defaultHandle(){

    return(new wcBasic({
        content: '<div class="defaultHandle"><span class="symbols"><span id="down">▼</span><span id="up">▲</span></span></div>',
        styleSheet: `
        .defaultHandle {
            width: var(--wc-splitter-default-handle-width, 3em);
            height: var(--wc-splitter-default-handle-height, 1em);
            border: var(--wc-splitter-default-handle-border, .128em solid rgba(240, 240, 240, .25));
            border-radius: var(--wc-splitter-default-handle-radius, 1em);
            box-shadow: var(--wc-splitter-default-handle-box-shadow, 2px 2px 2px rgba(20, 22, 23, .8) inset);
            background: var(--wc-splitter-default-handle-background, rgb(24, 35, 38));
            display: grid;
            place-items:center;
            margin-left: -50%;
        }
        .symbols {
            font-size: .85em;
             -webkit-text-stroke: .067em var(--wc-splitter-default-handle-arrow-stroke-color, rgba(240, 240, 240, .5));
            color: var(--wc-splitter-default-handle-arrow-color, transparent);
        }
        .defaultHandle:active {
            background-color: var(--wc-splitter-default-handle-active-background-color, rgb(17, 47, 65));
        }
        /*
        .defaultHandle:active .symbols {
            -webkit-text-stroke: .067em var(--wc-splitter-default-handle-arrow-active-stroke-color, transparent);
            color: var(--wc-splitter-default-handle-arrow-active-color, rgba(240, 240, 240, .5));
        }
        */
        :host([dir="both"]) #up, :host([dir="both"]) #down, :host([dir="down"]) #down, :host([dir="up"]) #up {
            -webkit-text-stroke: .067em var(--wc-splitter-default-handle-arrow-active-stroke-color, transparent);
            color: var(--wc-splitter-default-handle-arrow-active-color, rgba(240, 240, 240, .5));
        }

        `
    }));
}




/*
    getDragStart()
*/
getDragStart(evt){
    let that = this;
    if (this.orientation == "vertical"){
        that._dragStart = [
            evt.clientY,
            evt.clientX,
            that._elements.a.offsetWidth,
            that._elements.b.offsetWidth,
            (that._elements.a.offsetWidth/(that._elements.a.offsetWidth + that._elements.b.offsetWidth)),
            (that._elements.b.offsetWidth/(that._elements.a.offsetWidth + that._elements.b.offsetWidth)),
            (that._elements.handle.offsetWidth/(that._elements.a.offsetWidth + that._elements.b.offsetWidth))
        ];
    }else{
        that._dragStart = [
            evt.clientX,
            evt.clientY,
            that._elements.a.offsetHeight,
            that._elements.b.offsetHeight,
            (that._elements.a.offsetHeight/(that._elements.a.offsetHeight + that._elements.b.offsetHeight)),
            (that._elements.b.offsetHeight/(that._elements.a.offsetHeight + that._elements.b.offsetHeight)),
            (that._elements.handle.offsetHeight/(that._elements.a.offsetHeight + that._elements.b.offsetHeight))
        ];
    }
}




/*
    resetSplit()
*/
resetSplit(){
    if (this.orientation == "vertical"){
        this.DOMElement.style.gridTemplateRows = "";
        this.DOMElement.style.gridTemplateColumns = "1fr 1fr";
    }else{
        this.DOMElement.style.gridTemplateColumns = "";
        this.DOMElement.style.gridTemplateRows = "1fr 1fr";
    }
}




}
const _classRegistration = wcSplitter.registerElement('wc-splitter');
export { wcSplitter };
