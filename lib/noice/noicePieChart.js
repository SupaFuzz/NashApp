/*
    this implements an svg pie chart
    basically ripped out of startupDialog
    and extended
*/
import { noiceCoreUIElement } from './noiceCoreUI.js';
import { noiceObjectCore } from './noiceCore.js';

class noicePieChart extends noiceCoreUIElement{

/*
    constructor
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version:               1,
        _className:             'noicePieChart',
        _showPieChart:          false,
        _charts:                {},
        _runAnimation:          false,
        _animationFrame:        0,
        _size:                  '2em',
        _badgeText:             null,
        chartSize:              200,
        chartBackroundClass:    'chartBknd',
        _zIndex:                0
    },defaults),callback);

    this.setup();
    this.DOMElement.style.display  = "block";
    this.DOMElement.style.overflow = "hidden";

} // end constructor


/*
    html getter
*/
get html(){
    return(`<svg viewBox="${(this.chartSize/-2)} ${(this.chartSize/-2)} ${this.chartSize} ${this.chartSize}" width="99%" height="99%" xmlns="http://www.w3.org/2000/svg">
        <circle class="chartBknd" cx="0" cy="0" r="${(this.chartSize/2) * (7/8)}" />
    </svg>`);
}

/*
    size
*/
get size(){ return(this._size);}
set size(v){
    this._size = v;
    if (this.DOMElement instanceof Element){
        this.DOMElement.style.width = this.size;
        this.DOMElement.style.height = this.size;
    }
}


/*
    zIndex
*/
get zIndex(){ return(this._zIndex); }
set zIndex(v){
    this._zIndex = v;
    if (this.DOMElement instanceof Element){ this.DOMElement.style.zIndex = `${v}`; }
}


/*
    animation hooks
*/
get runAnimation(){ return(this._runAnimation); }
set runAnimation(v){
    let that = this;
    let tmp = (v===true);
    if ((! this._runAnimation) && tmp){

        /*
            starting from a previously stopped state
        */

        // init
        this._animationFrame = 0;
        if (this.hasOwnProperty('animationStartCallback') && (this.animationStartCallback instanceof Function)){
            try {
                this.animationStartCallback(that);
            }catch(e){
                throw(`runAnimation / animationStartCallback threw unexpected error: ${e}`, e);
            }
        }

        // start the animation if we've got an animationCallback
        if ((this.hasOwnProperty('animationCallback')) && (this.animationCallback instanceof Function)){
            this.startAnimation();
        }

    }else if (this._runAnimation && (! tmp)){
        /*
            stopping from a previously stopped state
        */
        if (this.hasOwnProperty('animationExitCallback') && (this.animationExitCallback instanceof Function)){
            try {
                that.animationExitCallback(that);
            }catch(e){
                throw(`runAnimation / animationExitCallback threw unexpected error: ${e}`, e);
            }
        }

    }
    that._runAnimation = tmp;
}
async startAnimation(){
    let that = this;
    await new Promise(function(toot, boot){
        window.requestAnimationFrame(function(){
            try {
                that._animationFrame ++;
                that.animationCallback(that);
                toot(true);
            }catch(e){
                boot(`animationCallback threw unexpectedly: ${e}`, e);
            }
        });
    }).catch(function(error){
        that.runAnimation = false;
        throw(`startAnimation / animationCallback threw unexpectedly ${error}`, error);
    });
    if (that.runAnimation){
        that.startAnimation();
    }else{
        return(true);
    }
}




/*
    setup()
*/
setup(){
    this.svgDOMObject = this.DOMElement.querySelector('svg');
    this.chartBknd = this.svgDOMObject.querySelector(`circle.${this.chartBackroundClass}`);

    let that = this;

    // init DOM values that have getter/drsetters
    ['showPieChart', 'size', 'zIndex'].forEach(function(at){ this[at] = this[at]; }, this);

    // setup the pieCharts
    if (this.hasOwnProperty('pieCharts') && (this.pieCharts instanceof Array)){
        this.pieCharts.forEach(function(c){ this.addPieChart(c); }, this);
    }

    this.DOMElement.style.position = 'relative';
    this.svgDOMObject.style.position = 'absolute';
    this.svgDOMObject.style.zIndex = '-1';

    // create the badgeTxt
    let div = document.createElement('div');
    div.className = 'pieChartBadge';
    let necessaryStyle = {
        display:                'grid',
        gridTemplateColumns:    '1fr',
        placeItems:             'center',
        position:               'absolute',
        zIndex:                 '1',
        top:                    '0px',
        left:                   '0px',
        width:                  '100%',
        height:                 '100%',
    };
    Object.keys(necessaryStyle).forEach(function(p){ div.style[p] = necessaryStyle[p]; });
    that.badgeTxtDOMElement = document.createElement('span');
    that.badgeTxtDOMElement.className = 'badgeTxt';
    that.badgeTxtDOMElement.style.alignSelf = 'center';
    div.appendChild(that.badgeTxtDOMElement);
    this.DOMElement.appendChild(div);


}



// badgeTxt stuff
get badgeTxt(){ return(this._badgeText); }
set badgeTxt(v){
    this._badgeText = v;
    if (this.badgeTxtDOMElement instanceof Element){
        this.badgeTxtDOMElement.textContent = this.isNotNull(this._badgeText)?`${this._badgeText}`:'';
    }
}




// hackery
set showPieChart(v){
    this._showPieChart = (v === true);
    if (this.svgDOMObject instanceof Element){
        this.svgDOMObject.style.display = (this.showPieChart)?'block':'none';
    }
}
get showPieChart(){ return(this._showPieChart); }



/*
    addPieChart({
        name:           <distinct name>
        fill:           <css-compatible color -- use rgba for transparency. not fill-opacity>
        stroke:         <css-compatible color -- use rgba for transparency. not stroke-opacity>
        strokeWidth:    int
    })
    this adds a progress indicator to the pie chart. there can be many inside the same
    pie chart vertically stacked. The vertical stacking context is back to front
    in the order you add them.
*/
addPieChart(args){

    /* TO-DO: these should have proper error objects some day */
    if (!(args instanceof Object)){ throw("[addPieChart] args is not an object"); }
    if (!(args.hasOwnProperty('name') && this.isNotNull(args.name))){ throw("[addPieChart]: name is required"); }

    /* defaults */
    if (!(args.hasOwnProperty('fill') && this.isNotNull(args.fill))){ args.fill = 'rgba(17, 47, 65, .2)'; }
    if (!(args.hasOwnProperty('stroke') && this.isNotNull(args.stroke))){ args.stroke = 'rgba(17, 47, 65, .6)'; }
    if (!(args.hasOwnProperty('strokeWidth') && this.isNotNull(args.strokeWidth))){ args.strokeWidth = '1px'; }

    /* make the path */
    this._charts[args.name] = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this._charts[args.name].setAttribute('fill', args.fill);
    this._charts[args.name].setAttribute('stroke', args.stroke);
    this._charts[args.name].setAttribute('stroke-width', args.strokeWidth);
    this._charts[args.name].classList.add('pieChartPath');

    /* append it */
    this.svgDOMObject.appendChild(this._charts[args.name])
}




/*
    updatePieChart(name, percent)
    set the pieChart specified by <name> to <percent>
*/
updatePieChart(name, percent){
    /* TO-DO: these should have proper error objects some day */
    if (this.isNull(name) || (! this._charts.hasOwnProperty(name))){ throw("[updatePieChart]: invalid name"); }

    let p = ((percent%100)/100);
    let radius = ((this.chartSize/2) * (7/8));
    let angle = 2 * Math.PI * p;

    // this takes care of a visual loose end, if you set strokeOpacity in the css for your chart
    if ((p == 100) || (p == 0)){
        this._charts[name].style.opacity = 0;
    }else{
        this._charts[name].style.opacity = 1;
    }

    /* time for some quick "d" */
    this._charts[name].setAttribute('d', `
        M 0,0
        L 0, ${-1 * radius}
        A ${radius} ${radius} 0 ${(p<=.5)?0:1} 1 ${(radius * Math.sin(angle))}, ${(-1 * radius * Math.cos(angle))}
        L 0,0 Z
    `);
}


} // end noicePieChart class

export { noicePieChart }
