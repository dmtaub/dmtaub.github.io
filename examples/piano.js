const title = 'piano-app';

import('floatingWindow').then(({ createFloatingWindow }) => {
    const { contentElement } = createFloatingWindow({
        rootElement: document.body,
        startDimensions: { width: 600, height: 300, top: 50, left: 50 },
        title,
        contentElement: document.createElement('div'),
    });

    // Inject HTML content for a simple digital piano (one octave, C4 to B4)
    contentElement.innerHTML = `
        <style>
            .piano-container {
                display: inline-block;
                position: relative;
                margin-top: 10px;
                margin-left: 50px;
            }
            /* White keys container */
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
                z-index: 1;
                cursor: pointer;
                user-select: none;
                text-align: center;
                line-height: 250px;
            }
            .white-key:last-child {
                border-right: 1px solid #000;
            }
            .white-key:active {
                background: #ddd;
            }

            /* Black keys container */
            .black-keys {
                display: flex;
                position: absolute;
                top: 0;
                left: 50px;
                height: 100%;
                pointer-events: none; /* Let white keys beneath receive clicks where black keys aren't present */
            }
            .black-key {
                width: 30px;
                height: 100px;
                background: #000;
                border: 1px solid #333;
                margin-left: 20px;
                z-index: 2;
                cursor: pointer;
                user-select: none;
                text-align: center;
                line-height: 100px;
                color: #fff;
                pointer-events: auto; /* Make black keys clickable */
            }
            .black-key:active {
                background: #444;
            }
            /* Position each black key above the gap between two white keys */
            .black-key:nth-of-type(1) {
                margin-left: -15px;  /* position over C & D */
            }
            .black-key:nth-of-type(3) {
                margin-left: 68px;  /* position over C & D */
            }
        </style>

        <div class="piano-container">
            <div class="white-keys">
                <div class="white-key" data-frequency="261.63">C4</div>
                <div class="white-key" data-frequency="293.66">D4</div>
                <div class="white-key" data-frequency="329.63">E4</div>
                <div class="white-key" data-frequency="349.23">F4</div>
                <div class="white-key" data-frequency="392.00">G4</div>
                <div class="white-key" data-frequency="440.00">A4</div>
                <div class="white-key" data-frequency="493.88">B4</div>
            </div>
            <div class="black-keys">
                <div class="black-key" data-frequency="277.18">C#4</div>
                <div class="black-key" data-frequency="311.13">D#4</div>
                <div class="black-key" data-frequency="369.99">F#4</div>
                <div class="black-key" data-frequency="415.30">G#4</div>
                <div class="black-key" data-frequency="466.16">A#4</div>
            </div>
        </div>
    `;

    // Set up a single AudioContext for all notes
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    /**
     * Play a note with a gentle fade out.
     * @param {number} frequency - frequency of the note
     * @param {number} duration - duration (in seconds) before the oscillator stops
     */
    function playNote(frequency, duration = 2) {
        const oscillator = audioCtx.createOscillator();
        oscillator.frequency.value = frequency;

        const gainNode = audioCtx.createGain();
        // Start at 0.2 volume and ramp down
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.00001, 
            audioCtx.currentTime + duration
        );

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    }

    // Add event listeners to all piano keys (white and black)
    contentElement.querySelectorAll('.white-key, .black-key').forEach((key) => {
        key.addEventListener('click', () => {
            const frequency = parseFloat(key.getAttribute('data-frequency'));
            playNote(frequency);
        });
    });
});
