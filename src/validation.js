export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requiredText(input, label, maxLength = 100) {
  if (typeof input !== 'string') throw new ApiError(400, `${label} geçersiz.`);
  const value = input.trim();
  if (!value || value.length > maxLength) throw new ApiError(400, `${label} 1-${maxLength} karakter olmalı.`);
  return value;
}

export function optionalText(input, maxLength = 280) {
  if (input === undefined || input === null) return '';
  if (typeof input !== 'string' || input.length > maxLength) throw new ApiError(400, 'Not alanı geçersiz.');
  return input.trim();
}

export function lastFour(input) {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input !== 'string' || !/^\d{4}$/.test(input)) throw new ApiError(400, 'Yalnızca kartın son 4 hanesini girin.');
  return input;
}

export function positiveMoney(value, allowZero = false) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value > 100000000000) throw new ApiError(400, 'Tutar geçersiz.');
  if (allowZero ? value < 0 : value <= 0) throw new ApiError(400, 'Tutar sıfırdan büyük olmalı.');
  return value;
}

export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, 'Tarih YYYY-AA-GG formatında olmalı.');
  const d = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new ApiError(400, 'Geçersiz tarih.');
  return value;
}

export function monthPeriod(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new ApiError(400, 'Dönem YYYY-AA biçiminde olmalı.');
  return value;
}

export function idText(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new ApiError(400, 'Kayıt kimliği geçersiz.');
  return value;
}

export async function readJSON(request,maxSize=12000) {
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new ApiError(415, 'JSON bekleniyor.');
  if (Number(request.headers.get('content-length') || 0) > maxSize) throw new ApiError(413, 'İstek çok büyük.');
  let body;
  try { body = await request.text(); } catch { throw new ApiError(400, 'İstek okunamadı.'); }
  if (body.length > maxSize) throw new ApiError(413, 'İstek çok büyük.');
  try { const data = JSON.parse(body); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('object'); return data; }
  catch { throw new ApiError(400, 'Geçerli JSON gönderin.'); }
}
