const MAX_UPLOAD_BYTES = 400_000;
const MIME_EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

function safeFilename(value, mime) {
  const fallback = `bijlage.${MIME_EXTENSIONS[mime] || 'bin'}`;
  const name = String(value || fallback).replace(/[\\/\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return name || fallback;
}

export function inspectSupportUpload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.dataUrl !== 'string' || value.dataUrl.length > 550_000) {
    throw new Error('Kies een geldige bijlage van maximaal 400 KB.');
  }
  const match = value.dataUrl.match(/^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('Bijlagen moeten PDF, PNG, JPEG of WebP zijn.');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_UPLOAD_BYTES) throw new Error('Een bijlage mag maximaal 400 KB groot zijn.');
  const valid = match[1] === 'application/pdf'
    ? data.subarray(0, 5).toString() === '%PDF-'
    : match[1] === 'image/png'
      ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === 'image/jpeg'
        ? data[0] === 255 && data[1] === 216 && data[data.length - 2] === 255 && data[data.length - 1] === 217
        : data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  if (!valid) throw new Error('De inhoud van de bijlage komt niet overeen met het bestandstype.');
  return {
    attachment: true,
    name: safeFilename(value.name, match[1]),
    mime: match[1],
    size: data.length,
    dataUrl: value.dataUrl
  };
}

export function safeAttachmentMetadata(value, label = 'Bijlage') {
  if (!value || typeof value !== 'object' || value.attachment !== true || !MIME_EXTENSIONS[value.mime] || typeof value.dataUrl !== 'string') return null;
  return { attachment: true, name: safeFilename(value.name, value.mime), mime: value.mime, size: Math.min(MAX_UPLOAD_BYTES, Math.max(0, Number(value.size) || 0)), label: String(label || 'Bijlage').slice(0, 120) };
}

export function supportQuestionLabel(ticket, questionId) {
  const question = (ticket.questionSnapshot || []).find(item => item.id === questionId);
  return question?.label || questionId;
}

export function findSupportAttachment(ticket, questionId) {
  const value = ticket?.answers?.[questionId];
  const metadata = safeAttachmentMetadata(value, supportQuestionLabel(ticket, questionId));
  if (!metadata) return null;
  try { return { ...inspectSupportUpload(value), label: metadata.label, questionId }; }
  catch { return null; }
}

export function supportTicketView(ticket, { includeAttachmentData = false } = {}) {
  const answers = Object.fromEntries(Object.entries(ticket.answers || {}).map(([id, value]) => {
    const metadata = safeAttachmentMetadata(value, supportQuestionLabel(ticket, id));
    return [id, metadata ? (includeAttachmentData ? value : metadata) : value];
  }));
  return { ...ticket, answers };
}

export function supportAttachmentList(ticket) {
  return Object.entries(ticket.answers || {}).map(([id, value]) => {
    const metadata = safeAttachmentMetadata(value, supportQuestionLabel(ticket, id));
    return metadata ? { ...metadata, questionId: id } : null;
  }).filter(Boolean);
}
