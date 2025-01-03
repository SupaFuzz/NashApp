/*
    wcScanIndicator.js
    6/15/24 Amy Hicox <amy@hicox.com>

    a standard web component showing the icon overlay
    with the scanning animation behind it
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';

class wcScanIndicator extends noiceAutonomousCustomElement {




static classID = wcScanIndicator;
static classAttributeDefaults = {

    run_animation: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
    size: { observed: true, accessor: true, type: 'str', value: '1em', forceAttribute: true},
    show_icon: { observed: true, accessor: true, type: 'bool', value: true, forceAttribute: true },
    chart_size: { observed: false, accessor: true, type: 'int', value: 200 },

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

static classStyleDefaults = {
    'background-color': { value: 'rgba(240, 240, 240, .3)', global: true },
    'background-stroke-color': { value: 'rgba(240, 240, 240, .7)', global: true },
    'background-stroke-width': { value: '1', global: true},
    'icon': { value: "url('./gfx/TSL-1128-neutral-icon.svg')", global: true },
    'path-stroke': { value: 'rgb(179, 0, 0)', global: true },
    'path-stroke-width': { value: '2', global: true },
    'path-stroke-opacity': { value: '.85', global: true },
    'path-fill': { value: 'rgb(179, 0, 0)', global: true },
    'fill-opacity': { value: '.1', global: true }
}


/*
    constructor
*/
constructor(args){
    super();
    this._className = 'wcScanIndicator';
    this._version = 1;
    this._initialized = false;
    this.cssVarPrefix = '--wc-scan-indicator';

    this.attributeDefaults = JSON.parse(JSON.stringify(wcScanIndicator.classAttributeDefaults));
    this.initConstructorArgs(args);
    this.spawnAttributeAccessors();

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        size:  (name, oldValue, newValue, slf) => { slf.setSize(newValue); }
    };

    // merge object defaults
    //this.mergeClassDefaults({});
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcScanIndicator.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcScanIndicator.classStyleDefaults);
}



/*
    getHTMLContent()
*/
getHTMLContent(){

    // the container div
    let div = document.createElement('div');
    div.className = this._className;
    div.style.width = this.size;
    div.style.height = this.size;
    div.insertAdjacentHTML('afterbegin', `
        <svg viewBox="${(this.chart_size/-2)} ${(this.chart_size/-2)} ${this.chart_size} ${this.chart_size}" width="99%" height="99%" xmlns="http://www.w3.org/2000/svg" data-_name="svgDOMObject">
            <circle class="chartBknd" cx="0" cy="0" r="${(this.chart_size/2) * (7/8)}" data-_name="bknd"/>
        </svg>
        <span class="overlay" data-_name="icon"></span>
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
    this._elements.svgDOMObject.appendChild(this.getIndicatorPath());
}




/*
    getIndicatorPath()
    copped the guts from noiceRadialPolygonPath as a default
    if you wanna override, specify getIndicatorPathCallback()
    on instantiation
*/
getIndicatorPath(){

    if (this.getIndicatorPathCallback instanceof Function){
        return(this.getIndicatorPathCallback())
    }else{

        // the default from noiceRadialPolygonPath
        const edges = 2;
        const useArc = true;
        const phase = -Math.PI*.5;
        const radius = (this.chart_size/2) * (7/8);
        const radius_scale = .9;
        const inc = ((Math.PI * 2)/edges);
        let vertices = [];
        for (let i=0; i < edges; i++){
            vertices.push([
                (Math.sin((i*inc)+phase) * (radius * radius_scale)),
                (Math.cos((-i*inc)-phase) * (radius * radius_scale))
            ]);
        }
        let path = [];
        vertices.forEach(function(v, i){
            if (i == 0){
                path.push(`M ${v[0]}, ${v[1]}`);
            }else{
                path.push(useArc?`A ${radius * radius_scale} ${radius * radius_scale} 1 0 1 ${v[0]}, ${v[1]}`:`L ${v[0]}, ${v[1]}`);
            }
        }, this);
        path.push('z');

        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.classList = 'indicatorPath';
        pathElement.setAttribute('d', path.join(" "));

        return(pathElement);
    }
}




/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        display: block;
    }
    div.wcScanIndicator {
        position: relative;
    }
    svg {
        position: absolute;
    }
    svg circle.chartBknd {
        fill: ${this.styleVar('background-color')};
        stroke: ${this.styleVar('background-stroke-color')};
        stroke-width: ${this.styleVar('background-stroke-width')};
    }
    span.overlay {
        display: grid;
        justify-items: center;
        align-items: center;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${this.styleVar('icon')};
        background-size: 75%;
        background-position: center;
        background-repeat: no-repeat;
    }
    :host([run_animation="true"]) span.overlay {
        animation: iconFader 1.5s linear infinite;
    }
    :host([run_animation="false"]) svg path.indicatorPath {
        display: none;
    }
    svg path.indicatorPath {
        stroke: ${this.styleVar('path-stroke')};
        stroke-width: ${this.styleVar('path-stroke-width')};
        stroke-opacity: ${this.styleVar('path-stroke-opacity')};
        fill: ${this.styleVar('path-fill')};
        fill-opacity: ${this.styleVar('fill-opacity')};
    }
    :host([run_animation="true"]) svg path.indicatorPath {
        animation: pathRotator 1.5s linear infinite;
    }
    @keyframes iconFader {
        0% { opacity: 1 }
        50% { opacity: 0 }
        100% { opacity: 1 }
    }
    @keyframes pathRotator {
        0% { transform: rotate(0deg) }
        100% { transform: rotate(360deg) }
    }
`)};




/*
    setSize(size)
    set height and width of root element
*/
setSize(size){
    if (this.initialized){
        if (this.DOMElement instanceof Element){
            this.DOMElement.style.width = size;
            this.DOMElement.style.height = size;
        }
    }else{
        this.attributeDefaults['size'].value = size;
    }
}




}
const _classRegistration = wcScanIndicator.registerElement('wc-scan-indicator');
export { _classRegistration as wcScanIndicator };
