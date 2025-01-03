/*
    wcPieChart.js
    4/9/24 Amy Hicox <amy@hicox.com>

    implements a pie chart!

    to-do:
        * write docs
        * the size attribute absolutely refuses to init a construtor arg

*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';
import { isNull, isNotNull } from '../noiceCore.js';

class wcPieChart extends noiceAutonomousCustomElement {

// let static functions know what subclass they're in
static classID = wcPieChart;

// attributeDefaults
static classAttributeDefaults = {
    size: { observed: true, accessor: true, type: 'str', value: '1em', forceAttribute: true},
    value: { observed: true, accessor: true, type: 'float', value: '0' },
    show_chart: { observed: true, accessor: true, type: 'bool', value: true },
    show_background: { observed: true, accessor: true, type: 'bool', value: true },
    background_color: { observed: true, accessor: true, type: 'str', value: '' },
    chart_color: { observed: true, accessor: true, type: 'str', value: 'rgba(191, 191, 24, .8)' },
    chart_stroke: { observed: true, accessor: true, type: 'str', value: 'rgba(17, 47, 65, .6)' },
    chart_stroke_width: { observed: true, accessor: true, type: 'str', value: '1px' },
    show_badge: { observed: true, accessor: true, type: 'bool', value: false },
    badge_position: { observed: true, accessor: true, type: 'enum', values: ['top', 'center', 'bottom'], value: 'center' },
    badge_text: { observed: true, accessor: true, type: 'str', value: 'test badge text' },
    badge_text_font_size: { observed: true, accessor: true, type: 'str', value: '1em', forceAttribute: true },
    show_value_in_badge: { observed: true, accessor: true, type: 'bool', value: false },
    multiple_chart_mode: { observed: true, accessor: true, type: 'enum', values: ['overlay', 'stack'], value: 'overlay' },
    chart_size: { observed: false, accessor: true, type: 'int', value: 200 },
    sort_charts: { observed: true, accessor: true, type: 'enum', values: ['ascending', 'descending', 'none'], value: 'descending' }
}

static classStyleDefaults = {
    'background-color': { value: 'rgb(24, 35, 38)', global: true },
    'main-chart-color': { value: 'rgba(191, 191, 24, .8)', global: true },
    'main-chart-stroke-color': { value: 'rgba(17, 47, 65, .6)', global: true },
    'main-chart-stroke-width': { value: '1px', global: true }
}

// observedAttributes
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });



/*
    constructor
*/
constructor(args){
    super();
    this._className = 'wcPieChart';
    this.cssVarPrefix = '--wc-pie-chart';
    this._version = 1;
    this._initialized = false;
    this._charts = {};

    // we have to make a hard copy of the classAttributeDefaults to use as our local copy
    this.attributeDefaults = JSON.parse(JSON.stringify(wcPieChart.classAttributeDefaults));

    // initConstructorArgs
    this.initConstructorArgs(args);

    // spawn the attribute accessors
    this.spawnAttributeAccessors();

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        size:  (name, oldValue, newValue, slf) => { slf.setSize(newValue); },
        value: (name, oldValue, newValue, slf) => { slf.updateChart('main', newValue); },
        show_chart: (name, oldValue, newValue, slf) => { slf.toggleCharts(newValue); },
        show_background: (name, oldValue, newValue, slf) => { slf.toggleBackground(newValue); },
        background_color: (name, oldValue, newValue, slf) => { slf.setBackgroundFill(newValue); },
        chart_color: (name, o, n, s) => { if (s.isNotNull(n)){ s.setChartFillColor('main', n); }},
        chart_stroke: (name, o, n, s) => { s.setChartStrokeColor('main', n); },
        chart_stroke_width: (name, o, n, s) => { s.setChartStrokeWidth('main', n); },
        show_badge: (name, o, n, s) => { s.toggleBadge(n); },
        badge_position: (name, o, n, s) => { s.setBadgePosition(n); },
        badge_text: (name, o, n, s) => { s.setBadgeText(n); },
        show_value_in_badge: (name, o, n, s) => { s.setShowValueInBadge(n); },
        multiple_chart_mode: (name, o, n, s) => { s.toggleChartMode(n); },
        sort_charts: (name, o, n, s) => { s.toggleSortCharts(n); }
    }
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcPieChart.classAttributeDefaults);
}
getStyleDefaults(){
    return(wcPieChart.classStyleDefaults);
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

    // the svg
    div.insertAdjacentHTML('afterbegin', `
        <svg viewBox="${(this.chart_size/-2)} ${(this.chart_size/-2)} ${this.chart_size} ${this.chart_size}" width="99%" height="99%" xmlns="http://www.w3.org/2000/svg">
            <circle class="chartBknd" cx="0" cy="0" r="${(this.chart_size/2) * (7/8)}" />
        </svg>
        <span class="badgeTxt" style="display:${this.show_badge?'grid':'none'}">${this.badge_text}${this.show_value_in_badge?` (${this.value}%)`:''}</span>
    `);

    this.svgDOMObject = div.querySelector('svg');

    // spawn the main chart path (other's you'll have to call addPieChart() on your own)
    this._charts.main = this.getPieChartPath(
        null, null, null,
        this.attributeDefaults.value.value
    );
    this._charts.main.dataset.name = "mainChart";
    this.svgDOMObject.appendChild(this._charts.main);

    // setup stuff for the badge text
    this.badgeTextElement = div.querySelector(`span.badgeTxt`);
    this.setBadgePosition(this.badge_position, true);

    return(div);
}




