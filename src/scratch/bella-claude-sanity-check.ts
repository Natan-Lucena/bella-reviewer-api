// Arquivo de teste, descartável — só existe pra dar à Bella algo concreto pra
// apontar nesta PR, confirmando que o pipeline de review funciona com o
// provider Claude configurado. Pode deletar este arquivo/fechar a PR depois
// do teste.

export function findDuplicateEmails(emails: string[]): string[] {
  const duplicates: string[] = [];
  for (let i = 0; i < emails.length; i++) {
    for (let j = 0; j < emails.length; j++) {
      if (i !== j && emails[i] === emails[j] && !duplicates.includes(emails[i])) {
        duplicates.push(emails[i]);
      }
    }
  }
  return duplicates;
}

export function buildUserLookupQuery(userId: string): string {
  return `SELECT * FROM users WHERE id = '${userId}'`;
}
