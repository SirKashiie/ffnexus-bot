// src/i18n.js
const dict = {
  pt: {
    resultsFor: 'Resultados para',
    noDocsIndexed: 'Nenhum documento indexado ainda. Coloque arquivos em data/docs e tente novamente.',
    noneFound: (q) => `Nenhum documento encontrado para: **${q}**`,
    listHeader: (q, page, pages) => `**Resultados para:** \`${q}\` • página ${page}/${pages}\n`,
    pickDocs: 'Selecione documento(s)',
    summaryIA: 'Resumo (IA)',
    clearSel: 'Limpar seleção',
    cancel: 'Cancelar',
    prev: 'Voltar',
    next: 'Avançar',
    lang: (lang) => (lang === 'pt' ? 'EN' : 'PT'),
    needPassword: 'Alguns documentos exigem senha. Informe abaixo.',
    passwordLabel: 'Senha',
    passwordTitle: 'Senha de documentos protegidos',
    mixedPasswords: 'Selecione apenas documentos com a mesma senha, ou gere resumos em grupos separados.',
    summarizing: 'Gerando resumo...',
    summaryTitle: (name) => `**${name}** — resumo`,
    previewTitle: (name) => `**${name}** — prévia`,
  },
  en: {
    resultsFor: 'Results for',
    noDocsIndexed: 'No documents indexed yet. Put files in data/docs and try again.',
    noneFound: (q) => `No documents found for: **${q}**`,
    listHeader: (q, page, pages) => `**Results for:** \`${q}\` • page ${page}/${pages}\n`,
    pickDocs: 'Select document(s)',
    summaryIA: 'Summarize (AI)',
    clearSel: 'Clear selection',
    cancel: 'Cancel',
    prev: 'Back',
    next: 'Next',
    lang: (lang) => (lang === 'pt' ? 'EN' : 'PT'),
    needPassword: 'Some documents require a password. Please enter it below.',
    passwordLabel: 'Password',
    passwordTitle: 'Protected docs password',
    mixedPasswords: 'Select only documents with the same password, or summarize in separate groups.',
    summarizing: 'Summarizing...',
    summaryTitle: (name) => `**${name}** — summary`,
    previewTitle: (name) => `**${name}** — preview`,
  }
};

export function pickLang(interaction) {
  const l = (interaction.locale || interaction.guildLocale || 'en').toLowerCase();
  return l.startsWith('pt') ? 'pt' : 'en';
}
export function t(lang, key, ...args) {
  const v = dict[lang]?.[key];
  return typeof v === 'function' ? v(...args) : (v ?? key);
}
