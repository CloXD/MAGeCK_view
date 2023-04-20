
import { DataHandler } from "./DataHandler";
import {parseGeneSummaryData, parseSgCountData, parseSgRNASummaryData} from "./parsers"
const CONTROL_GENE = "NO-TARGET";
const COLOR_P = ["#04AF54", "#AFAA05", "#5D05AF", "#AF0585", "#68DE3D"];

class MageckData {
  /**
   * Create a GeneSummary object to handle the data from *.gene_summary.txt files
   */
  constructor() {}
  gene_data = new DataHandler();
  sg_data = new DataHandler();
  samples = [];
  header = [];
  _selectedGenes = [];
  _prevNorm ="";
  sgLibrary = [];
  counts = false;
  control_gene =CONTROL_GENE;
  colors = COLOR_P

  /**
   * Change the predefined color palettes for the genes
   * @param {string[]} colors 
   */
  setColorPalette(colors){
    if ( typeof colors == typeof this.colors ){
      this.colors = colors;
    } else {
      throw("Wrong color types. Expectd "+(typeof this.colors)+", got "+(typeof colors));
    }
  }
 

  

  /**
   * Return true if the gene summary data is loaded
   */
  get ready() {
    return this.gene_data.length > 0 && this.sg_data.length && (this.counts);
  }
  /**
   * Select or deselect a gene
   * @param {string} name Gene name
   */
  toggleGene(name){
    let idx = this._selectedGenes.findIndex((g)=>g.name == name);
    if (idx  == -1 ){
      this._selectedGenes.push({name : name, color : this.colors[this._selectedGenes.length%this.colors.length]})
    } else {
      this._selectedGenes.splice(idx, 1);
    }
  }
  
  /**
   * 
   * @param {string} name Gene name
   * @returns boolean true if the gene is selected
   */
  isSelected(name){
    return this._selectedGenes.findIndex((g)=>g.name == name) != -1;
  }
  

  get selectedGenes(){
    return this._selectedGenes;
  }

  /**
   * Fetch data for Datatables.net table, as it would a server-side. This little trick save lots of memory and is faster than the built-in method
   * @param {any} request Datatables request object
   * @param {any} settings Datatables settings object
   * @returns 
   */
  async getGeneData(request){
    let out = await this.gene_data.getData(request);
    out.data.forEach((d)=>{
      if (this.isSelected(d.gene)){
        d["DT_RowClass"]="selected"
      } else {
        d["DT_RowClass"]=""
      }
    })
    return out;
  }

  /**
   * Fetch data for Datatables.net table, as it would a server-side. This little trick save lots of memory and is faster than the built-in method
   * @param {any} request Datatables request object
   * @param {any} settings Datatables settings object
   * @returns 
   */
  async getSgRNAData(request, norm){
    if (this._prevNorm!= norm){
      await this.sg_data.apply_normalization(norm, this.normalization_factors, this.samples)
      this._prevNorm = norm;
    }
    if (typeof request != typeof ""){
      request.selected_genes = this._selectedGenes.map((g)=>g.name);
    }
    return await this.sg_data.getData(request)  
  }

  /**
   * Parse and import a *.gene_summary.txt file
   * @param {string} data The content of a *.gene_summary.txt file
   * @returns Promise<void>
   */
  async parseGeneSummary(data) {
    let dat = await parseGeneSummaryData(data);
    this.gene_data.data = dat.data;
    this.gene_data.header = data.header;
  }
  /**
   * Parse and import a *.gene_summary.txt file
   * @param {string} data The content of a *.gene_summary.txt file
   * @returns Promise<void>
   */
  async parseSgRNASummary(data) {
    let dat = await parseSgRNASummaryData(data);
    this.sg_data.data = dat.data;
    this.sg_data.header = dat.header;
  }
   /**
   * Parse and import a *.sgrna_summary.txt file
   * @param {string} data The text content of a *.sgrna_summary.txt file
   * @returns Promise<void>
   */
  async parseSgCount(data) {
    let dat = await parseSgCountData(data)
    this.counts = dat.counts;
    this.samples = dat.samples;
  }
  /**
   * True if there is at least one library loaded
   */
  get hasLibrary() {
    return this.sgLibrary.length > 0;
  }

