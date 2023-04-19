/**
 * Download a text file with a given filename
 * @param {string} filename 
 * @param {string} text 
 */
function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

/**
 * Perform a filter on a single instance of a data element
 * @param {*} dat 
 * @param {*} search 
 * @returns boolean
 */
function apply_filter(dat, search){
  return true
}

export {download, apply_filter}