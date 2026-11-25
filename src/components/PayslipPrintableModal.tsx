import React from 'react';
import { Printer, X } from 'lucide-react';
import type { CompanyRecord, EmployeeRecord, PayslipRecord } from '../types/hrms';
import { formatIDR } from '../utils/currency';
import { formatDateDMY } from '../utils/dateFormat';

interface PayslipPrintableModalProps {
  payslip: PayslipRecord;
  company?: CompanyRecord;
  employee?: EmployeeRecord;
  departmentName?: string;
  positionTitle?: string;
  onClose: () => void;
}

export const PayslipPrintableModal: React.FC<PayslipPrintableModalProps> = ({
  payslip,
  company,
  employee,
  departmentName,
  positionTitle,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:bg-white print:p-0 print:static">
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col print:border-0 print:max-h-none">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 print:hidden">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Slip Gaji Karyawan · {payslip.periodLabel || payslip.periodMonth}
            </h3>
            <p className="text-xs text-slate-500">
              Status Workflow: {payslip.workflowStatus}
              {payslip.isProvisional ? ' · Perhitungan Provisional' : ' · Terverifikasi'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" />
              <span>Cetak / Simpan PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Tutup slip gaji"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto print:overflow-visible">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <p className="text-base font-bold text-slate-900">
                {company?.name || 'PT Nusantara Digital Karya'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {company?.address || 'Jakarta Selatan'}
              </p>
              {company?.npwp && (
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  NPWP: {company.npwp}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">SLIP GAJI ELEKTRONIK</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Periode: {payslip.periodLabel || payslip.periodMonth}
              </p>
              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {payslip.payslipId}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs border-b border-slate-200 pb-4">
            <div>
              <p className="text-slate-500">Nama Karyawan</p>
              <p className="font-semibold text-slate-900 mt-0.5">
                {payslip.employeeName || employee?.fullName || payslip.employeeId}
              </p>
            </div>
            <div>
              <p className="text-slate-500">ID / NIK Karyawan</p>
              <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                {employee?.employeeCode || payslip.employeeId}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Departemen / Jabatan</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {departmentName || '-'} · {positionTitle || '-'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Rekening Bank</p>
              <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
                {employee?.bankName ? `${employee.bankName} ${employee.bankAccountNumber || ''}` : '-'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-700 border-b border-slate-200 pb-1.5">
                Rincian Pendapatan (Income)
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Gaji Pokok</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatIDR(payslip.basicSalary)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tunjangan Jabatan</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatIDR(payslip.positionAllowance ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tunjangan Transport</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatIDR(payslip.transportAllowance ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tunjangan Makan</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatIDR(payslip.mealAllowance ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Upah Lembur Disetujui</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatIDR(payslip.overtimePayment ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tunjangan Lainnya</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatIDR(payslip.otherAllowances ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold">
                  <span className="text-slate-900">Total Penghasilan Bruto</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatIDR(payslip.grossIncome)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-700 border-b border-slate-200 pb-1.5">
                Rincian Potongan (Deductions)
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Potongan Ketidakhadiran</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    {formatIDR(payslip.absenceDeduction ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Potongan Keterlambatan</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    {formatIDR(payslip.lateDeduction ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">BPJS Kesehatan (1% Karyawan)</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    {formatIDR(payslip.bpjsHealth ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">BPJS Ketenagakerjaan (JHT + JP)</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    {formatIDR(payslip.bpjsEmployment ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">PPh 21 (Konfigurasi Perusahaan)</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    {formatIDR(payslip.pph21 ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Potongan Lainnya</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    {formatIDR(payslip.otherDeductions ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold">
                  <span className="text-slate-900">Total Potongan</span>
                  <span className="font-mono tabular-nums text-rose-700">
                    {formatIDR(payslip.totalDeductions)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-900 text-white p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-300">Gaji Bersih Diterima (Take Home Pay)</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Status: {payslip.workflowStatus} · Tanggal Cetak: {formatDateDMY(new Date())}
              </p>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {formatIDR(payslip.netPay)}
            </p>
          </div>

          {payslip.calculationNotes && (
            <p className="text-xs text-slate-500 leading-relaxed">
              Catatan Perhitungan: {payslip.calculationNotes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