/*
    style attribute
*/
get defaultStyle(){return(`
    div.${this._className} {
        position: relative;
    }
    svg {
        position: absolute;
        z-index: 0;
    }
    span.badgeTxt {
        font-size: ${this.badge_text_font_size};
        display: grid;
        justify-items: center;
        align-items: center;
        position: absolute;
        z-index: 1;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
    }
    circle.chartBknd {
        fill: ${this.styleVar('background-color')};
    }
    path[data-name="mainChart"] {
        fill: ${this.styleVar('main-chart-color')};
        stroke: ${this.styleVar('main-chart-stroke-color')};
        stroke-width: ${this.styleVar('main-chart-stroke-width')};
    }
`)}




/*
    getPieChartPath(fill, stroke, strokeWidth, value)
    make a path and set its default value, then return it
    it's on the caller to append to the shadowDOM svg element
*/
getPieChartPath(fill, stroke, strokeWidth, value, startAngle){
    let sangle = (! isNaN(parseFloat(startAngle)))?parseFloat(startAngle):0;
    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', "chartPath");
    if (this.isNotNull(fill)){ path.setAttribute('fill', fill); }
    if (this.isNotNull(stroke)){ path.setAttribute('stroke', stroke); }
    if (this.isNotNull(strokeWidth)){ path.setAttribute('stroke-width', strokeWidth); }
    path.setAttribute('d', this.getDatD(value, sangle));
    path.dataset.angle = this.getDatA(value, sangle);
    path.dataset.percent = value;
    return(path);
}




/*
    getDatA(percent, startAngle)
*/
getDatA(percent, startAngle){
    let angle = 2 * Math.PI * ((parseFloat(percent)%100)/100);
    let sangle = (! isNaN(parseFloat(startAngle)))?parseFloat(startAngle):0;
    return(angle + sangle);
}




/*
    getDatD(percent, startAngle)
    get the path "d" attribute for the given percentage
    at the given startAngle offset from 0 degrees (top center)
*/
getDatD(percent, startAngle){
    let p = ((parseFloat(percent)%100)/100);
    let radius = ((this.attributeDefaults.chart_size.value/2) * (7/8));
    let angle = 2 * Math.PI * p;
    let sangle = (! isNaN(parseFloat(startAngle)))?parseFloat(startAngle):0;

    // time for some quick "d"
    if (percent >= 100){
        return(`
            M 0, ${-1 * radius}
            A ${radius} ${radius} 0 ${(p<=.5)?0:1} 1 ${(radius * Math.sin(Math.PI))}, ${(-1 * radius * Math.cos(Math.PI))}
            A ${radius} ${radius} 0 ${(p<=.5)?0:1} 1 0, ${(-1 * radius)}
            Z
        `)
    }else if (percent <= 0){
        return(`
            M 0, ${-1 * radius}
            A ${radius} ${radius} 0 ${(p<=.5)?0:1} 1 ${(radius * Math.sin(angle))}, ${(-1 * radius * Math.cos(angle))}
            Z
        `);
    }else{
        return(`
            M ${(radius * Math.sin(sangle))}, ${(-1 * radius * Math.cos(sangle))}
            A ${radius} ${radius} 0 ${(p<=.5)?0:1} 1 ${(radius * Math.sin(angle + sangle))}, ${(-1 * radius * Math.cos(angle + sangle))}
            L 0,0 Z
        `);
    }
}




