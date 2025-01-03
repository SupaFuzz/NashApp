/*
    noiceBarChart.js
    10/9/23 @ 2250 -- started. this is work in progress
*/
import { noiceCoreUIElement } from './noiceCoreUI.js';
import { noiceObjectCore } from './noiceCore.js';

class noiceBarChart extends noiceCoreUIElement {




/*
    constructor
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version:               1,
        _className:             'noiceBarChart',
        _charts:                {},
        _chartLayers:           [],
        _runAnimation:          false,
        _animationFrame:        0,
        _badgeText:             null,

        // chart stuff
        _graphSpacing:          '.25em',
        _chartContainerMargin:  '.25em',
        _graphCornerRound:      '.25em',
        _scaleValues:           false,

        // container div dimensions
        _width:                 '16em',
        _height:                '9em',
        _zIndex:                0,

        chartSVGClass:          'noiceBarChart',
        chartBackroundClass:    'chartBknd',
        badgeClass:             'barChartBadge'
    },defaults),callback);

    this.setup();

} // end constructor




/*
    html getter
*/
get html(){
    return(`
        <div class="chartContainer" data-templatename="chartContainer" data-templateattribute="true"></div>
        <div class="label" data-templatename="label" data-templateattribute="true"></div>
    `)
}




/*
    setup()
*/
setup(){
    let that = this;
    that.DOMElement.style.display = 'grid';
    that.DOMElement.style.gridTemplateRows = `auto 1.5em`;
    that._DOMElements.chartContainer.style.position = "relative";

    ['width', 'height', 'zIndex', 'chartContainerMargin'].forEach((a)=>{this[a] = this[a]; });

}




/*
    container div attributes
*/
get zIndex(){ return(this._zIndex); }
set zIndex(v){
    if (this.DOMElement instanceof Element){ this.DOMElement.style.zIndex = v; }
    this._zIndex = v;
}
get width(){ return(this._width); }
set width(v){
    if (this.DOMElement instanceof Element){ this.DOMElement.style.width = v; }
    this._width = v;

}
get height(){ return(this._height); }
set height(v){
    if (this.DOMElement instanceof Element){ this.DOMElement.style.height = v; }
    this._height = v;
}
get graphSpacing(){ return(this._graphSpacing); }
set graphSpacing(v){
    this._graphSpacing = v;
    this.renderCharts();
}
get graphCornerRound(){ return(this._graphCornerRound); }
set graphCornerRound(v){
    this._graphCornerRound = v;
    this.renderCharts();
}
get scaleValues(){ return(this._scaleValues === true); }
set scaleValues(v){
    this._scaleValues = (v === true);
    this.renderCharts();
}
get chartContainerMargin(){ return(this._chartContainerMargin); }
set chartContainerMargin(v){
    this._chartContainerMargin = v;
    if (this._DOMElements.chartContainer instanceof Element){ this._DOMElements.chartContainer.style.margin = `${v}`; }
}



/*
    badgeTxt stuff
*/
get badgeTxt(){ return(this._badgeText); }
set badgeTxt(v){
    this._badgeText = v;
    if (this.badgeTxtDOMElement instanceof Element){
        this.badgeTxtDOMElement.textContent = this.isNotNull(this._badgeText)?`${this._badgeText}`:'';
    }
}




/*
    renderCharts()
    (re?)draw the charts
*/
renderCharts(){
    let that = this;

    // tear it all down
    that._DOMElements.chartContainer.innerHTML = '';

    // if we have scaleValues on go handle that
    if (this.scaleValues === true){
        let maxValue = 0;
        Object.keys(that._charts).forEach((chartName)=>{ that._charts[chartName].layers.forEach((layer) =>{ if (layer.value > maxValue){ maxValue = layer.value; } }) });
        if (maxValue > 0){
            Object.keys(that._charts).forEach((chartName)=>{ that._charts[chartName].layers.forEach((layer) =>{
                layer._scaledValue = ((layer.value/maxValue)*100);
            })});
        }
    }

    // figure out how many layers we need
    let maxLayers = 1;
    Object.keys(that._charts).forEach((chartName)=>{ if (that._charts[chartName].layers.length > maxLayers){ maxLayers = that._charts[chartName].layers.length; }})

    // get the grid-template-columns string corresponding to the number of charts we have
    let gtc = '';
    for (let i=0; i<Object.keys(that._charts).length; i++){ gtc += ' 1fr'; }

    // spawn layers
    that._chartLayers = [];
    for (let i=0; i<maxLayers; i++){
        let chartLayer = document.createElement('div');
        chartLayer.className = 'chartLayer';
        chartLayer.style.width = '100%';
        chartLayer.style.height = '100%';
        chartLayer.style.position = 'absolute';
        chartLayer.style.top = '0px';
        chartLayer.style.left = '0px';
        chartLayer.style.zIndex = i;
        chartLayer.style.display = 'grid';
        chartLayer.style.alignItems = 'end';
        chartLayer.style.gridTemplateColumns = gtc;

        // render identical chartLanes on every layer
        Object.keys(that._charts).sort((a,b)=>{return(a.order - b.order)}).forEach((chartName) => {
            let div = document.createElement('div');
            div.className = 'chartLane';
            div.dataset.name = chartName;
            div.style.display = 'grid';
            div.style.alignItems = 'end';
            ['width', 'height'].forEach((a) => { div.style[a] = '100%'; });
            chartLayer.appendChild(div);
        });
        that._DOMElements.chartContainer.appendChild(chartLayer);
        that._chartLayers.push(chartLayer);
    }

    // render chart values
    Object.keys(that._charts).sort((a,b)=>{return(a.order - b.order)}).forEach((chartName) => {

        let chart = that._charts[chartName];

        // spawn value into chartLane on layer
        chart.layers.forEach((layer, idx) => {
            let div = document.createElement('div');
            div.className = "chartBar";
            div.style.backgroundColor = layer.color;
            div.style.height = `${(that.scaleValues && layer.hasOwnProperty('_scaledValue'))?layer._scaledValue:layer.value}%`;
            div.style.margin = `0 ${layer.hasOwnProperty('graphSpacing')?layer.graphSpacing:that.graphSpacing} 0 ${layer.hasOwnProperty('graphSpacing')?layer.graphSpacing:that.graphSpacing}`;
            div.style.borderTopLeftRadius = layer.hasOwnProperty('graphCornerRound')?layer.graphCornerRound:that.graphCornerRound;
            div.style.borderTopRightRadius = layer.hasOwnProperty('graphCornerRound')?layer.graphCornerRound:that.graphCornerRound;
            that._chartLayers[idx].querySelector(`div.chartLane[data-name="${chartName}"]`).appendChild(div);
        });
    });

    // render chart labels
    that._DOMElements.label.innerHTML = '';
    that._DOMElements.label.style.display = 'grid';
    that._DOMElements.label.style.alignItems = 'start';
    that._DOMElements.label.style.justifyItems = 'center';
    that._DOMElements.label.style.gridTemplateColumns = gtc;
    Object.keys(that._charts).sort((a,b)=>{return(a.order - b.order)}).forEach((chartName) => {
        if (that._charts[chartName].label instanceof Element){
            // fancy custom label
            let div = document.createElement('div');
            div.className = 'chartLabel';
            div.style.width = 'max-content';
            div.style.padding = `0 ${that.graphSpacing} 0 ${that.graphSpacing}`;
            div.appendChild(that._charts[chartName].label);
            that._DOMElements.label.appendChild(div);
        }else{
            // default name label
            let span = document.createElement('span');
            span.className = 'chartLabel';
            span.style.width = 'max-content';
            span.style.padding = `0 ${that.graphSpacing} 0 ${that.graphSpacing}`;
            span.textContent = that._charts[chartName].name;
            that._DOMElements.label.appendChild(span);
        }
    });
}



/*
    addChart({
        name: <str>,
        order: <int>,
        layers: [{name:<str>, value:<pct>, color:<rgba>, graphSpacing:<cssUnits>}, ...]
    })
*/
addChart(v){
    this._charts[v.name] = v;
    this.renderCharts();
}




/*
    LOH 10/10/23 @ 1102
    this is fully functional and ready to use, however a little kludgey on updating charts
    if you wanna update a chart basically do this:

    1) pull the one you want from this._charts[<name>]
    2) modify it
    3) call addChart() again with the modified copy

    -- OR --

    1) reach into this._charts[<name>] and change it how you want
    2) call renderCharts()

    also ...

    TO DO: write some docs
*/



}
export { noiceBarChart };
