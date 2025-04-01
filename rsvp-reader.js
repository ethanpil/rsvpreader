javascript:(function() {
  'use strict'; // Enforce stricter parsing and error handling

  // --- Polyfill for Element.remove() for older browsers ---
  if (!('remove' in Element.prototype)) {
    Element.prototype.remove = function() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };
  }

  // --- Prevent multiple reader instances ---
  // If an instance already exists, remove it before creating a new one.
  if (window.rsvpInstance) {
    console.log("Removing existing RSVP instance.");
    window.rsvpInstance.remove();
    window.rsvpInstance = null;
  }

  // --- RSVPReader Class Definition ---
  class RSVPReader {
    constructor() {
      this.isPlaying = false;
      this.currentWordIndex = 0;
      this.words = [];
      this.intervalId = null; // Stores the setTimeout ID for the reading loop
      this.mouseDown = false; // For dragging state
      this.dragOffsetX = 0; // For smooth dragging
      this.dragOffsetY = 0; // For smooth dragging
      this.MIN_TEXT_LENGTH = 150; // Min characters required for auto-detected content
      this.MIN_WORD_COUNT = 25;  // Min words required for auto-detected content

      // --- Core Reading Loop Function ---
      // Defined as an arrow function to preserve 'this' context when used with setTimeout.
      this.tick = () => {
          if (!this.isPlaying) return; // Exit if paused or stopped

          if (this.currentWordIndex < this.words.length) {
              const currentWord = this.words[this.currentWordIndex];

              // --- Dynamic Delay Logic ---
              // Increase delay slightly for longer words or words ending in punctuation.
              let delayMultiplier = 1.0;
              if (currentWord.length > 8) delayMultiplier += 0.3;
              if (/[.,;!?]$/.test(currentWord)) delayMultiplier += 0.5; // Includes punctuation attached by split logic

              this.setWord(currentWord); // Display the word
              this.currentWordIndex++;

              // --- Schedule Next Word ---
              // Get WPM (may have changed) and calculate interval for the *next* word.
              const currentWpm = this.getWPM();
              const nextInterval = (60000 / currentWpm) * delayMultiplier;

              // Clear previous timeout and set the new one.
              clearTimeout(this.intervalId);
              this.intervalId = setTimeout(this.tick, nextInterval);

          } else {
              // --- End of Text ---
              this.stop();
              this.setWord("Finished!"); // Display final message
          }
      };

      // --- WPM Change Handler ---
      // Updates the reading speed dynamically during playback.
       this.handleWpmChange = () => {
           if (!this.isPlaying) return; // Only act if currently playing

           // Clear the currently scheduled next word display
           clearTimeout(this.intervalId);

           // Immediately reschedule the next word using the *new* WPM's base interval.
           // The tick() function itself will handle any delay multipliers for that word.
           const newWpm = this.getWPM();
           const newBaseInterval = 60000 / newWpm;
           this.intervalId = setTimeout(this.tick, newBaseInterval);
       };

      // Initialize UI and Styles
      this.createStyles();
      this.createUI();
      this.attachEventListeners();
      this.setWord("RSVP Ready"); // Initial display message
      document.body.appendChild(this.rootDiv); // Add the reader UI to the page
    }

    // --- Text Selection ---
    // Gets user-selected text from the page. Requires a minimum length.
    getSelectedText() {
        let text = "";
        if (window.getSelection) {
            const selection = window.getSelection();
            // Ensure selection exists and has a reasonable length
            if (selection && selection.toString().length > 10) {
                text = selection.toString();
            }
        } else if (document.selection && document.selection.type === "Text") { // Legacy IE support
             try { text = document.selection.createRange().text; }
             catch (e) { console.error("Error getting text from document.selection:", e); }
        }
        // Return cleaned text or empty string if selection is too short/invalid
        return (text && text.trim().length > 10) ? text.trim().replace(/(\r\n|\n|\r)/gm, " ") : "";
    }

    // --- Automatic Main Content Detection ---
    // Attempts to find the main readable content block if no text is selected.
    // Uses heuristics: semantic tags, common IDs/classes, content scoring.
    findMainContentElement() {
        console.log("Attempting to find main content...");
        const candidates = [];
        let bestCandidate = null;
        let maxScore = -1;

        // 1. Prioritize strong semantic tags (<main>, <article>)
        document.querySelectorAll('main, article').forEach(el => {
            if (this.isPotentialContent(el)) candidates.push(el);
        });

        // 2. Look for common IDs and Classes used for content containers
        const commonSelectors = [
            '#content', '#main-content', '#main', '#entry', '#article',
            '.content', '.main-content', '.main', '.entry', '.entry-content',
            '.post', '.post-content', '.post-body', '.article', '.article-content', '.article-body',
            '.story', '.story-content'
        ];
        document.querySelectorAll(commonSelectors.join(', ')).forEach(el => {
            // Avoid adding duplicates or elements already contained within a candidate
            if (this.isPotentialContent(el) && !candidates.some(c => c.contains(el))) {
                candidates.push(el);
            }
        });

        console.log(`Found ${candidates.length} initial candidates.`);

        // 3. Score candidates based on heuristics (text length, paragraphs, links etc.)
        candidates.forEach(el => {
            const score = this.scoreElement(el);
            // console.log(`Scoring: ${el.tagName}#${el.id}.${el.className.split(' ').join('.')} - Score: ${score.toFixed(2)}`); // Optional debug logging
            if (score > maxScore) {
                maxScore = score;
                bestCandidate = el;
            }
        });

        // 4. Validate the best candidate meets minimum length/word requirements
        if (bestCandidate && maxScore > 0) {
             const textContent = this.extractText(bestCandidate);
             const wordCount = textContent.split(/\s+/).length;
             if (textContent.length >= this.MIN_TEXT_LENGTH && wordCount >= this.MIN_WORD_COUNT) {
                 console.log(`Selected best candidate: ${bestCandidate.tagName}#${bestCandidate.id}.${bestCandidate.className.split(' ').join('.')} with score ${maxScore.toFixed(2)}`);
                 return bestCandidate; // Return the qualifying element
             } else {
                  console.log(`Best candidate rejected (score: ${maxScore.toFixed(2)}, length: ${textContent.length}, words: ${wordCount}).`);
             }
        }

        console.log("Could not determine main content element reliably.");
        return null; // Failed to find suitable content
    }

    // --- Content Candidate Filtering ---
    // Checks if an element is likely part of the main content area.
    isPotentialContent(el) {
        if (!el || typeof el.matches !== 'function') return false;

        // Exclude non-element nodes and common non-content tags
        if (el.nodeType !== Node.ELEMENT_NODE ||
            el.matches('script, style, noscript, iframe, header, footer, nav, aside, form, button, select, textarea') ||
            el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') {
            return false;
        }

        // Exclude elements with common non-content ARIA roles
         const role = el.getAttribute('role');
         if (role && /^(navigation|search|banner|complementary|contentinfo|form|menu|menubar|tablist|dialog|alert|log|status|timer)/i.test(role)) {
             return false;
         }

        // Basic check: Exclude elements directly within common layout containers,
        // unless they are specifically content tags themselves (e.g., <article> in <header>)
        if (el.matches('header *, footer *, nav *, aside *')) {
             if (!el.matches('main, article, #content, #main, .content, .entry-content, .post-body')) {
                 return false;
             }
        }

        // Could add checks for computed style display:none here, but can be slow.
        return true;
    }

    // --- Content Candidate Scoring ---
    // Assigns a score based on heuristics indicating likelihood of being main content.
    scoreElement(el) {
        if (!el) return 0;

        const textContent = this.extractText(el); // Use cleaned text
        const textLength = textContent.length;

        // Heavily penalize elements with very little text
        if (textLength < this.MIN_TEXT_LENGTH) return 0;

        const paragraphCount = el.querySelectorAll('p').length;
        const linkCount = el.querySelectorAll('a').length;
        const imgCount = el.querySelectorAll('img').length;
        const headingCount = el.querySelectorAll('h1, h2, h3, h4, h5, h6').length;

        // Calculate link density (links relative to text length)
        const linkDensity = linkCount / (textLength + 1);

        // Base score: Log of text length promotes longer content, boosted by paragraphs
        let score = Math.log10(textLength + 1) * (paragraphCount + 1);

        // Boost for headings (indicate structure)
        score += headingCount * 2; // Adjust weight as needed

        // Penalize high link density (often indicates navigation, footers)
        if (linkDensity > 0.1) score *= 0.5;
        if (linkDensity > 0.3) score *= 0.3; // Heavy penalty

        // Penalize high image density (might be galleries, ads)
        const imgDensity = imgCount / (textLength / 100 + 1); // Images per 100 chars
        if (imgDensity > 5) score *= 0.6;

        // Significant boost for semantic content tags
        if (el.matches('main')) score *= 2.0;
        else if (el.matches('article')) score *= 1.5;

        // Penalize common non-content class name patterns
        if (/(comment|meta|share|related|sidebar|ad-slot|nav|menu|footer|header|masthead|widget|utility|social)/i.test(el.className)) {
            score *= 0.3;
        }
        // Penalize if it looks like a list consisting primarily of links
        const listItems = el.querySelectorAll('li');
        if (listItems.length > 5) { // Check only lists with several items
             const listLinks = el.querySelectorAll('li a').length;
             // If most list items contain links, likely navigation/footer links
             if (listLinks / (listItems.length + 1) > 0.8) {
                 score *= 0.2;
             }
        }

        return Math.max(0, score); // Score cannot be negative
    }

    // --- Text Extraction Helper ---
    // Extracts text content, attempting to clean out script/style tags first.
     extractText(el) {
         let text = '';
         // Clone the element to avoid modifying the original page structure
         const clone = el.cloneNode(true);
         // Remove known non-content elements from the clone before extracting text
         clone.querySelectorAll('script, style, noscript, iframe, button, select, textarea, nav, aside, footer, header, [aria-hidden="true"]').forEach(badEl => badEl.remove());
         // Optional: remove figure captions? clone.querySelectorAll('figcaption').forEach(cap => cap.remove());
         text = clone.textContent || "";

         // Normalize whitespace (replace multiple spaces/newlines with single space)
         return text.replace(/\s+/g, ' ').trim();
     }

    // --- UI Creation: Styles ---
    createStyles() {
        this.rsvpStyles = `
        #rsvp_root {
          position: fixed; z-index: 2147483647; width: 400px; left: 50%; top: 50px;
          transform: translateX(-50%); padding: 15px; background-color: rgba(255, 255, 255, 0.95);
          border: 1px solid #ccc; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); border-radius: 5px;
          color: #333; font-family: "Source Code Pro", "Courier New", Courier, monospace;
          line-height: 1.4; user-select: none;
        }
        #rsvp_drag_handle {
            height: 20px; cursor: move; position: relative; margin-bottom: 10px; border-bottom: 1px solid #eee;
        }
        #rsvp_drag_handle::before { /* Drag handle indicator */
            content: '☰'; position: absolute; left: 50%; transform: translateX(-50%); color: #aaa; font-size: 14px; top: -2px;
        }
        #rsvp-display-area { /* Container for word display and guide lines */
            position: relative; height: 70px; margin-bottom: 15px; overflow: hidden;
        }
        #rsvp_line_top, #rsvp_line_bottom { /* Horizontal guide lines */
            position: absolute; left: 0; right: 0; height: 1px; background-color: #ccc;
        }
        #rsvp_line_top::before, #rsvp_line_bottom::before { /* Red center pivot indicator marks */
            content: ''; position: absolute; left: 50%; transform: translateX(-50%); width: 1px; height: 8px; background-color: red;
        }
        #rsvp_line_top { top: 15px; } #rsvp_line_top::before { top: -8px; }
        #rsvp_line_bottom { bottom: 15px; } #rsvp_line_bottom::before { bottom: -8px; }
        #rsvp-flex-container { /* Centers the word display block */
          display: flex; justify-content: center; align-items: center; height: 100%; text-align: center;
          font-size: 30px; font-weight: bold;
          white-space: pre; /* Crucial for preserving spaces used in pivot alignment */
        }
        #rsvp_word_wrapper { /* Container for the three word parts */
            flex: 0 0 auto; padding: 0 10px; /* Provides minimal side padding */
        }
        #rsvp_word_pivot { color: red; } /* Style for the pivot character */
        #rsvp_controls { /* Container for buttons and select */
            padding-top: 10px; text-align: center; border-top: 1px solid #eee;
        }
        #rsvp_controls > * { /* Basic spacing and alignment for controls */
             margin: 0 5px; cursor: pointer; vertical-align: middle;
        }
        #rsvp_controls button { /* Basic button styling */
             padding: 5px 12px; border: 1px solid #ccc; background-color: #f0f0f0; border-radius: 3px;
        }
        #rsvp_controls button:hover { background-color: #e0e0e0; border-color: #bbb; }
        #rsvp_controls select { /* Styling for WPM selector */
             padding: 0px 25px; /* User-specified padding for text visibility */
             border-radius: 3px; border: 1px solid #ccc;
             /* Inherits vertical-align: middle */
         }
      `;
        this.styleSheet = document.createElement("style");
        this.styleSheet.textContent = this.rsvpStyles;
        document.head.appendChild(this.styleSheet);
    }

    // --- UI Creation: Elements ---
    createUI() {
        this.rootDiv = this.addUiElement("div", "rsvp_root");
        this.dragHandle = this.addUiElement("div", "rsvp_drag_handle", this.rootDiv);
        this.displayArea = this.addUiElement("div", "rsvp-display-area", this.rootDiv);
        this.lineTop = this.addUiElement("div", "rsvp_line_top", this.displayArea);
        this.lineBottom = this.addUiElement("div", "rsvp_line_bottom", this.displayArea);
        this.wordFlexContainer = this.addUiElement("div", "rsvp-flex-container", this.displayArea);
        this.wordWrapper = this.addUiElement("div", "rsvp_word_wrapper", this.wordFlexContainer);
        this.former = this.addUiElement("span", "rsvp_word_former", this.wordWrapper); // Part before pivot
        this.pivot = this.addUiElement("span", "rsvp_word_pivot", this.wordWrapper); // Pivot character
        this.latter = this.addUiElement("span", "rsvp_word_latter", this.wordWrapper); // Part after pivot
        this.controlsDiv = this.addUiElement("div", "rsvp_controls", this.rootDiv);
        this.wpmSelect = this.addUiElement("select", "rsvp_wpm", this.controlsDiv); // WPM dropdown
        // Populate WPM options
        for (let wpm = 200; wpm <= 1000; wpm += 50) {
            const wpmOption = document.createElement("option");
            wpmOption.text = `${wpm} wpm`; wpmOption.value = String(wpm);
            if (wpm === 350) { wpmOption.selected = true; } // Default WPM
            this.wpmSelect.add(wpmOption);
        }
        this.startButton = this.addUiElement("button", "rsvp_start", this.controlsDiv); // Start/Pause/Continue button
        this.startButton.textContent = "Start";
        this.closeButton = this.addUiElement("button", "rsvp_close", this.controlsDiv); // Close button
        this.closeButton.textContent = "Close";
     }

    // --- UI Helper ---
    addUiElement(type, id, parent) {
      const element = document.createElement(type); element.id = id;
      if (parent) { parent.appendChild(element); } return element;
    }

    // --- Event Listener Setup ---
    attachEventListeners() {
        // --- Dragging Listeners ---
        this.dragHandle.addEventListener('mousedown', (event) => {
            this.mouseDown = true;
            // Calculate offset relative to the element's top-left corner
            this.dragOffsetX = event.clientX - this.rootDiv.offsetLeft;
            this.dragOffsetY = event.clientY - this.rootDiv.offsetTop;
            this.rootDiv.style.transition = 'none'; // Disable transitions during drag
            event.preventDefault(); // Prevent text selection while dragging handle
        });
        // Use document listeners for move/up to capture events outside the handle
        document.addEventListener('mousemove', (event) => {
            if (this.mouseDown) {
                // Calculate new position based on initial click offset
                let newX = event.clientX - this.dragOffsetX;
                let newY = event.clientY - this.dragOffsetY;
                // Basic boundary collision detection
                const PADDING = 10;
                newX = Math.max(PADDING, Math.min(newX, window.innerWidth - this.rootDiv.offsetWidth - PADDING));
                newY = Math.max(PADDING, Math.min(newY, window.innerHeight - this.rootDiv.offsetHeight - PADDING));
                this.rootDiv.style.left = `${newX}px`;
                this.rootDiv.style.top = `${newY}px`;
                this.rootDiv.style.transform = ''; // Use top/left for positioning during drag
            }
        }, { passive: true }); // Use passive listener for performance on frequent move events
        document.addEventListener('mouseup', () => {
            if (this.mouseDown) {
                this.mouseDown = false;
                this.rootDiv.style.transition = ''; // Re-enable potential transitions
            }
        });

        // --- Control Listeners ---
        this.startButton.addEventListener('click', () => { if (this.isPlaying) { this.pause(); } else { this.start(); } });
        this.closeButton.addEventListener('click', () => { this.remove(); });
        // Prevent clicks on controls initiating a drag
        this.controlsDiv.addEventListener('mousedown', (event) => { event.stopPropagation(); });
        // Listener for WPM dropdown changes
        this.wpmSelect.addEventListener('change', this.handleWpmChange);
     }

    // --- Get Current WPM Setting ---
    getWPM() {
      // Read the selected value and ensure it's a reasonable minimum
      const selectedWpm = parseInt(this.wpmSelect.value, 10);
      return Math.max(50, selectedWpm); // Minimum WPM of 50
    }

    // --- Display Word and Align Pivot ---
    setWord(word) {
        const NBSP = '\u00A0'; // Non-breaking space character
        const MAX_PADDING = 15; // Limit maximum padding added

        if (!word) { word = ''; }
        word = String(word).trim();

        let pivotIndex = 0;
        const len = word.length;

        // --- Pivot Index Calculation Rules ---
        // Determine the index of the character to align to the center indicator.
        if (len === 0) { /* No pivot for empty string */ }
        else if (len === 1) { pivotIndex = 0; } // Single character word
        else if (len % 2 !== 0) { pivotIndex = Math.floor(len / 2); } // Odd length: middle character
        else { pivotIndex = Math.floor(len / 2) - 1; } // Even length: character left of center

        const pivotChar = word.charAt(pivotIndex) || '';
        let formerPart = word.slice(0, pivotIndex); // Text before pivot
        let latterPart = word.slice(pivotIndex + 1); // Text after pivot

        // --- Visual Pivot Alignment Padding ---
        // Add non-breaking spaces to the shorter side (visually) to center the pivot character
        // under the red indicator line. Relies on a monospace font.
        let formerPadding = '';
        let latterPadding = '';
        if (len > 0) {
            // Estimate visual center point (~40% into the pivot character width)
            const PIVOT_CENTER_OFFSET = 0.4;
            // Calculate approximate visual width difference between left and right sides
            const widthDiff = (formerPart.length + PIVOT_CENTER_OFFSET) - (latterPart.length + (1.0 - PIVOT_CENTER_OFFSET));
            // Calculate padding needed (integer spaces)
            const paddingAmount = Math.round(Math.abs(widthDiff));
            const limitedPadding = Math.min(MAX_PADDING, paddingAmount); // Apply max padding limit

            if (widthDiff > 0) { // Left side visually wider, pad the right side (latter)
                latterPadding = NBSP.repeat(limitedPadding);
            } else if (widthDiff < 0) { // Right side visually wider, pad the left side (former)
                formerPadding = NBSP.repeat(limitedPadding);
            }
        }

        // Set the text content of the display parts
        this.former.textContent = formerPadding + formerPart;
        this.pivot.textContent = pivotChar || NBSP; // Use nbsp if pivot is somehow empty
        this.latter.textContent = latterPart + latterPadding;
     }

    // --- Start Reading Process ---
    start() {
      // --- Text Acquisition ---
      // Only get text from page if starting from the beginning (index 0)
      if (this.currentWordIndex === 0) {
        let textToUse = this.getSelectedText(); // Prioritize user selection

        // If no valid selection, attempt automatic content detection
        if (!textToUse) {
          const mainContentElement = this.findMainContentElement();
          if (mainContentElement) {
            textToUse = this.extractText(mainContentElement); // Extract cleaned text
          }
        }

        // If still no usable text, alert user and exit start process
        if (!textToUse || textToUse.length < 10) {
          this.setWord("Select text or find content?");
          alert("Please select text on the page, or RSVP couldn't automatically find the main content.");
          return; // Stop if no text found
        }

        // --- Word Tokenization ---
        // Split the text into words based on whitespace. Handles punctuation attached to words.
        this.words = textToUse.split(/\s+/)
                              .filter(w => w.length > 0); // Remove empty strings resulting from multiple spaces

        if (this.words.length === 0) {
             this.setWord("No words found?");
             return; // Stop if splitting resulted in no words
        }
      } // End text acquisition block

      // --- Start Playback ---
      // Ensure there are words to play and we haven't already finished
      if (this.words.length === 0 || this.currentWordIndex >= this.words.length) {
          this.stop(); // Reset if somehow called without words or after finishing
          return;
      }

      this.isPlaying = true;
      this.startButton.textContent = "Pause"; // Update button text
      this.wpmSelect.disabled = false; // Ensure WPM select is *always* enabled

      // Clear any previous timer and start the reading loop (tick)
      clearTimeout(this.intervalId);
      const baseInterval = 60000 / this.getWPM(); // Calculate interval for the first word
      this.intervalId = setTimeout(this.tick, baseInterval);
    }

    // --- Pause Reading ---
    pause() {
      clearTimeout(this.intervalId); // Stop the scheduled next word
      this.intervalId = null; // Clear the timer ID
      this.isPlaying = false;
      this.startButton.textContent = "Continue"; // Update button text
      this.wpmSelect.disabled = false; // Ensure select stays enabled
    }

    // --- Stop Reading and Reset ---
    stop() {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      this.currentWordIndex = 0; // Reset word index
      this.isPlaying = false;
      this.startButton.textContent = "Start"; // Reset button text
      this.wpmSelect.disabled = false;
      // Optionally reset display: // this.setWord("Stopped.");
    }

    // --- Remove Reader from Page ---
    remove() {
        this.pause(); // Ensure timer is stopped
        // Remove UI elements from the DOM
        if (this.rootDiv && this.rootDiv.parentNode) { this.rootDiv.remove(); }
        if (this.styleSheet && this.styleSheet.parentNode) { this.styleSheet.remove(); }
        // Remove event listeners attached to elements outside the root div
        if (this.wpmSelect && this.handleWpmChange) {
             this.wpmSelect.removeEventListener('change', this.handleWpmChange); // Clean up WPM listener
        }
        // Attempt cleanup for document-level drag listeners (though they should GC if instance is lost)
        // document.removeEventListener('mousemove', ...); // Requires storing bound references, often overkill for bookmarklet

        // Clear global reference to allow garbage collection
        if (window.rsvpInstance === this) {
             window.rsvpInstance = null;
        }
        console.log("RSVP instance removed.");
     }

  } // End RSVPReader Class

  // --- Initialization ---
  try {
      // Check for existing instance and remove if necessary
      if (window.rsvpInstance) {
          console.log("Removing existing RSVP instance.");
          window.rsvpInstance.remove();
      }
      // Create and store the new instance
      window.rsvpInstance = new RSVPReader();
  } catch (error) {
      // Log and alert user if initialization fails
      console.error("Failed to initialize RSVP:", error);
      alert("Error initializing RSVP reader. See console for details.");
  }

})(); // End bookmarklet IIFE
