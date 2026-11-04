export type Tema = 'sistema' | 'claro' | 'escuro'

const CHAVE = 'auxiliar-carteira-tema'

/** Preferência visual deste computador; nada financeiro passa por aqui. */
export function lerTema(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE)
    return salvo === 'claro' || salvo === 'escuro' ? salvo : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function aplicarTema(tema: Tema): void {
  if (tema === 'sistema') delete document.documentElement.dataset['theme']
  else document.documentElement.dataset['theme'] = tema === 'escuro' ? 'dark' : 'light'
}

export function salvarTema(tema: Tema): void {
  aplicarTema(tema)
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    // Sem armazenamento, o tema vale apenas até fechar o aplicativo.
  }
}
