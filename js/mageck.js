import { Alerts } from "./utils/alert";
import { SgRNASummary } from "./data/sgRNASummary";
import { GeneSummary } from "./data/geneSummary";
import { download } from "./utils/functions";
import $ from "jquery";
import DataTable from 'datatables.net';

const SGC_DT = "sgrna";
const SGS_DT = "sgrnaSummary";
const GS_DT = "geneSummary";
const COLOR_P = ["#04AF54", "#AFAA05", "#5D05AF", "#AF0585", "#68DE3D"];
const KEEP_FRACTION = 0.1;
const CONTROL_GENE = "NO-TARGET";

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
        "<div class='row'><div class='col-12 mt-3'><h3>Plots </h3><small>click again on the plot button to refresh after changing options</small></div><div class='col-12'><div id='mgkv-plotly-buttons' class='btn-group'></div></div><div class='col-12 mt-2'><div id='mgkv-plotly-options'></div></div><div class='col-12'><div id='mgkv-plotly' style='min-height:80vh'></div></div></div>"
      )
    );
    this._initSgBoxplot();
    this._initVolcanoPlot();
    this._initSgLinePlot();
    this.alerts = new Alerts();
    this.sgSummary = new SgRNASummary();
    this.gSummary = new GeneSummary();
  }

  geneTable = undefined;
  sgTable = undefined;
  selectedGene = [];
  normalization_factors = undefined;
  control_gene = CONTROL_GENE;
  _display_count_normalization = "raw";
  afterInit = () => {};
  /**
   * Parse a library file
   * @param {*} file file value of an input element (let file = el.files[0])
   * @param {*} libName name of the library
   * @returns Promise<number> return the index of the added library
   */
  parseLibrary(file, libName) {
    return this.sgSummary.parseLibrary(file, libName);
  }

  /**
   * Get the list of library loaded
   */
  get library(){
    return this.sgSummary.sgLibrary
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
            exec = this.sgSummary.parseSgCount(data);
          }
          if (data_type == GS_DT) {
            exec = this.gSummary.parse(data);
          }
          if (data_type == SGS_DT) {
            exec = this.sgSummary.parse(data);
          }
          exec.then((res) => {
              this.alerts.success("File "+file.name+" imported correctly");
              resolve(res);
            })
            .catch((err) => {
                console.log(err)
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
  load() {
    return new Promise((resolve, reject) => {
      if (this.ready) {
        this.sgSummary.mergeCountSummary();
        this._loading(true).then(() => {
          this._initTables()
            .then(() => {
              this._loading(false).then(resolve);
            })
            .catch((err) => {
              reject(err);
            });
        });
      } else {
        reject("Not redy");
      }
    });
  }
  /**
   * True if the required files are loaded
   */
  get ready() {
    return this.sgSummary.ready && this.gSummary.ready;
  }
  /**
   * List of samples loaded ( sgRNA count derived )
   */
  get samples(){
    return this.sgSummary.samples;
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
    $("#mgkv-boxplot-sgrna").on("click",() => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-boxplot-sgrna").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-sgb").removeClass("visually-hidden");
      let opts = { norm: "raw", scale: "log10" };
      opts.norm = $("#mgkv-plt-opts-sgb-norm").val();
      opts.scale = $("#mgkv-plt-opts-sgb-scale").val();
      this._sgBoxPlot(opts);
    });
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
    $("#mgkv-line-sgrna").click(() => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-line-sgrna").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-sgl").removeClass("visually-hidden");
      let opts = { norm: "raw", scale: "log10" };
      opts.norm = $("#mgkv-plt-opts-sgl-norm").val();
      opts.scale = $("#mgkv-plt-opts-sgl-scale").val();
      this._sgLinePlot(opts);
    });
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
        "<option value='pvalue' selected>Y axis value</option>" +
        "<option value='pvalue'>p-value</option>" +
        "<option value='FDR'>FDR</option></select></div>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-gvp-grp'>" +
        "<option value='best' selected>Test type</option>" +
        "<option value='best' title='Most significant between positive and negative p-value'>Best</option>" +
        "<option value='neg'>Negative</option>" +
        "<option value='pos'>Positive</option></select></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Significance threshold</span><input class='form-control' id='mgkv-plt-opts-gvp-thr0' type='number' value='0.05' ></div></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Absolute LogFC threshold</span><input class='form-control' id='mgkv-plt-opts-gvp-thr1' type='number' value='1.0' ></div></div>" +
        "<small>For performance reasons, only 10% of the Const data are shown.</small>" +
        "</div>"
    );
    $("#mgkv-plotly-options").append(
      "<div id='mgkv-plt-opts-svp' class='btn-group mgkv-plt-opts row visually-hidden'>" +
        "<div class='col'><select class='form-select' id='mgkv-plt-opts-svp-y'>" +
        "<option value='pvalue' selected>Y axis value</option>" +
        "<option value='pvalue'>p-value</option>" +
        "<option value='FDR'>FDR</option>" +
        "<option value='pLow'>p-value low</option>" +
        "<option value='pHigh'>p-value high</option></select></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Significance threshold</span><input class='form-control' id='mgkv-plt-opts-svp-thr0' type='number' value='0.05' ></div></div>" +
        "<div class='col'><div class='input-group'><span class='input-group-text'>Absolute LogFC threshold</span><input class='form-control' id='mgkv-plt-opts-svp-thr1' type='number' value='1.0' ></div></div>" +
        "<small>For performance reasons, only 10% of the Const data are shown.</small>" +
        "</div>"
    );
    $("#mgkv-volcano-gene").click(() => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-volcano-gene").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-gvp").removeClass("visually-hidden");
      let opts = { value: "pvalue", group: "best", thr: [0.05, 1] };
      opts.value = $("#mgkv-plt-opts-gvp-y").val();
      opts.group = $("#mgkv-plt-opts-gvp-grp").val();
      opts.thr[0] = parseFloat($("#mgkv-plt-opts-gvp-thr0").val());
      opts.thr[1] = parseFloat($("#mgkv-plt-opts-gvp-thr1").val());
      this._geneVolcanoPlot(opts);
    });
    $("#mgkv-volcano-sg").click(() => {
      $("#mgkv-plotly-buttons>button").removeClass("active");
      $("#mgkv-volcano-sg").addClass("active");
      $(".mgkv-plt-opts").addClass("visually-hidden");
      $("#mgkv-plt-opts-svp").removeClass("visually-hidden");
      let opts = { value: "pvalue", thr: [0.05, 1] };
      opts.value = $("#mgkv-plt-opts-svp-y").val();
      opts.group = $("#mgkv-plt-opts-svp-grp").val();
      opts.thr[0] = parseFloat($("#mgkv-plt-opts-svp-thr0").val());
      opts.thr[1] = parseFloat($("#mgkv-plt-opts-svp-thr1").val());
      this._sgVolcanoPlot(opts);
    });
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
    if (this.selectedGene.length == 0) {
      this._plot([], {
        title: "Select one or more gene to see the expression of their sgRNAs",
      });
      return;
    }
    let data = [];
    let genes = this.selectedGene.map((sg) => sg.name);
    this.sgSummary.data
      .filter((d) => genes.includes(d.gene))
      .forEach((sg) => {
        let gene = this.selectedGene.find((g) => g.name == sg.gene);
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
          let nc = this.sgSummary.normalization_factors[opts.norm][i] * c;
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
  }

  /**
   * Draw a BoxPlot of all the sgRNA
   * @param {{norm: string, scale : string}} userOpts define the normalization and the scale of the sgRNA counts
   */
  _sgBoxPlot(userOpts) {
    let opts = Object.assign({ norm: "raw", scale: "log10" }, userOpts);
    let data = this.samples.map((s) => {
      return { y: [], name: s.name, order: s.order, type: "box" };
    });
    this.sgSummary.data.forEach((dat) => {
      dat.counts.forEach((c, idx) => {
        let nc = this.sgSummary.normalization_factors[opts.norm][idx] * c;
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
    if (this.selectedGene.length > 0) {
      this.selectedGene.forEach((g) => {
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
    this.gSummary.data.forEach((d) => {
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

      let grp = this.selectedGene.findIndex((sg) => sg.name == d.gene);
      if (grp == -1) {
        grp = y > thr_y ? 1 : x < -thr_x ? 0 : x > thr_x ? 2 : 1;
      } else {
        grp = grp + 3;
      }
      // randomly discard a % of the non selected and non significant genes
      if (grp != 1 || Math.random() < KEEP_FRACTION) {
        data[grp].x.push(x);
        data[grp].y.push(y == 0 ? -1 : -Math.log10(y));
        data[grp].text.push(text);
      }
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
    if (this.selectedGene.length > 0) {
      this.selectedGene.forEach((g) => {
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
    this.sgSummary.data.forEach((d) => {
      let x,
        y,
        text = d.sgrna;
      x = d.LFC;
      y = d[opts.value];

      if (y != 0 && min_y > y) {
        min_y = y;
      }

      let grp = this.selectedGene.findIndex((sg) => sg.name == d.gene);
      if (grp == -1) {
        grp = y > thr_y ? 1 : x < -thr_x ? 0 : x > thr_x ? 2 : 1;
      } else {
        grp = grp + 3;
      }
      /// randomly discard a % of the non significant and not selected samples
      if (grp != 1 || Math.random() < KEEP_FRACTION) {
        data[grp].x.push(x);
        data[grp].y.push(y == 0 ? -1 : -Math.log10(y));
        data[grp].text.push(text);
      }
    });

    let max_y = -Math.log10(min_y);
    data.forEach((dat) => {
      dat.y = dat.y.map((y) => (y == -1 ? max_y : y));
    });
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
        serverSide : true,
        processing : true,
        searchDelay: 1000,
        ajax : (request, callback, settings )=>{
            this.gSummary.getData(request, settings).then((response)=>{
                callback(response);
            });
        },
        colReorder: true,
        rowId: "gene",
        buttons: [
          "csv",
          "colvis",
          { extend: "searchBuilder", config: {  conditions : {
            num : { "!null" : null, "null" : null }, string : { "!null" : null, "null" : null }
          }} },
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
          data: null,
          render: (row) => {
            return (
              Math.round(
                this.sgSummary.normalization_factors[this._display_count_normalization][
                  idx
                ] *
                  row.counts[idx] *
                  100
              ) / 100
            );
          },
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
        data: this.sgSummary.data,
        colReorder: true,
        rowId: "sgrna",
        buttons: [
          "csv",
          "colvis",
          "searchBuilder",
          {
            extend: "collection",
            text: "Count types",
            buttons: [
              {
                text: "raw",
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
            text: "Download filtered count table",
            buttons: [
              {
                text: "Raw",
                action: (_, dt) => {
                  let outfile =
                    "sgRNA\tGene\t" +
                    this.samples.map((sam) => sam.name).join("\t") +
                    "\n";
                  dt.rows({ search: "applied" })
                    .data()
                    .toArray()
                    .forEach((el) => {
                      outfile +=
                        [el.sgrna, el.gene].concat(el.counts).join("\t") + "\n";
                    });
                  download("raw.counts.txt", outfile);
                },
              },
              {
                text: "Median normalized",
                action: (_, dt) => {
                  let outfile =
                    "sgRNA\tGene\t" +
                    this.samples.map((sam) => sam.name).join("\t") +
                    "\n";
                  let data = dt.rows({ search: "applied" }).data().toArray();
                  let nf = this._computeMedianNormFactor(data);
                  data.forEach((el) => {
                    outfile +=
                      [el.sgrna, el.gene]
                        .concat(
                          el.counts.map(
                            (v, i) => Math.round(v * nf[i] * 100) / 100
                          )
                        )
                        .join("\t") + "\n";
                  });
                  download("median_normalized.counts.txt", outfile);
                },
              },
              {
                text: "Total normalized",
                action: (_, dt) => {
                  let outfile =
                    "sgRNA\tGene\t" +
                    this.samples.map((sam) => sam.name).join("\t") +
                    "\n";
                  let data = dt.rows({ search: "applied" }).data().toArray();
                  let nf = this._computeTotalNormFactor(data);
                  data.forEach((el) => {
                    outfile +=
                      [el.sgrna, el.gene]
                        .concat(
                          el.counts.map(
                            (v, i) => Math.round(v * nf[i] * 100) / 100
                          )
                        )
                        .join("\t") + "\n";
                  });
                  download("total_normalized.counts.txt", outfile);
                },
              },
              {
                text: "Control normalized",
                action: (_, dt) => {
                  let outfile =
                    "sgRNA\tGene\t" +
                    this.samples.map((sam) => sam.name).join("\t") +
                    "\n";
                  let data = dt.rows({ search: "applied" }).data().toArray();
                  let nf = this._computeControlNormFactor(data);
                  data.forEach((el) => {
                    outfile +=
                      [el.sgrna, el.gene]
                        .concat(
                          el.counts.map(
                            (v, i) => Math.round(v * nf[i] * 100) / 100
                          )
                        )
                        .join("\t") + "\n";
                  });
                  download("control_normalized.counts.txt", outfile);
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
        if (this.gSummary.isSelected(gene)) {
          this.gSummary.deselectGene(gene);
          $el.removeClass("selected");
        } else {
          this.gSummary.selectGene(gene);
          $el.addClass("selected");
        }
        this._updateSelectedGene();
      });
      $("#mgkv-boxplot-sgrna").click();
      this.afterInit();
      resolve();
      return true;
    });
  }

  /**
   * Update the plot and sgRNA table to show or highlight the selected genes' sgRNAs
   */
  _updateSelectedGene() {
    this.sgTable.draw();
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

export {MGKV as default}