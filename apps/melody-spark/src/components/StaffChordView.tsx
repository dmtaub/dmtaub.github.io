import React from 'react';
import { getAccidentalForNote, midiToNoteName, noteNameToStaffStep } from '../core/melodyEngine';

export function StaffChordView({ notes, onClick }: { notes: number[]; onClick: () => void }) {
  const noteNames = [...notes].sort((a, b) => a - b).map(midiToNoteName);
  const staffLineSteps = [30, 32, 34, 36, 38];
  const bottomStep = 28;
  const stepHeight = 8;
  const getY = (step: number) => 88 - (step - bottomStep) * (stepHeight / 2);

  return (
    <button type="button" onClick={onClick} className="staff-button" title="Click to cycle inversion">
      <svg viewBox="0 0 120 100" className="h-full w-full overflow-visible">
        {staffLineSteps.map((step) => (
          <line key={step} x1="12" y1={getY(step)} x2="108" y2={getY(step)} stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        ))}
        {noteNames.map((noteName, idx) => {
          const step = noteNameToStaffStep(noteName);
          const y = getY(step);
          const accidental = getAccidentalForNote(noteName);
          const x = 30 + idx * 30;
          const ledgerSteps: number[] = [];
          if (step < staffLineSteps[0]) {
            for (let s = staffLineSteps[0] - 2; s >= step; s -= 2) ledgerSteps.push(s);
          }
          if (step > staffLineSteps[staffLineSteps.length - 1]) {
            for (let s = staffLineSteps[staffLineSteps.length - 1] + 2; s <= step; s += 2) ledgerSteps.push(s);
          }
          return (
            <g key={`${noteName}-${idx}`}>
              {ledgerSteps.map((ledgerStep) => (
                <line key={ledgerStep} x1={x - 12} y1={getY(ledgerStep)} x2={x + 12} y2={getY(ledgerStep)} stroke="currentColor" strokeWidth="2" />
              ))}
              {accidental ? <text x={x - 14} y={y + 4} fontSize="14" textAnchor="middle" fill="currentColor">{accidental}</text> : null}
              <ellipse cx={x} cy={y} rx="7" ry="5.5" fill="currentColor" fillOpacity="0.9" transform={`rotate(-18 ${x} ${y})`} />
              <line x1={x + 7} y1={y} x2={x + 7} y2={y - 28} stroke="currentColor" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
    </button>
  );
}
