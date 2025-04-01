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
      this.MIN_TEXT_LENGTH = 150; // Minimum characters for auto-detected content
      this.MIN_WORD_COUNT = 25; // Minimum words for auto-detected content

      // Define tick as an arrow function to preserve 'this' context
      this.tick = () => {
          if (!this.isPlaying) return; // Stop if paused/stopped

          if (this.currentWordIndex < this.words.length) {
              const currentWord = this.words[this.currentWordIndex];
              let delayMultiplier = 1.0;
              if (currentWord.length > 8) delayMultiplier += 0.3;
              if (/[.,;!?]$/.test(currentWord)) delayMultiplier += 0.5;

              this.setWord(currentWord);
              this.currentWordIndex++;

              const currentWpm = this.getWPM();
              const nextInterval = (60000 / currentWpm) * delayMultiplier;

              clearTimeout(this.intervalId);
              this.intervalId = setTimeout(this.tick, nextInterval);

          } else {
              this.stop();
              this.setWord("Finished!");
          }
      };

      // Define handler for WPM changes
       this.handleWpmChange = () => {
           if (!this.isPlaying) return;
           clearTimeout(this.intervalId);
           const newWpm = this.getWPM();
           const newBaseInterval = 60000 / newWpm;
           this.intervalId = setTimeout(this.tick, newBaseInterval);
       };

      this.createStyles();
      this.createUI();
      this.attachEventListeners();
      this.setWord("Spritz Ready");
      document.body.appendChild(this.rootDiv);
    }

    // --- Text Selection Logic ---
    getSelectedText() {
        let text = "";
        if (window.getSelection) {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 10) { // Require minimal selection length
                text = selection.toString();
            }
        } else if (document.selection && document.selection.type === "Text") { // Legacy IE
             try {
                text = document.selection.createRange().text;
             } catch (e) { console.error("Error getting text from document.selection:", e); }
        }
        // Return cleaned text or empty string if selection is too short/invalid
        return (text && text.trim().length > 10) ? text.trim().replace(/(\r\n|\n|\r)/gm, " ") : "";
    }

    // --- Main Content Detection Algorithm ---
    findMainContentElement() {
        console.log("Attempting to find main content...");
        const candidates = [];
        let bestCandidate = null;
        let maxScore = -1;

        // 1. Prioritize strong semantic tags
        document.querySelectorAll('main, article').forEach(el => {
            if (this.isPotentialContent(el)) candidates.push(el);
        });

        // 2. Look for common IDs and Classes
        const commonSelectors = [
            '#content', '#main-content', '#main', '#entry', '#article', // IDs
            '.content', '.main-content', '.main', '.entry', '.entry-content', // Classes
            '.post', '.post-content', '.post-body', '.article', '.article-content', '.article-body',
            '.story', '.story-content' // More classes
        ];
        document.querySelectorAll(commonSelectors.join(', ')).forEach(el => {
            // Avoid adding duplicates or elements already inside a strong candidate
            if (this.isPotentialContent(el) && !candidates.some(c => c.contains(el))) {
                candidates.push(el);
            }
        });

        console.log(`Found ${candidates.length} initial candidates.`);

        // 3. Score candidates
        candidates.forEach(el => {
            const score = this.scoreElement(el);
            console.log(`Scoring: ${el.tagName}#${el.id}.${el.className.split(' ').join('.')} - Score: ${score.toFixed(2)}`);
            if (score > maxScore) {
                maxScore = score;
                bestCandidate = el;
            }
        });

        // Ensure the best candidate meets minimum requirements
        if (bestCandidate && maxScore > 0) {
             const textContent = this.extractText(bestCandidate);
             const wordCount = textContent.split(/\s+/).length;
             if (textContent.length >= this.MIN_TEXT_LENGTH && wordCount >= this.MIN_WORD_COUNT) {
                 console.log(`Selected best candidate: ${bestCandidate.tagName}#${bestCandidate.id}.${bestCandidate.className.split(' ').join('.')} with score ${maxScore.toFixed(2)}`);
                 return bestCandidate;
             } else {
                  console.log(`Best candidate rejected (score: ${maxScore.toFixed(2)}, length: ${textContent.length}, words: ${wordCount}).`);
             }
        }

        console.log("Could not determine main content element reliably.");
        return null; // Indicate failure
    }

    // Helper: Check if an element is potentially content (visible, not script/style etc.)
    isPotentialContent(el) {
        if (!el || typeof el.matches !== 'function') return false;

        // Basic node type and visibility checks
        if (el.nodeType !== Node.ELEMENT_NODE ||
            el.matches('script, style, noscript, iframe, header, footer, nav, aside, form, button, select, textarea') ||
            el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        // Check computed style for visibility (can be slow, use cautiously)
        // const style = window.getComputedStyle(el);
        // if (style.display === 'none' || style.visibility === 'hidden') {
        //     return false;
        // }

         // Check common non-content roles
         const role = el.getAttribute('role');
         if (role && /^(navigation|search|banner|complementary|contentinfo|form|menu|menubar|tablist|dialog|alert|log|status|timer)/i.test(role)) {
             return false;
         }

        // Check if element itself or its direct parent is often non-content (simple check)
        if (el.matches('header *, footer *, nav *, aside *')) {
             // Allow if it's a specific content tag *inside* these containers (e.g. article in header)
             if (!el.matches('main, article, #content, #main, .content, .entry-content, .post-body')) {
                 return false;
             }
        }

        return true;
    }

    // Helper: Score an element based on content heuristics
    scoreElement(el) {
        if (!el) return 0;

        const textContent = this.extractText(el); // Use helper to get cleaner text
        const textLength = textContent.length;

        if (textLength < this.MIN_TEXT_LENGTH) return 0; // Penalize very short content heavily

        const paragraphCount = el.querySelectorAll('p').length;
        const linkCount = el.querySelectorAll('a').length;
        const imgCount = el.querySelectorAll('img').length;
        const headingCount = el.querySelectorAll('h1, h2, h3, h4, h5, h6').length;

        // Calculate link density relative to text length
        const linkDensity = linkCount / (textLength + 1);

        // Base score on text length (log scale) and paragraph count
        let score = Math.log10(textLength + 1) * (paragraphCount + 1); // Add 1 to avoid log10(1)=0

        // Boost for headings
        score += headingCount * 2;

        // Penalize high link density (often navigation or ads)
        if (linkDensity > 0.1) score *= 0.5; // Halve score if >10% links
        if (linkDensity > 0.3) score *= 0.3; // Penalize heavily if >30%

        // Penalize high image density relative to text (might be galleries, ads)
        const imgDensity = imgCount / (textLength / 100 + 1); // Images per 100 chars
        if (imgDensity > 5) score *= 0.6; // Penalize if >5 images per 100 chars

        // Boost for semantic tags
        if (el.matches('main')) score *= 2.0;
        else if (el.matches('article')) score *= 1.5;

        // Penalize common non-content class patterns (even if not perfectly filtered)
        if (/(comment|meta|share|related|sidebar|ad-slot|nav|menu|footer|header|masthead)/i.test(el.className)) {
            score *= 0.3;
        }
        // Penalize if it looks like a list of links (common in footers/navs)
        const directChildren = Array.from(el.children);
        const listItems = el.querySelectorAll('li');
        if (listItems.length > 5 && directChildren.every(child => child.matches('ul, ol, li, a, div'))) {
             const listLinks = el.querySelectorAll('li a').length;
             if (listLinks / (listItems.length + 1) > 0.8) { // Most list items are just links
                 score *= 0.2;
             }
        }

        return Math.max(0, score); // Ensure score is not negative
    }

     // Helper: Extract text content more selectively
     extractText(el) {
         let text = '';
         // Simple approach: Use textContent but clean known bad tags first
         const clone = el.cloneNode(true);
         clone.querySelectorAll('script, style, noscript, iframe, button, select, textarea, nav, aside, footer, header, [aria-hidden="true"]').forEach(badEl => badEl.remove());
         // Consider removing figure captions if needed: clone.querySelectorAll('figcaption').forEach(cap => cap.remove());
         text = clone.textContent || "";

         // Basic cleanup of excessive whitespace
         return text.replace(/\s+/g, ' ').trim();

         /* // More complex/accurate but slower node walking:
         const nodeIterator = document.createNodeIterator(el, NodeFilter.SHOW_TEXT, (node) => {
              // Filter out text nodes within unwanted parent elements
              let parent = node.parentNode;
              while (parent && parent !== el && parent !== document.body) {
                   if (!this.isPotentialContent(parent) || parent.matches('a')) { // Exclude link text here? Maybe not.
                       return NodeFilter.FILTER_REJECT;
                   }
                   parent = parent.parentNode;
               }
               return NodeFilter.FILTER_ACCEPT;
         });
         let currentNode;
         while (currentNode = nodeIterator.nextNode()) {
             text += currentNode.nodeValue.trim() + ' ';
         }
         return text.replace(/\s+/g, ' ').trim();
         */
     }

    // --- UI Creation ---
    createStyles() { /* ... styles remain the same as previous version ... */
        this.spritzStyles = `
        #spritz_root {
          position: fixed; z-index: 2147483647; width: 400px; left: 50%; top: 50px;
          transform: translateX(-50%); padding: 15px; background-color: rgba(255, 255, 255, 0.95);
          border: 1px solid #ccc; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); border-radius: 5px;
          color: #333; font-family: "Source Code Pro", "Courier New", Courier, monospace;
          line-height: 1.4; user-select: none;
        }
        #spritz_drag_handle {
            height: 20px; cursor: move; position: relative; margin-bottom: 10px; border-bottom: 1px solid #eee;
        }
        #spritz_drag_handle::before {
            content: '☰'; position: absolute; left: 50%; transform: translateX(-50%); color: #aaa; font-size: 14px; top: -2px;
        }
        #spritz-display-area { position: relative; height: 70px; margin-bottom: 15px; overflow: hidden; }
        #spritz_line_top, #spritz_line_bottom {
            position: absolute; left: 0; right: 0; height: 1px; background-color: #ccc;
        }
        #spritz_line_top::before, #spritz_line_bottom::before {
            content: ''; position: absolute; left: 50%; transform: translateX(-50%); width: 1px; height: 8px; background-color: red;
        }
        #spritz_line_top { top: 15px; } #spritz_line_top::before { top: -8px; }
        #spritz_line_bottom { bottom: 15px; } #spritz_line_bottom::before { bottom: -8px; }
        #spritz-flex-container {
          display: flex; justify-content: center; align-items: center; height: 100%; text-align: center;
          font-size: 30px; font-weight: bold; white-space: pre;
        }
        #spritz_word_wrapper { flex: 0 0 auto; padding: 0 10px; }
        #spritz_word_pivot { color: red; }
        #spritz_controls { padding-top: 10px; text-align: center; border-top: 1px solid #eee; }
        #spritz_controls > * { margin: 0 5px; cursor: pointer; vertical-align: middle; }
        #spritz_controls button { padding: 5px 12px; border: 1px solid #ccc; background-color: #f0f0f0; border-radius: 3px; }
        #spritz_controls button:hover { background-color: #e0e0e0; border-color: #bbb; }
        #spritz_controls select { padding: 4px; border-radius: 3px; border: 1px solid #ccc; }
      `;
        this.styleSheet = document.createElement("style");
        this.styleSheet.textContent = this.spritzStyles;
        document.head.appendChild(this.styleSheet);
    }

    createUI() { /* ... UI creation remains the same as previous version ... */
        this.rootDiv = this.addUiElement("div", "spritz_root");
        this.dragHandle = this.addUiElement("div", "spritz_drag_handle", this.rootDiv);
        this.displayArea = this.addUiElement("div", "spritz-display-area", this.rootDiv);
        this.lineTop = this.addUiElement("div", "spritz_line_top", this.displayArea);
        this.lineBottom = this.addUiElement("div", "spritz_line_bottom", this.displayArea);
        this.wordFlexContainer = this.addUiElement("div", "spritz-flex-container", this.displayArea);
        this.wordWrapper = this.addUiElement("div", "spritz_word_wrapper", this.wordFlexContainer);
        this.former = this.addUiElement("span", "spritz_word_former", this.wordWrapper);
        this.pivot = this.addUiElement("span", "spritz_word_pivot", this.wordWrapper);
        this.latter = this.addUiElement("span", "spritz_word_latter", this.wordWrapper);
        this.controlsDiv = this.addUiElement("div", "spritz_controls", this.rootDiv);
        this.wpmSelect = this.addUiElement("select", "spritz_wpm", this.controlsDiv);
        for (let wpm = 200; wpm <= 1000; wpm += 50) {
            const wpmOption = document.createElement("option");
            wpmOption.text = `${wpm} wpm`; wpmOption.value = String(wpm);
            if (wpm === 350) { wpmOption.selected = true; } this.wpmSelect.add(wpmOption);
        }
        this.startButton = this.addUiElement("button", "spritz_start", this.controlsDiv);
        this.startButton.textContent = "Start";
        this.closeButton = this.addUiElement("button", "spritz_close", this.controlsDiv);
        this.closeButton.textContent = "Close";
     }

    addUiElement(type, id, parent) { /* ... remains the same ... */
      const element = document.createElement(type); element.id = id;
      if (parent) { parent.appendChild(element); } return element;
    }

    attachEventListeners() { /* ... remains the same ... */
        this.dragHandle.addEventListener('mousedown', (event) => {
            this.mouseDown = true; this.dragOffsetX = event.clientX - this.rootDiv.offsetLeft;
            this.dragOffsetY = event.clientY - this.rootDiv.offsetTop; this.rootDiv.style.transition = 'none'; event.preventDefault();
        });
        document.addEventListener('mousemove', (event) => {
            if (this.mouseDown) {
                let newX = event.clientX - this.dragOffsetX; let newY = event.clientY - this.dragOffsetY; const PADDING = 10;
                newX = Math.max(PADDING, Math.min(newX, window.innerWidth - this.rootDiv.offsetWidth - PADDING));
                newY = Math.max(PADDING, Math.min(newY, window.innerHeight - this.rootDiv.offsetHeight - PADDING));
                this.rootDiv.style.left = `${newX}px`; this.rootDiv.style.top = `${newY}px`; this.rootDiv.style.transform = '';
            }
        }, { passive: true });
        document.addEventListener('mouseup', () => {
            if (this.mouseDown) { this.mouseDown = false; this.rootDiv.style.transition = ''; }
        });
        this.startButton.addEventListener('click', () => { if (this.isPlaying) { this.pause(); } else { this.start(); } });
        this.closeButton.addEventListener('click', () => { this.remove(); });
        this.controlsDiv.addEventListener('mousedown', (event) => { event.stopPropagation(); });
        this.wpmSelect.addEventListener('change', this.handleWpmChange);
     }

    getWPM() { /* ... remains the same ... */
      const selectedWpm = parseInt(this.wpmSelect.value, 10); return Math.max(50, selectedWpm);
    }

    setWord(word) { /* ... remains the same ... */
        const NBSP = '\u00A0'; const MAX_PADDING = 15; if (!word) { word = ''; } word = String(word).trim();
        let pivotIndex = 0; const len = word.length;
        if (len === 0) {} else if (len === 1) { pivotIndex = 0; } else if (len % 2 !== 0) { pivotIndex = Math.floor(len / 2); } else { pivotIndex = Math.floor(len / 2) - 1; }
        const pivotChar = word.charAt(pivotIndex) || ''; let formerPart = word.slice(0, pivotIndex); let latterPart = word.slice(pivotIndex + 1);
        let formerPadding = ''; let latterPadding = '';
        if (len > 0) {
            const PIVOT_CENTER_OFFSET = 0.4; const widthDiff = (formerPart.length + PIVOT_CENTER_OFFSET) - (latterPart.length + (1.0 - PIVOT_CENTER_OFFSET));
            const paddingAmount = Math.round(Math.abs(widthDiff)); const limitedPadding = Math.min(MAX_PADDING, paddingAmount);
            if (widthDiff > 0) { latterPadding = NBSP.repeat(limitedPadding); } else if (widthDiff < 0) { formerPadding = NBSP.repeat(limitedPadding); }
        }
        this.former.textContent = formerPadding + formerPart; this.pivot.textContent = pivotChar || NBSP; this.latter.textContent = latterPart + latterPadding;
     }

    // --- start: Modified to use content detection ---
    start() {
      // Only re-process text if starting from the beginning
      if (this.currentWordIndex === 0) {
        let textToSpritz = this.getSelectedText();

        // If no selection, try to find main content
        if (!textToSpritz) {
          const mainContentElement = this.findMainContentElement();
          if (mainContentElement) {
            textToSpritz = this.extractText(mainContentElement); // Use the cleaner extraction
          }
        }

        // If still no text (no selection, no content found)
        if (!textToSpritz || textToSpritz.length < 10) { // Check length again after extraction
          this.setWord("Select text or find content?"); // Updated message
          alert("Please select text on the page, or Spritz couldn't automatically find the main content.");
          return;
        }

        // Process the found/selected text
        this.words = textToSpritz.split(/\s+/)
                               .filter(w => w.length > 0);

        if (this.words.length === 0) {
             this.setWord("No words found?");
             return;
        }
      } // End of processing text block

      if (this.words.length === 0 || this.currentWordIndex >= this.words.length) {
          this.stop();
          return;
      }

      this.isPlaying = true;
      this.startButton.textContent = "Pause";
      // WPM select remains enabled

      clearTimeout(this.intervalId);
      const baseInterval = 60000 / this.getWPM();
      this.intervalId = setTimeout(this.tick, baseInterval); // Start the tick loop
    }


    pause() { /* ... remains the same ... */
      clearTimeout(this.intervalId); this.intervalId = null; this.isPlaying = false;
      this.startButton.textContent = "Continue"; this.wpmSelect.disabled = false;
    }

    stop() { /* ... remains the same ... */
      clearTimeout(this.intervalId); this.intervalId = null; this.currentWordIndex = 0; this.isPlaying = false;
      this.startButton.textContent = "Start"; this.wpmSelect.disabled = false;
    }

    remove() { /* ... remains the same ... */
        this.pause();
        if (this.rootDiv && this.rootDiv.parentNode) { this.rootDiv.remove(); }
        if (this.styleSheet && this.styleSheet.parentNode) { this.styleSheet.remove(); }
        if (this.wpmSelect && this.handleWpmChange) { this.wpmSelect.removeEventListener('change', this.handleWpmChange); }
        if (window.spritzInstance === this) { window.spritzInstance = null; }
        console.log("Spritz instance removed.");
     }

  } // End Spritz Class

  // --- Initialize ---
  try {
      if (window.spritzInstance) { window.spritzInstance.remove(); }
      window.spritzInstance = new Spritz();
  } catch (error) {
      console.error("Failed to initialize Spritz:", error);
      alert("Error initializing Spritz reader. See console for details.");
  }

})(); // End bookmarklet IIFE
