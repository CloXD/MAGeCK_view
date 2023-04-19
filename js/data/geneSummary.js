import { apply_filter } from "../utils/functions";


class GeneSummary {
  /**
   * Create a GeneSummary object to handle the data from *.gene_summary.txt files
   */
  constructor() {}
  data = [];
  header = [];
  _order = [];
  _selected = new Set();
  _prevSearch = "";
  _prevOrder = "";
  _prevColumns = "";

  /**
   * Return true if the gene summary data is loaded
   */
  get ready() {
    return this.data.length > 0;
  }
  /**
   * Select a gene
   * @param {string} name Gene name
   */
  selectGene(name){
    this._selected.add(name)
  }
  /**
   * Deselect a gene
   * @param {string} name Gene name
   */
  deselectGene(name){
    this._selected.delete(name)
  }
  /**
   * 
   * @param {string} name Gene name
   * @returns boolean true if the gene is selected
   */
  isSelected(name){
    return this._selected.has(name)
  }
  /**
   * The number of selected genes
   */
  get nSelected(){
    return this._selected.size;
  }

  /**
   * Fetch data for Datatables.net table, as it would a server-side. This little trick save lots of memory and is faster than the built-in method
   * @param {any} request Datatables request object
   * @param {any} settings Datatables settings object
   * @returns 
   */
  async getData(request, settings){
    let out={ draw : request.draw, recordsTotal : this.data.length, recordsFiltered : 0 , data : [] };
    if ( this._prevOrder != JSON.stringify(request.order) ){
        this._prevOrder = JSON.stringify(request.order)
        this._order = [...Array(this.data.length).keys()];
        let order_col = request.columns[request.order[0].column].data;
        let order_dir = request.order[0].dir == 'asc' ? 1 : -1;
        if ( order_col.includes(".") ){
            order_col = order_col.split("\.")
            this._order.sort((a, b) => {
                return this.data[a][order_col[0]][order_col[1]] > this.data[b][order_col[0]][order_col[1]] ? order_dir : -order_dir;
            });
        } else {
            this._order.sort((a, b) => {
                return this.data[a][order_col] > this.data[b][order_col] ? order_dir : -order_dir;
            });
        }
    }
    let search = { search : request.search, searchBuilder : request.searchBuilder }
    if ( this._prevSearch != JSON.stringify(search)){
      this._prevSearch = JSON.stringify(search);
      
    }
    out.data = this._order.slice(request.start, request.start+request.length).map((v)=>this.data[v]);
    out.recordsFiltered = this._order.length;
    /// https://datatables.net/manual/server-side#Returned-data
    /// var value = s.split('.').reduce((a, b) => a[b], r);
    console.log(request)
    return out;
  }

  /**
   * Parse and import a *.gene_summary.txt file
   * @param {string} data The content of a *.gene_summary.txt file
   * @returns Promise<void>
   */
  parse(data) {
    return new Promise((resolve, reject) => {
      this.data = [];
      this.header = [];
      data = data.split("\n");
      let line;
      for (let idx = 0; idx < data.length; idx++) {
        line = data[idx].split("\t");
        if (idx == 0) {
          if (line[0] != "id" || line[1] != "num" || line.length != 14) {
            reject("The input file is not a gene Summary generated by MAGeCK.");
            return;
          } else {
            this.header = line;
          }
        } else {
          if (line.length == 14) {
            let d = {
              gene: line[0],
              numSgRNA: parseInt(line[1]),
              neg: {
                score: parseFloat(line[2]),
                pvalue: parseFloat(line[3]),
                FDR: parseFloat(line[4]),
                rank: parseFloat(line[5]),
                good: parseInt(line[6]),
                LFC: parseFloat(line[7]),
              },
              pos: {
                score: parseFloat(line[8]),
                pvalue: parseFloat(line[9]),
                FDR: parseFloat(line[10]),
                rank: parseFloat(line[11]),
                good: parseInt(line[12]),
                LFC: parseFloat(line[13]),
              },
              best: "pos",
              rank: 0,
            };
            if (d.neg.pvalue == d.pos.pvalue) {
              if (Math.abs(d.neg.LFC) > d.pos.LFC) {
                d.best = "neg";
              }
            } else {
              if (d.neg.pvalue < d.pos.pvalue) {
                d.best = "neg";
              }
            }
            d.LFC = d[d.best].LFC;
            d.pvalue = d[d.best].pvalue;
            d.FDR = d[d.best].FDR;
            this.data.push(d);
          }
        }
      }
      let ranking = [...Array(this.data.length).keys()];
      ranking = ranking.sort((a, b) => {
        return this.data[a].LFC > this.data[b].LFC ? -1 : 1;
      });
      ranking.forEach((idx, r) => {
        this.data[idx].rank = r;
      });
      resolve();
    });
  }
}

export {GeneSummary}