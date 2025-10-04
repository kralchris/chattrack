import { useChatStore } from '../store.js';

export default function AllocRibbon({ onToggleBenchmark }) {
  const { notes, comparingBenchmark, offline, activeSymbol } = useChatStore();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface/60 px-4 py-3 shadow-inner shadow-black/30">
      <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
        {activeSymbol} Hourly Preview
      </span>
      <button
        onClick={onToggleBenchmark}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
          comparingBenchmark ? 'bg-accent text-slate-900' : 'bg-white/10 text-white'
        }`}
      >
        {comparingBenchmark ? 'Comparing vs SPY' : 'Compare vs SPY'}
      </button>
      {offline ? (
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
          Offline data fallback
        </span>
      ) : null}
      {notes?.slice(-3).map((note, index) => (
        <span key={index} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
          {note}
        </span>
      ))}
    </div>
  );
}
