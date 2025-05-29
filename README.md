# RSVP Reader
RSVP Reader is a bookmarklet ustilizing the [Rapid Serial Visual Presentation](https://en.wikipedia.org/wiki/Rapid_serial_visual_presentation) (RSVP) method, where words are displayed one at a time in a fixed position to improve reading speed and comprehension. RSVP Reader does not contain any analytics, does not use any external scripts or libraries and does not make any AJAX calls.

## Installation
Create a bookmarklet from the main JS file. Drag the bookmarklet to your bookmarks bar. Click on it.

## Usage
* Highlight the text you want to read
* Activate the bookmarklet
* Select the WPM and Start reading
* You can pause/resume the reading and adjust the WPM during reading

## Changelog
_03/31/2025_ Many improvements with the help of [Gemini 2.5 Pro](https://gemini.google.com/). 
* Reworked UI for better layout and control
* Added time estimate and progress bar
* Renamed project to RSVP Reader
* Added algorithm to detect likely content if no text is selected

_10/18/2024_ Initial Release based on [CoffeeSpritz](https://github.com/cbarraco/CoffeeSpritz)
* Added previous and next words in muted color
* Added Pause / Resume function
* Set default reading speed 350wpm
* Fixed layout bug when WPM dropdown is opened during a read

## TO DO
* ~~If no text is selected, auto detect largest content block on the page with JS (without readibility api).~~
* Create github pages with lve bookmarklet link
* Rewind X seconds
* UI improvements
    * ~~Add vertical guidelines above red letter like original implementation~~
    * ~~Optimize layout of overly~~
    * ~~Fix jumpy overlay when dropdown opens~~
    * Improve / add button controls

## Acknowledgements
* [CoffeeSpritz](https://github.com/cbarraco/CoffeeSpritz)
* [OpenSpritz](https://github.com/Miserlou/OpenSpritz)
* [Spritz Incorporated](http://www.spritzinc.com/)
* [Gemini 2.5 Pro](https://gemini.google.com/)
* Google Jules - AI Software Engineering Agent (https://jules.google.com/)

## Notice
RSVP Reader is not affiliated with [Spritz Incorporated](http://www.spritzinc.com/).
