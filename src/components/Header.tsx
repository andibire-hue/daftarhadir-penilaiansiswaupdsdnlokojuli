import React from 'react';
import { School, Printer, Settings, FileCode, UserCheck, UploadCloud } from 'lucide-react';
import { SchoolInfo } from '../types';

interface HeaderProps {
  schoolInfo: SchoolInfo;
  onOpenSettings: () => void;
  onDownloadStandalone: () => void;
  onOpenSelfRegistration: () => void;
  onOpenUploadModal: () => void;
  onPrint: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  schoolInfo,
  onOpenSettings,
  onDownloadStandalone,
  onOpenSelfRegistration,
  onOpenUploadModal,
  onPrint,
}) => {
  return (
    <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white rounded-xl shadow-lg shadow-blue-950/10 mb-6 p-6 no-print border border-blue-700/50">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
            <School className="w-8 h-8 text-blue-200" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold tracking-wider text-blue-200 uppercase bg-blue-950/60 px-2.5 py-0.5 rounded-md border border-blue-400/20">
                Aplikasi Penilaian Sekolah Dasar
              </span>
              <span className="text-xs text-blue-200/80">·</span>
              <span className="text-xs font-medium text-blue-200">
                T.A. {schoolInfo.academicYear} (Semester {schoolInfo.semester})
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white drop-shadow-xs">
              Sistem Pengolahan Nilai PJOK
            </h1>
            <p className="text-sm font-medium text-blue-100 flex items-center gap-2 mt-0.5">
              <span>{schoolInfo.schoolName}</span>
              <span className="text-blue-300">·</span>
              <span className="text-blue-200 text-xs">Guru: {schoolInfo.teacherName}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0">
          <button
            onClick={onOpenUploadModal}
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
            title="Upload berkas Excel (.xlsx, .xls) atau CSV perkelas"
          >
            <UploadCloud className="w-4 h-4 text-indigo-200" />
            <span>Upload Data Siswa</span>
          </button>

          <button
            onClick={onOpenSelfRegistration}
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
            title="Buka form pengisian data peserta didik secara mandiri atau tempel daftar siswa"
          >
            <UserCheck className="w-4 h-4 text-emerald-100" />
            <span>Pengisian Mandiri</span>
          </button>

          <button
            onClick={onPrint}
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors cursor-pointer"
            title="Buka Pratinjau & Cetak format Rapor Resmi A4"
          >
            <Printer className="w-4 h-4 text-blue-200" />
            <span className="hidden sm:inline">Cetak Rekap</span>
          </button>

          <button
            onClick={onDownloadStandalone}
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-600 text-white border border-blue-400/30 transition-colors shadow-xs cursor-pointer"
            title="Unduh single-file index.html murni untuk dijalankan offline tanpa server"
          >
            <FileCode className="w-4 h-4 text-blue-200" />
            <span>Unduh index.html</span>
          </button>

          <button
            onClick={onOpenSettings}
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors cursor-pointer"
            title="Pengaturan Guru, Kepala Sekolah & KKTP"
          >
            <Settings className="w-4 h-4 text-blue-200" />
            <span className="hidden sm:inline">Pengaturan</span>
          </button>
        </div>
      </div>
    </header>
  );
};

