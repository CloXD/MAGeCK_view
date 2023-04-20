import { Alerts } from "./utils/alert";
import { MageckData } from "./data/MageckData";
import { download } from "./utils/functions";
import $ from "jquery";

const SGC_DT = "sgrna";
const SGS_DT = "sgrnaSummary";
const GS_DT = "geneSummary";
const KEEP_FRACTION = 0.1;
const PLOTS_WITH_SELECTION = ["#mgkv-line-sgrna", "#mgkv-volcano-gene", "#mgkv-volcano-sg"];

class MGKV {
  /**
   * Initialize MAGeCK View in the given dom.
   * @param {string|jQueryDOM} root : id of the DIV or jQuery element
   */
  constructor(root) {
    if (typeof root == "string") {
      this.root = $(root);
    } else {
      this.root = root;
    }
    this.root.addClass("visually-hidden");
    this.root.append(
      $(
        "<div class='row'><div class='col-12'><h3>Genes summary</h3></div><div class='col-12'><table class='table table-striped table-bordered' id='mgkv-gene-table'></table></div></div>"
      )
    );
    this.root.append(
      $(
        "<div class='row'><div class='col-12 mt-3'><h3>sgRNA summary</h3></div><div class='col-12'><table class='table table-striped table-bordered' id='mgkv-sg-table'></table></div></div>"
      )
    );
    this.root.append(
      $(
        "<div class='row'><div class='col-12 mt-3'><h3>Plots </h3></div><div class='col-12'><div id='mgkv-plotly-buttons' class='btn-group'></div></div><div class='col-12 mt-2'><div id='mgkv-plotly-options'></div></div><div class='col-12'><div id='mgkv-plotly' style='min-height:80vh'></div></div></div>"
      )
    );
    this._initSgBoxplot();
    this._initVolcanoPlot();
    this._initSgLinePlot();
    this.alerts = new Alerts();
    this.data = new MageckData();
  }

  geneTable = undefined;
  sgTable = undefined;
  _display_count_normalization = "raw";
  _last_plot ="";
  afterInit = () => {};
  /**
   * Parse a library file
   * @param {*} file file value of an input element (let file = el.files[0])
   * @param {*} libName name of the library
   * @returns Promise<number> return the index of the added library
   */
  parseLibrary(file, libName) {
    return this.data.parseLibrary(file, libName);
  }

  /**
   * Get the list of library loaded
   */
  get library() {
    return this.data.sgLibrary;
  }

  /**
   * Set the control gene
   * @param {string} gene
   */
  setControlGene(gene) {
    this.data.control_gene = gene;
  }

  /**
   * Parse an input file as gene summary, sgRNA count or summary
   * @param {*} file file value of an input element (let file = el.files[0])
   * @param {*} data_type one of "sgrna", "sgrnaSummary" or "geneSummary";
   * @returns Promise<void>
   */
  parse(file, data_type) {
    return new Promise((resolve, reject) => {
      if (this._validInput(file.name, data_type)) {
        let reader = new FileReader();
        let data = "";
        reader.onload = () => {
          data = data + reader.result;
        };
        reader.readAsText(file);
        reader.onloadend = () => {
          let exec = undefined;
          if (data_type == SGC_DT) {
            exec = this.data.parseSgCount(data);
          }
          if (data_type == GS_DT) {
            exec = this.data.parseGeneSummary(data);
          }
          if (data_type == SGS_DT) {
            exec = this.data.parseSgRNASummary(data);
          }
          exec
            .then((res) => {
              this.alerts.success("File " + file.name + " imported correctly");
              resolve(res);
            })
            .catch((err) => {
              console.log(err);
              this.alerts.error(err);
              reject(err);
            });
        };
      } else {
        this.alerts.error(
          "The file has an invalid name. Please, use the outputs of MAGeCK."
        );
        reject("Invalid name");
      }
    });
  }

  /**
   * If the necessary files are imported, load the GUI
   * @returns Promise<void>
   */
  async load() {
    if (this.ready) {
      await this._loading(true);
      await this.data.mergeCountSummary();
      await this._initTables();
      await this._loading(false);
    } else {
      throw "Not ready";
    }
  }
  /**
   * True if the required files are loaded
   */
  get ready() {
    return this.data.ready;
  }
  /**
   * List of samples loaded ( sgRNA count derived )
   */
  get samples() {
    return this.data.samples;
  }

