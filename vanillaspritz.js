javascript:(function() {
  'use strict'; // Enforce stricter parsing and error handling

  // --- Polyfill for Element.remove() if needed (older browsers) ---
  if (!('remove' in Element.prototype)) {
    Element.prototype.remove = function() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };
  }

  // --- Prevent multiple initializations ---
  if (window.spritzInstance) {
    window.spritzInstance.remove();
    window.spritzInstance = null; // Clean up old reference
  }

  // --- Spritz Class Definition ---
  class Spritz {
    constructor() {
      this.isPlaying = false;
      this.currentWordIndex = 0;
      this.words = [];
      this.intervalId = null; // Stores the timeout ID
      this.mouseDown = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;

      // Define tick as an arrow function to preserve 'this' context
      this.tick = () => {
          if (!this.isPlaying) return; // Stop if paused/stopped

          if (this.currentWordIndex < this.words.length) {
              const currentWord = this.words[this.currentWordIndex];

              // Basic delay for punctuation or longer words
              let delayMultiplier = 1.0;
              if (currentWord.length > 8) delayMultiplier += 0.3;
              // Check for common sentence-ending punctuation attached to the word
              if (/[.,;!?]$/.test(currentWord)) delayMultiplier += 0.5;

              this.setWord(currentWord); // Pass only the current word
              this.currentWordIndex++;

              // Get the potentially updated WPM for the next interval
              const currentWpm = this.getWPM();
              const nextInterval = (60000 / currentWpm) * delayMultiplier;

              // Clear existing timeout and set the next one
              clearTimeout(this.intervalId);
              this.intervalId = setTimeout(this.tick, nextInterval);

          } else {
              this.stop(); // Reached end of words
              this.setWord("Finished!"); // Give feedback
          }
      };

      // Define handler for WPM changes
       this.handleWpmChange = () => {
           if (!this.isPlaying) {
               return; // Only adjust if playing
           }
           // Clear the currently scheduled tick
           clearTimeout(this.intervalId);

           // Immediately schedule the next tick using the new WPM
           // The delayMultiplier will be applied correctly within the tick itself
           const newWpm = this.getWPM();
           const newBaseInterval = 60000 / newWpm;

           // Reschedule tick using the new base interval
           // (The very next word will appear after this new interval)
           this.intervalId = setTimeout(this.tick, newBaseInterval);
       };


      this.createStyles();
      this.createUI();
      this.attachEventListeners();

      this.setWord("Spritz Ready"); // Initial placeholder
      document.body.appendChild(this.rootDiv);
    }

    // --- Text Selection Logic (no changes needed) ---
    getSelectedText() {
        let text = "";
        if (window.getSelection) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
            const container = document.createElement("div");
            for (let i = 0; i < selection.rangeCount; i++) {
                try {
                container.appendChild(selection.getRangeAt(i).cloneContents());
                } catch (e) {
                console.error("Error cloning selection range:", e);
                }
            }
            text = container.textContent || container.innerText;
            }
        } else if (document.selection && document.selection.type === "Text") {
            try {
            text = document.selection.createRange().text;
            } catch (e) {
            console.error("Error getting text from document.selection:", e);
            }
        }
        return text.trim().replace(/(\r\n|\n|\r)/gm, " ");
    }

    // --- UI Creation ---
    createStyles() {
        // Removed CSS for prev/next words
        this.spritzStyles = `
        #spritz_root {
          position: fixed;
          z-index: 2147483647;
          width: 400px; /* Adjusted width */
          left: 50%;
          top: 50px;
          transform: translateX(-50%);
          padding: 15px;
          background-color: rgba(255, 255, 255, 0.95);
          border: 1px solid #ccc;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          border-radius: 5px;
          color: #333;
          font-family: "Source Code Pro", "Courier New", Courier, monospace;
          line-height: 1.4;
          user-select: none;
        }

        #spritz_drag_handle {
            height: 20px;
            cursor: move;
            position: relative;
            margin-bottom: 10px;
            border-bottom: 1px solid #eee;
        }
        #spritz_drag_handle::before {
            content: '☰';
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            color: #aaa;
            font-size: 14px;
            top: -2px;
        }

        #spritz-display-area {
            position: relative;
            height: 70px;
            margin-bottom: 15px;
            overflow: hidden;
        }

        #spritz_line_top,
        #spritz_line_bottom {
            position: absolute;
            left: 0;
            right: 0;
            height: 1px;
            background-color: #ccc;
        }
        #spritz_line_top::before,
        #spritz_line_bottom::before {
            content: '';
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            width: 1px;
            height: 8px;
            background-color: red;
        }
        #spritz_line_top { top: 15px; }
        #spritz_line_top::before { top: -8px; }
        #spritz_line_bottom { bottom: 15px; }
        #spritz_line_bottom::before { bottom: -8px; }

        /* Flex container centers ONLY the word wrapper now */
        #spritz-flex-container {
          display: flex;
          justify-content: center; /* Center horizontally */
          align-items: center;    /* Center vertically */
          height: 100%;
          text-align: center;
          font-size: 30px;
          font-weight: bold;
          white-space: pre; /* Preserve spaces for alignment */
        }

        /* Removed #spritz_word_prev, #spritz_word_next styles */

        #spritz_word_wrapper {
            flex: 0 0 auto; /* Don't grow or shrink */
            /* Added padding for visual spacing if needed, or adjust root width */
             padding: 0 10px;
        }

        #spritz_word_pivot {
            color: red;
        }

        #spritz_controls {
          padding-top: 10px;
          text-align: center;
          border-top: 1px solid #eee;
        }
        #spritz_controls > * {
            margin: 0 5px;
            cursor: pointer;
            vertical-align: middle;
        }
        #spritz_controls button {
            padding: 5px 12px;
            border: 1px solid #ccc;
            background-color: #f0f0f0;
            border-radius: 3px;
        }
         #spritz_controls button:hover {
             background-color: #e0e0e0;
             border-color: #bbb;
         }
         #spritz_controls select {
             padding: 4px;
             border-radius: 3px;
             border: 1px solid #ccc;
         }
      `;

      this.styleSheet = document.createElement("style");
      this.styleSheet.textContent = this.spritzStyles;
      document.head.appendChild(this.styleSheet);
    }

    // --- UI Structure: Removed prev/next word elements ---
    createUI() {
        this.rootDiv = this.addUiElement("div", "spritz_root");
        this.dragHandle = this.addUiElement("div", "spritz_drag_handle", this.rootDiv);
        this.displayArea = this.addUiElement("div", "spritz-display-area", this.rootDiv);
        this.lineTop = this.addUiElement("div", "spritz_line_top", this.displayArea);
        this.lineBottom = this.addUiElement("div", "spritz_line_bottom", this.displayArea);
        // Flex container holds only the word wrapper now
        this.wordFlexContainer = this.addUiElement("div", "spritz-flex-container", this.displayArea);
        // REMOVED this.wordPrev element creation
        this.wordWrapper = this.addUiElement("div", "spritz_word_wrapper", this.wordFlexContainer);
        this.former = this.addUiElement("span", "spritz_word_former", this.wordWrapper);
        this.pivot = this.addUiElement("span", "spritz_word_pivot", this.wordWrapper);
        this.latter = this.addUiElement("span", "spritz_word_latter", this.wordWrapper);
        // REMOVED this.wordNext element creation
        this.controlsDiv = this.addUiElement("div", "spritz_controls", this.rootDiv);
        this.wpmSelect = this.addUiElement("select", "spritz_wpm", this.controlsDiv);
        for (let wpm = 200; wpm <= 1000; wpm += 50) {
            const wpmOption = document.createElement("option");
            wpmOption.text = `${wpm} wpm`;
            wpmOption.value = String(wpm);
            if (wpm === 350) { wpmOption.selected = true; }
            this.wpmSelect.add(wpmOption);
        }
        this.startButton = this.addUiElement("button", "spritz_start", this.controlsDiv);
        this.startButton.textContent = "Start";
        this.closeButton = this.addUiElement("button", "spritz_close", this.controlsDiv);
        this.closeButton.textContent = "Close";
    }


    addUiElement(type, id, parent) {
      const element = document.createElement(type);
      element.id = id;
      if (parent) {
        parent.appendChild(element);
      }
      return element;
    }

    // --- Event Handling: Added WPM change listener ---
     attachEventListeners() {
        // Dragging
        this.dragHandle.addEventListener('mousedown', (event) => {
            this.mouseDown = true;
            this.dragOffsetX = event.clientX - this.rootDiv.offsetLeft;
            this.dragOffsetY = event.clientY - this.rootDiv.offsetTop;
            this.rootDiv.style.transition = 'none';
            event.preventDefault();
        });
        document.addEventListener('mousemove', (event) => {
            if (this.mouseDown) {
                let newX = event.clientX - this.dragOffsetX;
                let newY = event.clientY - this.dragOffsetY;
                const PADDING = 10;
                newX = Math.max(PADDING, Math.min(newX, window.innerWidth - this.rootDiv.offsetWidth - PADDING));
                newY = Math.max(PADDING, Math.min(newY, window.innerHeight - this.rootDiv.offsetHeight - PADDING));
                this.rootDiv.style.left = `${newX}px`;
                this.rootDiv.style.top = `${newY}px`;
                this.rootDiv.style.transform = '';
            }
        }, { passive: true });
        document.addEventListener('mouseup', () => {
            if (this.mouseDown) {
                this.mouseDown = false;
                this.rootDiv.style.transition = '';
            }
        });

        // Buttons
        this.startButton.addEventListener('click', () => {
            if (this.isPlaying) { this.pause(); } else { this.start(); }
        });
        this.closeButton.addEventListener('click', () => { this.remove(); });

        // Prevent drag on controls
         this.controlsDiv.addEventListener('mousedown', (event) => {
             event.stopPropagation();
         });

         // --- Listener for WPM changes ---
         this.wpmSelect.addEventListener('change', this.handleWpmChange);
    }


    // --- Core Spritz Logic ---
    getWPM() {
      // Ensure WPM is at least a minimum value to prevent division by zero or absurdly long intervals
      const selectedWpm = parseInt(this.wpmSelect.value, 10);
      return Math.max(50, selectedWpm); // Set a minimum WPM (e.g., 50)
    }

    // --- setWord: Removed prev/next parameters ---
    setWord(word) { // Only takes the current word
        const NBSP = '\u00A0'; // Non-breaking space constant
        const MAX_PADDING = 15; // Max padding spaces to add

        if (!word) { word = ''; }
        word = String(word).trim();

        let pivotIndex = 0;
        const len = word.length;

        if (len === 0) { /* No pivot */ }
        else if (len === 1) { pivotIndex = 0; }
        else if (len % 2 !== 0) { pivotIndex = Math.floor(len / 2); }
        else { pivotIndex = Math.floor(len / 2) - 1; }

        const pivotChar = word.charAt(pivotIndex) || '';
        let formerPart = word.slice(0, pivotIndex);
        let latterPart = word.slice(pivotIndex + 1);

        let formerPadding = '';
        let latterPadding = '';
        if (len > 0) {
            const PIVOT_CENTER_OFFSET = 0.4;
            const widthDiff = (formerPart.length + PIVOT_CENTER_OFFSET) - (latterPart.length + (1.0 - PIVOT_CENTER_OFFSET));
            const paddingAmount = Math.round(Math.abs(widthDiff));
            const limitedPadding = Math.min(MAX_PADDING, paddingAmount);

            if (widthDiff > 0) { latterPadding = NBSP.repeat(limitedPadding); }
            else if (widthDiff < 0) { formerPadding = NBSP.repeat(limitedPadding); }
        }

        this.former.textContent = formerPadding + formerPart;
        this.pivot.textContent = pivotChar || NBSP;
        this.latter.textContent = latterPart + latterPadding;

        // --- REMOVED lines setting prev/next word textContent ---
    }

    // --- start: Updated split logic, removed WPM disabling ---
    start() {
      // Only re-process text if starting from the beginning
      if (this.currentWordIndex === 0) {
        const selectionText = this.getSelectedText();
        if (!selectionText) {
          this.setWord("Select Text!");
          return;
        }
        // --- Split only by whitespace to keep punctuation attached ---
        this.words = selectionText.split(/\s+/)
                               .filter(w => w.length > 0); // Remove potential empty strings from multiple spaces

        if (this.words.length === 0) {
             this.setWord("No Words?");
             return;
        }
      }

      if (this.words.length === 0 || this.currentWordIndex >= this.words.length) {
          this.stop(); // Nothing to play or already finished
          return;
      }

      this.isPlaying = true;
      this.startButton.textContent = "Pause";
      // --- REMOVED WPM select disabling ---
      // this.wpmSelect.disabled = true;

      // Use the class method 'tick' for the timeout
      clearTimeout(this.intervalId); // Clear any residual timer
      // Start the first tick (using current WPM)
      const baseInterval = 60000 / this.getWPM();
      this.intervalId = setTimeout(this.tick, baseInterval);
    }

    pause() {
      // Clear timeout using the stored ID
      clearTimeout(this.intervalId);
      this.intervalId = null; // Important to nullify ID when timer is cleared
      this.isPlaying = false;
      this.startButton.textContent = "Continue";
      this.wpmSelect.disabled = false; // Ensure select is enabled
    }

    stop() {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      this.currentWordIndex = 0;
      this.isPlaying = false;
      this.startButton.textContent = "Start";
      this.wpmSelect.disabled = false; // Ensure select is enabled
      // Optionally clear display or leave last word, "Finished!" is set by tick()
    }

    // --- Cleanup ---
    remove() {
        this.pause(); // Clear timer and set isPlaying false
        if (this.rootDiv && this.rootDiv.parentNode) {
            this.rootDiv.remove();
        }
        if (this.styleSheet && this.styleSheet.parentNode) {
            this.styleSheet.remove();
        }
        // Remove WPM change listener to prevent potential memory leaks
        if (this.wpmSelect && this.handleWpmChange) {
            this.wpmSelect.removeEventListener('change', this.handleWpmChange);
        }

        if (window.spritzInstance === this) {
             window.spritzInstance = null;
        }
        console.log("Spritz instance removed.");
    }

  } // End Spritz Class

  // --- Initialize ---
  try {
      // Check for existing instance *before* creating a new one
      if (window.spritzInstance) {
          console.log("Removing existing Spritz instance.");
          window.spritzInstance.remove();
      }
      window.spritzInstance = new Spritz();
  } catch (error) {
      console.error("Failed to initialize Spritz:", error);
      alert("Error initializing Spritz reader. See console for details.");
  }

})(); // End bookmarklet IIFE
