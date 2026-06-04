// Pure formatters for presenting a packet in the popup and the inline preview.
// Keeping them here means the two surfaces never drift apart.
const fieldsOf = (packet) => (packet && packet.candidate && packet.candidate.fields) || [];
const answersOf = (packet) => (packet && packet.answers) || [];
const docsOf = (packet) => (packet && packet.documents) || [];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function previewSummary(packet) {
  return `${plural(fieldsOf(packet).length, 'field')} · ${plural(docsOf(packet).length, 'doc')} · ${plural(answersOf(packet).length, 'answer')}`;
}

export function fieldsToText(packet) {
  return fieldsOf(packet).map((f) => `${f.label}: ${f.value}`).join('\n');
}

export function answersToText(packet) {
  return answersOf(packet).map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
}
