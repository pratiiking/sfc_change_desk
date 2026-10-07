import React, { useEffect, useRef, useState } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

const TRIGGER_CLASS =
  'box-border flex w-full cursor-pointer select-none items-center justify-between rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none';

const ROW_HEIGHT = 36;
const SLOTS = [-2, -1, 0, 1, 2];
const WHEEL_SENSITIVITY = 50;
const SETTLE_DELAY = 140;
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

const mod = (value, n) => ((value % n) + n) % n;

// Genuinely circular wheel: `pos` is an unbounded float (never clamped,
// never reset/recentered) -- which option is shown in each row is always
// `options[mod(round(pos) + slot, n)]`, so 23 -> 00 and 00 -> 23 just fall
// out of the modulo math with no special-cased wraparound or silent
// "jump back to the middle" hack. Rendering is driven purely by CSS
// transform + transition, not native scrollTop, so there's nothing to
// desync or visibly snap.
function Wheel({ options, value, onChange }) {
  const n = options.length;
  const [pos, setPos] = useState(() => Math.max(0, options.indexOf(value)));
  const [transitioning, setTransitioning] = useState(true);
  const settleTimer = useRef(null);
  const elRef = useRef(null);

  const commit = (nextPos) => {
    const rounded = Math.round(nextPos);
    const idx = mod(rounded, n);
    if (options[idx] !== value) onChange(options[idx]);
    return rounded;
  };

  const handleClick = (slot) => {
    if (slot === 0) return;
    setTransitioning(true);
    setPos((p) => commit(p + slot));
  };

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  // JSX onWheel is registered passive by React, so preventDefault() inside it
  // is silently ignored and the page scrolls underneath the wheel -- has to
  // be a real DOM listener with { passive: false } for preventDefault to work.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      setTransitioning(false);
      setPos((p) => p + e.deltaY / WHEEL_SENSITIVITY);
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        setTransitioning(true);
        setPos((p) => commit(p));
      }, SETTLE_DELAY);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const base = Math.round(pos);
  const frac = pos - base;

  return (
    <div
      ref={elRef}
      className="relative overflow-hidden select-none"
      style={{ height: ROW_HEIGHT * 3, width: 56 }}
    >
      {SLOTS.map((slot) => {
        const optIdx = mod(base + slot, n);
        const y = (slot + 1) * ROW_HEIGHT - frac * ROW_HEIGHT;
        return (
          <div
            key={slot}
            onClick={() => handleClick(slot)}
            className={`absolute left-0 flex w-full cursor-pointer items-center justify-center text-[0.9rem] ${
              slot === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'
            }`}
            style={{
              top: 0,
              height: ROW_HEIGHT,
              transform: `translateY(${y}px)`,
              transition: transitioning ? 'transform 150ms ease-out' : 'none'
            }}
          >
            {options[optIdx]}
          </div>
        );
      })}
    </div>
  );
}

function TimeWheelPicker({ label = 'Time', required = false, value = '', onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const [hour, minute] = (value || '').split(':');
  const safeHour = HOURS.includes(hour) ? hour : '00';
  const safeMinute = MINUTES.includes(minute) ? minute : '00';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1 block text-[0.8rem] font-medium text-foreground">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
      )}
      <div tabIndex={0} onClick={() => setOpen((prev) => !prev)} className={TRIGGER_CLASS}>
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value ? `${safeHour}:${safeMinute}` : 'Select time...'}
        </span>
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-muted-foreground" />
          <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-[0.35rem] flex items-center gap-1 rounded-[10px] border border-border bg-card p-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          <Wheel options={HOURS} value={safeHour} onChange={(h) => onChange(`${h}:${safeMinute}`)} />
          <span className="text-foreground">:</span>
          <Wheel options={MINUTES} value={safeMinute} onChange={(m) => onChange(`${safeHour}:${m}`)} />
        </div>
      )}
    </div>
  );
}

export default React.memo(TimeWheelPicker);