  /**
   * Parse a library file
   * @param {*} file file value of an input element (let file = el.files[0])
   * @param {*} libName name of the library
   * @returns Promise<number> return the index of the added library
   */
  parseLibrary(file, libraryName) {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      let data = "";
      reader.onload = () => {
        data = data + reader.result;
      };
      reader.readAsText(file);
      reader.onloadend = () => {
        let lib = { name: libraryName, sgrnas: [] };
        data = data.split("\n");
        let line;
        for (let idx = 0; idx < data.length; idx++) {
          line = data[idx].split("\t");
          lib.sgrnas.push(line[0]);
        }
        this.sgLibrary.push(lib);
        resolve(this.sgLibrary.length - 1);
      };
    });
  }
 
  /**
   * Prepare the dataset by merging the information of the count and the summary files
   * @returns Promise<void>
   */
  async mergeCountSummary() {
    if (this.hasLibrary) {
      this.sg_data.data.forEach((sg) => {
        sg.counts = this.counts[sg.sgrna];
        sg.library = this.sgLibrary.find((sgl) =>
          sgl.sgrnas.includes(sg.sgrna)
        )?.name;
      });
    } else {
      /// Calabrese Libraries: setA are just number, setB are geneName_number
      this.sg_data.data.forEach((sg) => {
        sg.counts = this.counts[sg.sgrna];
        sg.library = sg.sgrna.match(/^[0-9]+$/) ? "libA" : "libB";
      });
    }
    this.counts = true;
    this.normalization_factors = this.computeNormalizationFactors(this.sg_data.data);
    console.log(this.normalization_factors)
    return;
      
  }
  /**
   * Compute the normalization factors over the control as done in MAGeCK
   * @param {{gene : string, counts :number[]}[]} data The data from which the normalization factors are computed
   * @returns number[]
   */
  _computeControlNormFactor(data) {
    let d1 = data.filter((sg) => sg.gene == this.control_gene);
    if (d1.length == 0) {
      return Array(data[0].counts.length).fill(1);
    } else {
      return this._computeMedianNormFactor(d1);
    }
  }

  /**
   * Compute the normalization factors over the median as done in MAGeCK
   * @param {{gene : string, counts :number[]}[]} data The data from which the normalization factors are computed
   * @returns number[]
   */
  _computeMedianNormFactor(data) {
    let n = data[0].counts.length;
    let m = data.length;
    let meanVal = Array(m).fill(-1);
    data.forEach((cnt, idx) => {
      if (cnt.counts.reduce((p, v) => p + v, 0) > 0) {
        meanVal[idx] = Math.exp(
          (cnt.counts.map((v) => Math.log(v + 1)).reduce((p, c) => p + c, 0) *
            1.0) /
            n
        );
        if (meanVal[idx] <= 0) {
          meanVal[idx] = 1;
        }
      }
    });
    let medianFactor = Array(n).fill(0);
    for (let ni = 0; ni < n; ni++) {
      let meanFactor = data
        .map((sg, idx) => sg.counts[ni] / meanVal[idx])
        .filter((v, idx) => meanVal[idx] != -1);
      let xFactor = meanFactor.sort()[Math.floor(meanFactor.length / 2)];
      medianFactor[ni] = xFactor > 0 ? 1.0 / xFactor : 0;
    }
    return medianFactor;
  }

  /**
   * Compute the normalization factors over the total counts as done in MAGeCK
   * @param {{gene : string, counts :number[]}[]} data The data from which the normalization factors are computed
   * @returns number[]
   */
  _computeTotalNormFactor(data) {
    let n = data[0].counts.length;
    let m = data.length;
    let sumSamples = Array(n).fill(0);
    data.forEach((cnt) => {
      cnt.counts.forEach((v, i) => (sumSamples[i] += v));
    });
    let avgSample = sumSamples.reduce((p, c) => p + c, 0) / n;
    return sumSamples.map((v) => avgSample / v);
  }
  /**
   * Compute all the normalization factors as done in MAGeCK
   * @param {{gene : string, counts :number[]}[]} data The data from which the normalization factors are computed
   * @returns {raw : number[],total : number[], median : number[], control : number[]}
   */
  computeNormalizationFactors(data) {
    /// Adapted from mageckCountNorm.py
    let normalization_factors = {};
    normalization_factors.raw = Array(data[0].counts.length).fill(1);
    normalization_factors.total = this._computeTotalNormFactor(data);
    normalization_factors.median = this._computeMedianNormFactor(data);
    normalization_factors.control = this._computeControlNormFactor(data);
    return normalization_factors;
  }

  
}

export {MageckData}