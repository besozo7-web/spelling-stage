# Spelling Stage

A spelling bee study app: spoken dictation, official-style pronouncer requests,
and spaced repetition for missed words.

## Files
- `index.html` — the page layout (setup screen, practice screen, word list, progress)
- `style.css`  — colors, fonts and layout
- `app.js`     — all the logic (speech, rounds, grading, spaced repetition)
- `words.json` — the 450-word bank

## Run it on your computer
    cd spelling-stage
    python3 -m http.server 8000      # on Windows: py -m http.server 8000
Then open http://localhost:8000 in Chrome, Edge or Safari.

Opening index.html by double-clicking will NOT work, because browsers block
loading words.json from a local file. Always use the server.

## Add or edit words
Add an entry to words.json:

    {"id": 451, "word": "zephyr", "alternates": [], "partOfSpeech": "noun",
     "definition": "a gentle breeze.", "origin": "Greek",
     "sentence": "A warm zephyr rustled the leaves."}

Optional: "pronounceAs": "led" if the voice says the word wrong.
