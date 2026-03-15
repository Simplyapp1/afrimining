import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { recruitmentApply } from './api';

export default function JobApplication() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState(null);
  const [vacancy, setVacancy] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    id_number: '',
    address: '',
  });
  const [files, setFiles] = useState({
    cv: null,
    cover_letter: null,
    qualifications: null,
    id_document: null,
    academic_record: null,
  });

  useEffect(() => {
    if (!token) {
      setError('Invalid application link');
      setLoading(false);
      return;
    }
    recruitmentApply.getInvite(token)
      .then((data) => {
        setInvite(data.invite);
        setVacancy(data.vacancy);
      })
      .catch((e) => setError(e?.message || 'Invalid or expired link'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleFileChange = (field, e) => {
    const file = e.target.files?.[0];
    setFiles((prev) => ({ ...prev, [field]: file || null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const name = (form.name || '').trim();
    const email = (form.email || '').trim();
    if (!name || !email) {
      setError('Name and email are required.');
      return;
    }
    const formData = new FormData();
    formData.append('name', name);
    formData.append('email', email);
    formData.append('phone', (form.phone || '').trim());
    formData.append('id_number', (form.id_number || '').trim());
    formData.append('address', (form.address || '').trim());
    if (files.cv) formData.append('cv', files.cv);
    if (files.cover_letter) formData.append('cover_letter', files.cover_letter);
    if (files.qualifications) formData.append('qualifications', files.qualifications);
    if (files.id_document) formData.append('id_document', files.id_document);
    if (files.academic_record) formData.append('academic_record', files.academic_record);

    setSubmitting(true);
    recruitmentApply.submit(token, formData)
      .then(() => setSubmitted(true))
      .catch((e) => setError(e?.message || 'Submission failed'))
      .finally(() => setSubmitting(false));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
        <p className="text-surface-600">Loading application form…</p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-surface-200 p-6 text-center">
          <h1 className="text-lg font-semibold text-surface-900 mb-2">Job application</h1>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-surface-200 p-6 text-center">
          <h1 className="text-lg font-semibold text-surface-900 mb-2">Application submitted</h1>
          <p className="text-surface-600">Thank you. Your application has been received and will be reviewed by our team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg border border-surface-200 overflow-hidden">
          <div className="bg-brand-600 text-white px-6 py-4">
            <h1 className="text-xl font-semibold">Job application</h1>
            {vacancy?.title && <p className="text-brand-100 text-sm mt-1">{vacancy.title}</p>}
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 px-4 py-2 text-sm">{error}</div>
            )}
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-3">Your particulars</h2>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">Full name *</span>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" placeholder="Full name" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">Email *</span>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" placeholder="Email" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">Phone</span>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" placeholder="Phone" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">ID number</span>
                  <input type="text" value={form.id_number} onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))} className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" placeholder="ID number" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">Address</span>
                  <textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" placeholder="Address" />
                </label>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-surface-800 mb-3">Documents</h2>
              <p className="text-xs text-surface-500 mb-3">Upload your CV, cover letter, qualifications, ID document and academic record (PDF or document).</p>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">CV *</span>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => handleFileChange('cv', e)} className="mt-1 w-full text-sm text-surface-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border file:border-surface-300 file:bg-surface-50" />
                  {files.cv && <span className="text-xs text-surface-500 mt-1 block">{files.cv.name}</span>}
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">Cover letter</span>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => handleFileChange('cover_letter', e)} className="mt-1 w-full text-sm text-surface-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border file:border-surface-300 file:bg-surface-50" />
                  {files.cover_letter && <span className="text-xs text-surface-500 mt-1 block">{files.cover_letter.name}</span>}
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">Qualifications</span>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => handleFileChange('qualifications', e)} className="mt-1 w-full text-sm text-surface-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border file:border-surface-300 file:bg-surface-50" />
                  {files.qualifications && <span className="text-xs text-surface-500 mt-1 block">{files.qualifications.name}</span>}
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">ID document</span>
                  <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => handleFileChange('id_document', e)} className="mt-1 w-full text-sm text-surface-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border file:border-surface-300 file:bg-surface-50" />
                  {files.id_document && <span className="text-xs text-surface-500 mt-1 block">{files.id_document.name}</span>}
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-surface-500">Academic record</span>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => handleFileChange('academic_record', e)} className="mt-1 w-full text-sm text-surface-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border file:border-surface-300 file:bg-surface-50" />
                  {files.academic_record && <span className="text-xs text-surface-500 mt-1 block">{files.academic_record.name}</span>}
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50">Submit application</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
