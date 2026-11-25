import React from 'react';
import { Wifi } from 'lucide-react';

interface PhoneFrameShellProps {
  enabled: boolean;
  liveTimeLabel: string;
  children: React.ReactNode;
}

export const PhoneFrameShell: React.FC<PhoneFrameShellProps> = ({
  enabled,
  liveTimeLabel,
  children,
}) => {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto w-full max-w-[404px] select-none lg:select-auto">
      {/* Realistic Smartphone Chassis (shown on desktop/tablet when Phone Frame mode is active) */}
      <div className="hidden lg:flex flex-col rounded-[48px] bg-slate-900 p-[11px] border border-slate-700 shadow-2xl h-[790px] max-h-[calc(100vh-120px)]">
        {/* Inner Display Screen */}
        <div className="flex-1 min-h-0 rounded-[37px] bg-[#F4F6F9] overflow-hidden flex flex-col relative">
          {/* Device Status Bar & Dynamic Island */}
          <div className="shrink-0 h-11 px-6 bg-white/95 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-900 select-none">
            <span className="font-mono tabular-nums w-14">{liveTimeLabel.slice(0, 5)}</span>
            <div className="h-5 w-24 rounded-full bg-slate-950 flex items-center justify-end pr-2">
              <span className="h-2 w-2 rounded-full bg-slate-800 border border-slate-700" />
            </div>
            <div className="flex items-center gap-1.5 w-14 justify-end text-slate-800">
              <Wifi className="h-3.5 w-3.5" />
              <div className="w-5 h-2.5 rounded-[3px] border border-slate-800 p-[1px] flex items-center">
                <div className="h-full w-3.5 rounded-[1px] bg-emerald-600" />
              </div>
            </div>
          </div>

          {/* App Viewport Content (header + scrollable body + bottom nav inside frame) */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>

          {/* Home Gesture Indicator */}
          <div className="shrink-0 h-5 bg-white flex items-center justify-center border-t border-slate-100">
            <div className="h-1 w-28 rounded-full bg-slate-300" />
          </div>
        </div>
      </div>

      {/* Real Mobile Viewport (< lg): native full-width without outer chassis */}
      <div className="lg:hidden">{children}</div>
    </div>
  );
};