  /**
   * Initialize the sgBoxplot options
   */
  _initSgBoxplot() {
    $("#mgkv-plotly-buttons").append(
      "<button class='btn btn-primary' id='mgkv-boxplot-sgrna'>sgRNA boxplot</button>"
    );
    $("#mgkv-plotly-options").append(
      "<div id='mgkv-plt-opts-sgb' class='btn-group mgkv-plt-opts row visually-hidden'>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-sgb-norm'>" +
        "<option value='raw' selected>Raw counts</option>" +
        "<option value='total'>Total normalization</option>" +
        "<option value='median'>Median normalization</option>" +
        "<option value='control'>Control normalization (equal median of NO-TARGET sgRNA)</option>" +
        "</select></div>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-sgb-scale'>" +
        "<option value='log10' selected>Log10</option>" +
        "<option value='linear'>Linear</option>" +
        "<option value='log2'>Log2</option>" +
        "</select></div>" +
        "</div>"
    );
    $("#mgkv-boxplot-sgrna").on("click", () => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-boxplot-sgrna").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-sgb").removeClass("visually-hidden");
      let opts = { norm: "raw", scale: "log10" };
      opts.norm = $("#mgkv-plt-opts-sgb-norm").val();
      opts.scale = $("#mgkv-plt-opts-sgb-scale").val();
      this._last_plot = "#mgkv-boxplot-sgrna";
      this._sgBoxPlot(opts);
    });
    $("#mgkv-plt-opts-sgb select").on("change", ()=>{
      $("#mgkv-boxplot-sgrna").trigger("click");
    })
  }
  /**
   * Initialize the sgLinePlot options
   */
  _initSgLinePlot() {
    $("#mgkv-plotly-buttons").append(
      "<button class='btn btn-primary' id='mgkv-line-sgrna'>sgRNA expression</button>"
    );
    $("#mgkv-plotly-options").append(
      "<div id='mgkv-plt-opts-sgl' class='btn-group mgkv-plt-opts row visually-hidden'>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-sgl-norm'>" +
        "<option value='raw' selected>Raw counts</option>" +
        "<option value='total'>Total normalization</option>" +
        "<option value='median'>Median normalization</option>" +
        "<option value='control'>Control normalization (NO-TARGET sgRNA)</option>" +
        "</select></div>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-sgl-scale'>" +
        "<option value='log10' selected>Log10</option>" +
        "<option value='linear'>Linear</option>" +
        "<option value='log2'>Log2</option>" +
        "</select></div>" +
        "</div>"
    );
    $("#mgkv-line-sgrna").on("click",() => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-line-sgrna").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-sgl").removeClass("visually-hidden");
      let opts = { norm: "raw", scale: "log10" };
      opts.norm = $("#mgkv-plt-opts-sgl-norm").val();
      opts.scale = $("#mgkv-plt-opts-sgl-scale").val();
      this._last_plot = "#mgkv-line-sgrna";
      this._sgLinePlot(opts);
    });
    $("#mgkv-plt-opts-sgl select").on("change", ()=>{
      $("#mgkv-line-sgrna").trigger("click");
    })
  }

  /**
   * Initialize the VolcanoPlots options
   */
  _initVolcanoPlot() {
    $("#mgkv-plotly-buttons").append(
      "<button class='btn btn-primary' id='mgkv-volcano-gene'>Genes Volcano Plot</button>"
    );
    $("#mgkv-plotly-buttons").append(
      "<button class='btn btn-primary' id='mgkv-volcano-sg'>sgRNA Volcano Plot</button>"
    );
    $("#mgkv-plotly-options").append(
      "<div id='mgkv-plt-opts-gvp' class='btn-group mgkv-plt-opts row visually-hidden'>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-gvp-y'>" +
        "<option value='pvalue' selected>p-value</option>" +
        "<option value='FDR'>FDR</option></select></div>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-gvp-grp'>" +
        "<option value='best' selected title='Most significant between positive and negative p-value'>Best</option>" +
        "<option value='neg'>Negative</option>" +
        "<option value='pos'>Positive</option></select></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Significance threshold</span><input class='form-control' id='mgkv-plt-opts-gvp-thr0' type='number' value='0.05' ></div></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Absolute LogFC threshold</span><input class='form-control' id='mgkv-plt-opts-gvp-thr1' type='number' value='1.0' ></div></div>" +
        "</div>"
    );
    $("#mgkv-plotly-options").append(
      "<div id='mgkv-plt-opts-svp' class='btn-group mgkv-plt-opts row visually-hidden'>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-svp-y'>" +
        "<option value='pvalue' selected>p-value</option>" +
        "<option value='FDR'>FDR</option>" +
        "<option value='pLow'>p-value low</option>" +
        "<option value='pHigh'>p-value high</option></select></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Significance threshold</span><input class='form-control' id='mgkv-plt-opts-svp-thr0' type='number' value='0.05' ></div></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Absolute LogFC threshold</span><input class='form-control' id='mgkv-plt-opts-svp-thr1' type='number' value='1.0' ></div></div>" +
        "<small>For performance reasons some data in dense regions are omitted.</small>" +
        "</div>"
    );
    $("#mgkv-volcano-gene").on("click", () => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-volcano-gene").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-gvp").removeClass("visually-hidden");
      let opts = { value: "pvalue", group: "best", thr: [0.05, 1] };
      opts.value = $("#mgkv-plt-opts-gvp-y").val();
      opts.group = $("#mgkv-plt-opts-gvp-grp").val();
      opts.thr[0] = parseFloat($("#mgkv-plt-opts-gvp-thr0").val());
      opts.thr[1] = parseFloat($("#mgkv-plt-opts-gvp-thr1").val());
      this._last_plot = "#mgkv-volcano-gene";
      this._geneVolcanoPlot(opts);
    });
    $("#mgkv-plt-opts-gvp select").on("change", ()=>{
      $("#mgkv-volcano-gene").trigger("click");
    })
    $("#mgkv-volcano-sg").on("click", () => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-volcano-sg").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-svp").removeClass("visually-hidden");
      let opts = { value: "pvalue", thr: [0.05, 1] };
      opts.value = $("#mgkv-plt-opts-svp-y").val();
      opts.group = $("#mgkv-plt-opts-svp-grp").val();
      opts.thr[0] = parseFloat($("#mgkv-plt-opts-svp-thr0").val());
      opts.thr[1] = parseFloat($("#mgkv-plt-opts-svp-thr1").val());
      this._last_plot = "#mgkv-volcano-sg";
      this._sgVolcanoPlot(opts);
    });
    $("#mgkv-plt-opts-svp select").on("change", ()=>{
      $("#mgkv-volcano-sg").trigger("click");
    })
  }
  /**
   * Check if the input files have a correct name
   * @param {string} fileName
   * @param {string} dataType
   * @returns
   */
  _validInput(fileName, dataType) {
    return (
      (fileName.match(".*.count.txt$") && dataType == SGC_DT) ||
      (fileName.match(".*.gene_summary.txt$") && dataType == GS_DT) ||
      (fileName.match(".*.sgrna_summary.txt$") && dataType == SGS_DT)
    );
  }

  datarevision = 0;

  /**
   * Draw the plot
   * @param {PlotlyData} data
   * @param {PlotlyDataLayoutConfig} layout
   */
  _plot(data, layout) {
    this.datarevision += 1;
    layout.datarevision = this.datarevision;
    Plotly.react(document.getElementById("mgkv-plotly"), data, layout);
  }
  /**
   * Plot a sgRNA plot of the currently selected sgRNAs
   * @param {{norm : string, scale : string}} userOpts User options for drawing the plot
   * @returns void
   */
  _sgLinePlot(userOpts) {
    let opts = Object.assign({ norm: "raw", scale: "log10" }, userOpts);
    if (this.data.selectedGenes.length == 0) {
      this._plot([], {
        title: "Select one or more gene to see the expression of their sgRNAs",
      });
      return;
    }
    let data = [];
    let genes = this.data.selectedGenes.map((sg) => sg.name);
    this.data.sg_data.getData("filtered").then((response) => {
      response.data.forEach((sg) => {
        let gene = this.data.selectedGenes.find((g) => g.name == sg.gene);
        let gene_idx = genes.indexOf(sg.gene);
        let dat = {
          x: [],
          y: [],
          order: gene_idx,
          name: sg.sgrna + " (" + sg.gene + ")",
          type: "scatter",
          marker: { color: gene.color, size: 15 },
          line: { color: gene.color },
        };
        sg.counts.forEach((c, i) => {
          dat.x.push(this.samples[i].name);
          let nc = this.data.normalization_factors[opts.norm][i] * c;
          if (opts.scale == "log10") {
            dat.y.push(nc == 0 ? 0 : Math.log10(nc));
          } else if (opts.scale == "log2") {
            dat.y.push(nc == 0 ? 0 : Math.log2(nc));
          } else {
            dat.y.push(nc);
          }
        });
        if (gene_idx > 0) {
          dat.xaxis = "x" + (gene_idx + 1);
          dat.yaxis = "y" + (gene_idx + 1);
        }
        data.push(dat);
      });
      let layout = {
        title: "sgRNA expression plot",
        xaxis: { title: genes[0] },
        yaxis: {
          title:
            (opts.scale == "linear" ? "" : opts.scale + " ") +
            (opts.norm == "raw" ? "raw" : opts.norm + " normalized") +
            " counts",
        },
      };
      genes.forEach((g, idx) => {
        if (idx > 0) {
          layout["xaxis" + (idx + 1)] = { title: g };
          layout["yaxis" + (idx + 1)] = { title: layout.yaxis.title };
        }
      });
      if (genes.length > 1) {
        layout.grid = {
          rows: genes.length > 2 ? Math.ceil(genes.length / 2) : 1,
          columns: 2,
          pattern: "independent",
        };
      }
      data = data.sort((a, b) => a.order - b.order);
      this._plot(data, layout);
    });
  }

  /**
   * Draw a BoxPlot of all the sgRNA
   * @param {{norm: string, scale : string}} userOpts define the normalization and the scale of the sgRNA counts
   */
  _sgBoxPlot(userOpts) {
    let opts = Object.assign({ norm: "raw", scale: "log10" }, userOpts);
    let data = this.data.samples.map((s) => {
      return { y: [], name: s.name, order: s.order, type: "box" };
    });
    this.data.sg_data.data.forEach((dat) => {
      dat.counts.forEach((c, idx) => {
        let nc = this.data.normalization_factors[opts.norm][idx] * c;
        if (opts.scale == "log10") {
          data[idx].y.push(nc == 0 ? 0 : Math.log10(nc));
        } else if (opts.scale == "log2") {
          data[idx].y.push(nc == 0 ? 0 : Math.log2(nc));
        } else {
          data[idx].y.push(nc);
        }
      });
    });
    data = data.sort((a, b) => a.order - b.order);
    let layout = {
      title: "sgRNA boxplot",
      xaxis: { title: "Sample" },
      yaxis: {
        title:
          (opts.scale == "linear" ? "" : opts.scale + " ") +
          (opts.norm == "raw" ? "raw" : opts.norm + " normalized") +
          " counts",
      },
    };
    this._plot(data, layout);
  }
  /**
   *
   * @param {{value : string, group : string, thr : number[]}} userOpts define the value (pvalue, FDR), group (best, low, high) and thresholds [pvalue_thr, LFC_thr ]
   */
  _geneVolcanoPlot(userOpts) {
    let opts = Object.assign(
      { value: "pvalue", group: "best", thr: [0.05, 1] },
      userOpts
    );
    let thr_x = opts.thr[1];
    let thr_y = opts.thr[0];
    let layout = {
      title: "Genes Volcano Plot",
      xaxis: { title: "LogFC" },
      yaxis: { title: opts.value },
    };
    let data = [
      {
        mode: "markers",
        type: "scatter",
        x: [],
        y: [],
        text: [],
        name: "Neg",
        marker: { color: "#7CC6FE" },
      },
      {
        mode: "markers",
        type: "scatter",
        x: [],
        y: [],
        text: [],
        name: "Const",
        marker: { color: "#BFBFBF" },
      },
      {
        mode: "markers",
        type: "scatter",
        x: [],
        y: [],
        text: [],
        name: "Pos",
        marker: { color: "#FF7D83" },
      },
    ];
    if (this.data.selectedGenes.length > 0) {
      this.data.selectedGenes.forEach((g) => {
        data.push({
          mode: "markers+text",
          type: "scatter",
          x: [],
          y: [],
          text: [],
          name: g.name,
          textposition: "top center",
          marker: { color: g.color, size: 14 },
        });
      });
    }
    let min_y = 1;
    this.data.gene_data.data.forEach((d) => {
      let x,
        y,
        text = d.gene;
      if (opts.group == "best") {
        x = d.LFC;
        y = d[opts.value];
      } else {
        x = d[opts.group].LFC;
        y = d[opts.group][opts.value];
      }
      if (y != 0 && min_y > y) {
        min_y = y;
      }

      let grp = this.data.selectedGenes.findIndex((sg) => sg.name == d.gene);
      if (grp == -1) {
        grp = y > thr_y ? 1 : x < -thr_x ? 0 : x > thr_x ? 2 : 1;
      } else {
        grp = grp + 3;
      }
      data[grp].x.push(x);
      data[grp].y.push(y == 0 ? -1 : -Math.log10(y));
      data[grp].text.push(text);
    });
    let max_y = -Math.log10(min_y);
    data.forEach((dat) => {
      dat.y = dat.y.map((y) => (y == -1 ? max_y : y));
    });

    this._plot(data, layout);
  }

  /**
   * sgRNA volcano plot
   * @param {*} userOpts define the value (pvalue, FDR, pLow, pHigh) and thresholds [pvalue_thr, LFC_thr ]
   */
  _sgVolcanoPlot(userOpts) {
    let opts = Object.assign({ value: "pvalue", thr: [0.05, 1] }, userOpts);
    let thr_x = opts.thr[1];
    let thr_y = opts.thr[0];
    let layout = {
      title: "sgRNA Volcano Plot",
      xaxis: { title: "LogFC" },
      yaxis: { title: opts.value },
    };

    let data = [
      {
        mode: "markers",
        type: "scatter",
        x: [],
        y: [],
        text: [],
        name: "Neg",
        marker: { color: "#7CC6FE" },
      },
      {
        mode: "markers",
        type: "scatter",
        x: [],
        y: [],
        text: [],
        name: "Const",
        marker: { color: "#BFBFBF" },
      },
      {
        mode: "markers",
        type: "scatter",
        x: [],
        y: [],
        text: [],
        name: "Pos",
        marker: { color: "#FF7D83" },
      },
    ];
    if (this.data.selectedGenes.length > 0) {
      this.data.selectedGenes.forEach((g) => {
        data.push({
          mode: "markers+text",
          type: "scatter",
          x: [],
          y: [],
          text: [],
          name: g.name,
          textposition: "top center",
          marker: { color: g.color, size: 14 },
        });
      });
    }
    let min_y = 1, min_x=0, max_x=0;
    let data_points=[];
    this.data.sg_data.data.forEach((d) => {
      let x,
        y,
        text = d.sgrna;
      x = d.LFC;
      y = d[opts.value];

      if (y != 0 && min_y > y) {
        min_y = y;
      }

      let grp = this.data.selectedGenes.findIndex((sg) => sg.name == d.gene);
      if (grp == -1) {
        grp = y > thr_y ? 1 : x < -thr_x ? 0 : x > thr_x ? 2 : 1;
      } else {
        grp = grp + 3;
      }
      if ( x < min_x ){
        min_x = x
      }
      if (x > max_x ){
        max_x = x
      }
      data_points.push({x: x, y : y == 0 ? -1 : -Math.log10(y), text : text, grp : grp});
    });
    let max_y = -Math.log10(min_y);
    data_points.forEach((dat) => {
      dat.y = dat.y == -1 ? max_y : dat.y;
    });
    /// create a grid and add only 10 data points for each grid
    let grid = {};
    data_points.forEach((dat)=>{
      let keep = dat.grp > 2;
      if ( ! keep ){
        let grid_x = Math.round(((dat.x - min_x) *300 )/ (max_x - min_x))
        let grid_y = Math.round(((dat.y ) *100 )/ (max_y ))
        let grid_k =grid_x+":"+grid_y; 
        if ( ! grid[grid_k] ){
          grid[grid_k]=1;
          keep=true;
        } else {
          if ( grid[grid_k] <= 100 ){
            keep=true;
            grid[grid_k]+=1;
          }
        }
      }
      if ( keep ){
        data[dat.grp].x.push(dat.x);
        data[dat.grp].y.push(dat.y);
        data[dat.grp].text.push(dat.text);
      }
    })

    this._plot(data, layout);
  }

  /**
   * Initialize the DataTables.net instances
   * @returns void
   */
  _initTables() {
    return new Promise((resolve, reject) => {
      if (!this.ready) {
        reject("Not ready");
        return;
      }
      this.root.removeClass("visually-hidden");
      if (this.geneTable) {
        this.geneTable.destroy();
      }
      if (this.sgTable) {
        this.sgTable.destroy();
      }
      $("#mgkv-gene-table").empty();
      $("#mgkv-sg-table").empty();
      this.geneTable = $("#mgkv-gene-table").DataTable({
        scrollY: "500px",
        scrollCollapse: true,
        dom:
          "<'row'<'col-sm-12 mb-2'B>>" +
          "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>>" +
          "<'row'<'col-sm-12'tr>>" +
          "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
        serverSide: true,
        processing: true,
        search: { regex: true, smart: false },
        ajax: (request, callback) => {
          this.data
            .getGeneData(request, this._display_count_normalization)
            .then((response) => {
              callback(response);
            });
        },
        colReorder: true,
        rowId: "gene",
        buttons: [
          {
            text: "Download",
            action: (_, bt, btn) => {
              this.data
                .getGeneData("filtered", this._display_count_normalization)
                .then((response) => {});
            },
          },
          "colvis",
          {
            extend: "searchBuilder",
            config: {
              conditions: {
                num: { "!null": null, null: null },
                string: { "!null": null, null: null },
              },
            },
          },
        ],
        order: [[2, "desc"]],
        columns: [
          {
            title: "Gene",
            data: "gene",
            orderable: true,
            searchable: true,
          },
          {
            title: "sgRNA",
            data: "numSgRNA",
            orderable: true,
            searchable: true,
          },
          {
            title: "logFC",
            data: "LFC",
            orderable: true,
            searchable: true,
            visible: true,
          },
          {
            title: "FDR",
            data: "FDR",
            orderable: true,
            searchable: true,
            visible: true,
          },
          {
            title: "p-value",
            data: "pvalue",
            orderable: true,
            searchable: true,
            visible: true,
          },
          {
            title: "Rank",
            data: "rank",
            orderable: true,
            searchable: true,
            visible: true,
          },
          {
            title: "Neg score",
            data: "neg.score",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Neg pvalue",
            data: "neg.pvalue",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Neg FDR",
            data: "neg.FDR",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Neg rank",
            data: "neg.rank",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Neg good",
            data: "neg.good",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Neg LFC",
            data: "neg.LFC",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Pos score",
            data: "pos.score",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Pos pvalue",
            data: "pos.pvalue",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Pos FDR",
            data: "pos.FDR",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Pos rank",
            data: "pos.rank",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Pos good",
            data: "pos.good",
            orderable: true,
            searchable: true,
            visible: false,
          },
          {
            title: "Pos LFC",
            data: "pos.LFC",
            orderable: true,
            searchable: true,
            visible: false,
          },
        ],
      });
      let sgTableCols = [
        {
          title: "sgRNA",
          data: "sgrna",
          orderable: true,
          searchable: true,
        },
        {
          title: "Library",
          data: "library",
          orderable: true,
          searchable: true,
        },
        {
          title: "Gene",
          data: "gene",
          name: "gene",
          orderable: true,
          searchable: true,
        },
        {
          title: "logFC",
          data: "LFC",
          orderable: true,
          searchable: true,
        },
        {
          title: "Score",
          data: "score",
          orderable: true,
          searchable: true,
        },
        {
          title: "p-value neg",
          data: "pLow",
          orderable: true,
          searchable: true,
          visible: false,
        },
        {
          title: "p-value pos",
          data: "pHigh",
          orderable: true,
          searchable: true,
          visible: false,
        },
        {
          title: "p-value",
          data: "pvalue",
          orderable: true,
          searchable: true,
        },
        {
          title: "FDR",
          data: "FDR",
          orderable: true,
          searchable: true,
        },
        {
          title: "Ctr. Var",
          data: "control_var",
          orderable: true,
          searchable: true,
          visible: false,
        },
        {
          title: "Adj. Var",
          data: "adj_var",
          orderable: true,
          searchable: true,
          visible: false,
        },
      ];
      this.samples.forEach((sam, idx) => {
        sgTableCols.push({
          title: sam.name,
          data: sam.name,
          orderable: true,
          searchable: true,
          visible: true,
        });
      });

      this.sgTable = $("#mgkv-sg-table").DataTable({
        scrollY: "500px",
        scrollCollapse: true,
        dom:
          "<'row'<'col-sm-12 mb-2'B>>" +
          "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>>" +
          "<'row'<'col-sm-12'tr>>" +
          "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
        serverSide: true,
        processing: true,
        search: { regex: true, smart: false },
        ajax: (request, callback) => {
          this.data
            .getSgRNAData(request, this._display_count_normalization)
            .then((response) => {
              callback(response);
            });
        },
        colReorder: true,
        rowId: "sgrna",
        buttons: [
          {
            text: "Download",
            action: (_, bt, btn) => {
              this.data
                .getSgRNAData("filtered", this._display_count_normalization)
                .then((response) => {
                  let out = this.data.sg_data.header.join("\t") + "\n";
                  response.data.forEach((d) => {
                    out +=
                      [
                        d.sgrna,
                        d.gene,
                        d.control_count,
                        d.treatment_count,
                        d.means[0],
                        d.means[1],
                        d.LFC,
                        d.control_var,
                        d.adj_var,
                        d.score,
                        d.pLow,
                        d.pHigh,
                        d.pvalue,
                        d.FDR,
                        d.highInTreatment ? "True" : "False",
                      ].join("\t") + "\n";
                  });
                  download("mageck_view.filtered.sg_counts.txt", out);
                });
            },
          },
          {
            text: "Download with counts",
            action: (_, bt, btn) => {
              this.data
                .getSgRNAData("filtered", this._display_count_normalization)
                .then((response) => {
                  let out =
                    this.data.sg_data.header.join("\t") +
                    this.data.samples.map((s) => s.name).join("\t") +
                    "\n";
                  response.data.forEach((d) => {
                    out +=
                      [
                        d.sgrna,
                        d.gene,
                        d.control_count,
                        d.treatment_count,
                        d.means[0],
                        d.means[1],
                        d.LFC,
                        d.control_var,
                        d.adj_var,
                        d.score,
                        d.pLow,
                        d.pHigh,
                        d.pvalue,
                        d.FDR,
                        d.highInTreatment ? "True" : "False",
                      ].join("\t") +
                      "\t" +
                      this.data.samples.map((s) => d[s.name]).join("\t") +
                      "\n";
                  });
                  download("mageck_view.filtered.sg_counts.txt", out);
                });
            },
          },

          "colvis",
          "searchBuilder",
          {
            extend: "collection",
            text: "Count types",
            buttons: [
              {
                text: "Raw counts",
                className:
                  this._display_count_normalization == "raw"
                    ? "active norm-buttons"
                    : "norm-buttons",
                action: (_, dt, btn) => {
                  if (this._display_count_normalization != "raw") {
                    $(".norm-buttons").removeClass("active");
                    btn.addClass("active");
                    this._display_count_normalization = "raw";
                    dt.rows().invalidate().draw(false);
                  }
                },
              },
              {
                text: "Median normalized",
                className:
                  this._display_count_normalization == "median"
                    ? "active norm-buttons"
                    : "norm-buttons",
                action: (_, dt, btn) => {
                  if (this._display_count_normalization != "median") {
                    $(".norm-buttons").removeClass("active");
                    btn.addClass("active");
                    this._display_count_normalization = "median";
                    dt.rows().invalidate().draw(false);
                  }
                },
              },
              {
                text: "Total normalized",
                className:
                  this._display_count_normalization == "total"
                    ? "active norm-buttons"
                    : "norm-buttons",
                action: (_, dt, btn) => {
                  if (this._display_count_normalization != "total") {
                    $(".norm-buttons").removeClass("active");
                    btn.addClass("active");
                    this._display_count_normalization = "total";
                    dt.rows().invalidate().draw(false);
                  }
                },
              },
              {
                text: "Control normalized",
                className:
                  this._display_count_normalization == "control"
                    ? "active norm-buttons"
                    : "norm-buttons",
                action: (_, dt, btn) => {
                  if (this._display_count_normalization != "control") {
                    $(".norm-buttons").removeClass("active");
                    btn.addClass("active");
                    this._display_count_normalization = "control";
                    dt.rows().invalidate().draw(false);
                  }
                },
              },
            ],
          },
          {
            extend: "collection",
            text: "Download count table",
            buttons: [
              {
                text: "Raw",
                action: (_, dt) => {
                  this.data.getSgRNAData("filtered", "raw").then((response) => {
                    let outfile =
                      "sgRNA\tGene\t" +
                      this.samples.map((sam) => sam.name).join("\t") +
                      "\n";
                    response.data.forEach((d) => {
                      outfile +=
                        d.sgrna +
                        "\t" +
                        d.gene +
                        "\t" +
                        this.samples.map((sam) => d[sam.name]).join("\t") +
                        "\n";
                    });
                    download("raw.counts.txt", outfile);
                  });
                },
              },
              {
                text: "Median normalized",
                action: (_, dt) => {
                  this.data
                    .getSgRNAData("filtered", "median")
                    .then((response) => {
                      let outfile =
                        "sgRNA\tGene\t" +
                        this.samples.map((sam) => sam.name).join("\t") +
                        "\n";
                      response.data.forEach((d) => {
                        outfile +=
                          d.sgrna +
                          "\t" +
                          d.gene +
                          "\t" +
                          this.samples.map((sam) => d[sam.name]).join("\t") +
                          "\n";
                      });
                      download("median.counts.txt", outfile);
                    });
                },
              },
              {
                text: "Total normalized",
                action: (_, dt) => {
                  this.data
                    .getSgRNAData("filtered", "total")
                    .then((response) => {
                      let outfile =
                        "sgRNA\tGene\t" +
                        this.samples.map((sam) => sam.name).join("\t") +
                        "\n";
                      response.data.forEach((d) => {
                        outfile +=
                          d.sgrna +
                          "\t" +
                          d.gene +
                          "\t" +
                          this.samples.map((sam) => d[sam.name]).join("\t") +
                          "\n";
                      });
                      download("total.counts.txt", outfile);
                    });
                },
              },
              {
                text: "Control normalized",
                action: (_, dt) => {
                  this.data
                    .getSgRNAData("filtered", "control")
                    .then((response) => {
                      let outfile =
                        "sgRNA\tGene\t" +
                        this.samples.map((sam) => sam.name).join("\t") +
                        "\n";
                      response.data.forEach((d) => {
                        outfile +=
                          d.sgrna +
                          "\t" +
                          d.gene +
                          "\t" +
                          this.samples.map((sam) => d[sam.name]).join("\t") +
                          "\n";
                      });
                      download("control.counts.txt", outfile);
                    });
                },
              },
            ],
          },
        ],
        order: [[3, "desc"]],
        columns: sgTableCols,
      });
      $("#mgkv-gene-table tbody").on("click", "tr", (el) => {
        let $el = $(el.currentTarget);
        let gene = $el.attr("id");
        if (this.data.isSelected(gene)) {
          $el.removeClass("selected");
        } else {
          $el.addClass("selected");
        }
        this.data.toggleGene(gene);
        this.sgTable.draw();
        if ( PLOTS_WITH_SELECTION.includes(this._last_plot) ){
          $(this._last_plot).trigger("click");
        }
      });
      $("#mgkv-boxplot-sgrna").trigger("click");
      this.afterInit();
      resolve();
      return true;
    });
  }

  /**
   * Enable or disable the loading div
   * @param {boolean} enable
   * @returns Promise<void>
   */
  _loading(enable = true) {
    return new Promise((resolve, reject) => {
      if (enable) {
        $("body").append(
          "<div id='mgkv-loading' class='position-absolute z-3 top-0 start-0 vh-100 vw-100 d-flex align-items-center justify-content-center bg-light'><div class='spinner-border text-success me-2' role='status'></div><h3>Loading the data</h3></div>"
        );
      } else {
        $("#mgkv-loading").remove();
      }
      setTimeout(resolve, 100);
    });
  }
}

export { MGKV as default };