/*
    updateChart(charName, value, angle)
    if angle specified, rotate chart to specified angle (for stacking)
*/
updateChart(name, value, angle){
    if ((this._charts instanceof Object) && (this._charts[name] instanceof Element) && (! isNaN(parseFloat(value)))) {
        this._charts[name].setAttribute('d', this.getDatD(value, angle));
        this._charts[name].dataset.angle = this.getDatA(value, angle);
        this._charts[name].dataset.percent = value;
        this.setShowValueInBadge(this.show_value_in_badge);
    }
}




/*
    addChart({name: <str>, chart_color: <str>, chart_stroke: <str>, chart_stroke_width: <str>, value: <float>})
    if a chart with the given name doesn't exist, spawn it with the given properties.
*/
addChart(args){
    if (
        this.initialized &&
        (args instanceof Object) &&
        args.hasOwnProperty('name') &&
        (this._charts instanceof Object) &&
        (! this._charts.hasOwnProperty(args.name)) &&
        args.hasOwnProperty('value') &&
        (! isNaN(parseFloat(args.value)))

    ){
        this._charts[args.name] = this.getPieChartPath(
            args.hasOwnProperty('chart_color')?args.chart_color:this.attributeDefaults.chart_color.value,
            args.hasOwnProperty('chart_stroke')?args.chart_stroke:this.attributeDefaults.chart_stroke.value,
            args.hasOwnProperty('chart_stroke_width')?args.chart_stroke_width:this.attributeDefaults.chart_stroke_width.value,
            args.value,
            (this.multiple_chart_mode == 'stack')?this.getMaxChartAngle():0
        );
        this._charts[args.name].dataset.name = args.name;
        this._charts[args.name].dataset.order = Object.keys(this._charts).length + 1;
        this.svgDOMObject.appendChild(this._charts[args.name]);
        this.toggleSortCharts(this.sort_charts);
    }
}




/*
    getMaxChartAngle()
    return the max angle across all displayed charts
*/
getMaxChartAngle(){
    if (this.initialized){
        let angles = Array.from(this.svgDOMObject.querySelectorAll('path')).map((el)=>{
            return(el.dataset && el.dataset.angle && (! isNaN(parseFloat(el.dataset.angle)))?parseFloat(el.dataset.angle):0)
        }).sort((a,b) => {return(b-a)});
        return((angles.length > 0)?angles[0]:0);
    }
}




/*
    removeChart(name)
*/
removeChart(name){
    if (
        this.initialized &&
        (this._charts instanceof Object) &&
        (this._charts.hasOwnProperty(name))
    ){
        this._charts[name].remove();
        delete(this._charts[name]);
    }
}




/*
    setSize(size)
    set height and width of root element
*/
setSize(size){
    if (this.initialized){
        let el = this.shadowDOM.querySelector(`div.${this._className}`);
        if (el instanceof Element){
            el.style.width = size;
            el.style.height = size;
        }
    }else{
        this.attributeDefaults['size'].value = size;
    }
}




/*
    toggleCharts(bool)
    if we have charts show them if true, else hide them
*/
toggleCharts(bool){
    if (this.initialized){
        Object.keys(this._charts).forEach((chartName) => {
            if (bool === true){
                this.svgDOMObject.appendChild(this._charts[chartName]);
            }else{
                this._charts[chartName].remove();
            }
        }, this )
    }
}




/*
    toggleBackground(bool)
    hide or show the chart background
*/
toggleBackground(bool){
    if (this.initialized){
        this.svgDOMObject.querySelector('circle.chartBknd').style.opacity = bool?1:0;
    }
}




/*
    setBackgroundFill(newValue)
    set the fill color of the background circle
*/
setBackgroundFill(newValue){
    if (this.initialized && this.isNotNull(newValue)){
        this.svgDOMObject.querySelector('circle.chartBknd').style.fill = newValue;
    }
}




