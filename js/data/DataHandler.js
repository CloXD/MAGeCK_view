/**
 * Perform a basic search filter on a single instance of a data element
 * @param {*} dat
 * @param {*} search
 * @returns boolean
 */
function basic_search(dat, search) {
  return (
    dat.gene.match(search) ||
    (dat.sgrna && dat.sgrna.match(search)) ||
    (dat.library && dat.library.match(search))
  );
}

function generateSearcher(builder_search) {
  let opts = [];
  builder_search.criteria.forEach((crit) => {
    if (crit.type == "num") crit.value = crit.value.map((v) => parseFloat(v));
    let op = (v)=>true;
    let data = crit.origData;
    let getData = (v)=>v[data]
    if ( data.includes("." )){
      data=data.split(".");
      getData = (v)=>v[data[0]][data[1]]
    }
    switch (crit.condition) {
      case "!=":
        op = (v)=>getData(v)!=crit.value[0]
        break;
      case "=":
        op = (v)=>getData(v)==crit.value[0]
        break;
      case "<":
        op = (v)=>getData(v)<crit.value[0]
        break;
      case "<=":
        op = (v)=>getData(v)<=crit.value[0]
        break;
      case ">":
        op = (v)=>getData(v)>crit.value[0]
        break;
      case ">=":
        op = (v)=>getData(v)>=crit.value[0]
        break;
      case "between":
        op = (v)=> getData(v) >= crit.value[0] && getData(v) <= crit.value[1]
        break;
      case "!between":
        op = (v)=> getData(v) < crit.value[0] || getData(v) > crit.value[1]
        break;
      case "starts":
        op = (v)=> getData(v).startsWith(crit.value[0])
        break;
      case "!starts":
        op = (v)=> !getData(v).startsWith(crit.value[0])
        break;
      case "contains":
        op = (v)=> getData(v).includes(crit.value[0])
        break;
      case "!contains":
        op = (v)=> !getData(v).includes(crit.value[0])
        break;
      case "ends":
        op = (v)=> getData(v).endsWith(crit.value[0])
        break;
      case "!ends":
        op = (v)=> !getData(v).endsWith(crit.value[0])
        break;
    }
    opts.push(op);
  });
  if (builder_search.logic == "AND" ){
    return (v)=>{
      for (let op in opts){
        if ( !opts[op](v)) return false;
      }
      return true;
    }
  } else {
    return (v)=>{
      let out=false;
      for (let op in opts){
        out = out || opts[op](v);
      }
      return out;
    }
  }
}

class DataHandler {
  constructor() {}
  data = [];
  header = [];
  _order = [];
  _filtered = [];
  _prevSearch = "{}";
  _prevOrder = "{}";
  _prevNormalization = "";

  async apply_normalization(norm, normalization_factors, samples) {
    if (this._prevNormalization != norm) {
      this.data.forEach((d) => {
        samples.forEach((s, idx) => {
          d[s.name] =
            Math.round(d.counts[idx] * normalization_factors[norm][idx] * 100) /
            100;
        });
      });
    }
  }

  /**
   * Fetch data for Datatables.net table, as it would a server-side. This little trick save lots of memory and is faster than the built-in method
   * @param {any} request Datatables request object
   * @param {any} settings Datatables settings object
   * @returns
   */
  async getData(request) {
    
    let out = {
      draw: request.draw,
      recordsTotal: this.data.length,
      recordsFiltered: 0,
      data: [],
    };
    if ( request == 'filtered' ){
      out.data = this._order.map((v) => this.data[v]); 
      return out;
    }
    if ( request == 'all' ){
      out.data = this.data;
      return out;
    }
    let search = {
      basic: request.search,
      builder: request.searchBuilder,
      selected_genes : request.selected_genes
    };
    if (this._prevSearch != JSON.stringify(search)) {
      this._prevSearch = JSON.stringify(search);
      let has_basic_search =
        search.basic && search.basic.value && search.basic.value.length > 0;
      let has_builder_search =
        search.builder &&
        search.builder &&
        search.builder.criteria &&
        search.builder.criteria.length > 0;
      let has_selected_genes = search.selected_genes && search.selected_genes.length > 0;
      this._filtered = [...Array(this.data.length).keys()];
      if ( has_selected_genes ){
        this._filtered = this._filtered.filter((el)=>search.selected_genes.includes(this.data[el].gene));
      }
      if (has_builder_search) {
        let builder_search = generateSearcher(search.builder);
        if (has_basic_search) {
          this._filtered = this._filtered
            .filter((idx) => basic_search(this.data[idx], search.basic.value))
            .filter((idx) => builder_search(this.data[idx]));
        } else {
          this._filtered = this._filtered.filter((idx) =>
            builder_search(this.data[idx])
          );
        }
      } else {
        if (has_basic_search) {
          this._filtered = this._filtered.filter((idx) =>
            basic_search(this.data[idx], search.basic.value)
          );
        }
      }
    }
    
    if (this._prevOrder != JSON.stringify(request.order) || this._filtered.length > this._order.length ) {
      this._prevOrder = JSON.stringify(request.order);
      this._order = JSON.parse(JSON.stringify(this._filtered));
      let order_col = request.columns[request.order[0].column].data;
      let order_dir = request.order[0].dir == "asc" ? 1 : -1;
      if (order_col.includes(".")) {
        order_col = order_col.split(".");
        this._order.sort((a, b) => {
          return this.data[a][order_col[0]][order_col[1]] >
            this.data[b][order_col[0]][order_col[1]]
            ? order_dir
            : -order_dir;
        });
      } else {
        this._order.sort((a, b) => {
          return this.data[a][order_col] > this.data[b][order_col]
            ? order_dir
            : -order_dir;
        });
      }
    }
    if ( this._filtered.length != this._order.length ){
      this._order = this._order.filter(v=>this._filtered.includes(v))
    }    

    out.data = this._order.slice(request.start, request.start + request.length)
      .map((v) => this.data[v]);
    out.recordsFiltered = this._filtered.length;
    return out;
  }

  get length() {
    return this.data.length;
  }
}

export { DataHandler };
