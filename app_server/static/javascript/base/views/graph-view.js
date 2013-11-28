/**
 * This base graph view expects the following from all subviews:
 * - copy pvt using getBasePvt method -- make sure to copy pvt.consts if you define your own consts, e.g. pvt.consts = _.extend(globalConsts, myconsts)
 * -el should be a container element that will render the svg
 *
 * NOTE: You should not (!) override the render or initialize method
 *        -- use prerender and postrender and handleNewPaths and handleNewCircles
 *           and preinitialize and postinitialize
 *
 * After first render (even in prerender on first render) the following elements are available
 * - this.d3Svg
 * - this.gPaths: block g element for the paths
 *    (paths when dealing with svg and edges when dealing with data model)
 *    where you can append a new g with this.gPaths.data(someData).append("g")
 * - this.gCircles: block g element for the circles
 *    (circles when dealing with svg and nodes when dealing with data model)
 *    where you can append a new g with this.gCircles.data(someData).append("g")
 *
 * Some general notes:
 * + d3 should handle all svg-related events, while backbone should handle all other events
 * + use handleNewPaths and handleNewCircles to attach listeners during calls to render
 */
window.define(["backbone", "d3", "underscore",  "filesaver"], function(Backbone, d3, _) {

  /**********************
   * private class vars *
   **********************/

  var pvt = {};

  pvt.consts = {
    exPlusWidth: 5, // expand plus sign width in pixels
    minusRectW: 11,
    minusRectH: 5.5,
    exPlusWidth: 5,
    nodeRadius: 50,
    graphClass: "graph",
    pathWrapClass: "link-wrapper",
    pathClass: "link",
    expandCrossClass: "exp-cross",
    contractMinusClass: "contract-minus",
    gHoverClass: "hover-g",
    circleGClass: "concept-g",
    circleGIdPrefix: "circlgG-",
    edgeGIdPrefix: "edgeG-"
  };

  pvt.consts.plusPts = "0,0 " +
    pvt.consts.exPlusWidth + ",0 " +
    pvt.consts.exPlusWidth + "," + pvt.consts.exPlusWidth + " " +
    (2 * pvt.consts.exPlusWidth) + "," + pvt.consts.exPlusWidth + " " +
    (2 * pvt.consts.exPlusWidth) + "," + (2 * pvt.consts.exPlusWidth) + " " +
    pvt.consts.exPlusWidth + "," + (2 * pvt.consts.exPlusWidth) + " " +
    pvt.consts.exPlusWidth + "," + (3 * pvt.consts.exPlusWidth) + " " +
    "0," + (3 * pvt.consts.exPlusWidth) + " " +
    "0," + (2 * pvt.consts.exPlusWidth) + " " +
    (-pvt.consts.exPlusWidth) + "," + (2 * pvt.consts.exPlusWidth) + " " +
    (-pvt.consts.exPlusWidth) + "," + pvt.consts.exPlusWidth + " " +
    "0," + pvt.consts.exPlusWidth + " " +
    "0,0";

  pvt.d3Line = d3.svg.line()
    .x(function(d) {return d.x === undefined ? d.get("x") : d.x;})
    .y(function(d) {return d.y === undefined ? d.get("y") : d.y;})
    .interpolate('bundle')
    .tension(1);

  /*******************
   * private methods *
   *******************/

  /**
   * First render renders the svg and sets up all of the listeners
   */
  pvt.firstRenderBase = function(){
    var thisView = this;

    var d3Svg = d3.select(thisView.el).append("svg:svg");
    thisView.d3Svg = d3Svg;

    var defs = d3Svg.append('svg:defs');
    defs.append('svg:marker')
      .attr('id', 'end-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('markerWidth', 5.5)
      .attr('markerHeight', 5.5)
      .attr('refX', 8)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5');

    thisView.d3SvgG = thisView.d3Svg.append("g")
      .classed(pvt.consts.graphClass, true);

    var d3SvgG = thisView.d3SvgG;

    // svg nodes and edges
    thisView.gPaths = d3SvgG.append("g").selectAll("g");
    thisView.gCircles = d3SvgG.append("g").selectAll("g");

    // svg listeners
    d3Svg.on("mousedown", function(){thisView.svgMouseDown.apply(thisView, arguments);});
    d3Svg.on("mouseup", function(){thisView.svgMouseUp.apply(thisView, arguments);});

  };

  // from http://bl.ocks.org/mbostock/3916621
  pvt.pathTween = function (d1, precision) {
    return function() {
      var path0 = this,
          path1 = path0.cloneNode(),
          n0 = path0.getTotalLength(),
          n1 = (path1.setAttribute("d", d1), path1).getTotalLength();

      // Uniform sampling of distance based on specified precision.
      var distances = [0], i = 0, dt = precision / Math.max(n0, n1);
      while ((i += dt) < 1) distances.push(i);
      distances.push(1);

      // Compute point-interpolators at each distance.
      var points = distances.map(function(t) {
        var p0 = path0.getPointAtLength(t * n0),
            p1 = path1.getPointAtLength(t * n1);
        return d3.interpolate([p0.x, p0.y], [p1.x, p1.y]);
      });

      return function(t) {
        return t < 1 ? "M" + points.map(function(p) { return p(t); }).join("L") : d1;
      };
    };
  };


  pvt.getEdgePath = function(d){
    var pathPts = [].concat(d.get("middlePts"));
    pathPts.unshift(d.get("source"));
    // TODO only compute if node position changed
    pathPts.push(pvt.computeEndPt(pathPts[pathPts.length-1], d.get("target")));
    return pvt.d3Line(pathPts);
  };

  // computes intersection points for two circular nodes (simple geometry)
  pvt.computeEndPt = function (src, tgt){
    var srcX = src.x === undefined ? src.get("x") : src.x,
        srcY =  src.y === undefined ? src.get("y") : src.y,
        tgtX = tgt.get("x"),
        tgtY = tgt.get("y"),
        ratio = Math.pow((srcY - tgtY)/(srcX - tgtX), 2),
        r = pvt.consts.nodeRadius,
        offX = r/Math.sqrt(1 + ratio) * (srcX > tgtX ? -1 : 1),
        offY = r/Math.sqrt(1 + 1/ratio) * (srcY > tgtY ? -1 : 1);

    // keep source at origin since we don't have an end marker
    return {x: tgtX - offX, y: tgtY - offY};
  };


  return Backbone.View.extend({


    // hack to call appRouter from view (must pass in approuter)
    appRouter: null,

    /**
     * Initialize function
     * This function should not be overwritten in subclasses
     * Use preinitialize and postinitialize to perform the desired actions
     * TODO throw error if in subclass version (how?)
     */
    initialize: function(inp){
      this.preinitialize();
      this.isFirstRender = true;
      this.isRendered = false;
      this.state = {
        doCircleTrans: false,
        doPathsTrans: false
      };
      if (inp !== undefined){
        this.appRouter = inp.appRouter;
      }
      this.postinitialize();
    },

    /**
     * Base render function
     * This function should not be overwritten in subclasses
     * Use `prerender` and `postrender` to perform actions before/after the basic graph rendering
     * TODO throw error if in subclass version (how?)
     */
    render: function() {
      var thisView = this,
          consts = pvt.consts;

      if (thisView.isFirstRender) {
        pvt.firstRenderBase.call(thisView);
        thisView.firstRender.call(thisView);
        thisView.isFirstRender = false;
      }

      //***********
      // PRERENDER
      //***********
      thisView.prerender();
      //***********


      //*************
      // Render Paths
      //*************

      // set the paths to only contain visible paths FIXME do edges always have ids?
      thisView.gPaths = thisView.gPaths
        .data(thisView.model.get("edges").filter(function(mdl){
          return mdl.isVisible();
        }), function(d){
          return d.id;
        });

      var gPaths = thisView.gPaths;

      if (thisView.state.doPathsTrans){ // TOMOVE do we want to use state?
        gPaths.each(function(d){
          var d3el = d3.select(this),
              edgePath = pvt.getEdgePath(d);
          d3el.selectAll("path." + consts.pathClass)
            .transition()
            .attrTween("d", pvt.pathTween(edgePath, 4));
          d3el.selectAll("path." + consts.pathWrapClass)
            .attr("d", edgePath);
        });
        thisView.state.doPathsTrans = false;
      }
      else{
        gPaths.each(function(d){
          // FIXME: remove code repetition with above conditional
          var d3el = d3.select(this),
              edgePath = pvt.getEdgePath(d);
          d3el.selectAll("path")
            .attr("d", edgePath);
        });
      }

      // add new paths
      var newPathsG = gPaths.enter().append("g");
      newPathsG
        .attr("id", function (d) { thisView.getPathGId(d); })
        .each(function(d){
          var d3el = d3.select(this),
              edgePath = pvt.getEdgePath(d);
          // apend display path
          d3el.append("path")
            .style('marker-end','url(#end-arrow)')
            .classed(consts.pathClass, true)
            .attr("d", edgePath );
          // append onhover path
          d3el.append("path")
            .attr("d", edgePath )
            .classed(pvt.consts.pathWrapClass, true);
        });

      // call subview function
      thisView.handleNewPaths(newPathsG);

      // remove old links
      gPaths.exit().remove(); // TODO add appropriate animation

      //***************
      // Render Circles
      //***************
     // update existing nodes
      thisView.gCircles = thisView.gCircles
        .data(thisView.model.get("nodes").filter(function(mdl){return mdl.isVisible();}),
              function(d){
                return d.id;
              });

      thisView.gCircles.exit().remove(); // TODO add appropriate animation

      if (thisView.state.doCircleTrans){
        thisView.gCircles
          .transition()
          .attr("transform", function(d){
            return "translate(" + d.get("x") + "," + d.get("y") + ")";
          });
        thisView.state.doCircleTrans = false;
      }
      else {
        thisView.gCircles
          .attr("transform", function(d){
            return "translate(" + d.get("x") + "," + d.get("y") + ")";
          });
        }

      // add new nodes
      var newGs = thisView.gCircles
            .enter()
            .append("g");

      newGs.classed(consts.circleGClass, true)
        .attr("id", function (d) { thisView.getCircleGId (d); })
        .attr("transform", function(d){return "translate(" + d.get("x") + "," + d.get("y") + ")";})
        .append("circle")
        .attr("r", consts.nodeRadius);

      thisView.handleNewCircles(newGs);

      //***********
      // POSTRENDER
      //***********
      thisView.postrender();
      //***********
      thisView.isRendered = false;
    },

    /**
     * Optimize graph placement using dagre
     * TODO should this be moved to the graph object?
     *
     * @param <boolean> minSSDist: whether to miminize the squared distance of the
     * nodes moved in the graph by adding the mean distance moved in each direction -- defaults to true
     * @param <id> noMoveNodeId: node id of node that should not move during optimization
     * note: noMoveNodeId has precedent over minSSDist
     */
    optimizeGraphPlacement: function(minSSDist, noMoveNodeId) {
      var thisView = this;
      thisView.state.doCircleTrans = true;
      thisView.state.doPathsTrans = true;
      thisView.model.optimizePlacement(pvt.consts.nodeRadius, minSSDist, noMoveNodeId);
      thisView.render();

    },

    /**
     * Return the g element of the path from the given model
     *
     * @param eModel: the edge model
     */
    getD3PathGFromModel: function(eModel){
      return d3.select("#" + this.getPathGId(eModel));
    },

    /**
     * Return the g element for the circle from the given model
     *
     * @param nModel: the node model
     */
    getD3CircleGFromModel: function(nModel){
      return d3.select("#" + this.getCircleGId(nModel));
    },

    /**
     * Return the circleG id for a a nodeModel
     *
     * @return <string> the id of circleG
     */
    getCircleGId: function  (nodeModel) {
      return pvt.consts.circleGIdPrefix + nodeModel.id;
    },

    /**
     * Return the edgeG id for a a nodeModel
     *
     * @return <string> the id of edgeG
     */
    getPathGId: function  (edgeModel) {
      return pvt.consts.edgeGIdPrefix + edgeModel.id;
    },


    /**
     * Returns a clone of the base private object
     *
     * @return {object} the base private object
     */
    getConstsClone: function() {
      return _.clone(pvt.consts);
    },

    /**
     * Return true if the view has been rendered
     */
    isRendered: function(){
      return this.isRendered;
    },

    /**
     * return the specified view constant
     */
    getViewConst: function(vc){
      return pvt.consts[vc];
    },

      /**
       * Close and unbind views to avoid memory leaks TODO make sure to unbind any listeners
       */
      close: function() {
        this.remove();
        this.unbind();
      },



    //********************
    // ABSTRACT METHODS
    //*******************

    /**
     * Function called before render actions
     * This function should be overwritten in subclasses if desired
     */
    prerender: function() {},

    /**
     * Function called after render actions
     * This function should be overwritten in subclasses if desired
     */
    postrender: function() {},

    /**
     * Function called before initialize actions
     * This function should be overwritten in subclasses if desired
     */
    preinitialize: function() {},

    /**
     * Function called after initialize actions
     * This function should be overwritten in subclasses if desired
     */
    postinitialize: function() {},

    // override in subclass
    windowKeyDown: function() {},

    // override in subclass
    windowKeyUp: function() {},

    // override in subclass
    handleNewPaths: function() {},

    // override in subclass
    firstRender: function(){

    }
  });

});
