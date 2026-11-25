import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  details: string | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      details: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsedMessage = error.message || 'Terjadi kesalahan aplikasi yang tidak terduga.';
    let parsedDetails: string | null = null;
    try {
      const json = JSON.parse(error.message);
      if (json && typeof json === 'object' && 'operationType' in json) {
        parsedMessage = `Akses Firestore gagal (${json.operationType} pada ${json.path || 'koleksi'})`;
        parsedDetails = json.error || error.message;
      }
    } catch {
      // Non-JSON runtime error
    }
    return {
      hasError: true,
      message: parsedMessage,
      details: parsedDetails,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('KerjaPay ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900">
                  Gangguan Sinkronisasi Data HRMS
                </h1>
                <p className="text-sm text-slate-600 mt-1">{this.state.message}</p>
              </div>
            </div>
            {this.state.details && (
              <pre className="rounded-xl bg-slate-950 text-slate-200 p-3 text-xs font-mono overflow-x-auto">
                {this.state.details}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Muat Ulang Aplikasi</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