/*
    setChartFillColor(chartName, color)
*/
setChartFillColor(chartName, color){
    if ((this.initialized) && (this._charts[chartName] instanceof Element)){
        this._charts[chartName].style.fill = color;
    }
}




/*
    setChartStrokeColor(chartName, color)
*/
setChartStrokeColor(chartName, color){
    if ((this.initialized) && (this._charts[chartName] instanceof Element)){
        this._charts[chartName].style.stroke = color;
    }
}




/*
    setChartStrokeWidth(chartName, val)
*/
setChartStrokeWidth(chartName, val){
    if ((this.initialized) && (this._charts[chartName] instanceof Element)){
        this._charts[chartName].style.strokeWidth = val;
    }
}




/*
    toggleBadge(bool)
    hide or show the badge
*/
toggleBadge(bool){
    if ((this.initialized) && (this.badgeTextElement instanceof Element)){
        this.badgeTextElement.style.display = bool?'grid':'none';
    }
}




/*
    setBadgePosition(v)
*/
setBadgePosition(v, force){
    if (((this.initialized) || (force === true)) && (this.badgeTextElement instanceof Element)){
        switch(v){
            case 'top':
                this.badgeTextElement.style.alignItems = "baseline";
                this.badgeTextElement.style.marginTop = "-1em";
                break;
            case 'center':
                this.badgeTextElement.style.alignItems = "center";
                this.badgeTextElement.style.marginTop = null;
                break;
            case 'bottom':
                this.badgeTextElement.style.alignItems = "end";
                this.badgeTextElement.style.marginTop = "1em";
                break;
        }
    }
}




/*
    setBadgeText(badgeText)
*/
setBadgeText(badgeText){
    if (this.initialized){
        let el = this.shadowDOM.querySelector(`span.badgeTxt`);
        if (el instanceof Element){
            el.textContent = `${this.badge_text}${this.show_value_in_badge?` (${this.value}%)`:''}`;
        }
    }
}




/*
    setShowValueInBadge(newBool, oldBool)
*/
setShowValueInBadge(newBool){
    if (this.initialized){ this.setBadgeText(this.badge_text); }
}




/*
    toggleChartMode(chartMode)
    chartMode [enum: (overlay, stack)] default: overlay
*/
toggleChartMode(chartMode){
    if (this.initialized){
        if (chartMode == 'overlay'){
            Object.keys(this._charts).map((name) => {return(this._charts[name])}).forEach((el) => { el.remove(); });
            Object.keys(this._charts).sort((a,b) => {return(
                parseFloat(this._charts[b].dataset.percent) -
                parseFloat(this._charts[a].dataset.percent)
            )}).forEach((name) => {
                this.svgDOMObject.appendChild(this._charts[name]);
                this.updateChart(name, this._charts[name].dataset.percent, 0);
            });
        }else if (chartMode == 'stack'){
            let sangle = 0;
            Object.keys(this._charts).sort((a,b) => {return(
                parseInt(this._charts[a].dataset.order) -
                parseInt(this._charts[b].dataset.order)
            )}).forEach((name) => {
                this.updateChart(name, this._charts[name].dataset.percent, sangle);
                sangle = isNaN(parseFloat(this._charts[name].dataset.angle))?0:parseFloat(this._charts[name].dataset.angle);
            });
        }
    }
}




/*
    toggleSortCharts(val)
    'ascending', 'descending', 'none'
*/
toggleSortCharts(val){
    if (this.initialized){
        // this is so dumb it might just work
        Array.from(this.svgDOMObject.querySelectorAll("path.chartPath")).sort((a,b) => {return(
            (val == 'ascending')?(parseFloat(a.dataset.percent) - parseFloat(b.dataset.percent)):(val == "descending")?(parseFloat(b.dataset.percent) - parseFloat(a.dataset.percent)):(parseInt(a.dataset.order) - parseInt(b.dataset.order))
        )}).forEach((el) => {
            this.svgDOMObject.appendChild(el);
        });
    }
}



/*
    don't judge me
*/
initializedCallback(slf){
    this.size = this.size;
}



}

const _classRegistration = wcPieChart.registerElement('wc-pie-chart');
export { _classRegistration as wcPieChart };
