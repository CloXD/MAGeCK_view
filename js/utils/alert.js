

class Alerts {
    /**
     * Utility to show alerts at the bottom of the screen
     * @param {number} timeout default timeout for the alerts to disappear
     */
    constructor(timeout = 2000) {
      this.timeout=timeout;
      this.alertBox = $("<div></div>");
      this.alertBox.addClass("fixed-bottom");
      this.alertBox.css("width", "100vw");
      $("body").append(this.alertBox)
    }
    /**
     * Add the alert to the GUI
     * @param {string} text 
     * @param {string} cssClass 
     */
    _initMessage(text, cssClass) {
      let alert = $("<div></div>");
      alert.addClass(
        "alert alert-dismissible"
      );
      alert.css("width", "100vw");
      alert.css("margin-bottom", "0");
      alert.css("margin-top", "5px");
      let alert_text = $("<span></span>");
      alert_text.text(text);
      let close_button = $("<button></button>");
      close_button.addClass("btn-close");
      close_button.on("click",(e) => {
        alert.remove()
      });
      alert.append(alert_text);
      alert.append(close_button);
      setTimeout(() => {
        alert.remove();
      }, this.timeout);
      alert.addClass(cssClass);
      this.alertBox.append(alert);
    }
    /**
     * Show a warning alert
     * @param {string} text 
     */
    warning(text) {
      this._initMessage(text, "alert-warning");
    }
    /**
     * Show an error alert
     * @param {string} text 
     */
    error(text) {
      this._initMessage(text, "alert-danger");
    }
    /**
     * Show a success alert
     * @param {string} text 
     */
    success(text) {
      this._initMessage(text, "alert-success");
    }
  }

  export {Alerts}