const title = 'Piano App'; // Title for the floating window

import('floatingWindow').then(({ createFloatingWindow }) => {
    const { contentElement } = createFloatingWindow({
        rootElement: document.body,
        startDimensions: { width: 800, height: 340, top: 50, left: 50 },
        title,
        contentElement: document.createElement('div'),
    });

    // ================================
    // CONFIG: Customize these values
    // ================================
    const START_OCTAVE = 4;       // Lower bound (e.g., 3, 4, etc.)
    const NUMBER_OF_OCTAVES = 2;  // How many octaves to generate
    
    // ================================
    // 1) Define frequency & naming
    // ================================
    // In 12-tone equal temperament, frequency = 440 * 2^((note - 69)/12).
    // We'll compute note relative to A4 (which is MIDI note 69).
    function getFrequency(noteIndex, octave) {
        // noteIndex: 0..11  => (C, C#, D, ..., B)
        // octave: integer   => e.g., 4 for C4..B4
        // A4 is noteIndex=9 at octave=4 => (octave-4)*12 + (noteIndex - 9) semitones from A4
        const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
        return 440 * Math.pow(2, semitonesFromA4 / 12);
    }

    // Names for each note index 0..11
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Which note indices belong to white keys and black keys
    const whiteNotes = [0, 2, 4, 5, 7, 9, 11];  // C, D, E, F, G, A, B
    const blackNotes = [1, 3, 6, 8, 10];       // C#, D#, F#, G#, A#

    // We'll position black keys absolutely within their octave
    // Key widths: white ~50px, black ~30px. These offsets align them properly above the gaps.
    const blackKeyOffsets = {
        1: 35,  // C#
        3: 85,  // D#
        6: 185, // F#
        8: 235, // G#
        10: 285 // A#
    };

    // ================================
    // 2) Generate HTML for the piano
    // ================================
    function generatePianoHtml(startOctave, numOctaves) {
        let html = `<div class="piano-container">`;

        // Loop for each octave
        for (let octaveOffset = 0; octaveOffset < numOctaves; octaveOffset++) {
            const currentOctave = startOctave + octaveOffset;
            html += `
              <div class="octave">
                <div class="white-keys">
            `;
            // White keys in this octave
            whiteNotes.forEach(noteIndex => {
                const freq = getFrequency(noteIndex, currentOctave);
                const label = noteNames[noteIndex] + currentOctave;
                html += `
                  <div class="white-key" data-frequency="${freq}">
                      ${label}
                  </div>
                `;
            });

            html += `
                </div> <!-- .white-keys -->
                <div class="black-keys">
            `;
            // Black keys in this octave
            blackNotes.forEach(noteIndex => {
                const freq = getFrequency(noteIndex, currentOctave);
                const label = noteNames[noteIndex] + currentOctave;
                const offset = blackKeyOffsets[noteIndex] || 0; // default 0 if somehow missing
                html += `
                  <div 
                    class="black-key" 
                    data-frequency="${freq}" 
                    style="margin-left:${offset}px"
                  >
                    ${label}
                  </div>
                `;
            });

            html += `
                </div> <!-- .black-keys -->
              </div> <!-- .octave -->
            `;
        }

        html += `</div> <!-- .piano-container -->`;
        return html;
    }

    // ================================
    // 3) Build the final HTML & CSS
    // ================================
    const pianoHtml = `
      <style>
        .piano-container {
            display: flex;
            flex-wrap: wrap;
            /* If you want each octave side by side, remove flex-wrap or adjust as needed */
        }
        .octave {
            position: relative;
            display: inline-block;
            margin-right: 20px;
        }
        /* White keys styling */
        .white-keys {
            display: flex;
        }
        .white-key {
            width: 50px;
            height: 180px;
            background: #fff;
            border: 1px solid #000;
            border-right: none;
            position: relative;
            cursor: pointer;
            user-select: none;
            text-align: center;
            line-height: 180px;
        }
        .white-key:last-child {
            border-right: 1px solid #000;
        }
        .white-key:active {
            background: #ddd;
        }
        /* Black keys styling */
        .black-keys {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            pointer-events: none; /* so clicks pass through except where black keys exist */
        }
        .black-key {
            position: absolute;
            width: 30px;
            height: 100px;
            background: #000;
            border: 1px solid #333;
            cursor: pointer;
            user-select: none;
            text-align: center;
            line-height: 100px;
            color: #fff;
            pointer-events: auto; /* re-enable clicks for black keys */
        }
        .black-key:active {
            background: #444;
        }
      </style>

      ${generatePianoHtml(START_OCTAVE, NUMBER_OF_OCTAVES)}
    `;

    // Put our piano HTML into the floating window
    contentElement.innerHTML = pianoHtml;

    // ================================
    // 4) Set up audio + fade-out
    // ================================
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    /**
     * Play a note with a gentle fade out.
     * @param {number} frequency - frequency of the note
     * @param {number} duration - duration (in seconds)
     */
    function playNote(frequency, duration = 1) {
        const oscillator = audioCtx.createOscillator();
        oscillator.frequency.value = frequency;

        const gainNode = audioCtx.createGain();
        // Start at moderate volume
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        // Exponential fade to near zero
        gainNode.gain.exponentialRampToValueAtTime(
            0.00001, 
            audioCtx.currentTime + duration
        );

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    }

    // ================================
    // 5) Bind event listeners
    // ================================
    // White + black keys share the same logic
    contentElement.querySelectorAll('.white-key, .black-key').forEach(key => {
        key.addEventListener('click', () => {
            const frequency = parseFloat(key.getAttribute('data-frequency'));
            playNote(frequency);
        });
    });
});
