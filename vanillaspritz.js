(function() {
  var spritz;

  this.Spritz = (function() {
    Spritz.prototype.getSelectedText = function() {
      var container, i, j, ref, selection, text;
      text = "";
      if (window.getSelection) {
        selection = window.getSelection();
        if (selection.rangeCount) {
          container = document.createElement("div");
          for (i = j = 0, ref = selection.rangeCount - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
            container.appendChild(selection.getRangeAt(i).cloneContents());
          }
          text = container.innerText || container.textContent;
        }
      } else if (document.selection) {
        if (document.selection.type === "Text") {
          text = document.selection.createRange().text;
        }
      }
      if (text === "") {
        return false;
      } else {
        return text;
      }
    };

    function Spritz() {
      var font, j, wpm, wpmOption;
      this.isPlaying = false;
      this.currentWordIndex = 0;
      this.words = [];
      this.intervalId = null;
      this.rootDiv = document.createElement("div");

      this.spritzStyles= `
        #spritz_root {
          position: fixed;
          z-index: 9999;
          width: 400px;
          left: 50%;
          margin: 0px;
          margin-left: -200px;
          padding: 10px;
          background-color: white;
          border: 3px solid black;
          cursor: move;
        }
        #spritz-flex-container {
          text-align: center;
          font-family: courier;
          font-size: 32px;
          font-weight: bold;
        }

        #spritz_word_prev { 
          color: #ddd;
        }
        #spritz_word_former  { 
        }
        #spritz_word_pivot { 
          color: red;
        }     
        #spritz_word_latter { 
        } 
        #spritz_word_next { 
          color: #ddd;
        }
        #spritz_controls {
          padding: 15px 0 0 0;
          text-align: center;
        }

        #spritz_word_pivot:before {
          position: absolute;
          content: "|";
          top: -.5em;
          left: 0;
          width: 100%;
          text-align: center;
          font-size: .7em;
        }
        #spritz_word_pivot:after {
          position: absolute;
          content: "|";
          top: 1.5em;
          left: 0;
          width: 100%;
          text-align: center;
          font-size: .7em;
        }

      `;

      this.styleSheet = document.createElement("style");
      this.styleSheet.textContent = this.spritzStyles;
      document.head.appendChild(this.styleSheet);


      this.rootDiv.id = "spritz_root";
      this.mouseDown = false;
      this.rootDiv.onmousedown = (function(_this) {
        return function() {
          return _this.mouseDown = true;
        };
      })(this);
      this.rootDiv.onmouseup = (function(_this) {
        return function() {
          return _this.mouseDown = false;
        };
      })(this);
     this.rootDiv.onmousemove = (function(_this) {
        return function(event) {
          if (_this.mouseDown) {
            _this.rootDiv.style.left = event.clientX + "px";
            _this.rootDiv.style.top = event.clientY - 40 + "px";
          }
          return event.preventDefault();
        };
      })(this);
      this.rootDiv.addEventListener("mouseleave", (function(_this) {
        return function() {
          return _this.mouseDown = false;
        };
      })(this));

      this.wordFlex= this.addUiElement("div", "spritz-flex-container", this.rootDiv);
      this.wordPrev = this.addUiElement("div", "spritz_word_prev", this.wordFlex);    
      this.former = this.addUiElement("span", "spritz_word_former", this.wordFlex);
      this.pivot = this.addUiElement("span", "spritz_word_pivot", this.wordFlex);
      this.latter = this.addUiElement("span", "spritz_word_latter", this.wordFlex);
      this.wordNext= this.addUiElement("div", "spritz_word_next", this.wordFlex);

      this.controlsDiv = this.addUiElement("div", "spritz_controls", this.rootDiv);
      this.wpmSelect = this.addUiElement("select", "spritz_wpm", this.controlsDiv);
      this.wpmSelect.onclick = (function(_this) {
        return function(event) {
          event.preventDefault();
          if (event.stopPropagation) {
            return event.stopPropagation();
          } else {
            return event.cancelBubble = true;
          }
        };
      })(this);
      for (wpm = j = 200; j <= 1000; wpm = j += 50) {
        wpmOption = document.createElement("option");
        wpmOption.text = wpm+" wpm";
        wpmOption.value = wpm;
        if (j == 350) { wpmOption.selected = true; }
        this.wpmSelect.add(wpmOption);
      }
      this.wpmSelect.removeAttribute("style");
      this.startButton = this.addUiElement("button", "spritz_start", this.controlsDiv);
      this.startButton.onclick = (function(_this) {
        return function(event) {
          if (_this.isPlaying) {
            _this.pause();
          } else {
            _this.start();
          }
          if (event.stopPropagation) {
            return event.stopPropagation();
          } else {
            return event.cancelBubble = true;
          }
        };
      })(this);
      this.startButton.innerHTML = "Start";
      this.startButton.removeAttribute("style");
      this.closeButton = this.addUiElement("button", "spritz_close", this.controlsDiv);
      this.closeButton.onclick = function() {
        return spritz.remove();
      };
      this.closeButton.innerHTML = "Close";
      this.closeButton.removeAttribute("style");
      if (document.body.firstChild) {
        document.body.insertBefore(this.rootDiv, document.body.firstChild);
      } else {
        document.body.appendChild(this.rootDiv);
      }
    }

    Spritz.prototype.addUiElement = function(type, id, parent) {
      var element;
      element = document.createElement(type);
      element.id = id;
      parent.appendChild(element);
      return element;
    };

    Spritz.prototype.remove = function() {
      document.body.removeChild(this.rootDiv);
      document.head.removeChild(this.styleSheet);
      return;
    };

    Spritz.prototype.getWPM = function() {
      var selectedIndex, wpm;
      selectedIndex = this.wpmSelect.selectedIndex;
      wpm = this.wpmSelect.options[selectedIndex].text;
      return parseInt(wpm);
    };

    Spritz.prototype.setWord = function(word, prevword, nextword) {
      var former, latter, pivot, pivotIndex;
      pivotIndex = 0;
      if (word.length > 1) {
        pivotIndex = Math.floor(word.length / 2);
      }
      pivot = word.charAt(pivotIndex);
      this.pivot.innerHTML = pivot;
      latter = "";
      if (word.length > 2) {
        latter = word.slice(pivotIndex + 1, word.length);
      }
      former = "";
      if (word.length > 1) {
        former = word.slice(0, pivotIndex);
      }
      while (former.length > latter.length) {
        latter += "\u00A0";
      }
      while (latter.length > former.length) {
        former = "\u00A0" + former;
      }      
      /*this.wordPrev.innerHTML = (typeof prevword !== 'undefined') ? prevword.trim() : '';
      this.wordNext.innerHTML =  (typeof nextword !== 'undefined') ? nextword.trim() : '';*/
      this.former.innerHTML = former;
      return this.latter.innerHTML = latter;
    };

    Spritz.prototype.start = function() {
      var callback, wpm;
      if (this.currentWordIndex === 0) { 
        var selection = this.getSelectedText();
        if (!selection || selection.length === 0) {
          alert("Please select text to Spritz");
          return;
        }
        selection = selection.replace(/\./, ".\u00A0");
        this.words = selection.split(/\s+/);
      }
      this.isPlaying = true;
      this.startButton.innerHTML = "Pause";
      this.wpmSelect.setAttribute("disabled", "");
      wpm = this.getWPM();
      callback = (function(_this) {
        return function() {
          if (_this.currentWordIndex < _this.words.length) {
            _this.setWord(_this.words[_this.currentWordIndex], _this.words[_this.currentWordIndex-1],_this.words[_this.currentWordIndex+1] );
            _this.currentWordIndex++;            
            return;
          } else {
            _this.stop();
          }
        };
      })(this);
      this.intervalId = setInterval(callback, 60000 / wpm);
    };

    Spritz.prototype.pause = function() {
      clearInterval(this.intervalId);
      this.isPlaying = false;
      this.startButton.innerHTML = "Continue";
      this.wpmSelect.removeAttribute("disabled", "");
    };

    Spritz.prototype.stop = function() {
      clearInterval(this.intervalId);
      this.currentWordIndex = 0;
      this.isPlaying = false;
      this.startButton.innerHTML = "Start";
      this.wpmSelect.removeAttribute("disabled", "");
    };

    return Spritz;

  })();

  spritz = new Spritz();

  spritz.setWord("VanillaSpritz");

}).call(this);
